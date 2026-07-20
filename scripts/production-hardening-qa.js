const fs = require('fs');
const path = require('path');

const root = process.cwd();

const requiredRateLimitedRoutes = [
  'src/app/api/coco/route.ts',
  'src/app/api/onboarding/extract/route.ts',
  'src/app/api/polls/route.ts',
  'src/app/api/payments/create-haulmer-link/route.ts',
  'src/app/api/email/send-expenses/route.ts',
  'src/app/api/whatsapp-notify/route.ts',
  'src/app/api/webhooks/iot/route.ts',
  'src/app/api/webhooks/haulmer/route.ts',
  'src/app/api/superadmin/communities/route.ts',
];

const requiredFiles = [
  'src/lib/security/rateLimit.ts',
  'src/lib/security/superadmin.ts',
  'src/app/api/superadmin/communities/route.ts',
];

const report = {
  passed: false,
  checks: [],
  failures: [],
};

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message, details = {}) {
  if (!condition) {
    report.failures.push({ message, details });
    throw new Error(message);
  }
  report.checks.push({ message, details });
}

try {
  for (const relativePath of requiredFiles) {
    assert(fs.existsSync(path.join(root, relativePath)), `${relativePath} exists`);
  }

  for (const route of requiredRateLimitedRoutes) {
    const source = read(route);
    assert(
      source.includes('enforceRateLimit(') || source.includes('enforceDistributedRateLimit('),
      `${route} enforces rate limit`
    );
  }

  const proxy = read('src/proxy.ts');
  assert(proxy.includes('isSuperAdminEmail'), 'Proxy uses centralized superadmin authorization');

  const superadminPage = read('src/app/(dashboard)/superadmin/page.tsx');
  assert(!superadminPage.includes("pedromoreno1983@gmail.com"), 'Superadmin page has no hard-coded personal email');
  assert(!superadminPage.includes("email?.includes('convive')"), 'Superadmin page has no domain substring authorization');
  assert(superadminPage.includes('/api/superadmin/communities'), 'Superadmin page uses server-side API');

  const outreach = read('src/components/admin/CommercialOutreach.tsx');
  const mojibakeDemoCta = 'Enviar Invitaci' + '\u00c3\u00b3n Demo';
  assert(!outreach.includes('Enviar Invitación Demo'), 'Outreach copy no longer uses demo CTA');
  assert(!outreach.includes(mojibakeDemoCta), 'Outreach copy no longer uses mojibake demo CTA');
  assert(!outreach.includes('Directo a Demo'), 'Outreach copy no longer points to demo');

  report.passed = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (!report.failures.some(failure => failure.message === error.message)) {
    report.failures.push({ message: error.message });
  }
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
