import { privacyFa, termsFa } from "./legal-fa.js";
import type { FastifyInstance } from "fastify";
import type { GatewayConfig } from "./config.js";
export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function resultPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} ? TartGram</title><style>body{font:16px/1.8 system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:1.5rem;background:#16120d;color:#efe7d9}a{color:#ffad90}h1{line-height:1.25}.fa{direction:rtl}footer{margin-top:3rem;font-size:.9rem;color:#c6b7a4}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><p><a href="/app/">Open TartGram</a></p><footer>Made by <a href="https://cloudtart.com" target="_blank" rel="noopener noreferrer">CloudTart</a> ? <a href="/privacy">Privacy</a> ? <a href="/terms">Terms</a></footer></body></html>`;
}
export function registerLegalPages(
  app: FastifyInstance,
  c: GatewayConfig,
): void {
  const operator = escapeHtml(c.operatorName),
    contact = escapeHtml(c.operatorContactUrl);
  app.get("/privacy", async (_req, reply) =>
    reply
      .type("text/html")
      .send(
        resultPage("Privacy policy", "").replace(
          "<p></p>",
          `<p>This TartGram installation is operated by ${operator}. Contact: <a href="${contact}" rel="noopener noreferrer">installation operator</a>. CloudTart develops the software; it does not receive your installation's accounts or tokens.</p><h2>Data and purpose</h2><p>With your Meta authorization, this server processes professional account IDs, usernames, granted permissions, access tokens, messages and comments, contacts, uploaded media, automations and publishing records to provide the features you enable. Passwords are entered only on Meta's own login pages.</p><h2>Storage and retention</h2><p>Meta tokens are encrypted with AES-256-GCM using a separate server key. Other operational data is stored on the operator's server. Incoming comments are capped at 500 across the installation; contacts and automation data remain until removed. Uploaded media is publicly accessible by its unguessable URL while stored, so Meta can fetch it for publishing. Unused uploads expire after seven days; files needed by pending posts are retained. Event deduplication records expire after eight days, and deletion confirmation records after 30 days. Infrastructure logs and backups are controlled by the operator.</p><h2>Delete and disconnect</h2><p>Use Disconnect and delete in Accounts to remove locally stored tokens, contacts, comments, account automations, counters, pending posts and uploaded media. Meta's signed data deletion callback is available at <code>/privacy/data-deletion</code>. It acts on the authorization subject identifier supplied by Meta. For other requests, contact the operator above. Removal from this server does not delete messages or posts already delivered to Instagram. Operator backups must follow the operator's retention policy; restoring a backup must not resurrect deleted data.</p><h2>Sharing</h2><p>The installation sends data to Meta to perform authorized actions. The software includes no CloudTart analytics or account telemetry. The operator is responsible for its infrastructure providers and any policy changes.</p>${privacyFa(operator)}`,
        ),
      ),
  );
  app.get("/terms", async (_req, reply) =>
    reply
      .type("text/html")
      .send(
        resultPage("Terms of use", "").replace(
          "<p></p>",
          `<p>This installation is operated by ${operator}. <a href="${contact}" rel="noopener noreferrer">Contact the operator</a>.</p><p>You must be authorized to manage every account you connect and comply with Meta's Platform Terms and the permissions granted by account owners. Do not use this installation for spam, unauthorized access or unsolicited messaging. Messaging eligibility does not itself authorize marketing.</p><p>TartGram uses official Meta APIs and is an independent CloudTart project. Meta has not endorsed this installation. API availability, app review and business verification are controlled by Meta. The software is provided as is under CPAL-1.0, without warranty. Hosting and other infrastructure costs are the operator's responsibility.</p>${termsFa()}`,
        ),
      ),
  );
}
