// Explicit operator maintenance; credentials stay in memory, only price observations are removed.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
require('./load-env').loadEnvFile();
const bin = process.env.QA_POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin';
function run(exe,args,env=process.env) {
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='',error='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);
    child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(new Error(error.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'))));
  });
}
async function main() {
  if(!process.argv[2])throw new Error('Pass a verified private backup directory.');
  const directory=path.resolve(process.argv[2]);
  const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
  const proof=JSON.parse(await fs.readFile(path.join(directory,'pglite-restore-report.json'),'utf8'));
  if(!manifest.completed||!proof.passed)throw new Error('A complete backup and passing restore are required.');
  const h=createHash('sha256');for await(const c of createReadStream(path.join(directory,'database.dump')))h.update(c);
  if(h.digest('hex')!==manifest.files.find(f=>f.name==='database.dump').sha256)throw new Error('Backup checksum differs.');
  const script=await run('cmd.exe',['/d','/s','/c','npx.cmd supabase db dump --linked --dry-run']);
  const env={...process.env,PGSSLMODE:'require',PGCONNECT_TIMEOUT:'20',PGOPTIONS:'-c statement_timeout=600000 -c lock_timeout=10000'};
  delete env.PGSERVICE;delete env.PGSERVICEFILE;
  for(const m of script.matchAll(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="(.*)"$/gm))env[m[1]]=m[2].replace(/\\(["\\$`])/g,'$1');
  const ref=(await fs.readFile('supabase/.temp/project-ref','utf8')).trim();
  if(!env.PGPASSWORD||!env.PGUSER.endsWith(`.${ref}`)||new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!==`${ref}.supabase.co`)throw new Error('Project mismatch.');
  const sql=q=>run(path.join(bin,'psql.exe'),['-X','-q','-At','--no-password','-v','ON_ERROR_STOP=1','-c','SET ROLE postgres; '+q],env);
  const measure=`select jsonb_build_object('database_bytes',pg_database_size(current_database()),'history_bytes',pg_total_relation_size('public.supermarket_price_history'),'history_rows',(select count(*) from public.supermarket_price_history),'products',(select count(*) from public.supermarket_products),'expenses',(select count(*) from public.expenses),'expense_sum',(select sum(amount) from public.expenses),'profiles',(select count(*) from public.profiles),'auth_users',(select count(*) from auth.users));`;
  const report={startedAt:new Date().toISOString(),before:JSON.parse(await sql(measure)),deleted:0};
  report.cutoff=await sql("select now()-interval '7 days';");
  for(;;) {
    const count=Number(await sql(`with doomed as (select ctid from public.supermarket_price_history where observed_at < '${report.cutoff}'::timestamptz limit 100000), removed as (delete from public.supermarket_price_history h using doomed d where h.ctid=d.ctid returning 1) select count(*) from removed;`));
    report.deleted+=count;console.log(`Removed ${report.deleted} old price observations.`);if(!count)break;
  }
  console.log('Compacting the price history table.');
  // Separate psql commands: VACUUM cannot execute inside a transaction block.
  await run(path.join(bin,'psql.exe'),['-X','-q','--no-password','-v','ON_ERROR_STOP=1','-c','SET ROLE postgres','-c','VACUUM (FULL, ANALYZE) public.supermarket_price_history'],env);
  report.after=JSON.parse(await sql(measure));
  for(const key of ['products','expenses','expense_sum','profiles','auth_users'])if(report.before[key]!==report.after[key])throw new Error(`Unrelated reference changed during maintenance: ${key}`);
  report.completedAt=new Date().toISOString();report.passed=report.after.database_bytes<500000000;
  await fs.writeFile(path.join(directory,'price-history-maintenance.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));if(!report.passed)throw new Error('Database still exceeds 500 MB.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
