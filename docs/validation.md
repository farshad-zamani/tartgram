# Validation and known limits

Release validation distinguishes local software behavior from Meta's live service.

## Automated coverage

- Core keyword matching, comment/DM/story flows, postbacks and follow-gate behavior.
- Raw-byte webhook signatures, verification challenges, duplicate suppression and network websocket delivery.
- Browser sessions, secure cookie attributes, Origin enforcement, login throttling and state bound to the initiating session.
- Unified Login fixtures, multiple assigned accounts, incomplete permissions, subscription failures and legacy response shapes.
- Token encryption, wrong-key/tamper refusal, concurrent store writes and refusal of corrupt/plaintext files.
- Complete local data deletion, confirmation links, invalid signed callbacks, account isolation in scheduled deletion and restart-safe stores.
- Messaging windows, oversized Unicode messages, quota failures, file rejection and CSV formula protection.
- Publishing container readiness, scheduled execution and interrupted-publication handling.
- Chromium checks of real panel login/logout and English/Persian UI workflows, narrow setup and inbox views, threaded replies, retry, action failures and ambiguous publication warnings.
- Malformed successful responses, repeated/missing OAuth cursors, duplicate account pages, concurrent legacy refresh and revoked authorizations.
- Uncertain immediate/scheduled publishing without automatic replay, one-minute processing polls, upload ownership and cleanup retention.
- Cyclic/dangling flow rejection, repeated-submit guards, expiring confirmation links and unmapped privacy requests without false completion.

`pnpm test:run` runs unit/integration tests. `pnpm test:browser` runs Chromium against an isolated loopback gateway and generates the screenshot samples. No real Meta credentials are used by those tests. `pnpm audit` checks resolved package advisories; it is a point-in-time dependency check, not a guarantee of security.

## Live Meta status

Live OAuth, business verification, Advanced Access, real webhook delivery and actual Instagram publishing require an operator-owned eligible app and authorized accounts. They are **not certified by this repository's fixture tests**, screenshots or release notes. The initial public release has no included production app approval or live end-to-end certification. Operators must complete the acceptance steps in [Meta setup](meta-setup.md).

## Limits

The supported deployment is one gateway process and one trusted administrative workspace. JSON storage is intentionally modest; multi-process writes and horizontally scaled deployments are unsupported. Token encryption protects stored credentials but does not encrypt other operational data or protect against a compromised running server with access to the key.

The webhook receiver is not a durable queue. Deduplication does not guarantee successful delivery, and external API actions do not have an exactly-once guarantee. Live-comment timing and other eligibility rules remain enforced by Meta.

Inbox lists are recent, bounded results rather than a full historical mirror. Replies to a selected message are supported. Rich attachment rendering, complete pagination, durable delayed flow nodes and the unused `welcome` trigger are not offered as supported panel features. Delay/welcome definitions submitted through the API are rejected rather than silently executed incorrectly.

Unified expiration is observed from Meta; this release uses reconnection instead of the optional System User token management API. Migration between login families requires explicit reconnection/mapping, not automatic token conversion.

Signed privacy callbacks act on the stored authorization subject. Unified business system users are different from the person who connected the app; this release cannot automatically map every person identifier in a callback to a business grant. An unmapped request while accounts remain is recorded as needing attention. The operator must verify the requester and delete the relevant accounts through Accounts; the public status must not be treated as successful automatic deletion. A self-hosted operator needs this manual privacy-request process before production use.

The public privacy pages describe the shipped software. Operators must adapt them to actual hosting providers, backup retention, legal identity and any downstream modifications. Automated experiences may require appropriate disclosure under applicable rules; an operator should configure its message copy accordingly.
