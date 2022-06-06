#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LeadEventQueueCdkStack } from '../lib/lead-event-queue-cdk-stack';
import { AppContext, StackOptions } from '../lib/lead-event-queue-cdk-context';

const app = new cdk.App();
const appContext = AppContext.loadFromApp(app, 'lead-event-queue');
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

for (const envContext of appContext.envContexts) {
  new LeadEventQueueCdkStack(app, appContext.appName, {
    env,
    ...(<StackOptions>envContext),
  });
}
