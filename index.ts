import ec2 = require("@aws-cdk/aws-ec2");
import ecs = require("@aws-cdk/aws-ecs");
import ecs_patterns = require("@aws-cdk/aws-ecs-patterns");
import cdk = require("@aws-cdk/core");
import route53 = require("@aws-cdk/aws-route53");
import acm = require("@aws-cdk/aws-certificatemanager");
import targets = require("@aws-cdk/aws-route53-targets/lib");
import s3 = require("@aws-cdk/aws-s3");
import s3deploy = require("@aws-cdk/aws-s3-deployment");
import cloudfront = require("@aws-cdk/aws-cloudfront");
import path = require("path");
import { config } from "dotenv";

config();

if (!process.env.SERVICE_NAME) {
  throw new Error("process.env.SERVICE_NAME not specified. Update .env");
}
if (!process.env.DOMAIN_NAME) throw new Error("Missing DOMAIN_NAME in .env");
if (!process.env.FRONTEND_SUBDOMAIN)
  throw new Error("Missing FRONTEND_SUBDOMAIN in .env");
if (!process.env.BACKEND_SUBDOMAIN)
  throw new Error("Missing BACKEND_SUBDOMAIN in .env");

const app = new cdk.App();
const stack = new cdk.Stack(app, process.env.SERVICE_NAME, {
  env: {
    // Stack must be in us-east-1, because the ACM certificate for a
    // global CloudFront distribution must be requested in us-east-1.
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1"
  }
});

// Routes
let zone;
try {
  zone = route53.HostedZone.fromLookup(
    stack,
    process.env.DOMAIN_NAME + "HostedZone",
    {
      domainName: process.env.DOMAIN_NAME
    }
  );
} catch (err) {
  zone = new route53.PublicHostedZone(
    stack,
    process.env.DOMAIN_NAME + "HostedZone",
    {
      zoneName: process.env.DOMAIN_NAME
    }
  );
}

// Certs
const siteDomain =
  process.env.FRONTEND_SUBDOMAIN + "." + process.env.DOMAIN_NAME;
new cdk.CfnOutput(stack, siteDomain + "Site", {
  value: "https://" + siteDomain
});

const apiDomain = process.env.BACKEND_SUBDOMAIN + "." + process.env.DOMAIN_NAME;
new cdk.CfnOutput(stack, apiDomain + "Site", { value: "https://" + apiDomain });
const frontEndCertificateArn = new acm.DnsValidatedCertificate(
  stack,
  siteDomain + "SiteCertificate",
  {
    domainName: siteDomain,
    hostedZone: zone
  }
).certificateArn;
new cdk.CfnOutput(stack, siteDomain + "-Certificate", {
  value: frontEndCertificateArn
});

const backEndCertificateArn = new acm.DnsValidatedCertificate(
  stack,
  apiDomain + "SiteCertificate",
  {
    domainName: apiDomain,
    hostedZone: zone
  }
).certificateArn;

new cdk.CfnOutput(stack, apiDomain + "-Certificate", {
  value: backEndCertificateArn
});

// S3 App
const siteBucket =
  s3.Bucket.fromBucketName(stack, "SiteBucket", siteDomain) ||
  new s3.Bucket(stack, "SiteBucket", {
    bucketName: siteDomain,
    websiteIndexDocument: "index.html",
    websiteErrorDocument: "error.html",
    publicReadAccess: true,
    removalPolicy: cdk.RemovalPolicy.DESTROY
  });

new cdk.CfnOutput(stack, "Bucket", { value: siteBucket.bucketName });

const distribution = new cloudfront.CloudFrontWebDistribution(
  stack,
  "SiteDistribution",
  {
    aliasConfiguration: {
      acmCertRef: frontEndCertificateArn,
      names: [siteDomain],
      sslMethod: cloudfront.SSLMethod.SNI,
      securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016
    },
    originConfigs: [
      {
        s3OriginSource: {
          s3BucketSource: siteBucket
        },
        behaviors: [{ isDefaultBehavior: true }]
      }
    ]
  }
);
new cdk.CfnOutput(stack, "DistributionId", {
  value: distribution.distributionId
});

new s3deploy.BucketDeployment(stack, "DeployWithInvalidation", {
  sources: [s3deploy.Source.asset("./content")],
  destinationBucket: siteBucket,
  distribution,
  distributionPaths: ["/*"]
});

// Fargate App
const vpc = new ec2.Vpc(stack, process.env.DOMAIN_NAME + "Vpc", { maxAzs: 2 });
const cluster = new ecs.Cluster(stack, "Cluster", { vpc });
const lb = new ecs_patterns.ApplicationLoadBalancedFargateService(
  stack,
  process.env.SERVICE_NAME,
  {
    assignPublicIp: true,
    cluster,
    taskImageOptions: {
      image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, "docker"))
    }
  }
);

// A Records
new route53.ARecord(stack, apiDomain + "SiteAliasRecord", {
  recordName: apiDomain,
  target: route53.AddressRecordTarget.fromAlias(
    new targets.LoadBalancerTarget(lb.loadBalancer)
  ),
  zone
});

// Route53 alias record for the CloudFront distribution
new route53.ARecord(stack, siteDomain + "SiteAliasRecord", {
  recordName: siteDomain,
  target: route53.AddressRecordTarget.fromAlias(
    new targets.CloudFrontTarget(distribution)
  ),
  zone
});

app.synth();
