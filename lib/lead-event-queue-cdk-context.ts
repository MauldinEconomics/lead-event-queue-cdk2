import { App } from 'aws-cdk-lib';

type EnvContextProps = StackOptions;
export type EnvContexts = { [key: string]: EnvContextProps };

export interface GGCEntity {
  [entity: string]: EntityProps;
}

export class EntityProps {
  public domainName: string;
  public SSLCertArn: string;
  public region: string;
}

export class EnvContext {
  public envName: string;
  public topicName: string;
  public encryptionKey: string;
  public entities: GGCEntity;
  public queueName: string;
  public queueDurationMinutes: number;

  constructor(props: EnvContextProps) {
    Object.assign(this, props);
  }
}

export interface StackOptions {
  envName: string;
  topicName: string;
  encryptionKey: string;
  entities: GGCEntity;
  queueName: string;
  queueDurationMinutes: number;
}

export class AppContext {
  public static loadFromApp(app: App, appName: string): AppContext {
    const node = app.node;
    const appEnvs = node.tryGetContext('appEnvs') as EnvContexts;
    return new AppContext(appName, appEnvs);
  }

  public readonly appName: string;
  public readonly envContexts: Array<EnvContext>;

  constructor(appName: string, appEnvs: EnvContexts) {
    this.appName = appName;
    this.envContexts = [];

    for (const envName in appEnvs) {
      const envProps: EnvContextProps = appEnvs[envName];
      this.envContexts.push(
        new EnvContext({
          ...envProps,
          envName,
        })
      );
    }
  }
}
