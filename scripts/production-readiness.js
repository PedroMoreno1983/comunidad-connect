const fs = require("fs");
const path = require("path");

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const strict = process.env.READINESS_STRICT === "1";
const requirePaidProduction = process.env.READINESS_REQUIRE_PAID === "1";

function readLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key) acc[key] = value;
      return acc;
    }, {});
}

const localEnv = readLocalEnv(envPath);

function hasValue(key) {
  const value = process.env[key] || localEnv[key];
  return typeof value === "string"
    && value.trim().length > 0
    && !/^(TU_|your_|placeholder|changeme|xxx)/i.test(value.trim())
    && !/(placeholder|sandbox|sk_test|test_|demo_|example)/i.test(value.trim());
}

function getValue(key) {
  return process.env[key] || localEnv[key] || "";
}

function isEnabled(key) {
  return /^(1|true|yes|on)$/i.test(getValue(key).trim());
}

function checkKeys(keys) {
  return keys.map((key) => ({ key, present: hasValue(key) }));
}

function checkOneOf(label, keys) {
  return {
    key: label,
    present: keys.some(hasValue),
    accepted: keys,
  };
}

const groups = [
  {
    name: "Core app",
    critical: true,
    checks: [
      ...checkKeys(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]),
    ],
  },
  {
    name: "AI",
    critical: true,
    checks: checkKeys(["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY"]),
  },
  {
    name: "Commercial channels",
    critical: false,
    checks: checkKeys(["RESEND_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]),
  },
  {
    name: "Payments (Haulmer/Tuu)",
    critical: false,
    deferred: !isEnabled("HAULMER_PAYMENTS_REQUIRED") && !(hasValue("HAULMER_ACCOUNT_ID") && hasValue("HAULMER_SECRET_KEY")),
    checks: checkKeys(["HAULMER_ACCOUNT_ID", "HAULMER_SECRET_KEY"]),
  },
  {
    name: "Admin operations and monitoring",
    critical: false,
    checks: [
      checkOneOf("SUPERADMIN_EMAIL(S)", ["SUPERADMIN_EMAIL", "SUPERADMIN_EMAILS"]),
      ...checkKeys(["NEXT_PUBLIC_SITE_URL", "WHATSAPP_WEBHOOK_SECRET", "VOYAGE_API_KEY", "VOYAGE_EMBEDDING_MODEL", "AI_BUDGET_ENFORCEMENT"]),
      ...(
        isEnabled("AI_HEALTH_TOKEN_REQUIRED")
          ? checkKeys(["AI_HEALTH_TOKEN"])
          : [{ key: "AI_HEALTH_TOKEN", present: hasValue("AI_HEALTH_TOKEN"), deferred: !hasValue("AI_HEALTH_TOKEN") }]
      ),
      ...(
        isEnabled("IOT_WEBHOOKS_REQUIRED")
          ? checkKeys(["IOT_WEBHOOK_SECRET"])
          : [{ key: "IOT_WEBHOOK_SECRET", present: hasValue("IOT_WEBHOOK_SECRET"), deferred: !hasValue("IOT_WEBHOOK_SECRET") }]
      ),
    ],
  },
];

const vercelProjectPath = path.join(root, ".vercel", "project.json");
const vercelProject = fs.existsSync(vercelProjectPath)
  ? JSON.parse(fs.readFileSync(vercelProjectPath, "utf8"))
  : null;

const summary = groups.map((group) => {
  const missing = group.checks.filter((check) => !check.present);
  return {
    name: group.name,
    critical: group.critical,
    deferred: Boolean(group.deferred) || (missing.length > 0 && missing.every((check) => check.deferred)),
    ready: missing.length === 0 || Boolean(group.deferred) || (missing.length > 0 && missing.every((check) => check.deferred)),
    present: group.checks.filter((check) => check.present).map((check) => check.key),
    missing: missing.map((check) => check.key),
    deferredMissing: missing.filter((check) => check.deferred || group.deferred).map((check) => check.key),
  };
});

const criticalMissing = summary
  .filter((group) => group.critical)
  .flatMap((group) => group.missing.map((key) => `${group.name}: ${key}`));

const report = {
  generatedAt: new Date().toISOString(),
  envFile: fs.existsSync(envPath) ? ".env.local found" : ".env.local missing",
  vercelProject: vercelProject
    ? { projectName: vercelProject.projectName, projectId: vercelProject.projectId, orgId: vercelProject.orgId }
    : "not linked",
  summary,
  readyForCommercial: criticalMissing.length === 0,
  readyForLaunch: summary.every((group) => group.ready),
  readyForPaidProduction: summary.every((group) => group.ready && !group.deferred),
  nextActions: summary.flatMap((group) => group.missing
    .filter((key) => !group.deferredMissing.includes(key))
    .map((key) => `${group.name}: configure ${key}`)),
  deferredActions: summary.flatMap((group) => group.deferredMissing.map((key) => `${group.name}: deferred ${key}`)),
  strict,
  requirePaidProduction,
};

for (const group of summary) {
  const icon = group.ready ? group.deferred ? "DEFERRED" : "OK" : group.critical ? "MISSING" : "OPTIONAL";
  console.log(`${icon} ${group.name}`);
  if (group.present.length) console.log(`  present: ${group.present.join(", ")}`);
  if (group.missing.length) console.log(`  missing: ${group.missing.join(", ")}`);
  if (group.deferredMissing.length) console.log(`  deferred: ${group.deferredMissing.join(", ")}`);
}

console.log(`\nVercel project: ${typeof report.vercelProject === "string" ? report.vercelProject : `${report.vercelProject.projectName} (${report.vercelProject.orgId})`}`);
console.log(`Commercial readiness: ${report.readyForCommercial ? "READY" : "BLOCKED"}`);
console.log(`Launch readiness: ${report.readyForLaunch ? "READY" : "NEEDS CONFIG"}`);
console.log(`Full paid production readiness: ${report.readyForPaidProduction ? "READY" : "DEFERRED OR NEEDS CONFIG"}`);

const reportPath = path.join(root, ".tmp", "production-readiness.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Report: ${reportPath}`);

if ((strict && criticalMissing.length > 0) || (requirePaidProduction && !report.readyForPaidProduction)) {
  process.exitCode = 1;
}
