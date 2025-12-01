#!/usr/bin/env bash
set -euo pipefail

stack_name=${STACK_NAME:-smoke-tests}
lambda_name="$stack_name-CanaryRunnerFunction"

# Check for interactive session
tty -s && live_logs=true || live_logs=false

function start_following_logs() {
  $live_logs || return 0
  trap "stop_following_logs; exit" SIGINT SIGTERM

  PYTHONUNBUFFERED=true aws logs tail "/aws/lambda/$lambda_name" \
    --filter-pattern="{($.canaryName = \"$canary\") && ($.clientRunId = \"$runId\")}" \
    --follow --since=0s --format=short --color=off |
    process_log_entries &

  logs_pid=$(jobs -p)
}

function stop_following_logs() {
  $live_logs || return 1
  trap - SIGINT SIGTERM
  kill -- "$logs_pid"
}

function process_log_entries() {
  grep --line-buffered --color=never --only-matching --extended-regexp '\{.*\}$' |
    jq --unbuffered --raw-output '"  ‣ \(.message)"'
}

canary_names=$(
  aws cloudformation describe-stacks --stack-name "$stack_name" --output json \
    --query 'Stacks[0].Outputs[?OutputKey==`CanaryNames`]'
)

if [[ $(jq length <<< "$canary_names") -eq 0 ]]; then
  echo "  𝑥 Canary names output not found in stack $stack_name"
  exit 1
fi

if $live_logs; then
  runId=$(uuidgen)
  context=$(jq --null-input --arg runId "$runId" '{Custom: {runId: $runId}}' | base64)
else
  log_type=Tail
fi

canary_results_dir="canary-results" && mkdir -p "$canary_results_dir"
IFS="," read -ra canaries < <(jq --raw-output '.[0].OutputValue' <<< "$canary_names")

echo "ℹ Running ${#canaries[@]} canaries from stack $stack_name using function $lambda_name"
success=true
index=1

# @quality_gate_integration_test @quality_gate_regression_test @quality_gate_stack_test
for canary in "${canaries[@]}"; do
  echo "» [$((index++))/${#canaries[@]}] Running canary $canary"

  payload=$(jq --null-input --arg canaryName "$canary" '{canaryName: $canaryName}' | base64)
  output_file="$canary_results_dir/$canary.json"
  start_following_logs

  canary_result=$(
    aws lambda invoke --function-name "$lambda_name" --payload "$payload" \
      ${context:+--client-context $context} \
      ${log_type:+--log-type $log_type} \
      --output json "$output_file"
  )

  stop_following_logs ||
    jq --raw-output '.LogResult' <<< "$canary_result" | base64 -d | process_log_entries

  if [[ $(jq 'has("FunctionError")' <<< "$canary_result") == true ]]; then
    echo "  𝑥 Lambda invocation failed for canary $canary"
    jq . "$output_file"
    success=false
  elif [[ $(jq --raw-output '.passed' "$output_file") == true ]]; then
    echo "  ✔ Successfully ran canary $canary"
  else
    echo "  𝑥 Error running canary $canary"
    success=false
  fi
done

$success || exit 1
