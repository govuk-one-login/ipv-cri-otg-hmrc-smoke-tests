import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import {
  CanaryRun,
  CanaryRunState,
  CanaryState,
  DescribeCanariesLastRunCommand,
  GetCanaryCommand,
  ServiceInputTypes,
  ServiceOutputTypes,
  StartCanaryCommand,
  StopCanaryCommand,
  SyntheticsClient,
} from "@aws-sdk/client-synthetics";
import { Context } from "aws-lambda";

const pollingInterval = 1000;

const logger = new Logger();
const synthetics = new SyntheticsClient();

type CanaryRunResult = {
  canaryName: string;
  passed: boolean;
  timestamp: string;
};

export class CanaryRunnerHandler implements LambdaInterface {
  public async handler(
    event: {
      canaryName: string;
    },
    context?: Context
  ): Promise<CanaryRunResult> {
    try {
      logger.addPersistentLogAttributes({
        canaryName: event.canaryName,
        clientRunId: context?.clientContext?.Custom?.runId,
      });

      return {
        canaryName: event.canaryName,
        passed: await executeCanary(event.canaryName),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error running canary ${event.canaryName}: ${error}`);
      throw error;
    }
  }
}

async function executeCanary(canaryName: string): Promise<boolean> {
  logger.info(`Executing canary ${canaryName}`);

  await stopCanary(canaryName);

  const lastCanaryRunId = await getLastCanaryRunId(canaryName);
  await startCanary(canaryName);

  const newCanaryRun = await waitForNewCanaryRun(canaryName, lastCanaryRunId);
  const canaryPassed = newCanaryRun?.Status?.State === CanaryRunState.PASSED;

  logger.info(`Canary ${canaryName} ${canaryPassed ? "passed" : "failed"}`);
  return canaryPassed;
}

async function stopCanary(canaryName: string) {
  if (await isCanaryStopped(canaryName)) {
    logger.info(`Canary ${canaryName} is stopped`);
    return;
  }

  if (await isCanaryStarting(canaryName)) {
    await waitForCanaryToStart(canaryName);
  }

  if (!(await isCanaryStopping(canaryName))) {
    logger.info(`Stopping canary ${canaryName}`);
    await sendCommand(new StopCanaryCommand({ Name: canaryName }));
  }

  await waitForCanaryToStop(canaryName);
}

async function startCanary(canaryName: string) {
  if (await isCanaryRunning(canaryName)) {
    logger.info(`Canary ${canaryName} is running`);
    return;
  }

  if (await isCanaryStopping(canaryName)) {
    await waitForCanaryToStop(canaryName);
  }

  if (!(await isCanaryStarting(canaryName))) {
    logger.info(`Starting canary ${canaryName}`);
    await sendCommand(new StartCanaryCommand({ Name: canaryName }));
  }

  await waitForCanaryToStart(canaryName);
}

async function waitForCanaryToStart(canaryName: string) {
  await waitUntil(() => isCanaryRunning(canaryName));
  logger.info(`Canary ${canaryName} has started`);
}

async function waitForCanaryToStop(canaryName: string) {
  await waitUntil(() => isCanaryStopped(canaryName));
  logger.info(`Canary ${canaryName} has stopped`);
}

function waitForNewCanaryRun(
  canaryName: string,
  previousRunId: string
): Promise<CanaryRun> {
  logger.info(`Waiting for current run of canary ${canaryName} to complete`);

  return waitForState(
    () => getLastCanaryRun(canaryName),
    (canaryRun) =>
      canaryRun.Id !== previousRunId &&
      canaryRun.Status?.State != CanaryRunState.RUNNING
  );
}

async function getCanaryState(canaryName: string): Promise<CanaryState> {
  const getCanaryResponse = await sendCommand(
    new GetCanaryCommand({ Name: canaryName })
  );

  return nonNull(
    getCanaryResponse.Canary?.Status?.State,
    `State of canary ${canaryName}`
  );
}

async function getLastCanaryRun(canaryName: string): Promise<CanaryRun> {
  const canaryLastRunsResponse = await sendCommand(
    new DescribeCanariesLastRunCommand({
      Names: [canaryName],
      MaxResults: 1,
    })
  );

  const canaryLastRun = canaryLastRunsResponse.CanariesLastRun?.find(
    (lastRun) => lastRun.CanaryName == canaryName
  );

  return nonNull(canaryLastRun?.LastRun, `Last run of canary ${canaryName}`);
}

async function getLastCanaryRunId(canaryName: string): Promise<string> {
  const lastCanaryRun = await getLastCanaryRun(canaryName);
  return nonNull(lastCanaryRun.Id, `ID of last run of canary ${canaryName}`);
}

async function isCanaryStarting(canaryName: string): Promise<boolean> {
  return (await getCanaryState(canaryName)) == CanaryState.STARTING;
}

async function isCanaryRunning(canaryName: string): Promise<boolean> {
  return (await getCanaryState(canaryName)) == CanaryState.RUNNING;
}

async function isCanaryStopping(canaryName: string): Promise<boolean> {
  return (await getCanaryState(canaryName)) == CanaryState.STOPPING;
}

async function isCanaryStopped(canaryName: string): Promise<boolean> {
  return (await getCanaryState(canaryName)) == CanaryState.STOPPED;
}

async function waitUntil(condition: () => Promise<boolean>) {
  await waitForState(condition, (conditionMet) => conditionMet);
}

function waitForState<State>(
  state: () => Promise<State>,
  condition: (state: State) => boolean
): Promise<State> {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const currentState = await state();

      if (condition(currentState)) {
        clearInterval(interval);
        resolve(currentState);
      }
    }, pollingInterval);
  });
}

async function sendCommand<
  Input extends ServiceInputTypes,
  Output extends ServiceOutputTypes,
>(
  command: Parameters<typeof synthetics.send<Input, Output>>[0]
): Promise<Output> {
  const response = await synthetics.send(command);
  const statusCode = response.$metadata.httpStatusCode;

  if (statusCode !== 200) {
    throw new Error(`${statusCode} Failed to send command ${typeof command}`);
  }

  return response;
}

function nonNull<Value>(value: Value, name: string): NonNullable<Value> {
  if (value === undefined || value === null) {
    throw new Error(`Value was null: ${name}`);
  }

  return value;
}

const handlerClass = new CanaryRunnerHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
