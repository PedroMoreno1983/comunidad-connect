const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260715133000_onboarding_document_batches.sql');
const batchRoute = read('src/app/api/onboarding/batches/route.ts');
const detailRoute = read('src/app/api/onboarding/batches/[id]/route.ts');
const syncRoute = read('src/app/api/onboarding/upsert/route.ts');
const adminPage = read('src/app/(dashboard)/admin/onboarding/page.tsx');
const agentPage = read('src/app/(dashboard)/agent-center/page.tsx');

const checks = [
  ['Persistent batch, document, and row tables exist', ['onboarding_import_batches', 'onboarding_import_documents', 'onboarding_import_rows'].every(name => migration.includes(`CREATE TABLE IF NOT EXISTS public.${name}`))],
  ['Original files use a private storage bucket', migration.includes("'onboarding-documents'") && migration.includes('false, 10485760')],
  ['Batch reads are tenant scoped', batchRoute.includes(".eq('community_id', profile.community_id)") && detailRoute.includes(".eq('community_id', profile.community_id)")],
  ['Batch upload enforces file count and byte limits', batchRoute.includes('MAX_ONBOARDING_BATCH_FILES') && batchRoute.includes('MAX_ONBOARDING_BATCH_BYTES')],
  ['Rows are deduplicated across a batch', batchRoute.includes("onConflict: 'batch_id,dedupe_key'") && batchRoute.includes('residentDedupeKey(row)')],
  ['Failed documents can be retried from the stored original', detailRoute.includes("body.action !== 'retry_failed'") && detailRoute.includes("storage.from('onboarding-documents').download")],
  ['Human review is persisted into batch row states', syncRoute.includes("status: 'skipped'") && syncRoute.includes("status: 'syncing'")],
  ['Admin onboarding accepts multiple files', adminPage.includes('multiple') && adminPage.includes('formData.append("files", file)')],
  ['Agent Center uploads into the same reviewed batch flow', agentPage.includes('uploadOnboardingBatch') && agentPage.includes('source", "agent_center"') && agentPage.includes('/admin/onboarding?batch=')],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ passed: failures.length === 0, checks: checks.map(([name, passed]) => ({ name, passed })), failures }, null, 2));
if (failures.length) process.exit(1);
