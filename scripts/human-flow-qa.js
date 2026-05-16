const { chromium } = require("playwright");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outDir = process.env.QA_OUT_DIR || path.join(process.cwd(), ".tmp", "human-flow-qa");
const adminEmail = process.env.QA_ADMIN_EMAIL || "admin.showcase@conviveconnect.cl";
const adminPassword = process.env.QA_ADMIN_PASSWORD || "ConviveShowcase-2026!";

async function clickFirstVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false) && await item.isEnabled().catch(() => false)) {
      await item.click();
      return;
    }
  }
  throw new Error(`${label} was not clickable`);
}

async function expectVisible(locator, label, timeout = 15000) {
  const startedAt = Date.now();
  let lastCount = 0;
  while (Date.now() - startedAt < timeout) {
    lastCount = await locator.count().catch(() => 0);
    for (let index = 0; index < lastCount; index += 1) {
      if (await locator.nth(index).isVisible().catch(() => false)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} was not visible after ${timeout}ms (matches: ${lastCount})`);
}

async function expectInputValue(page, value, label, timeout = 15000) {
  await page.waitForFunction(
    (expected) => Array.from(document.querySelectorAll("input, textarea")).some((item) => item.value === expected),
    value,
    { timeout }
  ).catch((error) => {
    throw new Error(`${label} was not present as input value: ${error.message}`);
  });
}

async function loginAsAdmin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
  const emailInput = page.getByPlaceholder(/correo|email/i).first();
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(adminEmail);
    await page.getByPlaceholder(/contrase|password/i).first().fill(adminPassword);
    await clickFirstVisible(page.getByRole("button", { name: /iniciar|entrar|acceder/i }), "admin credential login");
    await page.waitForFunction(() => !location.pathname.startsWith("/login"), null, { timeout: 30000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await expectVisible(page.getByText(/Buenas|Admin|Inicio/i), "authenticated admin shell");
    return;
  }

  await clickFirstVisible(page.getByRole("button", { name: /Administrador/i }), "admin demo login");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expectVisible(page.getByText(/Buenas|Admin|Inicio/i), "authenticated admin shell");
}

async function runStep(name, fn, failures, screenshots, page) {
  try {
    await fn();
    screenshots.push(await capture(page, name));
    return { name, passed: true };
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    screenshots.push(await capture(page, `${name}-failed`).catch(() => null));
    return { name, passed: false, error: error.message };
  }
}

async function capture(page, name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filePath = path.join(outDir, `${safe}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

async function createRosterFile() {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, "nomina-residentes-qa.xlsx");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Nomina");
  sheet.addRow(["nombre", "unidad", "correo", "telefono"]);
  sheet.addRow(["Valentina Saavedra", "2103", "valentina.saavedra@example.com", "+56 9 5555 2103"]);
  sheet.addRow(["Rodrigo Campos", "704", "rodrigo.campos@example.com", "+56 9 5555 0704"]);
  sheet.addRow(["Paulina Soto", "1102", "paulina.soto@example.com", "+56 9 5555 1102"]);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const failures = [];
  const consoleErrors = [];
  const httpErrors = [];
  const screenshots = [];
  const steps = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" && !/TypeError: Failed to fetch|net::ERR_ABORTED|loadNeighbors/i.test(text)) {
      consoleErrors.push(text.slice(0, 300));
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 300)));
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !url.includes("favicon") && !url.includes("sockjs")) {
      httpErrors.push(`${status} ${url}`);
    }
  });

  steps.push(await runStep("login admin", async () => {
    await loginAsAdmin(page);
  }, failures, screenshots, page));

  steps.push(await runStep("excel roster upload reaches review and directory", async () => {
    await page.goto(`${baseUrl}/admin/onboarding`, { waitUntil: "networkidle", timeout: 30000 });
    const filePath = await createRosterFile();
    await page.locator('input[type="file"]').setInputFiles(filePath);
    await expectVisible(page.getByText(/Revision antes|Revisión antes/i), "roster review after xlsx upload", 20000);
    await expectInputValue(page, "Valentina Saavedra", "xlsx resident row");
    await clickFirstVisible(page.getByRole("button", { name: /Sincronizar nómina|Sincronizar nomina/i }), "sync roster");
    await clickFirstVisible(page.getByRole("button", { name: /Confirmar sincronización|Confirmar sincronizacion/i }), "confirm sync roster");
    await expectVisible(page.getByText(/Carga simulada|Nómina sincronizada|Nomina sincronizada/i), "roster sync success");
    await clickFirstVisible(page.getByRole("button", { name: /Ver Directorio/i }), "open directory");
    await expectVisible(page.getByText(/Valentina Saavedra|Rodrigo Campos|Paulina Soto/i), "synced roster visible in directory");
  }, failures, screenshots, page));

  steps.push(await runStep("amenity reservation creates confirmed booking", async () => {
    await page.goto(`${baseUrl}/amenities`, { waitUntil: "networkidle", timeout: 30000 });
    await clickFirstVisible(page.getByRole("button", { name: /Reservar ahora/i }), "reserve amenity");
    await expectVisible(page.getByRole("dialog"), "booking dialog");
    const dayButtons = page.getByRole("dialog").locator("button:not([disabled])").filter({ hasText: /^[0-9]{1,2}$/ });
    await clickFirstVisible(dayButtons, "available calendar day");
    await clickFirstVisible(page.getByRole("dialog").getByRole("button", { name: /08:00|09:00|10:00|11:00|12:00|13:00|14:00|15:00|16:00|17:00|18:00|19:00|20:00|21:00/ }), "available time slot");
    await clickFirstVisible(page.getByRole("button", { name: /Confirmar Reserva/i }), "confirm reservation");
    await expectVisible(page.getByText(/Reserva confirmada|Mis Reservas|Mis reservas/i), "reservation confirmation");
  }, failures, screenshots, page));

  steps.push(await runStep("provider registration with photo reaches ready form", async () => {
    await page.goto(`${baseUrl}/services/register`, { waitUntil: "networkidle", timeout: 30000 });
    const providerSuffix = Date.now();
    const providerName = `Gasfiter QA ${providerSuffix}`;
    await page.getByPlaceholder("Juan Pérez").fill(providerName);
    await page.getByPlaceholder("juan@ejemplo.cl").fill(`gasfiter.qa.${providerSuffix}@example.com`);
    await page.getByPlaceholder("+56 9 1234 5678").fill("+56 9 5555 2222");
    await clickFirstVisible(page.getByRole("button", { name: /Siguiente/i }), "provider next step 1");
    await page.getByPlaceholder("10").fill("12");
    await page.getByPlaceholder("15000").fill("28000");
    await page.getByPlaceholder(/Cuenta sobre/i).fill("Especialista en fugas, flexibles, calefont y mantención preventiva para comunidades residenciales.");
    await clickFirstVisible(page.getByRole("button", { name: /Siguiente/i }), "provider next step 2");
    await page.getByPlaceholder(/Reparación|Reparacion/i).fill("Fugas y flexibles");
    await clickFirstVisible(page.getByRole("button", { name: /Agregar/i }).first(), "add specialty");
    await page.getByPlaceholder(/Certificación|Certificacion/i).fill("SEC Gas Clase 3");
    await clickFirstVisible(page.getByRole("button", { name: /Agregar/i }).nth(1), "add certification");
    await page.locator('input[type="file"]').setInputFiles({
      name: "perfil-proveedor.png",
      mimeType: "image/png",
      buffer: tinyPngBuffer(),
    });
    await expectVisible(page.getByText(/Foto cargada/i), "provider photo preview");
    await expectVisible(page.getByRole("button", { name: /Enviar Solicitud/i }), "submit provider button");
  }, failures, screenshots, page));

  steps.push(await runStep("training free mode responds and updates classroom", async () => {
    await page.goto(`${baseUrl}/resident/training`, { waitUntil: "networkidle", timeout: 30000 });
    await clickFirstVisible(page.getByRole("button", { name: /Abrir modo libre/i }), "open free training mode");
    await expectVisible(page.getByText(/Pizarra interactiva|Aula guiada/i), "training classroom");
    await page.getByPlaceholder(/Pregunta|comenta|mensaje|Escribe/i).fill("Explícame qué hacer ante ruidos reiterados en horario de descanso.");
    await clickFirstVisible(page.getByRole("button", { name: /Enviar|send/i }), "send classroom message");
    await expectVisible(page.getByText(/ruido|reglamento|criterio|Ley|intermitencia/i), "classroom response", 30000);
  }, failures, screenshots, page));

  await context.close();
  await browser.close();

  const uniqueConsole = Array.from(new Set(consoleErrors));
  const uniqueHttp = Array.from(new Set(httpErrors));
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: failures.length === 0 && uniqueConsole.length === 0 && uniqueHttp.length === 0,
    steps,
    failures,
    consoleErrors: uniqueConsole,
    httpErrors: uniqueHttp,
    screenshots: screenshots.filter(Boolean),
  };

  const reportPath = path.join(outDir, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passed: report.passed,
    failures: report.failures,
    consoleErrors: report.consoleErrors,
    httpErrors: report.httpErrors,
    reportPath,
  }, null, 2));

  if (!report.passed) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
