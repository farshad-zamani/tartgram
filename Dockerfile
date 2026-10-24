FROM node:24-bookworm-slim AS build
WORKDIR /source
RUN npm install --global pnpm@11.13.1
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
RUN pnpm --filter @app/gateway deploy --prod --legacy /runtime

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data SPA_DIR=/app/public
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ /app/
COPY --from=build --chown=node:node /source/apps/desktop/dist/ /app/public/
RUN mkdir /data && chown node:node /data
COPY --chown=node:node LICENSE NOTICE /app/
COPY --chown=node:node docs/third-party /app/third-party
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/index.js"]
