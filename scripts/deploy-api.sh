#!/usr/bin/env bash
# Builds and (re)starts the API container on the EC2 instance (ADR-011, docs/deploy/aws-runbook.md Phase 2).
# Run from the repo root as ec2-user: bash scripts/deploy-api.sh
# Secrets come from SSM Parameter Store under /estoque-vivo/ via the instance role; none live in this file.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENV_FILE="${ENV_FILE:-$HOME/api.env}"
IMAGE=estoque-vivo-api

cd "$(dirname "$0")/.."

echo "==> Building image $IMAGE"
docker build -f apps/api/Dockerfile -t "$IMAGE" .

echo "==> Writing $ENV_FILE from Parameter Store"
umask 077
aws ssm get-parameters-by-path --region "$REGION" \
  --path /estoque-vivo/ --with-decryption \
  --query 'Parameters[*].[Name,Value]' --output text \
  | sed 's|^/estoque-vivo/||; s|\t|=|' > "$ENV_FILE"
cat >> "$ENV_FILE" <<'VARS'
NODE_ENV=production
OTP_SENDER=brevo
TRUST_PROXY_HOPS=1
API_PATH_PREFIX=/api
DATABASE_SSL_CA_PATH=/opt/rds/global-bundle.pem
VARS
echo "    variables: $(cut -d= -f1 "$ENV_FILE" | tr '\n' ' ')"
for name in DATABASE_URL SESSION_COOKIE_SECRET BREVO_API_KEY BREVO_FROM_EMAIL; do
  grep -q "^$name=" "$ENV_FILE" || { echo "Missing /estoque-vivo/$name in Parameter Store" >&2; exit 1; }
done

echo "==> Running migrations"
docker run --rm --env-file "$ENV_FILE" "$IMAGE" npm run migration:run:prod

echo "==> (Re)starting container api"
docker rm -f api >/dev/null 2>&1 || true
docker run -d --restart unless-stopped --name api -p 3000:3000 --env-file "$ENV_FILE" "$IMAGE"

echo "==> Health check"
for _ in $(seq 1 15); do
  if curl -fsS localhost:3000/health; then echo; echo "API is up."; exit 0; fi
  sleep 2
done
echo "API did not answer /health; last logs:" >&2
docker logs --tail 50 api >&2
exit 1
