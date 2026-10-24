# Initial release checks

Checked locally on 24 October 2026:

| Check | Result |
| --- | --- |
| TypeScript checks | Passed |
| Unit and integration tests | 99 passed |
| Chromium browser tests | 4 passed |
| Fresh clone with frozen lockfile | Install, build and tests passed |
| English/Persian screenshots | 11 fictional-data captures, visually reviewed |
| Dependency advisories | Zero reported by `pnpm audit` at verification time |
| Gitleaks | No findings in the staged public files or fresh release history |
| Linux Docker build | Passed with Node 24 |
| Compose configuration | Validated |
| Container runtime | Unprivileged, read-only root filesystem; health, panel and login passed |
| Persistence and recovery | Restart and restoration into a fresh volume passed |

The repository's CI repeats checks on Linux and Windows and builds/tests the container. Its actual workflow result is visible in the Actions tab.

These results do not include a real Meta app's OAuth consent, production webhook delivery, business verification, permission approval or actual Instagram publishing. Public-domain TLS issuance requires the operator's DNS and server; the local container check does not obtain a public certificate. Follow the live acceptance steps in [Meta setup](meta-setup.md).
