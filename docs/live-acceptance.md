# Operator live acceptance

Run these checks on accounts you control and with people who have agreed to testing. Keep credentials in the server environment. Never attach tokens, OAuth codes, signed requests or customer conversations to a public issue. This checklist is required operator work; it is not a claim that the repository has passed a live Meta review.

## Before testing

1. Complete [Meta setup](meta-setup.md), HTTPS, callback registration, appropriate app/test roles and permissions. Record the TartGram release, selected login family and Graph version.
2. Back up the private environment and data. Use test media you own, a test business account and a consenting second account. Keep business automations disabled until each relevant test passes.
3. Confirm the privacy page identifies your organization and provides a working contact route. Establish a verified-request procedure for callback identifiers that cannot be mapped automatically to a Unified business authorization.

| Scenario | Expected result |
| --- | --- |
| Connect and cancel | Successful connection lists every selected professional account with webhook status; cancellation gives an explicit result and allows a new attempt |
| Incomplete permission or asset selection | Rejected connection or explicit attention state; no false ready badge |
| Inbound direct message | Correct account appears in Inbox; one keyword/default response according to the enabled automation |
| Story reply and mention | Matching supported automation runs for the correct owning account |
| Selected-message reply | Reply appears attached to the selected message in the Instagram chat |
| Comment keyword | At most one private response to that comment; any configured public reply/hide action has the expected result; the business's own replies do not loop |
| Follow gate and ice breaker | A permitted tap reaches the configured response; a non-follower is not given the reward; configuration is visible in Instagram where supported |
| Messaging deadline | Ordinary sends outside the verified 24-hour window are blocked; Human Agent remains manual and available only if separately approved and enabled |
| Image, reel and story | Publicly accessible sample media publishes once; story caption appears; inspect any non-blocking warning on the actual post |
| Schedule and restart | Future post waits until due, survives a normal restart and publishes once; verify server clock and browser timezone |
| Removed or expired authorization | Further calls stop and Accounts requests reconnection; confirm no refresh attempt uses the wrong token family |
| Disconnect and signed deletion | Correct local account data, files and jobs are removed; unrelated accounts remain; an unmapped request displays a need for attention rather than claiming success |

Use an isolated test server for network-interruption tests. A dropped final publish response can mean the post was created: inspect Instagram and the saved `uncertain` record before another attempt. Do not repeatedly publish to discover the outcome. Do not assume replaying an external action is safe.

Record each result privately with timestamp, response status and sanitized evidence. Report ordinary reproducible bugs through [Issues](https://github.com/farshad-zamani/tartgram/issues); fixes will be reviewed and released in updates. Use [SECURITY.md](../SECURITY.md) for security reports. Only describe a live check as passed when you actually observed its result.
