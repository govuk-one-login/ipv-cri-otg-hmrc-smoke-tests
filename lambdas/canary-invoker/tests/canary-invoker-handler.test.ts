import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { CanaryInvokerHandler } from "../src/canary-invoker-handler";

jest.setTimeout(50 * 1000 * 4);

const cloudFormation = new CloudFormationClient();
const canaryInvoker = new CanaryInvokerHandler();

describe("Run canaries", () => {
  it("Should run all canaries", async () => {
    const canaryNames = await getCanaryNames();
    let allPassed = true;

    for (const canary of canaryNames) {
      const canaryRunResult = await canaryInvoker.handler(
        { canaryName: canary },
        {}
      );

      allPassed = allPassed && canaryRunResult.passed;
    }

    expect(allPassed).toBe(true);
  });
});

async function getCanaryNames() {
  const stackName = process.env.STACK_NAME;

  if (!stackName) {
    throw new Error("STACK_NAME environment variable not set");
  }

  const stack = await cloudFormation.send(
    new DescribeStacksCommand({ StackName: stackName })
  );

  const canaryNames = stack.Stacks?.at(0)?.Outputs?.find(
    (output) => output?.OutputKey === "CanaryNames"
  )?.OutputValue;

  if (!canaryNames) {
    throw new Error(`Could not get canary names for stack ${stackName}`);
  }

  return canaryNames.split(" ");
}
