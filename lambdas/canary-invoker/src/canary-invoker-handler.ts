import { LambdaInterface } from "@aws-lambda-powertools/commons";
import { Logger } from "@aws-lambda-powertools/logger";
import {
    GetCanaryRunsCommand,
    StartCanaryCommand,
    SyntheticsClient,
} from "@aws-sdk/client-synthetics";

const logger = new Logger();
const client = new SyntheticsClient();

export class CanaryInvokerHandler implements LambdaInterface {
    public async handler(
      event: { canaryName: string },
      _context: unknown
    ): Promise<{}> {
        try {
            logger.info(`Running ${event.canaryName}`);

            const previousRuns = await client.send(new GetCanaryRunsCommand({
                Name: event.canaryName
            }));

            const previousRunId = previousRuns?.CanaryRuns?.at(0)?.Id;
            const startCanary = await client.send(new StartCanaryCommand({ Name: event.canaryName }));
            const startCanaryStatusCode = startCanary.$metadata.httpStatusCode;

            if(startCanaryStatusCode !== 200) {
                throw new Error(`Failed to invoke canary received ${startCanaryStatusCode}`)
            }

            const interval = setInterval(async () => {
                const canaryRuns = await client.send(new GetCanaryRunsCommand({
                    Name: event.canaryName
                }));

                const runStatus = canaryRuns?.CanaryRuns?.at(0);

                if (runStatus?.Id !== previousRunId) {
                    clearInterval(interval);
                    if (runStatus?.Status?.State === "PASSED") {
                        return "Canary has passed";
                    } else {
                        throw new Error("Canary did not pass: " + runStatus?.Status?.StateReason);
                    }
                }
            }, 5000);

            await new Promise(resolve => setTimeout(resolve, 60000));

            throw new Error("Test timed out")
        } catch (error) {
            logger.error('Error executing canary:' + error);
            throw error;
        }
    }
}

const handlerClass = new CanaryInvokerHandler();
export const lambdaHandler = handlerClass.handler.bind(handlerClass);
