# ipv-cri-otg-smoke-tests

HMRC OTG Service Smoke Tests

## Running Canaries Locally

### Using AWS
To run the canaries locally you need to do the following steps:
1. Deploy the stack to AWS
2. Grab the AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN from https://uk-digital-identity.awsapps.com/start/
3. In the DockerFile on line 2 add the following:
    ```
    env AWS_ACCESS_KEY_ID="<value from aws>"
    env AWS_SECRET_ACCESS_KEY="<value from aws>"
    env AWS_SESSION_TOKEN="<value from aws>"
    env AWS_REGION="eu-west-2"
    ```
4. Run `docker-compose up --build`

This will then invoke the Canary-Invoker Lambda from the `ipv-cri-otg-hmrc-smoke-tests` stack. If you want to use your
own stack then update the `run-tests.sh` to point to your stack.
