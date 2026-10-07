// Read-only backup. Credentials from the authenticated CLI remain in memory.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
require('./load-env').loadEnvFile();

const bin = process.env.QA_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const resume = process.argv[2] === '--resume';
if (resume && !process.argv[3]) throw new Error('Pass the private backup directory to resume.');
const root = resume ? path.resolve(process.argv[3]) : path.resolve(process.env.LOCALAPPDATA, 'ComunidadConnect', 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
const manifest = { startedAt: new Date().toISOString(), completed: false, files: [], storage: [], limitations: ['Archive validation is not a complete managed Supabase restore.', 'Auth configuration, platform secrets and external services require separate configuration.'] };

async function run(executable, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${path.basename(executable)} failed (${code}): ${stderr.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')}`)));
  });
}
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function record(file) {
  manifest.files.push({ name: path.relative(root, file), bytes: (await fs.stat(file)).size, sha256: await hash(file) });
}
async function main() {
  await fs.mkdir(root, { recursive: true });
  console.log(`Backup directory: ${root}`);
  if (resume) {
    Object.assign(manifest, JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8')));
    delete manifest.error;
    manifest.completed = false;
    manifest.files = manifest.files.filter(file => file.name === 'database.dump');
    manifest.storage = [];
    if (!manifest.archiveReadable || !manifest.files[0] || await hash(path.join(root, manifest.files[0].name)) !== manifest.files[0].sha256) throw new Error('Cannot resume an unverified archive.');
  }
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const script = await run('cmd.exe', ['/d', '/s', '/c', 'npx.cmd supabase db dump --linked --dry-run']);
  const dbEnv = { ...process.env, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20', PGOPTIONS: '-c default_transaction_read_only=on' };
  delete dbEnv.PGSERVICE;
  delete dbEnv.PGSERVICEFILE;
  for (const match of script.matchAll(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="(.*)"$/gm)) dbEnv[match[1]] = match[2].replace(/\\(["\\$`])/g, '$1');
  if (!dbEnv.PGPASSWORD || !dbEnv.PGUSER || !dbEnv.PGHOST) throw new Error('CLI did not provide an authenticated database connection.');
  const projectRef = (await fs.readFile('supabase/.temp/project-ref', 'utf8')).trim();
  if (!dbEnv.PGUSER.endsWith(`.${projectRef}`) || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${projectRef}.supabase.co`) throw new Error('Database and Storage project references differ.');
  manifest.projectRef = projectRef;
  const identity = await run(path.join(bin, 'psql.exe'), ['--no-password', '-X', '-At', '-c', 'select current_database(),current_user'], dbEnv);
  if (!identity.startsWith('postgres|')) throw new Error('Unexpected database.');
  console.log('Authenticated read-only PostgreSQL connection verified.');
  const archive = path.join(root, 'database.dump');
  if (!resume) {
    const reference = await run(path.join(bin, 'psql.exe'), ['--no-password','-X','-q','-At','-c',"SET ROLE postgres; select jsonb_build_object('communities',(select count(*) from public.communities),'profiles',(select count(*) from public.profiles),'units',(select count(*) from public.units),'expenses',(select count(*) from public.expenses),'unit_payments',(select count(*) from public.unit_payments),'auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects),'history',(select count(*) from public.supermarket_price_history),'products',(select count(*) from public.supermarket_products),'tasks',(select count(*) from public.agent_tasks),'public_policies',(select count(*) from pg_policies where schemaname='public'),'expense_sum',(select coalesce(sum(amount),0) from public.expenses),'payment_sum',(select coalesce(sum(amount),0) from public.unit_payments));"], dbEnv);
    await fs.writeFile(path.join(root, 'source-reference.json'), JSON.stringify(JSON.parse(reference), null, 2));
    await run(path.join(bin, 'pg_dump.exe'), ['--no-password', '--role=postgres', '--format=custom', '--compress=gzip:6', '--file', archive], dbEnv);
    console.log('Database archive written.');
  }
  const toc = await run(path.join(bin, 'pg_restore.exe'), ['--list', archive]);
  for (const entry of ['TABLE DATA public expenses', 'TABLE DATA auth users', 'TABLE DATA storage objects', 'TABLE DATA public supermarket_price_history']) {
    if (!toc.includes(entry)) throw new Error(`Archive is missing ${entry}.`);
  }
  await fs.writeFile(path.join(root, 'database-toc.txt'), toc);
  // Read every compressed block, including table data, without printing it.
  await run(path.join(bin, 'pg_restore.exe'), ['--file=NUL', archive]);
  if (!resume) await record(archive);
  manifest.archiveReadable = true;
  // Another tool/session may rotate the CLI login while a large dump is running.
  const renewed = await run('cmd.exe', ['/d', '/s', '/c', 'npx.cmd supabase db dump --linked --dry-run']);
  for (const match of renewed.matchAll(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="(.*)"$/gm)) dbEnv[match[1]] = match[2].replace(/\\(["\\$`])/g, '$1');
  if (!dbEnv.PGUSER.endsWith(`.${projectRef}`)) throw new Error('Linked project changed during backup.');
  await run(path.join(bin, 'pg_dumpall.exe'), ['--no-password', '--database=postgres', '--roles-only', '--no-role-passwords', '--role=postgres', '--file', path.join(root, 'roles.sql')], dbEnv);
  await record(path.join(root, 'roles.sql'));
  console.log('Archive traversal and role export verified.');

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const buckets = await client.storage.listBuckets();
  if (buckets.error) throw new Error(buckets.error.message);
  await fs.writeFile(path.join(root, 'storage-buckets.json'), JSON.stringify(buckets.data, null, 2));
  await record(path.join(root, 'storage-buckets.json'));
  async function walk(bucket, prefix = '') {
    for (let offset = 0;; offset += 100) {
      const page = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (page.error) throw new Error(page.error.message);
      for (const object of page.data) {
        const key = prefix ? `${prefix}/${object.name}` : object.name;
        if (!object.id) { await walk(bucket, key); continue; }
        const result = await client.storage.from(bucket).download(key);
        if (result.error) throw new Error(result.error.message);
        const bytes = Buffer.from(await result.data.arrayBuffer());
        const relative = path.join('storage', bucket, `${Buffer.from(key).toString('base64url')}.bin`);
        const file = path.join(root, relative);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, bytes);
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (await hash(file) !== digest) throw new Error('Storage checksum mismatch.');
        manifest.storage.push({ bucket, key, localFile: relative, bytes: bytes.length, sha256: digest, metadata: object.metadata });
      }
      if (page.data.length < 100) break;
    }
  }
  for (const bucket of buckets.data) await walk(bucket.name);
  manifest.completed = true;
  manifest.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ completed: true, directory: root, archiveBytes: manifest.files[0].bytes, storageFiles: manifest.storage.length }));
}
main().catch(async error => {
  manifest.error = error.message;
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2)).catch(() => {});
  console.error(error.message); process.exitCode = 1;
});
