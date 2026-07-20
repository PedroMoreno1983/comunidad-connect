const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function expect(label, condition) {
  checks.push(label);
  if (!condition) failures.push(label);
}

const paymentRoute = read('src/app/api/payments/create-haulmer-link/route.ts');
const webhookRoute = read('src/app/api/webhooks/haulmer/route.ts');
const expensePage = read('src/app/(dashboard)/expenses/page.tsx');
const residentFinancePage = read('src/app/(dashboard)/resident/finances/page.tsx');
const marketplacePage = read('src/app/(dashboard)/marketplace/page.tsx');
const agent = read('src/lib/coco/agent.ts');
const tools = read('src/lib/coco/tools.ts');
const agentCenter = read('src/app/api/agent-center/route.ts');
const financeDashboard = read('src/components/admin/FinanceDashboard.tsx');
const emailRoute = read('src/app/api/email/send-expenses/route.ts');
const migration = read('supabase/migrations/038_payment_integrity_lockdown.sql');

expect('Payment amount is resolved from an authenticated database target', paymentRoute.includes('resolvePaymentTarget') && paymentRoute.includes('EXPENSE_NOT_OWNED'));
expect('Payment attempt update is scoped to unit and community', paymentRoute.includes(".eq('unit_id', target.unitId") && paymentRoute.includes(".eq('community_id', target.communityId)"));
expect('Payment token is not returned to the browser', !paymentRoute.includes('token: response.token'));
expect('Webhook compares the signed callback amount with the expected attempt amount', webhookRoute.includes('expectedAmount') && webhookRoute.includes('Math.abs'));
expect('Resident expense return requires persisted paid status', expensePage.includes('Pago verificado') && expensePage.includes('expense.status === "paid"') && !expensePage.includes('searchParams.get("status")'));
expect(
  'Alternate resident finance route delegates to the canonical persisted-status flow',
  residentFinancePage.includes('redirect(')
    && residentFinancePage.includes('/expenses')
    && !residentFinancePage.includes('Pago verificado')
    && !residentFinancePage.includes('handlePay')
);
expect('Marketplace return requires persisted completed status', marketplacePage.includes("item.paymentStatus === 'completed'") && !marketplacePage.includes("searchParams.get('status')"));
expect('Residents cannot update their own expense status through RLS', migration.includes('DROP POLICY IF EXISTS "expenses_update_own"'));
expect('CoCo requires a decision for every mutating action', agent.includes('providedResolutionIds.length !== expectedResolutionIds.size') && agent.includes("resolution !== 'approved'"));
expect('CoCo unit scope is checked against the authenticated community', tools.includes(".eq('community_id', userCtx.community_id)"));
expect('CoCo uses the live expenses table', !tools.includes(".from('fees')") && tools.includes(".from('expenses')"));
expect('Agent Center uses the live amount column', !agentCenter.includes('total_amount'));
expect('Finance dashboard has no hard-coded 192-unit or fabricated chart', !financeDashboard.includes('const totalUnits = 192') && !financeDashboard.includes('12500000'));
expect('Expense emails derive recipient amounts from server-side expenses', emailRoute.includes('expenseByUnit') && !emailRoute.includes('body.totalAmount'));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0,
  checks: checks.length,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
