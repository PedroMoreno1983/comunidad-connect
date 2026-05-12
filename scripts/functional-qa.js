const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outDir = process.env.QA_OUT_DIR || path.join(process.cwd(), ".tmp", "functional-qa");

function unique(items) {
  return Array.from(new Set(items));
}

async function expectVisible(page, locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 15000 }).catch((error) => {
    throw new Error(`${label} was not visible: ${error.message}`);
  });
}

async function clickFirstVisible(page, locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      return;
    }
  }
  throw new Error(`${label} was not clickable`);
}

async function expectNotVisible(page, locator, label) {
  await page.waitForTimeout(500);
  if (await locator.first().isVisible().catch(() => false)) {
    throw new Error(`${label} should not be visible`);
  }
}

async function loginAsAdmin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await clickFirstVisible(page, page.getByRole("button", { name: /Administrador/i }), "admin demo login");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expectVisible(page, page.getByText(/Buenas|Admin|Inicio/i), "authenticated shell");
}

async function runStep(name, fn, failures) {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    return { name, passed: false, error: error.message };
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const httpErrors = [];
  const failures = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 300)));
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !url.includes("favicon")) {
      httpErrors.push(`${status} ${url}`);
    }
  });

  const steps = [];
  const qaPollTitle = `Consulta QA ${Date.now()}`;

  steps.push(await runStep("login demo admin", async () => {
    await loginAsAdmin(page);
  }, failures));

  steps.push(await runStep("marketplace discovery and publish dialog", async () => {
    await page.goto(`${baseUrl}/marketplace`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByRole("heading", { name: /Marketplace/i }), "marketplace heading");
    await clickFirstVisible(page, page.getByRole("button", { name: /Publicar/i }), "publish item button");
    await expectVisible(page, page.getByRole("heading", { name: /Publicar producto/i }), "publish product dialog");
    await expectVisible(page, page.getByPlaceholder(/Bicicleta|producto|articulo/i), "product title field");
    await page.keyboard.press("Escape");
  }, failures));

  steps.push(await runStep("marketplace admin moderation affects public marketplace", async () => {
    await page.evaluate(() => {
      localStorage.removeItem("cc_demo_marketplace_items");
      localStorage.removeItem("cc_demo_marketplace_status_overrides");
    });

    await page.goto(`${baseUrl}/marketplace`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText("Bicicleta plegable aro 20"), "demo bike before moderation");

    await page.goto(`${baseUrl}/admin/marketplace`, { waitUntil: "networkidle", timeout: 30000 });
    const bikeArticle = page.locator("article").filter({ hasText: "Bicicleta plegable aro 20" }).first();
    await expectVisible(page, bikeArticle, "bike in admin marketplace");
    await bikeArticle.getByRole("button", { name: /Ocultar/i }).click();

    await page.goto(`${baseUrl}/marketplace`, { waitUntil: "networkidle", timeout: 30000 });
    await expectNotVisible(page, page.getByText("Bicicleta plegable aro 20"), "hidden demo bike in public marketplace");

    await page.goto(`${baseUrl}/admin/marketplace`, { waitUntil: "networkidle", timeout: 30000 });
    await page.getByRole("button", { name: /^Ocultos/i }).click();
    const hiddenBikeArticle = page.locator("article").filter({ hasText: "Bicicleta plegable aro 20" }).first();
    await expectVisible(page, hiddenBikeArticle, "hidden bike in admin marketplace");
    await hiddenBikeArticle.getByRole("button", { name: /^Disponible$/i }).click();

    await page.goto(`${baseUrl}/marketplace`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText("Bicicleta plegable aro 20"), "restored demo bike in public marketplace");
  }, failures));

  steps.push(await runStep("services search and request dialog", async () => {
    await page.goto(`${baseUrl}/services`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByRole("heading", { name: /Directorio/i }), "services heading");
    await page.getByPlaceholder(/Buscar por nombre/i).fill("gas");
    await expectVisible(page, page.locator("article").filter({ hasText: /Aguas|Gasfiter|Torres/i }), "filtered service provider");
    await page.goto(`${baseUrl}/services/provider/demo-provider-plumbing`, { waitUntil: "networkidle", timeout: 30000 });
    await clickFirstVisible(page, page.getByRole("button", { name: /Solicitar/i }), "request service button");
    await expectVisible(page, page.getByText(/Completa los detalles|Fecha/i), "request service dialog");
    await page.keyboard.press("Escape");
  }, failures));

  steps.push(await runStep("amenities load and reservation surface", async () => {
    await page.goto(`${baseUrl}/amenities`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Espacios comunes|Espacios Comunes|Reservas/i), "amenities surface");
  }, failures));

  steps.push(await runStep("resident finances payment surface", async () => {
    await page.goto(`${baseUrl}/resident/finances`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByRole("heading", { name: /Gastos comunes/i }), "resident finances heading");
    await expectVisible(page, page.getByText(/Pagar con Haulmer|Todo al dia|Cobros pendientes/i), "payment surface");
  }, failures));

  steps.push(await runStep("admin finance and water operations", async () => {
    await page.goto(`${baseUrl}/admin/finanzas`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Finanzas|Registro de cobros|Gastos/i), "admin finance surface");
    await page.goto(`${baseUrl}/admin/consumo`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Control hidrico|Control Hidrico|lecturas|Lecturas/i), "admin water surface");
  }, failures));

  steps.push(await runStep("admin onboarding demo import review and sync", async () => {
    await page.goto(`${baseUrl}/admin/onboarding`, { waitUntil: "networkidle", timeout: 30000 });
    await clickFirstVisible(page, page.getByRole("button", { name: /Cargar ejemplo/i }), "load onboarding example");
    await expectVisible(page, page.getByText(/Revision antes|Revisi/i), "onboarding review table");
    await clickFirstVisible(page, page.getByRole("button", { name: /Sincronizar nomina/i }), "sync roster first confirmation");
    await clickFirstVisible(page, page.getByRole("button", { name: /Confirmar sincronizacion/i }), "sync roster final confirmation");
    await expectVisible(page, page.getByText(/Carga simulada|Nomina sincronizada/i), "onboarding sync success");
    await clickFirstVisible(page, page.getByRole("button", { name: /Ver Directorio/i }), "open directory after onboarding");
    await expectVisible(page, page.getByText(/Andrea Dupre|Carlos Rivas|Marta Rojas/i), "synced demo resident in directory");
  }, failures));

  steps.push(await runStep("admin poll creation distributes to voting center", async () => {
    await page.goto(`${baseUrl}/admin/votaciones`, { waitUntil: "networkidle", timeout: 30000 });
    await page.getByPlaceholder(/Aprobacion|Aprobación/i).fill(qaPollTitle);
    await page.getByPlaceholder(/Explica/i).fill("Consulta funcional de QA para validar creacion, envio por chat y publicacion en el centro de votacion.");
    await clickFirstVisible(page, page.getByRole("button", { name: /Publicar y enviar/i }), "publish poll");
    await expectVisible(page, page.getByText(/Envio simulado|Votacion enviada|Votacion demo publicada/i), "poll delivery summary");
    await page.goto(`${baseUrl}/votaciones`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(qaPollTitle), "created poll in resident voting center");
  }, failures));

  steps.push(await runStep("concierge operations", async () => {
    await page.goto(`${baseUrl}/concierge/packages`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Paqueteria|Paquetería|encomiendas|Encomiendas/i), "packages surface");
    await page.goto(`${baseUrl}/concierge/visitors`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Visitas|visitantes|Visitantes/i), "visitors surface");
  }, failures));

  steps.push(await runStep("voting and CoCo cases surfaces", async () => {
    await page.goto(`${baseUrl}/votaciones`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Votaciones|Consultas|Democracia/i), "voting surface");
    await page.goto(`${baseUrl}/resident/cases`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page, page.getByText(/Casos CoCo|casos CoCo|Seguimiento/i), "CoCo cases surface");
  }, failures));

  await context.close();
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: failures.length === 0 && consoleErrors.length === 0 && httpErrors.length === 0,
    steps,
    consoleErrors: unique(consoleErrors),
    httpErrors: unique(httpErrors),
    failures,
  };

  const reportPath = path.join(outDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ passed: report.passed, failures: report.failures, consoleErrors: report.consoleErrors, httpErrors: report.httpErrors, reportPath }, null, 2));

  if (!report.passed) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
