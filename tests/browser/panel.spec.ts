import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const base = "http://127.0.0.1:8085";
const sampleAccount = {
  igId: "111111111111",
  username: "example_studio",
  subscriptionStatus: "active",
  loginMethod: "unified_login",
};
async function demo(page: Page, lang: "en" | "fa") {
  await page.addInitScript(
    (language) => localStorage.setItem("lang", language),
    lang,
  );
  let file = {
    automations: [
      {
        id: "welcome-offer",
        accountId: sampleAccount.igId,
        name: "Catalog request",
        enabled: true,
        trigger: {
          kind: "comment",
          keyword: {
            mode: "any",
            matchAll: false,
            caseSensitive: false,
            include: ["catalog"],
            exclude: [],
          },
          mediaIds: [],
          includeLive: false,
        },
        flowId: "catalog",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    flows: {
      [sampleAccount.igId]: [
        {
          id: "catalog",
          name: "Catalog",
          startNodeId: "send",
          nodes: [
            {
              kind: "send",
              id: "send",
              message: {
                type: "text",
                text: "Thanks for your interest. Here is our catalog: https://example.com/catalog",
                quickReplies: [],
              },
            },
          ],
        },
      ],
    },
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let result: unknown = [];
    if (path === "/api/auth/session") result = { ok: true };
    else if (path === "/api/status")
      result = {
        engine: true,
        accounts: [sampleAccount],
        connectUrl: base + "/oauth/instagram/start",
        automationsCount: file.automations.length,
        setup: {
          loginMode: "unified",
          graphVersion: "v26.0",
          oauthConfigured: true,
          webhookUrl: base + "/webhooks/instagram",
          redirectUri: base + "/oauth/instagram/callback",
          deauthorizeUrl: base + "/oauth/instagram/deauthorize",
          dataDeletionUrl: base + "/privacy/data-deletion",
          privacyUrl: base + "/privacy",
          termsUrl: base + "/terms",
          requiredScopes: [
            "instagram_basic",
            "instagram_manage_messages",
            "instagram_manage_comments",
            "instagram_content_publish",
          ],
          humanAgentEnabled: false,
        },
      };
    else if (path === "/api/stats")
      result = {
        totals: {
          triggered: 124,
          sent: 118,
          follow_gate_prompt: 32,
          follow_gate_pass: 24,
        },
        perAutomation: {},
        updatedAt: Date.now(),
      };
    else if (path === "/api/automations") {
      if (request.method() === "PUT") file = request.postDataJSON();
      result = request.method() === "PUT" ? { ok: true } : file;
    } else if (path.endsWith("/conversations"))
      result = [
        {
          id: "conversation-1",
          userId: "person-1",
          username: "sample_customer",
          updatedTime: new Date().toISOString(),
          snippet:
            lang === "fa"
              ? "لطفاً کاتالوگ محصولات را ارسال کنید."
              : "Could you share your product catalog?",
        },
      ];
    else if (path.endsWith("/messages"))
      result = [
        {
          id: "m1",
          fromId: "person-1",
          fromUsername: "sample_customer",
          text:
            lang === "fa"
              ? "سلام، لطفاً کاتالوگ محصولات را ارسال کنید."
              : "Hello! Could you share your product catalog?",
          createdTime: new Date(Date.now() - 300000).toISOString(),
          isBusiness: false,
        },
        {
          id: "m2",
          fromId: sampleAccount.igId,
          fromUsername: sampleAccount.username,
          text:
            lang === "fa"
              ? "سلام! خوشحالیم که همراه ما هستید. کاتالوگ را همین‌جا برایتان می‌فرستیم."
              : "Hello! Thanks for your interest. Here is our latest catalog.",
          createdTime: new Date(Date.now() - 240000).toISOString(),
          isBusiness: true,
        },
      ];
    else if (path.endsWith("/comments"))
      result = [
        {
          id: "comment-1",
          accountId: sampleAccount.igId,
          text: "catalog",
          fromUsername: "sample_customer",
          timestamp: Date.now(),
          status: "replied",
        },
      ];
    else if (path.endsWith("/publish-limit")) result = { used: 3, total: 100 };
    else if (path.endsWith("/scheduled"))
      result = [
        {
          id: "post-1",
          igId: sampleAccount.igId,
          type: "image",
          url: "https://example.com/image.jpg",
          caption: "A new collection is on its way.",
          scheduleAt: Date.now() + 86400000,
          status: "pending",
          createdAt: Date.now(),
        },
      ];
    else if (path.endsWith("/ice-breakers"))
      result = [
        {
          id: "faq",
          question:
            lang === "fa" ? "چطور سفارش بدهم؟" : "How do I place an order?",
          response:
            lang === "fa"
              ? "برای ثبت سفارش، نام محصول را برایمان ارسال کنید."
              : "Send us the product name to start your order.",
        },
      ];
    else if (path.endsWith("/contacts"))
      result = [
        {
          id: "person-1",
          accountId: sampleAccount.igId,
          igsid: "person-1",
          username: "sample_customer",
          tags: ["catalog"],
          attributes: {},
          lastInboundAt: Date.now() - 300000,
          createdAt: Date.now() - 86400000,
        },
      ];
    else if (path === "/api/captions")
      result = [
        {
          id: "caption-1",
          title: "New collection",
          text: "A new collection is on its way.",
        },
      ];
    await route.fulfill({ json: result });
  });
  await page.goto("/app/");
  await expect(
    page.getByRole("button", {
      name: lang === "fa" ? "تنظیمات" : "Settings",
      exact: true,
    }),
  ).toBeVisible();
}
test("real panel login uses cookies and leaves no management token in browser storage", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("#tok").fill(process.env.TARTGRAM_TEST_TOKEN!);
  await page
    .locator("form button[type=submit],form button:not([type])")
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "تنظیمات", exact: true }),
  ).toBeVisible();
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
  }));
  expect(JSON.stringify(storage)).not.toContain(
    process.env.TARTGRAM_TEST_TOKEN,
  );
  await page.getByRole("button", { name: "خروج", exact: true }).click();
  await expect(page.locator("#tok")).toBeVisible();
  await page.reload();
  await expect(page.locator("#tok")).toBeVisible();
});
for (const lang of ["en", "fa"] as const)
  test(`sample screenshots and main workflows (${lang})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await demo(page, lang);
    await mkdir("docs/screenshots", { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `docs/screenshots/dashboard-${lang}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: lang === "fa" ? "اتوماسیون‌ها" : "Automations",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Catalog request", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `docs/screenshots/automations-${lang}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: lang === "fa" ? "اینباکس" : "Inbox",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: /sample_customer/ }).click();
    await expect(
      page.getByText(
        lang === "fa"
          ? "سلام، لطفاً کاتالوگ محصولات را ارسال کنید."
          : "Hello! Could you share your product catalog?",
        { exact: true },
      ),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `docs/screenshots/inbox-${lang}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: lang === "fa" ? "انتشار" : "Publish",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("A new collection is on its way.", { exact: true }).last(),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `docs/screenshots/publish-${lang}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", {
        name: lang === "fa" ? "تنظیمات" : "Settings",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("instagram_manage_messages", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: `docs/screenshots/setup-${lang}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
test("Persian setup remains usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "fa");
  await page.getByRole("button", { name: "تنظیمات", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.querySelector("main")!.scrollWidth <=
          document.querySelector("main")!.clientWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({
    path: "docs/screenshots/setup-mobile-fa.png",
    fullPage: true,
  });
});

test("inbox load failures offer retry instead of claiming the inbox is empty", async ({
  page,
}) => {
  await demo(page, "en");
  let attempts = 0;
  await page.route("**/api/accounts/*/conversations", (route) =>
    route.fulfill(
      ++attempts === 1
        ? { status: 502, json: { error: "meta_request_failed" } }
        : { json: [] },
    ),
  );
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not load this inbox",
  );
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("threaded replies send the selected message ID once even with repeated Enter", async ({
  page,
}) => {
  await demo(page, "en");
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/accounts/*/send", async (route) => {
    sent.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({ json: { ok: true, messageId: "synthetic-reply" } });
  });
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("button", { name: /sample_customer/ }).click();
  await page
    .getByRole("button", { name: "Reply to this message", exact: true })
    .first()
    .click();
  await page.locator("textarea").fill("Example reply");
  await page.locator("textarea").press("Enter");
  await page.locator("textarea").press("Enter");
  await expect(page.locator("textarea")).toHaveValue("");
  expect(sent).toEqual([
    {
      recipientId: "person-1",
      text: "Example reply",
      humanAgent: false,
      replyToMid: "m1",
    },
  ]);
});

test("comment action errors keep the draft and display a failure", async ({
  page,
}) => {
  await demo(page, "en");
  await page.route("**/api/accounts/*/comments/*/reply", (route) =>
    route.fulfill({ status: 502, json: { error: "meta_request_failed" } }),
  );
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByRole("textbox").fill("Keep this draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "The action was not confirmed",
  );
  await expect(page.getByRole("textbox")).toHaveValue("Keep this draft");
});

test("mobile inbox shows the selected thread and returns to the conversation list", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page, "fa");
  await page.getByRole("button", { name: "اینباکس", exact: true }).click();
  await page.getByRole("button", { name: /sample_customer/ }).click();
  await expect(page.locator("textarea")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.querySelector("main")!.scrollWidth <=
          document.querySelector("main")!.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/inbox-mobile-fa.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "بازگشت به گفتگوها", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /sample_customer/ }),
  ).toBeVisible();
});

test("a failed logout keeps the panel open instead of pretending the session ended", async ({
  page,
}) => {
  await demo(page, "en");
  await page.route("**/api/auth/session", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({ status: 503, json: { error: "unavailable" } })
      : route.fulfill({ json: { ok: true } }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#tok")).toHaveCount(0);
});

test("story captions remain editable and ambiguous publishing has a specific warning", async ({
  page,
}) => {
  await demo(page, "en");
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/accounts/*/publish", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      status: 409,
      json: { error: "publish_outcome_unknown", postId: "uncertain-post" },
    });
  });
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Story", exact: true }).click();
  await page.locator("textarea").fill("Example story caption");
  await page.locator("summary").first().click();
  await page
    .getByPlaceholder("https://example.com/media.jpg")
    .fill("https://example.com/story.jpg");
  await page.locator("form .btn-primary").click();
  await expect(page.getByRole("alert")).toContainText(
    "Check Instagram before publishing again",
  );
  expect(submitted).toMatchObject({
    type: "story",
    caption: "Example story caption",
  });
});
