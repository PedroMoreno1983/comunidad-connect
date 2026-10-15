const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260715133000_onboarding_document_batches.sql');
const knowledgeMigration = read('supabase/migrations/20260715140000_onboarding_document_knowledge.sql');
const batchRoute = read('src/app/api/onboarding/batches/route.ts');
const detailRoute = read('src/app/api/onboarding/batches/[id]/route.ts');
const syncRoute = read('src/app/api/onboarding/upsert/route.ts');
const adminPage = read('src/app/(dashboard)/admin/onboarding/page.tsx');
const agentPage = read('src/app/(dashboard)/agent-center/page.tsx');
const rightsImport = read('src/lib/onboarding/unitRightsImport.ts');
const rightsOnboarding = read('src/lib/onboarding/unitRightsOnboarding.ts');
const rightsMigration = read('supabase/migrations/20261015030000_unit_rights_onboarding.sql');

const checks = [
  ['Persistent batch, document, and row tables exist', ['onboarding_import_batches', 'onboarding_import_documents', 'onboarding_import_rows'].every(name => migration.includes(`CREATE TABLE IF NOT EXISTS public.${name}`))],
  ['Original files use a private storage bucket', migration.includes("'onboarding-documents'") && migration.includes('false, 10485760')],
  ['Uploaded documents become private searchable knowledge', knowledgeMigration.includes('search_vector tsvector') && knowledgeMigration.includes('USING GIN')],
  ['Batch reads are tenant scoped', batchRoute.includes(".eq('community_id', profile.community_id)") && detailRoute.includes(".eq('community_id', profile.community_id)")],
  ['Batch upload enforces file count and byte limits', batchRoute.includes('MAX_ONBOARDING_BATCH_FILES') && batchRoute.includes('MAX_ONBOARDING_BATCH_BYTES')],
  ['Rows are deduplicated across a batch', batchRoute.includes("onConflict: 'batch_id,dedupe_key'") && batchRoute.includes('residentDedupeKey(row)')],
  ['Failed documents can be retried from the stored original', detailRoute.includes("body.action !== 'retry_failed'") && detailRoute.includes("storage.from('onboarding-documents').download")],
  ['Human review is persisted into batch row states', syncRoute.includes("status: 'skipped'") && syncRoute.includes("status: 'syncing'")],
  ['Admin onboarding accepts multiple files', adminPage.includes('multiple') && adminPage.includes('formData.append("files", file)')],
  ['Unit rights reuse the assemblies validation instead of duplicating it', rightsImport.includes("from '@/lib/assemblies/unitRights'") && rightsImport.includes('validateUnitRights(') && !/RIGHTS_TOTAL_PERMILLE\s*=/.test(rightsImport)],
  ['Onboarding unit rights are saved through the audited service', rightsOnboarding.includes("method: 'onboarding'") && rightsOnboarding.includes('saveUnitRights(') && syncRoute.includes('applyOnboardingRights(') && rightsMigration.includes("'onboarding'")],
  ['Missing or partial unit rights leave the pending task without blocking the sync', rightsImport.includes("'Cargar derechos de cada unidad'") && rightsImport.includes("'/admin/asambleas#derechos'") && adminPage.includes('PendingTaskCard')],
  ['Agent Center uploads into the same reviewed batch flow', agentPage.includes('uploadOnboardingBatch') && agentPage.includes('source", "agent_center"') && agentPage.includes('/admin/onboarding?batch=')],
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ passed: failures.length === 0, checks: checks.map(([name, passed]) => ({ name, passed })), failures }, null, 2));
if (failures.length) process.exit(1);
