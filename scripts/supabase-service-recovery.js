// Real backup -> isolated local PostgreSQL, Auth, REST and Storage. Never contacts production.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, createHmac, randomBytes } = require('node:crypto');
const backup = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Pass the verified private backup directory.');
const project = 'convive-recovery';
const directory = path.join(backup,'service-recovery');
const composeFile = path.join(directory,'compose.json');
const report = {startedAt:new Date().toISOString(),passed:false,scope:'Local restored database, Auth session, tenant REST isolation, Storage upload and signed download. OAuth, SMTP, MFA encryption and external integrations are not exercised.'};
let secrets;
function run(exe,args,input) {
  return new Promise((resolve,reject)=>{
    const p=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';
    p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);p.on('error',reject);
    p.on('close',code=>code===0?resolve(out.trim()):reject(new Error(`${path.basename(exe)} failed (${code}): ${err.slice(-2000).replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]')}`)));
    p.stdin.on('error',()=>{});
    if(input && typeof input.pipe==='function'){input.on('error',reject);input.pipe(p.stdin);}else p.stdin.end(input);
  });
}
const compose=(args,input)=>run('docker',['compose','-p',project,'-f',composeFile,...args],input);
const sql=query=>compose(['exec','-T','db','psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],query);
async function hash(file){const h=createHash('sha256');for await(const c of createReadStream(file))h.update(c);return h.digest('hex');}
function token(role) {const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');const value=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400});return value+'.'+createHmac('sha256',secrets.jwt).update(value).digest('base64url');}
async function request(base,endpoint,method='GET',body,bearer) {
  const response=await localFetch(base+endpoint,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(bearer?{Authorization:`Bearer ${bearer}`}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw new Error(`Local API ${endpoint.split('?')[0]}: HTTP ${response.status} ${response.data?.msg||response.data?.message||response.data?.error||''}`);
  return response.data;
}
// Invoke HTTP from inside the isolated network, so no port or personal data is exposed to the LAN.
async function localFetch(url,options={}) {
  const internal=url.replace('http://127.0.0.1:15493','http://auth:9999').replace('http://127.0.0.1:15494','http://rest:3000').replace('http://127.0.0.1:15495','http://storage:5000');
  const code="let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',async()=>{try{const p=JSON.parse(input);if(p.options.base64){p.options.body=Buffer.from(p.options.base64,'base64');delete p.options.base64;}const r=await fetch(p.url,{...p.options,signal:AbortSignal.timeout(30000)});const b=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(b.toString())}catch{}console.log(JSON.stringify({ok:r.ok,status:r.status,data,sha256:require('node:crypto').createHash('sha256').update(b).digest('hex')}));}catch(e){console.error(e.message);process.exitCode=1;}});";
  return JSON.parse(await compose(['exec','-T','storage','node','-e',code],JSON.stringify({url:internal,options})));
}
async function healthy(url) {
  for(let n=0;n<30;n++){try{const r=await localFetch(url);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,1000));}
  throw new Error('Local service did not become healthy.');
}
async function main() {
  const manifest=JSON.parse(await fs.readFile(path.join(backup,'manifest.json'),'utf8'));
  const oldProof=JSON.parse(await fs.readFile(path.join(backup,'pglite-restore-report.json'),'utf8'));
  if(!manifest.completed||!oldProof.passed)throw new Error('Verified backup and restore required.');
  for(const file of manifest.files)if(await hash(path.join(backup,file.name))!==file.sha256)throw new Error('Backup checksum differs.');
  await fs.mkdir(directory,{recursive:true});
  try{secrets=JSON.parse(await fs.readFile(path.join(directory,'local-secrets.json'),'utf8'));}catch{secrets={password:randomBytes(24).toString('hex'),jwt:randomBytes(32).toString('hex')};await fs.writeFile(path.join(directory,'local-secrets.json'),JSON.stringify(secrets));}
  const env={POSTGRES_PASSWORD:secrets.password,POSTGRES_DB:'postgres',POSTGRES_USER:'supabase_admin',PGPASSWORD:secrets.password};
  const common={networks:['isolated'],restart:'no'};
  const config={services:{
    db:{...common,image:'public.ecr.aws/supabase/postgres:17.6.1.063',environment:env,volumes:['database_v2:/var/lib/postgresql/data'],ports:['127.0.0.1:15492:5432']},
    auth:{...common,image:'supabase/gotrue:v2.196.0',ports:['127.0.0.1:15493:9999'],environment:{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:15493',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${secrets.password}@db:5432/postgres`,GOTRUE_SITE_URL:'http://127.0.0.1:15493',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_SECRET:secrets.jwt,GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:'1025',GOTRUE_SMTP_ADMIN_EMAIL:'recovery@example.invalid'}},
    rest:{...common,image:'postgrest/postgrest:v14.17',ports:['127.0.0.1:15494:3000'],environment:{PGRST_DB_URI:`postgres://authenticator:${secrets.password}@db:5432/postgres`,PGRST_DB_SCHEMAS:'public,storage',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secrets.jwt}},
    storage:{...common,image:'supabase/storage-api:v1.80.2',ports:['127.0.0.1:15495:5000'],volumes:['objects:/var/lib/storage'],environment:{ANON_KEY:token('anon'),SERVICE_KEY:token('service_role'),AUTH_JWT_SECRET:secrets.jwt,POSTGREST_URL:'http://rest:3000',DATABASE_URL:`postgres://supabase_storage_admin:${secrets.password}@db:5432/postgres`,STORAGE_PUBLIC_URL:'http://127.0.0.1:15495',STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',FILE_SIZE_LIMIT:'52428800',GLOBAL_S3_BUCKET:'stub',TENANT_ID:'stub',REGION:'local',ENABLE_IMAGE_TRANSFORMATION:'false'}}
  },networks:{isolated:{internal:true}},volumes:{database_v2:{},objects:{}}};
  await fs.writeFile(composeFile,JSON.stringify(config,null,2));
  await compose(['pull','auth','rest','storage']);console.log('Official service images available.');
  await compose(['up','-d','db']);
  for(let n=0;n<60;n++){try{await sql('select 1;');break;}catch{if(n===59)throw new Error('Local database failed to start.');await new Promise(r=>setTimeout(r,1000));}}
  if(process.argv[3]!=='--verify-existing') {
    const roles=await fs.readFile(path.join(backup,'roles.sql'),'utf8');
    const existing=new Set((await sql('select rolname from pg_roles;')).split('\n'));
    for(const m of roles.matchAll(/^CREATE ROLE (.+);$/gm)){const name=m[1].replace(/^"|"$/g,'');if(!existing.has(name))await sql(`CREATE ROLE "${name.replaceAll('"','""')}" NOLOGIN;`);}
    await sql(`DROP SCHEMA IF EXISTS public CASCADE;DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS storage CASCADE;DROP SCHEMA IF EXISTS supabase_functions CASCADE;DROP SCHEMA IF EXISTS supabase_migrations CASCADE;CREATE SCHEMA public;CREATE SCHEMA IF NOT EXISTS extensions;CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;`);
    for(const section of ['pre-data','data','post-data']) {
      console.log(`Restoring actual backup: ${section}.`);
      await compose(['exec','-T','db','psql','-X','-q','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres'],createReadStream(path.join(backup,`restore-${section}.sql`)));
    }
    await sql(`ALTER SCHEMA auth OWNER TO supabase_auth_admin;ALTER SCHEMA storage OWNER TO supabase_storage_admin;DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.relname,n.nspname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','storage') AND c.relkind IN ('r','p','S','v') LOOP EXECUTE format('ALTER %s %I.%I OWNER TO %I',CASE WHEN r.relkind='S' THEN 'SEQUENCE' WHEN r.relkind='v' THEN 'VIEW' ELSE 'TABLE' END,r.nspname,r.relname,CASE WHEN r.nspname='auth' THEN 'supabase_auth_admin' ELSE 'supabase_storage_admin' END);END LOOP; END $$;`);
  }
  for(const role of ['supabase_auth_admin','supabase_storage_admin','authenticator'])await sql(`ALTER ROLE ${role} LOGIN PASSWORD '${secrets.password}';`);
  const source=JSON.parse(await fs.readFile(path.join(backup,'source-reference.json'),'utf8'));
  report.counts=JSON.parse(await sql("select jsonb_build_object('profiles',(select count(*) from public.profiles),'auth_users',(select count(*) from auth.users),'history',(select count(*) from public.supermarket_price_history),'products',(select count(*) from public.supermarket_products),'expenses',(select count(*) from public.expenses),'storage_objects',(select count(*) from storage.objects),'expense_sum',(select sum(amount) from public.expenses));"));
  for(const [key,value] of Object.entries(report.counts))if(source[key]!==value)throw new Error(`Restored count differs: ${key}`);
  await compose(['up','-d','auth','rest','storage']);
  await healthy('http://127.0.0.1:15493/health');await healthy('http://127.0.0.1:15495/status');
  const service=token('service_role');
  const actor=JSON.parse(await sql("select row_to_json(r) from (select p.id,u.email,p.community_id from public.profiles p join auth.users u on u.id=p.id where p.role='resident' and exists(select 1 from public.expenses e where e.unit_id=p.unit_id) limit 1)r;"));
  const link=await request('http://127.0.0.1:15493','/admin/generate_link','POST',{type:'magiclink',email:actor.email},service);
  const session=await request('http://127.0.0.1:15493','/verify','POST',{type:'magiclink',token_hash:link.hashed_token});
  if(session.user.id!==actor.id||!session.access_token)throw new Error('Restored Auth session differs.');
  report.authSessionVerified=true;
  const expenses=await request('http://127.0.0.1:15494','/expenses?select=community_id','GET',undefined,session.access_token);
  if(!expenses.length||expenses.some(e=>e.community_id!==actor.community_id))throw new Error('Restored tenant REST isolation failed.');
  report.residentVisibleExpenses=expenses.length;
  const objects=[];
  for(const object of manifest.storage) {
    const bytes=await fs.readFile(path.join(backup,object.localFile));
    if(createHash('sha256').update(bytes).digest('hex')!==object.sha256)throw new Error('Storage backup checksum differs.');
    objects.push({bucket:object.bucket,key:object.key,sha256:object.sha256,base64:bytes.toString('base64'),type:object.metadata?.mimetype||'application/octet-stream'});
  }
  const buckets=JSON.parse(await fs.readFile(path.join(backup,'storage-buckets.json'),'utf8'));
  const transferCode=`let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',async()=>{try{
    const p=JSON.parse(input),base='http://storage:5000';let verified=0,privateObjectsProtected=0;
    for(const o of p.objects){
      const key=encodeURIComponent(o.bucket)+'/'+o.key.split('/').map(encodeURIComponent).join('/');
      const upload=await fetch(base+'/object/'+key,{method:'POST',headers:{Authorization:'Bearer '+p.service,'x-upsert':'true','Content-Type':o.type},body:Buffer.from(o.base64,'base64'),signal:AbortSignal.timeout(30000)});
      if(!upload.ok)throw Error('Local Storage upload: HTTP '+upload.status);
      const sign=await fetch(base+'/object/sign/'+key,{method:'POST',headers:{Authorization:'Bearer '+p.service,'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60}),signal:AbortSignal.timeout(30000)});
      if(!sign.ok)throw Error('Local Storage signing: HTTP '+sign.status);
      const signed=await sign.json(),download=await fetch(base+signed.signedURL,{signal:AbortSignal.timeout(30000)});
      if(!download.ok||require('node:crypto').createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex')!==o.sha256)throw Error('Restored signed download checksum differs.');
      if(p.privateBuckets.includes(o.bucket)){
        const anonymous=await fetch(base+'/object/public/'+key,{signal:AbortSignal.timeout(30000)});
        if(anonymous.ok)throw Error('Private restored object is publicly readable.');
        privateObjectsProtected++;
      }
      verified++;
    }
    console.log(JSON.stringify({verified,privateObjectsProtected}));
  }catch(e){console.error(e.message);process.exitCode=1;}});`;
  const transfer=JSON.parse(await compose(['exec','-T','storage','node','-e',transferCode],JSON.stringify({objects,service,privateBuckets:buckets.filter(b=>!b.public).map(b=>b.id)})));
  if(transfer.verified!==manifest.storage.length)throw new Error('Not all Storage files were verified.');
  report.storageSignedDownloadsVerified=transfer.verified;report.privateObjectsProtected=transfer.privateObjectsProtected;
  report.passed=true;report.completedAt=new Date().toISOString();console.log(JSON.stringify(report));
}
main().catch(error=>{report.error=error.message;console.error(error.message);process.exitCode=1;}).finally(async()=>{
  // Leave persisted local copies stopped: no public listeners after the test.
  await compose(['stop']).catch(()=>{});
  await fs.writeFile(path.join(directory,'service-recovery-report.json'),JSON.stringify(report,null,2)).catch(()=>{});
});
