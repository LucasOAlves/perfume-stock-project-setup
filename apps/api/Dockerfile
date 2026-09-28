# Build with the repo root as context: docker build -f apps/api/Dockerfile -t estoque-vivo-api .
# npm workspaces: only apps/api is installed, apps/web is never pulled in.
FROM node:24-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build --workspace apps/api

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/api --include-workspace-root=false --omit=dev
COPY --from=build /repo/apps/api/dist apps/api/dist
# AWS RDS global CA bundle, used when DATABASE_SSL_CA_PATH points at it (see ADR-011).
# ADD from a URL creates the file as 0600 root, unreadable by the non-root "node" user below,
# so it goes in its own directory and is made world-readable explicitly. (Do not use ADD --chmod
# into /etc/ssl: it also strips the directory's execute bit and breaks OpenSSL.)
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /opt/rds/global-bundle.pem
RUN chmod 755 /opt/rds && chmod 644 /opt/rds/global-bundle.pem
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
