const fs = require("fs");
const path = require("path");

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const strict = process.env.READINESS_STRICT === "1";

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
  return typeof value === "string" && value.trim().length > 0 && !value.toLowerCase().includes("placeholder");
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
    checks: checkKeys(["RESEND_API_KEY", "HAULMER_API_KEY", "HAULMER_WEBHOOK_SECRET", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]),
  },
  {
    name: "Admin operations and monitoring",
    critical: false,
    checks: [
      checkOneOf("SUPERADMIN_EMAIL(S)", ["SUPERADMIN_EMAIL", "SUPERADMIN_EMAILS"]),
      ...checkKeys(["AI_HEALTH_TOKEN", "NEXT_PUBLIC_SITE_URL", "IOT_WEBHOOK_SECRET", "WHATSAPP_WEBHOOK_SECRET", "VOYAGE_API_KEY"]),
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
    ready: missing.length === 0,
    present: group.checks.filter((check) => check.present).map((check) => check.key),
    missing: missing.map((check) => check.key),
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
  readyForCommercialDemo: criticalMissing.length === 0,
  readyForPaidProduction: summary.every((group) => group.ready),
  strict,
};

for (const group of summary) {
  const icon = group.ready ? "OK" : group.critical ? "MISSING" : "OPTIONAL";
  console.log(`${icon} ${group.name}`);
  if (group.present.length) console.log(`  present: ${group.present.join(", ")}`);
  if (group.missing.length) console.log(`  missing: ${group.missing.join(", ")}`);
}

console.log(`\nVercel project: ${typeof report.vercelProject === "string" ? report.vercelProject : `${report.vercelProject.projectName} (${report.vercelProject.orgId})`}`);
console.log(`Commercial demo readiness: ${report.readyForCommercialDemo ? "READY" : "BLOCKED"}`);
console.log(`Paid production readiness: ${report.readyForPaidProduction ? "READY" : "NEEDS CONFIG"}`);

const reportPath = path.join(root, ".tmp", "production-readiness.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Report: ${reportPath}`);

if (strict && criticalMissing.length > 0) {
  process.exitCode = 1;
}
