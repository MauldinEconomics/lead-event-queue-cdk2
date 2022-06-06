import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { StackOptions } from './lead-event-queue-cdk-context';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ssm from 'aws-cdk-lib/aws-ssm';

const DIV = '-';

export interface appStackProps extends StackOptions, StackProps {}

export class LeadEventQueueCdkStack extends Stack {
  constructor(scope: Construct, id: string, props: appStackProps) {
    const prefix = id + DIV + props.envName;
    super(scope, prefix, props);

    const keyArn = ssm.StringParameter.fromStringParameterAttributes(
      this,
      'LeadEventEncriptionKeyArn',
      { parameterName: props.encryptionKey }
    );

    const encriptionKey = kms.Key.fromKeyArn(this, 'LeadEventKey', keyArn.stringValue);

    for (const entity in props.entities) {
      const suffix = DIV + entity + DIV + props.envName;

      const topic = new sns.Topic(this, props.topicName + suffix, {
        masterKey: encriptionKey,
      });

      const deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue' + suffix, {
        retentionPeriod: Duration.days(1),
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: encriptionKey,
      });

      const queue = new sqs.Queue(this, props.queueName + suffix, {
        visibilityTimeout: Duration.minutes(props.queueDurationMinutes),
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: encriptionKey,
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
      });
    }
  }
}
