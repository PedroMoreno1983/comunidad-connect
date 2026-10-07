// Restore real backed-up data locally with pgvector; no remote writes or listeners.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

if (!process.argv[2]) throw new Error('Pass the private backup directory.');
const backup = path.resolve(process.argv[2]);
const bin = process.env.QA_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const report = { startedAt:new Date().toISOString(),passed:false,engine:'PGlite PostgreSQL with pgvector',scope:'Application, Auth and Storage database schemas, data, grants and RLS; Storage file checksums. Hosted Auth/Storage APIs and external configuration are not exercised.' };
let db;
async function run(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(path.join(bin,'pg_restore.exe'),args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let stderr=''; child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',reject); child.on('close',code=>code===0?resolve():reject(new Error(`pg_restore (${code}): ${stderr}`)));
  });
}
async function hash(file) { const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex'); }
function withoutMeta(sql) { return sql.split(/\r?\n/).filter(line=>!line.startsWith('\\')).join('\n'); }
async function main() {
  const manifest=JSON.parse(await fs.readFile(path.join(backup,'manifest.json'),'utf8'));
  if(!manifest.completed||!manifest.archiveReadable)throw new Error('Backup is not complete.');
  for(const file of manifest.files)if(await hash(path.join(backup,file.name))!==file.sha256)throw new Error(`Backup checksum differs: ${file.name}.`);
  if (process.argv[3]) {
    const existing = path.resolve(process.argv[3]);
    if (!existing.startsWith(backup + path.sep)) throw new Error('Existing rehearsal must be inside the backup directory.');
    db = await PGlite.create(existing, { extensions: { vector, pgcrypto, pg_trgm, uuid_ossp, btree_gist } });
  } else {
  const archive=path.join(backup,'database.dump');
  const list=path.join(backup,'restore-selection.list');
  const allowed=new Set(['public','auth','storage','supabase_migrations','supabase_functions']);
  const toc=await fs.readFile(path.join(backup,'database-toc.txt'),'utf8');
  const selected=toc.split(/\r?\n/).filter(line=>{
    if(line.startsWith(';'))return true;
    const entry=line.match(/^\d+; \d+ \d+ (.+)$/)?.[1];
    if(!entry)return false;
    if(entry.startsWith('SCHEMA - '))return allowed.has(entry.split(' ')[2]);
    if(entry.startsWith('ACL - SCHEMA '))return allowed.has(entry.split(' ')[3]);
    return [...allowed].some(schema=>new RegExp(`^(?:FUNCTION|PROCEDURE|TYPE|DOMAIN|TABLE|TABLE DATA|SEQUENCE|SEQUENCE OWNED BY|SEQUENCE SET|DEFAULT|VIEW|MATERIALIZED VIEW|MATERIALIZED VIEW DATA|INDEX|CONSTRAINT|FK CONSTRAINT|TRIGGER|POLICY|ROW SECURITY|COMMENT|ACL|DEFAULT ACL) ${schema} `).test(entry));
  }).join('\n');
  await fs.writeFile(list,selected);
  for(const section of ['pre-data','data','post-data'])await run(['--no-owner','--section',section,'--use-list',list,'--file',path.join(backup,`restore-${section}.sql`),archive]);
  db=await PGlite.create(path.join(backup,`pglite-rehearsal-${Date.now()}`),{extensions:{vector,pgcrypto,pg_trgm,uuid_ossp,btree_gist}});
  const roles=await fs.readFile(path.join(backup,'roles.sql'),'utf8');
  const roleNames=[...roles.matchAll(/^CREATE ROLE (.+);$/gm)].map(m=>m[1]).filter(n=>n!=='postgres'&&n!=='"postgres"');
  await db.exec(roleNames.map(n=>`CREATE ROLE ${n} NOLOGIN;`).join('\n'));
  await db.exec('CREATE SCHEMA extensions;CREATE EXTENSION vector WITH SCHEMA public;CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE EXTENSION pg_trgm WITH SCHEMA public;CREATE EXTENSION btree_gist WITH SCHEMA extensions;');
  await db.exec(withoutMeta(await fs.readFile(path.join(backup,'restore-pre-data.sql'),'utf8')));
  console.log('Restored real schema, including pgvector. Importing table data.');
  const lines=readline.createInterface({input:createReadStream(path.join(backup,'restore-data.sql')),crlfDelay:Infinity});
  let copy=null;let chunks=[];let sql='';let rows=0;let totalRows=0;
  async function flush() {
    if(!chunks.length)return;
    await db.exec(copy.replace(/FROM stdin;$/,"FROM '/dev/blob';"),{blob:new Blob([chunks.join('\n')+'\n'])});
    rows+=chunks.length;totalRows+=chunks.length;chunks=[];
  }
  for await(const line of lines) {
    if(copy) {
      if(line==='\\.') {await flush();if(rows>100000)console.log(`Imported ${rows} rows from ${copy.match(/^COPY ([^ ]+)/)[1]}.`);copy=null;rows=0;}
      else {chunks.push(line);if(chunks.length>=25000)await flush();}
    } else if(/^COPY .+ FROM stdin;$/.test(line)) {if(sql.trim())await db.exec(sql);sql='';copy=line;}
    else if(!line.startsWith('\\')) {sql+=line+'\n';}
  }
  if(copy)throw new Error('Incomplete COPY section.');
  if(sql.trim())await db.exec(sql);
  console.log(`Imported ${totalRows} rows; restoring constraints, indexes and access rules.`);
  await db.exec(withoutMeta(await fs.readFile(path.join(backup,'restore-post-data.sql'),'utf8')));
  }
  await db.exec('SET row_security = on');
  const result=await db.query(`select jsonb_build_object('communities',(select count(*) from public.communities),'profiles',(select count(*) from public.profiles),'units',(select count(*) from public.units),'expenses',(select count(*) from public.expenses),'unit_payments',(select count(*) from public.unit_payments),'auth_users',(select count(*) from auth.users),'storage_objects',(select count(*) from storage.objects),'history',(select count(*) from public.supermarket_price_history),'products',(select count(*) from public.supermarket_products),'tasks',(select count(*) from public.agent_tasks)) as counts;`);
  report.counts=result.rows[0].counts;
  const source=JSON.parse(await fs.readFile(path.join(backup,'source-reference.json'),'utf8'));
  for(const [key,value] of Object.entries(report.counts))if(source[key]!==value)throw new Error(`Restored count differs: ${key}.`);
  report.finance=(await db.query("select jsonb_build_object('expenses',(select coalesce(sum(amount),0) from public.expenses),'payments',(select coalesce(sum(amount),0) from public.unit_payments)) as totals")).rows[0].totals;
  if(report.finance.expenses!==source.expense_sum||report.finance.payments!==source.payment_sum)throw new Error('Restored financial sums differ.');
  report.policies=Number((await db.query("select count(*) as n from pg_policies where schemaname='public'")).rows[0].n);
  if (source.public_policies !== undefined && report.policies !== source.public_policies) throw new Error('Restored policy count differs.');
  report.constraints=Number((await db.query("select count(*) as n from pg_constraint where connamespace='public'::regnamespace")).rows[0].n);
  const actor=(await db.query("select p.id,p.community_id from public.profiles p where p.role='resident' and exists(select 1 from public.expenses e where e.unit_id=p.unit_id) limit 1")).rows[0];
  if(!actor)throw new Error('No suitable resident for the access check.');
  await db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor.id]);
    await tx.exec('SET LOCAL ROLE authenticated');
    report.residentIsolation=(await tx.query("select jsonb_build_object('own',(select count(*) from public.expenses where community_id=$1),'foreign',(select count(*) from public.expenses where community_id<>$1)) as checks",[actor.community_id])).rows[0].checks;
  });
  if(!report.residentIsolation.own||report.residentIsolation.foreign!==0)throw new Error('Restored resident isolation failed.');
  for(const object of manifest.storage)if(await hash(path.join(backup,object.localFile))!==object.sha256)throw new Error('Storage file checksum differs.');
  report.storageFilesVerified=manifest.storage.length;
  report.passed=true;report.completedAt=new Date().toISOString();console.log(JSON.stringify(report));
}
try {await main();}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;}finally{if(db)await db.close();await fs.writeFile(path.join(backup,'pglite-restore-report.json'),JSON.stringify(report,null,2));}



