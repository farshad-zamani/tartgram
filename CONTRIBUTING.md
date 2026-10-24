# Contributing

Bug reports and improvements are welcome. Use the issue forms and include reproduction steps, the release version, selected Meta login mode and sanitized diagnostics. Reported problems will be investigated and fixes published in updates. Please avoid sharing secrets or customer data.

Keep integrations on official Meta endpoints and request only permissions used by the shipped features. Include official documentation links when changing an API contract. Preserve Persian/English behavior, RTL/LTR support and the CloudTart attribution required by CPAL-1.0.

Use Node 24 and pnpm 11.13.1. Before submitting a change, run:

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test:run
pnpm build
pnpm audit
pnpm exec playwright install chromium
pnpm test:browser
```

Add behavior tests for security or API changes. Never use a live customer account in CI. Changes to screenshots must identify that their data is fictional. Contributions are made under CPAL-1.0; retain required notices and third-party licenses.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.
