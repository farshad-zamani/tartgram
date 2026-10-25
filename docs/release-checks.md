# Release checks — v0.2.0

Checked locally on 25 October 2026. See the separate [Meta compatibility review](meta-audit-2026-10-25.md) for official sources and the live-test boundary.

| Check | Result |
| --- | --- |
| TypeScript checks | Passed |
| Unit and integration tests | 188 passed (8 shared, 88 core, 92 gateway) |
| Chromium browser tests | 10 passed |
| Fresh clone with frozen lockfile | Install, build and tests passed |
| English/Persian screenshots | 12 fictional-data captures, including mobile inbox, visually reviewed |
| Dependency advisories | Zero reported by `pnpm audit` at verification time |
| Gitleaks | No findings in the staged public files or fresh release history |
| Linux Docker build | Passed with Node 24 |
| Compose configuration | Validated |
| Container runtime | Unprivileged, read-only root filesystem; health, panel and login passed |
| Persistence and recovery | Restart and restoration into a fresh volume passed |

Regression coverage includes invalid successful responses, OAuth cursor loops and incomplete permissions, simultaneous token refresh, revoked authorizations, self/deleted/unsupported messages, flow graph rejection, uncertain publication with no replay, selected-message reply payloads, expiring privacy status, upload ownership and serialized storage. Browser coverage includes failure/retry states, preserved drafts, repeated Enter submission, story captions, uncertain-publication warnings, logout failure and narrow Persian navigation.

The repository's CI repeats checks on Linux and Windows and builds/tests the container. Its actual workflow result is visible in the Actions tab.

These results do not include a real Meta app's OAuth consent, production webhook delivery, business verification, permission approval or actual Instagram publishing. Public-domain TLS issuance requires the operator's DNS and server; the local container check does not obtain a public certificate. Follow the live acceptance steps in [Meta setup](meta-setup.md).
