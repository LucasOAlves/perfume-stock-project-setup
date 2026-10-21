# AWS Deployment Runbook (Console, Phase 0–3)

Architecture and reasoning: [ADR-011](../decisions/ADR-011-aws-deployment-architecture.md). Study checklist: the "AWS Practitioner com o Estoque Vivo" artifact. Everything here uses placeholders — never commit real account IDs, hostnames or keys (ADR-007).

## Phase 0 — Account and guardrails

1. Create a **new AWS account** with its own email (an alias like `you+aws@…` works). Enable **MFA on the root user** and stop using root.
2. Create an administrator identity (IAM Identity Center, or an IAM user) with MFA for daily work.
3. **Billing → Budgets**: create alerts at US$10 and US$25. Open Cost Explorer.
4. Pick region **us-east-1**. Tag every resource `project=estoque-vivo`.

## Phase 1 — Network and database

1. **EC2 → Security Groups** (default VPC):
   - `sg-api`: inbound TCP 3000 from the managed prefix list `com.amazonaws.global.cloudfront.origin-facing` only.
   - `sg-db`: inbound TCP 5432 from `sg-api` only.
2. **RDS → Create database**: PostgreSQL, `db.t4g.micro`, Single-AZ, 20 GB gp3, **Public access: No**, security group `sg-db`, automated backups 7 days, initial database `shared_stock`. Save the master password in a password manager.
3. **Systems Manager → Parameter Store**, SecureString, under `/estoque-vivo/`: `DATABASE_URL` (`postgres://user:pass@<rds-endpoint>:5432/shared_stock`), `SESSION_COOKIE_SECRET` (long random string), `BREVO_API_KEY`, `BREVO_FROM_EMAIL`.

## Phase 2 — API on EC2

1. **IAM role** for EC2 with a policy allowing `ssm:GetParametersByPath` (and KMS decrypt for the default key) on `/estoque-vivo/*` only.
2. Launch **t3.micro**, Amazon Linux, the role above, `sg-api`, public IPv4, 8 GB gp3. Install Docker and git.
3. On the instance:
   ```bash
   git clone https://github.com/LucasOAlves/perfume-stock-project-setup.git
   cd perfume-stock-project-setup
   docker build -f apps/api/Dockerfile -t estoque-vivo-api .
   ```
4. Write an env file (`chmod 600`) from Parameter Store, plus:
   `NODE_ENV=production`, `OTP_SENDER=brevo`, `TRUST_PROXY_HOPS=1`, `API_PATH_PREFIX=/api`, `DATABASE_SSL_CA_PATH=/opt/rds/global-bundle.pem`.
5. Migrate, then run:
   ```bash
   docker run --rm --env-file /path/to/env estoque-vivo-api npm run migration:run:prod
   docker run -d --restart unless-stopped --name api -p 3000:3000 --env-file /path/to/env estoque-vivo-api
   ```
6. Check `curl localhost:3000/health`.

Steps 3 (build) to 6 are also scripted: from the repo root run `bash scripts/deploy-api.sh`. Re-run it after `git pull` to redeploy.

## Phase 3 — Site and CloudFront

1. **S3**: private bucket, Block Public Access on. Build the site (`npm run build:web`) and upload `apps/web/dist/web/browser/`.
2. **CloudFront** distribution:
   - Origin 1: the S3 bucket with **Origin Access Control**; default behavior serves it. Default root object `index.html`; custom error responses 403/404 → `/index.html` with 200 (Angular routing).
   - Origin 2: the EC2 public DNS, HTTP only, port 3000; behavior path `/api/*`, cache policy **CachingDisabled**, origin request policy **AllViewerExceptHostHeader**, all HTTP methods allowed.
3. Apply the bucket policy CloudFront suggests for OAC.
4. Open the `*.cloudfront.net` URL and log in by email end to end.

## Teardown (do this on purpose at least once)

Delete the CloudFront distribution (disable first), the S3 bucket, the EC2 instance and its volume, the RDS instance (skip or keep a final snapshot), the Security Groups, the SSM parameters, and the IAM role. Check Cost Explorer the next day.
