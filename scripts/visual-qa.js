const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outDir = process.env.QA_OUT_DIR || path.join(process.cwd(), ".tmp", "visual-qa");

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/admin-onboarding",
];

const appRoutes = [
  "/home",
  "/comunicaciones",
  "/chat",
  "/marketplace",
  "/marketplace/my-listings",
  "/amenities",
  "/services",
  "/services/plumbing",
  "/services/my-requests",
  "/services/provider-dashboard",
  "/services/register",
  "/directorio",
  "/profile",
  "/admin/consumo",
  "/admin/finanzas",
  "/admin/mantenimiento",
  "/admin/marketplace",
  "/admin/units",
  "/admin/users",
  "/admin/votaciones",
  "/admin/onboarding",
  "/concierge/packages",
  "/concierge/visitors",
  "/resident/cases",
  "/resident/finances",
  "/resident/consumo",
  "/resident/invitations",
  "/resident/supermercado",
  "/resident/training",
  "/votaciones",
];

const viewports = [
  ["desktop", { width: 1366, height: 768 }],
  ["mobile", { width: 390, height: 844 }],
];

function safeName(route, viewport) {
  return `${viewport}-${route.replace(/^\//, "").replace(/\//g, "-") || "root"}.png`;
}

async function loginAsAdmin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  const demoButton = page.getByRole("button", { name: /Administrador/i });
  await demoButton.click();
  await page.waitForURL(/\/(home)?$/, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const horizontalOverflow = Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    const textOverflow = [];

    const selector = "button, a, h1, h2, h3, p, span, td, th, input, textarea";
    for (const element of Array.from(document.querySelectorAll(selector))) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (style.position === "fixed") continue;

      const rect = element.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (element.scrollWidth > element.clientWidth + 2 && rect.width < viewport.width) {
        textOverflow.push({
          text: (element.textContent || element.getAttribute("placeholder") || "").trim().slice(0, 90),
          tag: element.tagName.toLowerCase(),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
        });
      }
    }

    const visibleErrorText = Array.from(document.body.querySelectorAll("*"))
      .map((el) => (el.textContent || "").trim())
      .find((text) => /hubo un error|no pudo cargarse|missing api key|all gemini|runtime error/i.test(text));

    const activeSidebarLinks = Array.from(document.querySelectorAll("[data-sidebar-link][data-active='true']"))
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      })
      .map((el) => ({
        href: el.getAttribute("data-sidebar-link"),
        text: (el.textContent || "").trim(),
      }));

    return {
      path: location.pathname,
      viewport,
      horizontalOverflow,
      textOverflow: textOverflow.slice(0, 10),
      visibleErrorText: visibleErrorText || null,
      activeSidebarLinks,
    };
  });
}

async function runViewport(browser, viewportName, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240));
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 240)));

  const results = [];
  for (const route of publicRoutes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
      await page.waitForTimeout(2000);
    });
    await page.waitForTimeout(500);

    const screenshot = path.join(outDir, safeName(route, viewportName));
    await page.screenshot({ path: screenshot, fullPage: false });

    results.push({
      route,
      screenshot,
      metrics: await collectMetrics(page),
    });
  }

  await loginAsAdmin(page);

  for (const route of appRoutes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
      await page.waitForTimeout(2000);
    });
    await page.waitForTimeout(500);

    const screenshot = path.join(outDir, safeName(route, viewportName));
    await page.screenshot({ path: screenshot, fullPage: false });

    results.push({
      route,
      screenshot,
      metrics: await collectMetrics(page),
    });
  }

  await context.close();
  return { viewportName, consoleErrors: Array.from(new Set(consoleErrors)), results };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const runs = [];
  for (const [viewportName, viewport] of viewports) {
    runs.push(await runViewport(browser, viewportName, viewport));
  }
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    runs,
  };
  const reportPath = path.join(outDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const summary = [];
  for (const run of report.runs) {
    if (run.consoleErrors.length > 0) {
      summary.push({
        viewport: run.viewportName,
        route: "*",
        horizontalOverflow: 0,
        visibleErrorText: `Console errors: ${run.consoleErrors.join(" | ")}`,
        activeSidebarLinks: [],
        textOverflow: [],
      });
    }

    for (const item of run.results) {
      const metrics = item.metrics;
      const duplicateSidebarActive = metrics.activeSidebarLinks.length > 1;
      if (metrics.horizontalOverflow || metrics.visibleErrorText || metrics.textOverflow.length || duplicateSidebarActive) {
        summary.push({
          viewport: run.viewportName,
          route: item.route,
          horizontalOverflow: metrics.horizontalOverflow,
          visibleErrorText: metrics.visibleErrorText,
          activeSidebarLinks: metrics.activeSidebarLinks,
          textOverflow: metrics.textOverflow.slice(0, 5),
        });
      }
    }
  }

  const output = { passed: summary.length === 0, summary, reportPath };
  console.log(JSON.stringify(output, null, 2));

  if (summary.length > 0) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
