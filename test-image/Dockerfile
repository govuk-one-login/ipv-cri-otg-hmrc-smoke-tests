FROM amazon/aws-cli:2.16.7

RUN yum -y install jq

COPY run-tests.sh /

ARG STACK_NAME
ENV STACK_NAME=${STACK_NAME}

ENTRYPOINT ["/run-tests.sh"]
