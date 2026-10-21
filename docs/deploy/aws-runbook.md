# AWS Deployment Runbook (Console, Phase 0–3)

Architecture and reasoning: [ADR-011](../decisions/ADR-011-aws-deployment-architecture.md). Study checklist: the "AWS Practitioner com o Estoque Vivo" artifact. Everything here uses placeholders — never commit real account IDs, hostnames, IPs or keys (ADR-007).

First deployed end to end on 2026-10-21 following this runbook; the notes marked **Gotcha** are what actually went wrong that day.

## Phase 0 — Account and guardrails

1. Create a **new AWS account** with its own email (an alias like `you+aws@…` works). Enable **MFA on the root user** and stop using root.
2. As root, **Account → IAM user and role access to Billing information → Activate IAM Access**. Without it the admin identity below cannot see costs or create budgets.
3. Create an administrator identity (IAM Identity Center, or an IAM user with `AdministratorAccess`) with MFA for daily work.
4. **Billing → Budgets**: create alerts at US$10 and US$25. Open Cost Explorer.
5. Pick region **us-east-1**. Tag every resource `project=estoque-vivo`. Global services (IAM, Billing, CloudFront) show the region selector as "Global" and greyed out; that is expected.

## Phase 1 — Network and database

1. **EC2 → Security Groups** (default VPC):
   - `sg-api`: inbound TCP 3000 from the managed prefix list `com.amazonaws.global.cloudfront.origin-facing` only. No port 22: shell access is through Session Manager (Phase 2).
   - `sg-db`: inbound TCP 5432 from `sg-api` only.
2. **RDS → Create database**: PostgreSQL (the default version works), Free tier template, `db.t4g.micro`, Single-AZ, 20 GB gp3, storage autoscaling off, **Public access: No**, security group `sg-db` only (**Gotcha:** the console preselects `default` too; remove it), automated backups 7 days, and under **Additional configuration** the initial database name `shared_stock` (without it RDS creates no database). Use a master password of letters and digits only: it goes inside a URL.
3. **Systems Manager → Parameter Store**, Standard tier, SecureString, default `alias/aws/ssm` key, under `/estoque-vivo/` (the part after the prefix becomes the env var name, so keep the exact case):
   - `DATABASE_URL` = `postgres://<user>:<password>@<rds-endpoint>:5432/shared_stock` (endpoint from RDS → the database → Connectivity & security, once it is Available)
   - `SESSION_COOKIE_SECRET` (64+ random hex characters)
   - `BREVO_API_KEY` (an **API** key, `xkeysib-…`, not an SMTP key)
   - `BREVO_FROM_EMAIL` (the sender address verified in Brevo)
   - `BREVO_FROM_NAME` (optional, defaults to "Estoque Vivo")

## Phase 2 — API on EC2

1. **IAM role** `estoque-vivo-ec2` for EC2 with:
   - the managed policy `AmazonSSMManagedInstanceCore` (Session Manager shell, no SSH key or open port);
   - an inline policy allowing `ssm:GetParametersByPath` on `arn:aws:ssm:us-east-1:*:parameter/estoque-vivo*` and `kms:Decrypt` with condition `kms:ViaService = ssm.us-east-1.amazonaws.com`. **Gotcha:** the ARN needs the colon after the account `*`; the policy editor rejects `…:*parameter/…`.
2. Launch **t3.micro**, Amazon Linux 2023, no key pair, the role above, `sg-api`, public IPv4, 8 GB gp3, credit specification **Standard**.
3. Connect with **EC2 → Connect → Session Manager** (EC2 Instance Connect uses SSH and fails by design), then `sudo su - ec2-user` and:
   ```bash
   sudo dnf install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user
   sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
   sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   exit   # then sudo su - ec2-user again so the docker group applies
   ```
   The 2 GB swap keeps the image and site builds from running out of the instance's 1 GB of RAM.
4. Clone and deploy:
   ```bash
   git clone https://github.com/LucasOAlves/perfume-stock-project-setup.git
   cd perfume-stock-project-setup
   bash scripts/deploy-api.sh
   ```
   The script builds the image, writes `~/api.env` (mode 600) from Parameter Store plus `NODE_ENV=production`, `OTP_SENDER=brevo`, `TRUST_PROXY_HOPS=1`, `API_PATH_PREFIX=/api` and `DATABASE_SSL_CA_PATH=/opt/rds/global-bundle.pem`, stops if a required secret is missing, runs migrations, (re)starts the `api` container and checks `/health`. It ends with "API is up.".
5. **Brevo IP allow-list.** Brevo blocks API calls from unknown IPs. Add the instance's public IPv4 under Brevo → Security → Authorised IPs (https://app.brevo.com/security/authorised_ips). A failed send shows up in `docker logs api` as `[brevo] … rejected: HTTP <status> <body>` with addresses masked: `Key not found` means a wrong or SMTP key, `unrecognised IP address` means this step.

## Phase 3 — Site and CloudFront

1. **S3**: private bucket in us-east-1 (globally unique name), Block Public Access on.
2. Add an inline policy to `estoque-vivo-ec2` allowing `s3:ListBucket` on `arn:aws:s3:::<bucket>` and `s3:PutObject` / `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`. **Gotcha:** without the `/*` every upload fails with AccessDenied.
3. On the instance: `bash scripts/deploy-web.sh <bucket>` (builds the Angular app in a Node container and syncs `apps/web/dist/web/browser/` to the bucket).
4. **CloudFront → Create distribution**, Pay-as-you-go:
   - Origin: the S3 bucket with **Origin Access Control**; let the wizard update the bucket policy (or paste the one it offers under the bucket's Permissions).
   - Security: **Do not enable** WAF (billed separately; not needed for the MVP).
   - After creation: General → Settings → Default root object `index.html`.
5. **SPA routing with a CloudFront Function**, not custom error responses (those would also turn the API's own 403/404 into `index.html` with 200). Functions → Create `spa-index`, runtime `cloudfront-js-2.0`, publish it, and associate it with the **Default (\*)** behavior on **Viewer request**:
   ```js
   function handler(event) {
     var req = event.request;
     if (req.uri.indexOf(".") === -1) {
       req.uri = "/index.html";
     }
     return req;
   }
   ```
   A 503 "The CloudFront function associated with the distribution is invalid" means a typo, an unpublished function, or the wrong event type.
6. Origins → Create origin: the EC2 **Public IPv4 DNS**, HTTP only, port 3000, name `api-ec2`. Behaviors → Create behavior: path `/api/*`, origin `api-ec2`, Redirect HTTP to HTTPS, all HTTP methods, cache policy **CachingDisabled**, origin request policy **AllViewerExceptHostHeader**, no function. It must sit above Default (\*) (precedence 0).
7. Once the distribution is deployed: `https://<distribution>.cloudfront.net/api/health` returns `{"ok":true}`, then log in by email on `https://<distribution>.cloudfront.net`.

## Phase 4 — Continuous deployment (optional)

[ADR-012](../decisions/ADR-012-continuous-deployment.md). After CI passes on a push to `main`, `.github/workflows/deploy.yml` runs the two deploy scripts on the instance through SSM Run Command and invalidates CloudFront. One-time setup:

1. **IAM → Identity providers → Add provider**: OpenID Connect, provider URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
2. **IAM → Roles → Create role** → Web identity → that provider, audience `sts.amazonaws.com`, GitHub organization `LucasOAlves`, repository `perfume-stock-project-setup`, branch `main`. No managed policies. Name it `estoque-vivo-github-deploy`.
   **Gotcha:** repositories created or renamed after 2026-07-15 send an immutable-ID subject (`repo:<owner>@<owner-id>/<repo>@<repo-id>:ref:refs/heads/main`), but the wizard writes the old `repo:<owner>/<repo>:…` form and every run fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity". Edit the trust policy's `sub` to the ID form; the IDs come from `https://api.github.com/repos/<owner>/<repo>` (`owner.id` and `id`).
3. Add an inline policy to it (replace the placeholders; `*` in the account field avoids typing the account ID):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "ssm:SendCommand",
         "Resource": [
           "arn:aws:ec2:us-east-1:*:instance/<instance-id>",
           "arn:aws:ssm:us-east-1::document/AWS-RunShellScript"
         ]
       },
       { "Effect": "Allow", "Action": "ssm:GetCommandInvocation", "Resource": "*" },
       {
         "Effect": "Allow",
         "Action": "cloudfront:CreateInvalidation",
         "Resource": "arn:aws:cloudfront::*:distribution/<distribution-id>"
       }
     ]
   }
   ```
4. **GitHub → repository Settings → Secrets and variables → Actions → Variables**: `AWS_DEPLOY_ROLE_ARN` (the role's ARN), `EC2_INSTANCE_ID`, `WEB_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`. These are variables, not secrets: none of them grants access on its own, and they stay out of the repository files (ADR-007).
5. Test it: Actions tab → **Deploy** → **Run workflow** on `main` (or merge something to `main`). Until `AWS_DEPLOY_ROLE_ARN` is set, the job is skipped. Each run does `git reset --hard` in the checkout on the instance, so edits made by hand there are discarded.

## Operating it

- **Redeploy** after changes on `main`: automatic once Phase 4 is set up; by hand, on the instance, `git pull`, then `bash scripts/deploy-api.sh` and/or `bash scripts/deploy-web.sh <bucket>`.
- **Reboot is safe; Stop/Start is not.** Stop/Start gives the instance a new public IP and DNS, which breaks the Brevo allow-list and the CloudFront `api-ec2` origin until both are updated. An Elastic IP would remove this, at the same hourly cost as the public IPv4 already paid.
- **Logs**: `docker logs --tail 50 api`.

## Teardown (do this on purpose at least once)

Delete the CloudFront distribution (disable first) and the `spa-index` function, the S3 bucket (empty it first), the EC2 instance and its volume, the RDS instance (skip or keep a final snapshot), the Security Groups, the SSM parameters, and the IAM role. Check Cost Explorer the next day.
