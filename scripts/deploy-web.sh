#!/usr/bin/env bash
# Builds the Angular site and uploads it to the private S3 bucket behind CloudFront
# (ADR-011, docs/deploy/aws-runbook.md Phase 3). Run from the repo on the EC2 instance as ec2-user:
#   bash scripts/deploy-web.sh NOME-DO-BUCKET
# Needs the instance role to allow s3:ListBucket, s3:PutObject and s3:DeleteObject on that bucket.
set -euo pipefail

BUCKET="${1:-${WEB_BUCKET:-}}"
if [ -z "$BUCKET" ]; then
  echo "Usage: bash scripts/deploy-web.sh BUCKET_NAME" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> Building the site in a Node container (takes a few minutes)"
# Runs as the current user so node_modules and dist are not left owned by root.
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/repo -w /repo node:24-slim \
  sh -c 'npm ci && npm run build:web'

OUT=apps/web/dist/web/browser
[ -f "$OUT/index.html" ] || { echo "Build output $OUT/index.html not found" >&2; exit 1; }

echo "==> Uploading $OUT to s3://$BUCKET"
aws s3 sync "$OUT/" "s3://$BUCKET/" --delete

echo "Site uploaded. If CloudFront still shows the old version, create an invalidation for /* in the distribution."
