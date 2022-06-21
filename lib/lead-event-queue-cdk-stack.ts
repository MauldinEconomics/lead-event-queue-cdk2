import { join } from 'path';
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackOptions } from './lead-event-queue-cdk-context';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

const DIV = '-';

export interface appStackProps extends StackOptions, StackProps {}

export class LeadEventQueueCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: appStackProps) {
    const prefix = id + DIV + props.envName;
    super(scope, prefix, props);

    const keyArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'LeadEventEncryptionKeyArn',
      { parameterName: props.encryptionKey }
    );

    const encryptionKey = kms.Key.fromKeyArn(this, 'LeadEventKey', keyArn.stringValue);

    for (const entity in props.entities) {
      const suffix = DIV + entity + DIV + props.envName;

      const topic = new sns.Topic(this, props.topicName + suffix, {
        masterKey: encryptionKey,
        fifo: true,
        topicName: props.topicName + suffix,
      });

      const deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue' + suffix, {
        retentionPeriod: Duration.days(1),
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: encryptionKey,
        fifo: true,
      });

      const queue = new sqs.Queue(this, props.queueName + suffix, {
        visibilityTimeout: Duration.minutes(props.queueDurationMinutes),
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: encryptionKey,
        fifo: true,
        deadLetterQueue: {
          queue: deadLetterQueue,
          maxReceiveCount: 1,
        },
      });

      queue.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'AllowSnsMessages' + suffix,
          effect: iam.Effect.ALLOW,
          resources: [queue.queueArn],
          actions: ['sqs:*'],
          principals: [new iam.ServicePrincipal('sns.amazonaws.com')],
        })
      );

      new sns.Subscription(this, 'SnsSubscription' + suffix, {
        endpoint: queue.queueArn,
        protocol: sns.SubscriptionProtocol.SQS,
        topic: topic,
        rawMessageDelivery: true,
      });

      const lambdaPolicies = [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:getParameters'],
          resources: ['*'],
        }),
      ];

      const envVars = {
        environment: props.envName,
        apiUrl: props.entities[entity].apiUrl,
        username_PARAM: props.entities[entity].username,
        password_PARAM: props.entities[entity].password,
        throttle_PARAM: props.entities[entity].throttle.toString(),
        entity: entity,
      };

      const lambdaHandler = new lambda.Function(this, prefix + DIV + 'handler' + suffix, {
        code: lambda.Code.fromAsset(join(__dirname, '../src/lambda/lead-event-queue-handler.zip')),
        handler: 'index.handler',
        runtime: lambda.Runtime.NODEJS_16_X,
        description: 'Lead Event Processor',
        initialPolicy: lambdaPolicies,
        environment: envVars,
        functionName: prefix + DIV + 'handler' + suffix,
      });

      lambdaHandler.addEventSource(
        new SqsEventSource(queue, {
          batchSize: 10,
          // maxBatchingWindow: Duration.minutes(5),
        })
      );
    }
  }
}
