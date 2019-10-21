#!/usr/bin/env bash
npm run-script build
npx cdk synth
cdk bootstrap
npx cdk deploy
