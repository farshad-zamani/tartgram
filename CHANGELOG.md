# Changelog

## 0.2.0 — 2026-10-25

Reliability and Meta compatibility update, by CloudTart.

- Rechecked the official Graph version index, v26 changelog, Unified authorization, messaging, publishing and webhook contracts. Graph v26.0 remains current.
- Added replies to specific messages in the inbox and exposed story captions in the publishing form.
- Distinguished failed inbox synchronization from empty results; added retry, preserved comment drafts after errors, and made conversation navigation usable on narrow screens.
- Rejected malformed successful API responses instead of recording false successes. Bounded and deduplicated assigned-account pagination without following remote paging URLs.
- Used actual authorization/data-access expiry, serialized legacy refresh requests and stopped using revoked tokens. Expired connections now need attention in the panel.
- Persisted immediate publishing history. A lost or malformed final publication response becomes `uncertain`, includes the container ID when available, and is never retried automatically. Container polling follows Meta's one-minute recommendation for up to five minutes.
- Ignored deleted, unsupported, self-test and outbound messages for automation; prevented replies to the business's own comments and rechecked messaging deadlines before each flow send.
- Rejected cyclic, dangling and oversized flow graphs, duplicate identifiers and local-only ice-breaker edits that bypass Meta synchronization.
- Staged uploads privately until validation, checked upload ownership, serialized cleanup with workspace writes and retained media needed by uncertain posts.
- Reported unmapped signed privacy requests as requiring attention, with no false deletion confirmation. Confirmation links expire after 30 days even without another request.
- Expanded regression and browser coverage, refreshed bilingual screenshots and documented live acceptance and upgrade boundaries.

See [validation](docs/validation.md) and [release checks](docs/release-checks.md). This release does not include a verified production Meta app or a successful live-account test claim.

## 0.1.0 — 2026-10-24

First public TartGram release, by CloudTart.

- Self-hosted web panel for official Meta Instagram automation, inbox, contacts and publishing.
- Unified Login as the default, with explicit support for eligible existing Instagram Login apps.
- Shared Graph v26.0 configuration, token-family separation, multi-account authorization and subscription status.
- Encrypted token storage, atomic data writes, expiring browser sessions, Origin checks and private OAuth state.
- Complete local account deletion, upload restrictions, messaging-window checks and publishing-quota handling.
- Docker Compose deployment, English/Persian setup guides and fictional-data interface screenshots.
- CPAL-1.0 licensing and visible CloudTart attribution.

Automated validation uses fixtures and local browser/network tests. Production Meta approval and live end-to-end account certification are not included. Known limitations are documented in `docs/validation.md`.
