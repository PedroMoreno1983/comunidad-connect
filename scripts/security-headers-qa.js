const DEFAULT_BASE_URL = 'http://localhost:3000';
const baseUrl = (process.env.QA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

const requiredHeaders = [
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'content-security-policy',
];

const expectedValues = {
  'x-content-type-options': value => value.toLowerCase() === 'nosniff',
  'x-frame-options': value => value.toUpperCase() === 'DENY',
  'referrer-policy': value => value.toLowerCase() === 'strict-origin-when-cross-origin',
  'content-security-policy': value => value.includes("frame-ancestors 'none'") && value.includes("object-src 'none'"),
};

async function checkHeaders() {
  const response = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
  const failures = [];
  const found = {};

  for (const header of requiredHeaders) {
    const value = response.headers.get(header);
    found[header] = value || null;
    if (!value) {
      failures.push(`Missing security header: ${header}`);
      continue;
    }
    const validator = expectedValues[header];
    if (validator && !validator(value)) {
      failures.push(`Unexpected value for ${header}: ${value}`);
    }
  }

  const health = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
  const healthJson = await health.json().catch(() => null);
  if (!health.ok || !healthJson?.ok) {
    failures.push(`Health endpoint not ready: HTTP ${health.status}`);
  }
  const cacheControl = health.headers.get('cache-control') || '';
  if (!cacheControl.toLowerCase().includes('no-store')) {
    failures.push(`Health endpoint must be no-store, got: ${cacheControl}`);
  }

  const report = {
    passed: failures.length === 0,
    baseUrl,
    status: response.status,
    headers: found,
    health: healthJson,
    failures,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exit(1);
}

checkHeaders().catch(error => {
  console.error(JSON.stringify({ passed: false, baseUrl, failures: [error.message] }, null, 2));
  process.exit(1);
});
