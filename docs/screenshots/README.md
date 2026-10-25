# Interface screenshots

All images are captures of TartGram's real web interface with fictional sample accounts, contacts, conversations and statistics. They do not show a production Meta connection. The public screenshots contain no operator secrets or private customer data.

| Screen | English | فارسی |
| --- | --- | --- |
| Dashboard | [Open](dashboard-en.png) | [مشاهده](dashboard-fa.png) |
| Automations | [Open](automations-en.png) | [مشاهده](automations-fa.png) |
| Inbox | [Open](inbox-en.png) | [مشاهده](inbox-fa.png) |
| Publishing | [Open](publish-en.png) | [مشاهده](publish-fa.png) |
| Setup | [Open](setup-en.png) | [مشاهده](setup-fa.png) |
| Narrow screen | — | [تنظیمات موبایل](setup-mobile-fa.png) |
| Mobile inbox | — | [گفتگوی موبایل](inbox-mobile-fa.png) |

To regenerate: build the project, install Playwright Chromium, then run `pnpm test:browser`. Fixtures live in `tests/browser/panel.spec.ts`; the preview binds only to loopback and uses an isolated temporary data directory. Browser rendering is checked in Chromium; physical mobile devices are not part of this release's automated validation.
