#!/bin/sh


export GITREPO="$GITREPO"
# export S3_KEY="$s3key"
# export S3_SECRET="$s3secret"
# export PROJECT_ID="$projectid"

git clone $GITREPO /home/app/output

exec node script.js