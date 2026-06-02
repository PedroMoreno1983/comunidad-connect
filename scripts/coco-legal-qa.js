const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function normalize(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const checks = [
  {
    name: "legal knowledge covers Ley 21.442 core articles",
    file: "src/lib/coco/legal-knowledge.ts",
    mustInclude: ["Ley 21.442", "Articulo 20", "Articulo 27", "Articulo 31", "Articulo 32", "Articulo 36", "Articulo 40"],
  },
  {
    name: "legal knowledge covers Reglamento Decreto 5",
    file: "src/lib/coco/legal-knowledge.ts",
    mustInclude: ["Decreto 5", "Registro Nacional de Administradores", "rendicion de cuentas"],
  },
  {
    name: "legal knowledge covers Ley 21.719 privacy principles",
    file: "src/lib/coco/legal-knowledge.ts",
    mustInclude: ["Ley 21.719", "finalidad", "proporcionalidad", "seguridad", "transparencia", "confidencialidad"],
  },
  {
    name: "system prompt injects legal knowledge and legal response rule",
    file: "src/lib/coco/system-prompt.ts",
    mustInclude: ["COCO_LEGAL_KNOWLEDGE", "marco legal chileno interno", "orientación operativa"],
  },
  {
    name: "local fallback handles privacy requests",
    file: "src/app/api/coco/route.ts",
    mustInclude: ["OPEN_PRIVACY_CONTEXT", "Ley 21.719", "finalidad", "No conviene exponer RUT"],
  },
  {
    name: "local fallback handles noise through CNV mediation",
    file: "src/app/api/coco/route.ts",
    mustInclude: ["OPEN_MEDIATION_CNV", "Ley 21.442 art. 27", "Comunicación No Violenta", "navigate: '/convivencia'"],
  },
  {
    name: "local fallback handles morosity and common expenses",
    file: "src/app/api/coco/route.ts",
    mustInclude: ["OPEN_FINANCES", "arts. 31 y 32", "art. 36", "electrodependientes"],
  },
];

const failures = [];

for (const check of checks) {
  const text = normalize(read(check.file));
  const missing = check.mustInclude.filter((needle) => !text.includes(normalize(needle)));
  if (missing.length) {
    failures.push({
      name: check.name,
      file: check.file,
      missing,
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  checks: checks.length,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (!report.passed) {
  process.exitCode = 1;
}
