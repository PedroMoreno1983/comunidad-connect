const fs = require('fs');

function readLocalEnv() {
  if (!fs.existsSync('.env.local')) return {};
  return fs.readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const match = line.match(/^\s*([^#][A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!match) return acc;
      acc[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
      return acc;
    }, {});
}

const localEnv = readLocalEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY;

const requiredTables = [
  'amenities',
  'neighbor_mediations',
  'time_bank_offers',
  'collective_purchase_campaigns',
  'community_projects',
];

const report = {
  generatedAt: new Date().toISOString(),
  passed: false,
  checks: [],
  failures: [],
};

async function checkTable(table) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, {
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
    },
  });

  if (response.ok) {
    report.checks.push({ message: `${table} exists`, details: { status: response.status } });
    return;
  }

  const body = await response.text().catch(() => '');
  report.failures.push({
    message: `${table} is missing or inaccessible`,
    details: { status: response.status, body: body.slice(0, 180) },
  });
}

async function main() {
  if (!supabaseUrl || !serviceRole) {
    report.failures.push({ message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  } else {
    for (const table of requiredTables) {
      await checkTable(table);
    }
  }

  report.passed = report.failures.length === 0;
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exit(1);
}

main().catch((error) => {
  report.failures.push({ message: error.message });
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
});
