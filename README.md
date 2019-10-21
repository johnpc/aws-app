# What is this repo:

This repo contains AWS cdk scripts to deploy a docker container that runs in AWS Fargate as a backend and an s3 static frontend.

## Prerequisites

1.  Install the AWS sdk

```
curl "https://s3.amazonaws.com/aws-cli/awscli-bundle.zip" -o "awscli-bundle.zip"
unzip awscli-bundle.zip
sudo ./awscli-bundle/install -i /usr/local/aws -b /usr/local/bin/aws
```

2.  Set up your .env file with contents like this:

```
SERVICE_NAME=JpcApp
DOMAIN_NAME=jpc.io
BACKEND_SUBDOMAIN=api
FRONTEND_SUBDOMAIN=www
```

3.  Install dependencies `npm install`

4.  Set it up with `aws configure`

5.  Make sure the the `DOMAIN_NAME` from your `.env` has it's nameservers pointed at a Route53 Hosted Zone with the same name.

## Okay, I'm ready to run it!

- To deploy infrastructure, run `./deploy.sh`
