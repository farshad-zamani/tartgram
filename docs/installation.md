# Installation and development

[فارسی](README.fa.md) · [Meta setup](meta-setup.md) · [Operations](operations.md)

## Requirements

- A Linux server with Docker Engine and Docker Compose, a persistent disk and outbound HTTPS access to Meta.
- An HTTPS domain pointing at the server; ports TCP 80/443 and optionally UDP 443 available to Caddy.
- Your own Meta app and a Business/Creator Instagram account. Approval requirements are in the Meta guide.
- For direct execution/development: Node.js 24 and pnpm 11.13.1. Node 26 is accepted, but Node 24 is the deployment baseline.

## Docker Compose

1. Clone this repository and copy `.env.example` to `.env`.
2. Set `PUBLIC_HOST=your-domain.example` and `PUBLIC_URL=https://your-domain.example`. `PUBLIC_URL` must be an origin without a subpath or credentials.
3. Replace `OPERATOR_NAME` and `OPERATOR_CONTACT_URL` with the real operator of this installation. Review `/privacy` and `/terms` before submitting the app to Meta.
4. Run `node scripts/generate-secrets.mjs --write`. It fills only empty local secrets and does not print them. Preserve `.env` securely: losing the encryption key makes saved tokens unreadable. Never commit this file.
5. Start `docker compose up --build -d` and inspect `docker compose ps` and `docker compose logs --tail=50 gateway`. Caddy obtains the certificate when public DNS and firewall settings are correct.
6. Open `/app/`, enter the management token from `.env`, and follow Settings → Meta setup.
7. Add the Meta credentials, configuration ID and verify-token settings described in [Meta setup](meta-setup.md), then run `docker compose up -d --force-recreate gateway`.

The gateway's port is internal to the Compose network. Caddy publishes HTTPS; the data is in the `tartgram-data` named volume. Do not run several gateways against the same data directory. Compose keeps the runtime filesystem read-only except the data volume and `/tmp`.

On a host without Node, generate local secrets using:

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24-bookworm-slim node scripts/generate-secrets.mjs --write
```

For PowerShell, install Node 24 and use `Copy-Item .env.example .env` followed by `node scripts/generate-secrets.mjs --write`. Restrict `.env` to the service account with Windows file permissions; Unix mode bits alone do not enforce a Windows ACL.

## Direct execution

```sh
npm install --global pnpm@11.13.1
pnpm install --frozen-lockfile
pnpm build
cp .env.example .env
node scripts/generate-secrets.mjs --write
```

Configure `.env`, put the process behind an HTTPS reverse proxy and run `pnpm start` from the repository root. The process uses `node --env-file=.env`; merely copying the example does not configure a separately invoked `node` process. A service manager should use the repository root as its working directory, run as an unprivileged service account, restart on failure, and allow up to three minutes for graceful shutdown. Keep `data/` outside public document roots.

## Local development

For local-only work set `PUBLIC_URL=http://localhost:8080`, `ALLOW_INSECURE_LOCALHOST=true`, `HOST=127.0.0.1`, and leave `OAUTH_REDIRECT_URI` unset. This exception accepts only loopback hosts. Meta's real callbacks still need public HTTPS.

After building the shared packages, run `pnpm dev:gateway`. To work on the frontend, run `pnpm --filter @app/desktop dev` in another terminal. Its API/OAuth proxy points at the local gateway. Use the built panel served by the gateway when testing login: strict origin checks intentionally reject mismatched Vite origins. Do not point the development proxy at a production installation.

The `apps/desktop` directory currently contains the web frontend. The old directory name is retained for workspace compatibility; there is no desktop installer in this release.

## Environment reference

| Setting | Meaning |
| --- | --- |
| `PUBLIC_HOST` | Domain used by Caddy |
| `PUBLIC_URL` | Canonical public HTTPS origin used for callbacks and uploaded media |
| `META_LOGIN_MODE` | `unified` (default) or eligible existing `instagram` integration |
| `META_GRAPH_VERSION` | Shared version for requests; default `v26.0` |
| `META_APP_ID`, `META_APP_SECRET` | Parent Meta app ID/secret; parent secret also verifies signed notifications |
| `META_CONFIG_ID` | Unified Login configuration ID; not itself a secret |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | Separate legacy Instagram app credentials; used only in legacy mode |
| `META_VERIFY_TOKEN` | Random shared value entered during Meta webhook verification |
| `GATEWAY_CLIENT_TOKEN` | Administrative login token; everyone possessing it controls this workspace |
| `TOKEN_ENCRYPTION_KEY` | Independent 32-byte encryption key encoded as 64 hexadecimal characters |
| `OAUTH_REDIRECT_URI` | Optional override; defaults to `PUBLIC_URL/oauth/instagram/callback`, must use the same origin |
| `DATA_DIR` | Persistent private data directory; `./data` directly or `/data` in Docker |
| `SPA_DIR` | Absolute/resolved frontend build path; set automatically in Docker |
| `SESSION_TTL_MS` | Absolute session lifetime; default eight hours, maximum 24 hours |
| `HUMAN_AGENT_ENABLED` | Default false; enable only after the Human Agent feature is approved |
| `HOST`, `PORT`, `LOG_LEVEL` | Network binding and logging; Docker sets `0.0.0.0:8080` internally |
| `ALLOW_INSECURE_LOCALHOST` | Development-only loopback HTTP exception; false in Compose |
| `TRUST_PROXY` | Default false. Do not enable behind an untrusted or directly exposed proxy |
| `OPERATOR_NAME`, `OPERATOR_CONTACT_URL` | Required operator identity and public contact for legal pages |
| `DEDUPE_TTL_MS` | Fast in-memory duplicate suppression; persisted receipt records additionally prevent repeated processing |

Do not put Meta app secrets or access tokens in frontend build variables. The UI exposes configuration readiness and public URLs only.
