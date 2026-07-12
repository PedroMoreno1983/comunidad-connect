const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const checks = [];

function check(name, condition) {
    checks.push({ name, passed: Boolean(condition) });
}

const training = read('src/app/api/training/multi-agent/route.ts');
const search = read('src/app/api/search/route.ts');
const booking = read('src/app/api/email/booking-confirmation/route.ts');
const welcome = read('src/app/api/email/welcome/route.ts');
const expense = read('src/app/api/email/expense-alert/route.ts');
const newCommunity = read('src/app/api/email/new-community/route.ts');
const proxy = read('src/proxy.ts');
const rateLimit = read('src/lib/security/rateLimit.ts');
const csp = read('next.config.ts');
const signup = read('src/app/api/auth/signup/route.ts');
const signupPage = read('src/app/(auth)/signup/page.tsx');
const enrollmentMigration = read('supabase/migrations/035_resident_manual_unit_enrollment.sql');

check('Training resolves authenticated profile', training.includes('getAuthenticatedAgentProfile'));
check('Training ignores client userId', !training.includes('body.userId'));
check('Training uses distributed rate limit', training.includes('enforceDistributedRateLimit'));
check('Search requires authenticated profile', search.includes('getAuthenticatedAgentProfile'));
check('Booking resolves booking by authenticated user', booking.includes(".eq('user_id', profile.id)"));
check('Booking ignores client recipient', !booking.includes('body.to'));
check('Welcome ignores client recipient', !welcome.includes('body.to'));
check('Expense recipient is scoped to caller community', expense.includes(".eq('community_id', profile.community_id)"));
check('Legacy new-community relay is retired', newCommunity.includes('status: 410'));
check('Admin routes are protected by proxy', proxy.includes('"/admin/:path*"'));
check('Resident routes are protected by proxy', proxy.includes('"/resident/:path*"'));
check('Concierge routes are protected by proxy', proxy.includes('"/concierge/:path*"'));
check('Rate limiter uses shared Postgres RPC', rateLimit.includes("rpc('consume_api_rate_limit'"));
check('CSP is enforced', csp.includes('key: "Content-Security-Policy"'));
check('CSP is not report-only', !csp.includes('Content-Security-Policy-Report-Only'));
check('Signup resolves invite code on server', signup.includes(".from('communities')"));
check('Signup derives role from stored code', signup.includes('roleForCode'));
check('Signup page no longer calls Supabase signUp', !signupPage.includes('signUp('));
check('Auth trigger ignores client community_id', !enrollmentMigration.includes("raw_user_meta_data->>'community_id'"));
check('Auth trigger ignores client role', !enrollmentMigration.includes("raw_user_meta_data->>'role'"));
check('Public invitation code policy is removed', enrollmentMigration.includes('DROP POLICY IF EXISTS "Public can view community by code"'));

const failures = checks.filter(item => !item.passed);
console.log(JSON.stringify({ passed: failures.length === 0, checks, failures }, null, 2));
if (failures.length) process.exit(1);
