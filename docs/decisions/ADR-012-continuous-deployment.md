# ADR-012 — Continuous Deployment via GitHub OIDC and SSM Run Command

## Status

Proposed

## Context

ADR-011 shipped a manual deploy and named "publish to ECR and deploy from GitHub Actions via OIDC" as a later phase. After the first real deployment (2026-10-21) the manual path is two scripts on the instance (`scripts/deploy-api.sh`, `scripts/deploy-web.sh`), but the owner has to open a Session Manager shell and type them, and CloudFront keeps serving the old `index.html` until its cache expires. The owner asked for every merge to `main` to rebuild and redeploy both apps. Cost minimization (ADR-010) and "no long-lived AWS keys" (ADR-011) still apply.

## Options Considered

1. **Build in GitHub Actions, push the API image to ECR, sync the site to S3 from Actions, and have the instance pull the image.** Faster deploys and no build load on the t3.micro, but adds ECR (storage cost, lifecycle policy, an instance pull step) and a second build definition for the site.
2. **GitHub Actions calls SSM Run Command, which runs the existing deploy scripts on the instance, then invalidates CloudFront.** Reuses the scripts already proven in production; no new AWS service beyond IAM; builds still run on the instance (minutes, and they need the 2 GB swap).
3. **A long-lived IAM user's access keys in GitHub secrets.** Rejected: ADR-011 rules out long-lived keys.

## Decision

Option 2. `.github/workflows/deploy.yml` triggers on the CI workflow completing successfully for a push to `main`, assumes an IAM role through GitHub's OIDC provider (trust limited to this repository's `main` branch), sends `AWS-RunShellScript` to the one instance to reset the checkout to the tested commit and run both deploy scripts as `ec2-user`, waits for the result, prints the tail of the output, and invalidates `/*` on the distribution. The role can only send that document to that instance, read command results, and invalidate that distribution. Account-specific values are GitHub repository variables. The job is skipped until the role ARN variable exists, so merging this changes nothing until the AWS side is set up.

## Consequences

- A merge to `main` is live a few minutes after CI goes green, with no shell session.
- Deploys are serialized (`concurrency`), and a failed script fails the run with the instance output visible in the Actions log.
- The instance still builds both apps, so deploys are slow and briefly load the t3.micro; a failed API health check leaves the old container replaced (the script recreates `api` before checking). Moving builds to Actions with ECR (Option 1) is the upgrade path.
- CloudFront invalidations are free for the first 1,000 paths a month; `/*` counts as one.

## Security/Operational Impact

No AWS credentials are stored in GitHub. The OIDC trust is scoped to `repo:LucasOAlves/perfume-stock-project-setup:ref:refs/heads/main`. SSM commands run as root, so the workflow drops to `ec2-user` explicitly. The checkout on the instance is reset hard to the deployed commit, so manual edits there are discarded on the next deploy.

## Revisit When

Builds on the instance become too slow or start failing for memory, the app moves to more than one instance, or ECR's cost becomes negligible next to the time saved.
