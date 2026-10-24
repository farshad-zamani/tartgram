# Meta API implementation notes

Verified against official documentation on 24 October 2026. Start with [the setup guide](meta-setup.md) for app approval and configuration.

- New apps use Unified Login, Business Integration System User tokens, `instagram_*` permissions and `graph.facebook.com`.
- Eligible existing Instagram Login apps use Instagram User tokens, `instagram_business_*` permissions and `graph.instagram.com`. No automatic conversion is attempted.
- The shared runtime Graph version is `v26.0`; OAuth adapters, management clients, the engine and scheduler all use it.
- Unified `/me` is a system user, not the Instagram account. Assigned account IDs are fetched and explicitly used in resource paths.
- Tokens are server-side and encrypted at rest. Graph operations use Bearer headers. Official OAuth/debug/refresh endpoints that require query parameters are called only server-to-server and are never request-logged by this application.
- Webhooks verify the raw HMAC-SHA256 body, acknowledge promptly and process under an account lock. Persisted receipts suppress duplicates; they are not a durable work queue.
- Standard messaging uses a verified 24-hour interaction window. Human Agent is manual-only and disabled until configured after approval. Private replies are limited to one per comment within seven days; Meta additionally enforces active-Live eligibility.
- Publishing reads the account's live quota instead of assuming 25, 50 or 100. Newer Meta documentation describes 100 in a rolling 24 hours, but account responses are authoritative.
- A missing `media_url` is valid after Meta's download/copyright changes; media IDs and permalinks remain useful.
- `media_publish` can succeed with a non-blocking `config_issue`; callers retain the warning and must inspect the published result.
- Contact-information quick replies were disabled in October 2026. This implementation sends only plain-text quick replies.
- Recent API additions outside the current feature set, such as advertising, are not requested or advertised as implemented.

Official references: [Unified authentication](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), [migration](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide), [webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks), [private replies](https://developers.facebook.com/docs/instagram-platform/private-replies/), [content publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/), [Instagram changelog](https://developers.facebook.com/docs/instagram-platform/changelog/).
