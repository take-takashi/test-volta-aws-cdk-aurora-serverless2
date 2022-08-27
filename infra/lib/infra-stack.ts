import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // VPCの作成+パブリックサブネット2個、プライベートサブネット2個作成
    // ec2.Vpcを利用するとベストプラクティスで作成される
    // この場合はmaxAz分、各サブネットが作成される
    // PublicSubnet 2個、PrivateSubnet（Natgatewayなし）2個
    // PublicSubnetは自動的にIGWが接続される
    // ▼メモ
    // スバラシイことにTagNameが以下になる
    // Vpc=InfraStack/Vpc
    // PublicSubnet1=InfraStack/Vpc/PublicSubnet1
    const vpc: ec2.Vpc = new ec2.Vpc(this, "Vpc", {
      cidr: "10.0.0.0/16",
      natGateways: 0, // NATゲートウェイ作らない
      maxAzs: 2, // アベイラビリティゾーン数2個
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        }
      ]
    });

    // RDS用のサブネットグループを作成
    // 作成しないとRDSが立てられない（少なくともAuroraSerevrlessは）
    // Isolatedサブネット2つをグループ化する
    const subnetGroup: rds.SubnetGroup = new rds.SubnetGroup(this, "SubnetGroup", {
      description: "subnet group for rds",
      vpc: vpc,
      vpcSubnets: {
        subnets: vpc.isolatedSubnets,
      }
    });

    // セキュリティグループを作成
    const securiryGroup = new ec2.SecurityGroup(this, "SecurityGroup", {
      securityGroupName: "SecurityGroup",
      vpc: vpc,
    })

    // セキュリティグループにルール追加（Anyから5432）
    securiryGroup.connections.allowFromAnyIpv4(ec2.Port.tcp(5432))

    // ここからRDS定義（AuroraServerless）
    // URL: https://github.com/aws/aws-cdk/issues/20197#issuecomment-1117555047
    enum ServerlessInstanceType {
      SERVERLESS = 'serverless',
    }

    type CustomInstanceType = ServerlessInstanceType | ec2.InstanceType;

    const CustomInstanceType = { ...ServerlessInstanceType, ...ec2.InstanceType };

    const dbClusterInstanceCount: number = 1

    const dbCluster = new rds.DatabaseCluster(this, "DbCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_14_3,
      }),
      instances: dbClusterInstanceCount,
      instanceProps: {
        vpc: vpc,
        instanceType: CustomInstanceType.SERVERLESS as unknown as ec2.InstanceType,
        autoMinorVersionUpgrade: false,
        publiclyAccessible: true,
        securityGroups: [
          securiryGroup
        ],
        vpcSubnets: {
          subnets: vpc.isolatedSubnets
        },
      },
      // credentials: rds.Credentials.fromSecret // TODO Check
      // backup: // TODO Check
      port: 5432,
      cloudwatchLogsExports: ["postgresq;"],
      // cloudwatchLogsRetention: // TODO Check
      subnetGroup: subnetGroup,
      storageEncrypted: true,
      // storageEncryptionKey: // TODO Check
    })

    const severlessV2ScallingConfiguration = {
      MinCapacity: 0.5,
      MaxCapacity: 1,
    }

    // TODO Write

  }
}
