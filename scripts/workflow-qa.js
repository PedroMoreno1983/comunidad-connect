const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const baseUrl = process.env.QA_BASE_URL || "http://localhost:3000";
const outDir = process.env.QA_OUT_DIR || path.join(process.cwd(), ".tmp", "workflow-qa");

async function clickFirstVisible(locator, label) {
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

async function expectVisible(locator, label) {
  await locator.first().waitFor({ state: "visible", timeout: 15000 }).catch((error) => {
    throw new Error(`${label} was not visible: ${error.message}`);
  });
}

async function loginAsAdmin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await clickFirstVisible(page.getByRole("button", { name: /Administrador/i }), "admin demo login");
  await page.waitForLoadState("networkidle").catch(() => {});
  await expectVisible(page.getByText(/Buenas|Admin|Inicio/i), "authenticated shell");
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

async function assertModuleFlow(page, route, expectedTitle, options = {}) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 30000 });
  const flow = page.locator("[data-module-flow]").filter({ hasText: expectedTitle }).first();
  await expectVisible(flow, `${expectedTitle} workflow`);

  const stepCount = await flow.locator("[data-module-flow-step]").count();
  if (stepCount !== 4) {
    throw new Error(`${expectedTitle} expected 4 workflow steps, found ${stepCount}`);
  }

  const currentSteps = await flow.locator("[data-module-flow-step-state='current']").count();
  if (currentSteps < 1) {
    throw new Error(`${expectedTitle} has no current step`);
  }

  await expectVisible(flow.locator("[data-module-flow-status]"), `${expectedTitle} status badge`);
  await expectVisible(flow.getByText(/Cierre esperado/i), `${expectedTitle} expected outcome`);

  if (options.primaryAction) {
    await clickFirstVisible(flow.getByRole("link", { name: options.primaryAction }), `${expectedTitle} primary action`);
    await page.waitForTimeout(350);
    const target = page.locator(options.targetSelector);
    await expectVisible(target, `${expectedTitle} action target`);
  }
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  const failures = [];
  const consoleErrors = [];
  const httpErrors = [];
  const steps = [];
  const qaPollTitle = `Workflow QA ${Date.now()}`;

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

  steps.push(await runStep("login demo admin", async () => {
    await loginAsAdmin(page);
  }, failures));

  steps.push(await runStep("marketplace workflow has next action", async () => {
    await assertModuleFlow(page, "/marketplace", "Publicacion segura entre vecinos", {
      primaryAction: /Explorar articulos|Publicar articulo/i,
      targetSelector: "#vitrina-marketplace, #publicar-articulo",
    });
  }, failures));

  steps.push(await runStep("water workflow anchors to operational table", async () => {
    await assertModuleFlow(page, "/admin/consumo", "Cierre mensual de lecturas", {
      primaryAction: /Completar lecturas|Revisar alertas|Ver cierre/i,
      targetSelector: "#ingreso-lecturas, #estado-lecturas",
    });
  }, failures));

  steps.push(await runStep("amenities workflow anchors to booking grid", async () => {
    await assertModuleFlow(page, "/amenities", "De disponibilidad a reserva confirmada", {
      primaryAction: /Reservar espacio/i,
      targetSelector: "#reservar-espacio",
    });
  }, failures));

  steps.push(await runStep("services workflow anchors to catalog", async () => {
    await assertModuleFlow(page, "/services", "De búsqueda a servicio cerrado", {
      primaryAction: /Explorar servicios/i,
      targetSelector: "#catalogo-servicios",
    });
  }, failures));

  steps.push(await runStep("provider registration workflow anchors to form", async () => {
    await assertModuleFlow(page, "/services/register", "De perfil a proveedor verificable", {
      primaryAction: /Completar perfil/i,
      targetSelector: "#formulario-proveedor",
    });
  }, failures));

  steps.push(await runStep("training workflow anchors to course catalog", async () => {
    await assertModuleFlow(page, "/resident/training", "De curso a aprendizaje guiado", {
      primaryAction: /Ver cursos/i,
      targetSelector: "#catalogo-cursos",
    });
  }, failures));

  steps.push(await runStep("onboarding workflow anchors to upload", async () => {
    await assertModuleFlow(page, "/admin/onboarding", "De nómina a comunidad operativa", {
      primaryAction: /Subir nómina|Subir nomina|Revisar filas/i,
      targetSelector: "#subir-nomina, #revision-nomina",
    });
  }, failures));

  steps.push(await runStep("maintenance workflow anchors to queue", async () => {
    await assertModuleFlow(page, "/admin/mantenimiento", "De alerta a tarea cerrada", {
      primaryAction: /Revisar casos CoCo|Ir a cola operativa/i,
      targetSelector: "#cola-operativa",
    });
  }, failures));

  steps.push(await runStep("finance workflow anchors to dashboard", async () => {
    await assertModuleFlow(page, "/admin/finanzas", "Cierre financiero del periodo", {
      primaryAction: /Preparar reporte|Gestionar cobranza/i,
      targetSelector: "#control-financiero",
    });
  }, failures));

  steps.push(await runStep("poll workflow creates and distributes consultation", async () => {
    await assertModuleFlow(page, "/admin/votaciones", "De consulta a decision trazable", {
      primaryAction: /Crear votacion/i,
      targetSelector: "#crear-votacion",
    });

    await page.getByPlaceholder(/Aprobacion|Aprobaci/i).fill(qaPollTitle);
    await page.getByPlaceholder(/Explica/i).fill("Consulta automatizada de QA para validar creacion, distribucion y aparicion en el centro de votacion.");
    await clickFirstVisible(page.getByRole("button", { name: /Publicar y enviar/i }), "publish poll");
    await expectVisible(page.getByText(/Envio simulado|Votacion enviada|Votacion demo publicada/i), "poll delivery confirmation");

    await page.goto(`${baseUrl}/votaciones`, { waitUntil: "networkidle", timeout: 30000 });
    await expectVisible(page.getByText(qaPollTitle), "new poll in resident voting center");
  }, failures));

  await context.close();
  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: failures.length === 0 && consoleErrors.length === 0 && httpErrors.length === 0,
    steps,
    failures,
    consoleErrors: Array.from(new Set(consoleErrors)),
    httpErrors: Array.from(new Set(httpErrors)),
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
