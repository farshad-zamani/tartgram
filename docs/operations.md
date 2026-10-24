# Operations, recovery and troubleshooting

## Administrative access

Every management-token holder controls the installation. Browser login creates an eight-hour server-side session with an HttpOnly cookie; the token is not stored in localStorage/sessionStorage. Cookies use Secure in production and SameSite=Lax so OAuth return navigation can complete. State-changing cookie requests additionally require the canonical Origin. A server restart invalidates browser sessions and pending OAuth states. Sign in again and restart the connection if needed.

Programmatic management requests can use `Authorization: Bearer <GATEWAY_CLIENT_TOKEN>`. Websocket clients use that header or the browser session; URL tokens are rejected. There are no per-customer roles. Do not distribute administrative access as an end-user invitation.

To revoke access, replace `GATEWAY_CLIENT_TOKEN` with a newly generated value and recreate the gateway. All browser sessions disappear on restart. The generator preserves non-empty values, so it does not rotate a key accidentally.

Compose does not trust forwarded client IPs by default. Login throttling is shared at the proxy's address; this is deliberate protection for a small trusted workspace. Enable `TRUST_PROXY` only with a properly restricted and understood proxy boundary. Never expose the gateway directly while trusting arbitrary forwarding headers.

## Back up and restore

Stop the gateway before a consistent backup. Back up the **data volume and private `.env` together**, keeping them outside the public repository and public web roots. Store encrypted backups with restricted access and a documented retention policy. Caddy's certificate volume can also be backed up if needed. A data-only backup cannot decrypt tokens without the matching `TOKEN_ENCRYPTION_KEY`.

Example on Linux, from the repository directory:

```sh
docker compose stop gateway
mkdir -m 700 -p /private/tartgram-backups
docker compose run --rm --no-deps --user 0 -v /private/tartgram-backups:/backup --entrypoint tar gateway -czf /backup/data.tar.gz -C /data .
cp .env /private/tartgram-backups/settings.env
chmod 600 /private/tartgram-backups/*
docker compose start gateway
```

These example paths are private operator-controlled directories; choose a location outside publicly served storage. Protect or encrypt the archive before moving it elsewhere. Verify its checksum and periodically restore into a separate isolated installation. In that installation, keep the gateway disconnected from Meta, inspect the records and test administrative login before allowing outbound actions.

To restore, stop the gateway, restore the data into an **empty** data volume with ownership matching the runtime user (UID 1000), restore its matching environment file and start the same application version. Check queued posts before resuming: old pending posts may be due. Reapply any data deletion requests recorded after the backup date, so restoration does not resurrect removed user data.

The repository ships no private operator backup. Existing plaintext token files are rejected. Prefer reconnecting accounts into a fresh installation. Advanced operators can use the [offline legacy import utility](../scripts/import-legacy.ts), with a verified authorization-subject mapping, while the gateway is stopped. It writes a new encrypted file and leaves subscription status failed until the account is reconnected. Never put the input file in the repository or a public upload directory.

## Update

1. Read the changelog and current official Meta changelog.
2. Take and verify a private backup of data and `.env`.
3. Check out the desired release tag. Keep your private configuration intact.
4. Run `docker compose build gateway`, then `docker compose up -d gateway`.
5. Check health, sign in, inspect Accounts, and test with an authorized test account before enabling business automations.

Use one gateway process per data volume. Data writes are atomic and serialized inside one process; JSON files are not a cross-process database. Do not attach the same directory to several replicas.

Keep the encryption key stable across ordinary upgrades. Changing it without decrypting and re-encrypting the existing store makes the tokens unreadable. This release does not provide in-place encryption-key rotation; reconnect into a fresh store with a new key if rotation is required.

## Scheduling and uploaded media

Schedules store epoch milliseconds; the datetime control uses the browser's local time. Verify the server clock and your browser timezone. A single worker checks due posts approximately every 30 seconds. Quota is fetched before publishing; there is no guessed fallback limit.

Before a scheduled external action, the record changes to `publishing`. If the process restarts in that state, it becomes `uncertain` and is not retried automatically. Check Instagram before creating another post. Network failures can also leave an uncertain external result even when the UI reports a failure; this release does not guarantee exactly-once external delivery.

JPEG images and MP4 videos are accepted after header checks, up to 200 MB per upload. Meta's own publishing specifications may be more restrictive. Formats, aspect ratios, duration, account eligibility and copyrighted audio can cause rejection. Uploaded files have public unguessable URLs, as required for Meta to fetch them; never upload confidential material. Records include their owning account. Unused files expire after seven days during hourly cleanup; pending/publishing schedules retain their files. Disconnecting the account removes its uploads and jobs.

## Messaging and event processing

- Ordinary direct replies require a verified inbound interaction within 24 hours. Reading the inbox can synchronize a recent inbound timestamp for an existing conversation.
- A comment permits one private reply within seven days. Follow-up messages require the recipient to respond. Live replies are limited by Meta to the active broadcast; do not rely on a delayed live event being eligible.
- Human Agent is for manual support replies only, requires Meta approval, and remains disabled by default.
- Contact-list messaging stays within the standard verified window. A window is not permission to send unsolicited marketing.
- Persistent receipt records suppress duplicate processing across restarts. The receiver acknowledges promptly, then processes asynchronously; this is not a durable job queue. A crash after acknowledgement can lose pending work. An event claimed before a crash may remain suppressed to avoid duplicate private replies.
- Events for disconnected accounts are ignored. Local data deletion is serialized with account actions so a running action finishes before purge.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| Server will not start | Required environment values, generated secrets, data-directory permissions and matching encryption key; the startup error deliberately omits values |
| HTTPS does not work | Domain DNS, ports 80/443, another service occupying those ports and Caddy logs |
| Login returns 403 | Use the canonical `PUBLIC_URL`; check scheme/hostname/port and avoid a mismatched development origin |
| Login returns 429 | Wait for the one-minute throttle; check whether several admins share the proxy address |
| OAuth canceled/expired | Sign in again, start from Accounts and finish within ten minutes in the same browser session |
| Unified setup tab missing | The Meta app must be owned by a business portfolio |
| Instagram option missing | Compatible configuration, `prompt=login`, and the browser's current Facebook login |
| No account shared | Professional account type, correct business portfolio and granted assets |
| Messages fail | Granted permissions, token validity, Allow access to messages, eligibility and messaging window |
| Account needs attention | Reconnect to retry webhook subscription; inspect Meta field/access requirements |
| No comments arrive | App/field selection, per-account subscription, public owning account, Live/Advanced Access requirements |
| Publishing quota unavailable | Meta authorization, permission and endpoint availability; the UI does not fabricate a quota |
| Media thumbnail absent | Meta may omit `media_url`; the interface uses a thumbnail or placeholder and keeps a permalink when available |
| Published without caption | A non-blocking Meta `config_issue` can be returned; check the warning and inspect the published post |
| Corrupt/wrong-key store | Stop the gateway and restore a verified matching backup; do not replace the file with an empty array |
| Deletion needs attention | Retry the signed request or administrative deletion and inspect private storage permissions; unknown confirmation codes return 404 |

When reporting a bug, include the release version, selected login mode, reproduction steps, response status and sanitized logs. Do not send passwords, tokens, OAuth codes, signatures or customer conversations. Use the private security channel for a vulnerability.
