# Set up Meta and connect Instagram

Last researched: **24 October 2026**. Meta changes dashboard labels and requirements; the linked official documentation is the source of truth. This guide does not supply or guarantee approval.

## 1. Choose the supported official setup

**Use Unified Login for a new app.** Meta's current migration guide states that newly created apps cannot set up the older Instagram Login flow. Existing eligible Instagram Login apps continue to work; no retirement date is announced in that guide. TartGram supports them through its explicit legacy mode. Do not mix their app IDs, permission families, API hosts or token types.

| | Unified Login | Existing Instagram Login |
| --- | --- | --- |
| API host | `graph.facebook.com` | `graph.instagram.com` |
| Credentials for OAuth | Meta app ID and secret | Instagram app ID and secret |
| Configuration | `config_id` | Instagram scopes |
| Token | Business Integration System User Access Token | Instagram User access token |
| Instagram account IDs | `/me/assigned_instagram_accounts` | Token/profile response |
| Facebook Page | Not required | Not required |
| Business portfolio | Required | Follow the existing app's requirements |

TartGram does not request Instagram passwords. The owner enters credentials only on a page hosted by Meta.

## 2. Prepare your business and app

1. Register as a Meta developer and create an app with the **Manage messaging & content on Instagram** use case.
2. Connect the app to a **Business Portfolio** owned and administered by your organization. Without it, the Unified Login setup tab may be absent.
3. Use a real Instagram **Business or Creator** account for testing. A personal account must be converted in Instagram first. The Unified guide says synthetic Meta test users are not supported.
4. Deploy TartGram on public HTTPS and configure your operator identity/contact. Verify `/app/`, `/privacy`, `/terms` and `/healthz` are reachable. Review the legal copy against your actual hosting and retention practices.
5. Enter the relevant app domains, privacy URL, terms URL, deauthorization callback and data deletion callback in Meta's app settings. Copy their exact values from TartGram Settings.

The source license attribution identifies the software's developer. It does not make CloudTart the operator, verified business or data controller of your deployment.

## 3. Configure Unified Login

In the App Dashboard open **Use cases → Manage messaging & content on Instagram → Customize → API setup with Unified login**.

1. Under **Configure your app**, create or select a compatible Facebook Login for Business configuration and choose **Use this configuration**. An existing configuration must carry the **Instagram Login Compatible** label.
2. Configure an Instagram account asset and the four permissions below. The default Meta configuration may include ads permissions; remove `ads_read` and `ads_management` because this release does not implement ads. If an optional ad-account selection remains, clients can skip it.
3. Register the exact HTTPS redirect URI from TartGram Settings, including its path and any trailing slash. The default is `https://YOUR_DOMAIN/oauth/instagram/callback`.
4. Review the configuration's token type and expiration. Save its `config_id` as `META_CONFIG_ID` in the server `.env`. Set `META_APP_ID` and `META_APP_SECRET` from the **parent Meta app**, not the legacy Instagram app.
5. Keep `META_LOGIN_MODE=unified`, then restart the gateway. Settings should show that the login configuration is present; this is a local readiness check, not proof of Meta approval.

| Permission | Used by TartGram |
| --- | --- |
| `instagram_basic` | Professional account profile, assigned accounts and media |
| `instagram_manage_messages` | Inbox, replies, ice breakers and messaging webhooks; also required for Unified private replies |
| `instagram_manage_comments` | Read/moderate comments and comment webhooks |
| `instagram_content_publish` | Publish images, reels and stories |

Additional permissions such as ads, events and insights are outside this release's integration. The dashboard counters are local automation statistics, not Instagram Insights.

## 4. Configure webhooks in two places

**App-level configuration:** select the Instagram object / Configure webhooks in the Unified setup. Set the callback URL to `https://YOUR_DOMAIN/webhooks/instagram`. Enter the exact `META_VERIFY_TOKEN` from your private `.env`. This is a random value you generate; it is different from `META_APP_SECRET` and an access token.

Select the fields used by the application: `comments`, `live_comments`, `messages`, `message_reactions`, `messaging_postbacks`, `messaging_seen`, `messaging_referral`. Follow the official field matrix for your access level. Production access and some notifications require approval; own-account development is not a guarantee that every field works before Advanced Access. The account owning comment media must be public.

**Per-account subscription:** after OAuth, TartGram subscribes every assigned Instagram account through its `/subscribed_apps` edge. App-level field selection alone is insufficient. A failed subscription is displayed as requiring attention, and automation stays disabled until reconnecting successfully subscribes the account.

The server verifies `X-Hub-Signature-256` over the raw body with the parent Meta app secret. Keep that secret current if you rotate it in Meta. Verification GETs and signed POSTs must reach the gateway without a proxy altering their body.

## 5. Test your own account

1. In **Generate access tokens**, add your professional account as an Instagram Tester and accept the invitation through Instagram on the web → Settings → Website permissions → Apps and websites → Tester Invites. Use the current dashboard's supported role/tester limits.
2. Sign into TartGram with the administrative token and select **Connect Instagram**. The generated official login URL includes the configuration ID, one-time state and `prompt=login` so both login choices can appear.
3. Select your business portfolio and the professional accounts to share, grant the required permissions, and enable **Allow access to messages** if requested. People logging in through Facebook may need to enable that setting separately in Instagram.
4. On return, check Accounts and reconnect if subscription failed. One authorization can share multiple accounts; TartGram records the business and connection identity with them.
5. From another authorized test account, send a message, tap an ice breaker and create a keyword comment. Confirm delivery and inspect sanitized server logs. Use a test-owned JPEG or MP4 to test publishing. Published test content and sent messages are real external actions.

Standard Access is for the eligible role/test accounts in Meta's setup. It does not grant production access to arbitrary businesses. The repository's fixture tests and screenshots cannot replace these account-level tests.

## 6. Business Verification, App Review and production

Complete **Business Verification** using your organization's real legal identity and evidence requested by Meta: business name/address, registration or other accepted documents, domain/contact verification and any additional dashboard checks. Requirements vary; use the current dashboard checklist. TartGram cannot submit a company on your behalf or bypass verification.

For serving businesses without an app role, request **Advanced Access** for each used permission through **App Review**, and switch the app to **Live** when eligible. Prepare:

- A working, externally reachable panel, visible official connection button and clear explanation of each requested permission.
- Precise reviewer instructions, temporary private panel access and authorized testing arrangements. Never put reviewer credentials in this repository or public issues. Reviewers with panel access are administrators of this installation, so use a dedicated review deployment with test data.
- A screencast demonstrating the actual end-to-end flow for each permission: connection and profile/media; receiving/responding to messages and an ice breaker; comment moderation/private reply; publishing owned test media.
- Accurate privacy/terms pages, a tested signed data deletion callback, a contact route and the requested data-handling declarations.
- Any recurring Data Use Checkup, access verification or Tech Provider requirements presented for your business/use case.

Request **Human Agent** separately if you need manual support replies beyond the standard window. Only then set `HUMAN_AGENT_ENABLED=true`. This feature is never used for automated follow-ups or broadcasts.

## 7. Token lifecycle and migration

Unified tokens are business-scoped, and their expiration depends on the chosen configuration. TartGram stores the expiration Meta reports rather than inventing a 60-day expiry. It does not request `business_management` or implement the optional System User token management API. Reconnect when a token expires, is revoked or stops covering an account after an asset move.

Existing Instagram Login tokens use the official long-lived token exchange and refresh endpoint. The gateway refreshes eligible unexpired tokens near expiry; expired tokens need reconnection. Allow the documented minimum token age before refresh.

To use an existing legacy app, set `META_LOGIN_MODE=instagram`, keep the parent `META_APP_SECRET` for signed notifications and set the separate `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`. Required legacy scopes are `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments`, `instagram_business_content_publish`.

Changing modes does not convert tokens, identifiers or approvals. Migrate using a separate installation, reconnect accounts, explicitly map old/new account IDs, and recreate or deliberately map automation definitions after verification. Do not reuse old message IDs. This release refuses to overwrite an account with a different authorization family at the same ID. Avoid running the same automations in both installations during migration.

## Official sources

- [Unified Login overview](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login)
- [Get started and configuration](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started)
- [Permissions](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions)
- [Authentication and expiration](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication)
- [Migration guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide)
- [Webhook setup](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup) and [fields](https://developers.facebook.com/documentation/instagram-platform/webhooks/fields)
- [App Review](https://developers.facebook.com/docs/instagram-platform/app-review/)
- [Business Verification](https://developers.facebook.com/docs/development/release/business-verification/)
- [Data deletion callback](https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback)
- [Graph v26 changelog](https://developers.facebook.com/docs/graph-api/changelog/version26.0/)
- [Instagram changelog](https://developers.facebook.com/docs/instagram-platform/changelog/)
