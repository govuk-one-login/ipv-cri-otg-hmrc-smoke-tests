import {
    CloudFormationClient,
    DescribeStacksCommand,
  } from "@aws-sdk/client-cloudformation";
  import { CanaryRunnerHandler } from "../src/canary-runner-handler";

  jest.setTimeout(50 * 1000 * 4);

  const cloudFormation = new CloudFormationClient();
  const canaryRunner = new CanaryRunnerHandler();

  describe("Run canaries", () => {
    it("All canaries should pass", async () => {
      const canaryNames = await getCanaryNames();
      let allPassed = true;

      for (const canary of canaryNames) {
        const canaryRunResult = await canaryRunner.handler({
          canaryName: canary,
        });

        allPassed = allPassed && canaryRunResult.passed;
      }

      expect(allPassed).toBe(true);
    });
  });

  async function getCanaryNames() {
    const stackName = getEnvironmentVariable("STACK_NAME");

    const stack = await cloudFormation.send(
      new DescribeStacksCommand({ StackName: stackName })
    );

    const canaryNames = stack.Stacks?.at(0)?.Outputs?.find(
      (output) => output?.OutputKey === "CanaryNames"
    )?.OutputValue;

    if (!canaryNames) {
      throw new Error(`Could not get canary names for stack ${stackName}`);
    }

    return canaryNames.split(",");
  }

  function getEnvironmentVariable(name: string): string {
    const value = process.env[name];

    if (!value) {
      throw new Error(`${name} environment variable not set`);
    }

    return value;
  }
