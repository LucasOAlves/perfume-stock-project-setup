# ADR-011 — AWS Deployment: CloudFront in Front of S3 and a Single EC2, with RDS

## Status

Accepted

## Context

The deploy track was the last undecided area (`docs/decisions/ADR-008-cicd-and-lint-tooling.md` deliberately stopped at CI). The project owner is also preparing for the AWS Certified Cloud Practitioner exam and wants this deployment to double as a hands-on lab, with cost minimization as the standing priority (ADR-010). The requirements that shape the design:

- The session cookie is `SameSite=Lax` and CSRF is header-based (ADR-004). A browser only sends that cookie on API calls if the site and the API share an origin.
- There is no owned domain, so the public URL is the one CloudFront provides (`*.cloudfront.net`, HTTPS included).
- The API is a long-running Fastify process with a PostgreSQL dependency; the frontend is a static Angular build.

## Options Considered

1. **Site and API on separate origins** (e.g. S3 website plus an API URL). Rejected — the `SameSite=Lax` cookie would not accompany cross-site XHR calls, forcing a weaker cookie policy or a domain purchase.
2. **App Runner** for the API. Simpler, but about US$5–10/month even idle and it hides the networking the owner wants to learn.
3. **Lambda + Function URL.** Near-zero cost, but requires adapting Fastify and putting Lambda in a VPC (NAT cost) to reach RDS.
4. **One CloudFront distribution, two origins:** S3 (private, via Origin Access Control) for the site and a single EC2 instance running the API container for `/api/*`, with RDS PostgreSQL in a private subnet. Chosen.

## Decision

Option 4, in `us-east-1` (cheapest region, and where CloudFront certificates live), in a **new, dedicated AWS account** with MFA on the root user, an administrator IAM identity for daily work, and AWS Budgets alerts set before any resource exists.

- **Routing:** CloudFront's default behavior serves the Angular build from S3; the `/api/*` behavior forwards to the EC2 origin with caching disabled and cookies, the `x-csrf-token` header and query strings forwarded. The production web build calls `/api` (`isDevMode()` switch in `api.service.ts`); the API strips the prefix (`API_PATH_PREFIX=/api`, Fastify `rewriteUrl`) so routes stay prefix-free and tests are unaffected.
- **Client IP:** `trustProxy` was `true`, which trusts every `X-Forwarded-For` hop and would let a client spoof its IP and dodge the per-IP OTP rate limit. It is now `TRUST_PROXY_HOPS` (default `0`); production sets `1` (CloudFront is the single proxy).
- **Network:** the API's Security Group accepts inbound traffic only from the CloudFront origin-facing managed prefix list, so the EC2 cannot be called around CloudFront. The RDS Security Group accepts port 5432 only from the API's Security Group; RDS is not publicly accessible.
- **Database TLS:** RDS PostgreSQL 15+ rejects plain connections. The API image ships AWS's RDS CA bundle and `DATABASE_SSL_CA_PATH` turns on verified TLS; unset (local, CI) keeps plain connections.
- **Secrets:** SSM Parameter Store SecureString parameters under `/estoque-vivo/*`, read by an EC2 instance role scoped to that prefix. No access keys on the instance, none in the repo.
- **Packaging:** `apps/api/Dockerfile` (repo root as build context), built in CI on every change as a verification. Phase 1 builds the image on the instance from the public repo; publishing to ECR and deploying from GitHub Actions via OIDC (no long-lived keys) is a later phase. Migrations run from the compiled code (`npm run migration:run:prod`).

## Consequences

- One public URL, same-origin cookies, HTTPS without a domain or certificate work.
- Deliberate single points of failure: one EC2, one Availability Zone, Single-AZ RDS. Multi-AZ RDS and an Auto Scaling group behind a load balancer are the upgrade path when cost allows.
- The origin hop between CloudFront and EC2 is plain HTTP inside AWS. Accepted for the MVP; revisit with an origin certificate or an ALB.
- Estimated steady-state cost is roughly US$26–28/month in `us-east-1` (EC2 t3.micro, public IPv4, RDS db.t4g.micro and storage, negligible CloudFront/S3), to be confirmed with the AWS Pricing Calculator; new-account credits are expected to cover the first months.
- Operating the EC2 (OS patches, Docker, disk) is the owner's responsibility under the shared responsibility model; the RDS engine and OS patching are AWS's.

## Security/Operational Impact

The public repository (ADR-007) must never contain account IDs, ARNs with account numbers, access keys or real hostnames; the runbook uses placeholders. `BREVO_API_KEY`, `SESSION_COOKIE_SECRET` and the database password live only in SSM. `OTP_SENDER=brevo` must be set in production; `console` would print login codes into the container logs.

## Revisit When

There is an owned domain (Route 53 + ACM, HTTPS to the origin), real traffic justifies Multi-AZ or an Auto Scaling group, or the free credits end and cost needs re-evaluation (a Lambda or App Runner variant becomes worth comparing).
