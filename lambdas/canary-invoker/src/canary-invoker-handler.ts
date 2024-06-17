import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import {
    CanaryRun,
    CanaryRunState,
    CanaryState,
    DescribeCanariesLastRunCommand,
    GetCanaryCommand,
    StartCanaryCommand,
    StopCanaryCommand,
    SyntheticsClient,
} from "@aws-sdk/client-synthetics";

const logger = new Logger();
const client = new SyntheticsClient();

type CanaryRunResult = {
    canaryName: string;
    passed: boolean;
    timestamp: string;
};

export class CanaryInvokerHandler implements LambdaInterface {
    public async handler(
      event: { canaryName: string },
      _context: unknown
    ): Promise<CanaryRunResult> {
        try {
            const canaryName = event.canaryName;
            logger.info(`Executing canary ${canaryName}`);

            if (await isCanaryRunning(canaryName)) {
                await stopCanary(canaryName);
            }

            const lastCanaryRunId = await getLastCanaryRunId(canaryName);
            await startCanary(canaryName);

            const canaryPassed = await waitForCanaryToPass(
              canaryName,
              lastCanaryRunId
            );

            if (canaryPassed) {
                logger.info(`Canary ${canaryName} has passed`);
            } else {
                logger.error(`Canary ${canaryName} has failed`);
            }

            return {
                canaryName: canaryName,
                passed: canaryPassed,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            logger.error(`Error executing canary: ${error}`);
            throw error;
        }
    }
}

async function stopCanary(canaryName: string) {
    logger.info(`Stopping running canary ${canaryName}`);

    const stopCanaryResponse = await client.send(
      new StopCanaryCommand({ Name: canaryName })
    );

    const stopCanaryStatusCode = stopCanaryResponse.$metadata.httpStatusCode;

    if (stopCanaryStatusCode !== 200) {
        throw new Error(
          `Failed to stop canary with status ${stopCanaryStatusCode}`
        );
    }

    await waitForCanaryToStop(canaryName);
}

async function startCanary(canaryName: string) {
    logger.info(`Starting canary ${canaryName}`);

    const startCanaryResponse = await client.send(
      new StartCanaryCommand({ Name: canaryName })
    );

    const startCanaryStatusCode = startCanaryResponse.$metadata.httpStatusCode;

    if (startCanaryStatusCode !== 200) {
        throw new Error(
          `Failed to invoke canary received ${startCanaryStatusCode}`
        );
    }
}

async function waitForCanaryToStop(canaryName: string) {
    return new Promise<void>((resolve) => {
        const interval = setInterval(async () => {
            if (await isCanaryStopped(canaryName)) {
                clearInterval(interval);
                logger.info(`Canary ${canaryName} stopped`);
                resolve();
            }
        }, 1000);
    });
}

async function waitForCanaryToPass(
  canaryName: string,
  previousRunId: string
): Promise<boolean> {
    logger.info(`Waiting for current run of canary ${canaryName} to complete`);
    return new Promise<boolean>((resolve) => {
        const interval = setInterval(async () => {
            const currentCanaryRun = await getLastCanaryRun(canaryName);

            if (currentCanaryRun.Id !== previousRunId) {
                clearInterval(interval);
                if (currentCanaryRun?.Status?.State === CanaryRunState.PASSED) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }
        }, 1000);
    });
}

async function getCanaryState(canaryName: string): Promise<CanaryState> {
    const getCanaryResponse = await client.send(
      new GetCanaryCommand({ Name: canaryName })
    );

    const canaryState = getCanaryResponse.Canary?.Status?.State;

    if (!canaryState) {
        throw new Error(`Could not get state of canary ${canaryName}`);
    }

    return canaryState;
}

async function getLastCanaryRun(canaryName: string): Promise<CanaryRun> {
    const canaryLastRunsResponse = await client.send(
      new DescribeCanariesLastRunCommand({
          Names: [canaryName],
          MaxResults: 1,
      })
    );

    const canaryLastRun = canaryLastRunsResponse.CanariesLastRun?.find(
      (lastRun) => lastRun.CanaryName == canaryName
    );

    if (!canaryLastRun?.LastRun) {
        throw new Error(`Could not get last run of canary ${canaryName}`);
    }

    return canaryLastRun.LastRun;
}

async function getLastCanaryRunId(canaryName: string): Promise<string> {
    const lastCanaryRun = await getLastCanaryRun(canaryName);
    const lastCanaryRunId = lastCanaryRun.Id;

    if (!lastCanaryRunId) {
        throw new Error(`Could not get ID of last run of canary ${canaryName}`);
    }

    return lastCanaryRunId;
}

async function isCanaryRunning(canaryName: string): Promise<boolean> {
    const canaryState = await getCanaryState(canaryName);
    return canaryState == CanaryState.RUNNING;
}

async function isCanaryStopped(canaryName: string): Promise<boolean> {
    const canaryState = await getCanaryState(canaryName);
    return canaryState == CanaryState.STOPPED;
}

const handlerClass = new CanaryInvokerHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
