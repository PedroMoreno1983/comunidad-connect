import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Isolated PostgreSQL rehearsal. Contains synthetic data only; no production credentials or restore.
const db = await PGlite.create();
let restored;
const checks = [];
try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
        'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
      CREATE TABLE communities(id uuid PRIMARY KEY,name text NOT NULL);
      CREATE TABLE profiles(id uuid PRIMARY KEY,community_id uuid REFERENCES communities(id),role text,name text);
      CREATE FUNCTION public.get_my_community_id() RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path=public AS
        'SELECT community_id FROM profiles WHERE id=auth.uid()';
      CREATE TABLE service_providers(id uuid PRIMARY KEY,user_id uuid REFERENCES profiles(id),community_id uuid REFERENCES communities(id),name text);
      CREATE TABLE service_requests(id uuid PRIMARY KEY,community_id uuid REFERENCES communities(id),user_id uuid REFERENCES profiles(id),
        provider_id uuid REFERENCES service_providers(id),description text,preferred_date date,preferred_time text,
        status text DEFAULT 'pending',created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
        CONSTRAINT service_requests_status_check CHECK(status IN ('pending','accepted','completed','cancelled')));
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES profiles(id),community_id uuid REFERENCES communities(id),
        type text,category text,title text,body text,link text,read boolean DEFAULT false);
      CREATE TABLE community_participation_requests(id uuid PRIMARY KEY,community_id uuid REFERENCES communities(id),requester_id uuid REFERENCES profiles(id),
        coordinator_id uuid REFERENCES profiles(id),initiative_type text,initiative_id uuid,status text DEFAULT 'pending',created_at timestamptz DEFAULT now());
      CREATE TABLE units(id uuid PRIMARY KEY,community_id uuid REFERENCES communities(id),number text);
      CREATE TABLE expenses(id uuid PRIMARY KEY,community_id uuid REFERENCES communities(id),unit_id uuid REFERENCES units(id),month text,amount numeric);
      CREATE TABLE unit_payments(id uuid PRIMARY KEY,community_id uuid REFERENCES communities(id),unit_id uuid REFERENCES units(id),expense_id uuid REFERENCES expenses(id),amount numeric);
      ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
      GRANT SELECT,INSERT,UPDATE ON service_requests TO authenticated;
      CREATE POLICY users_create_requests ON service_requests FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
      CREATE POLICY users_view_own_requests ON service_requests FOR SELECT TO authenticated USING(user_id=auth.uid());
      CREATE POLICY users_update_own_requests ON service_requests FOR UPDATE TO authenticated USING(user_id=auth.uid());
      CREATE POLICY providers_update_request_status ON service_requests FOR UPDATE TO authenticated USING(true);
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261006185658_operational_request_boundaries.sql', import.meta.url), 'utf8'));
    checks.push('La migración se aplica en PostgreSQL aislado.');
    const community = randomUUID(), foreign = randomUUID(), resident = randomUUID(), admin = randomUUID(), provider = randomUUID(), request = randomUUID();
    await db.query('INSERT INTO communities VALUES ($1,$2),($3,$4)', [community,'QA local',foreign,'QA otra comunidad']);
    await db.query('INSERT INTO profiles VALUES ($1,$2,$3,$4),($5,$2,$6,$7)', [resident,community,'resident','Residente QA',admin,'admin','Admin QA']);
    await db.query('INSERT INTO service_providers VALUES ($1,$2,$3,$4)', [provider,admin,community,'Proveedor QA']);
    await db.query("INSERT INTO service_requests(id,community_id,user_id,provider_id,description,status) VALUES($1,$2,$3,$4,'QA servicio','pending')", [request,community,resident,provider]);
    assert.equal((await db.query('SELECT count(*)::int n FROM notifications')).rows[0].n, 2);
    await assert.rejects(db.query("UPDATE service_requests SET status='completed' WHERE id=$1",[request]), /invalid-request-transition/);
    await assert.rejects(db.query('UPDATE service_requests SET community_id=$1 WHERE id=$2',[foreign,request]), /identity-immutable/);
    for (const status of ['accepted','awaiting_confirmation','completed']) {
        await db.query('UPDATE service_requests SET status=$1 WHERE id=$2',[status,request]);
    }
    await assert.rejects(db.query("UPDATE service_requests SET status='pending' WHERE id=$1",[request]), /invalid-request-transition/);
    checks.push('Servicio: recepción, aceptación, finalización y cierre; identidad inmutable y sin reapertura.');
    const noAdmin = randomUUID(), loneResident = randomUUID();
    await db.query('INSERT INTO communities VALUES($1,$2)',[noAdmin,'QA sin responsable']);
    await db.query('INSERT INTO profiles VALUES($1,$2,$3,$4)',[loneResident,noAdmin,'resident','Residente sin responsable']);
    await assert.rejects(db.query("INSERT INTO service_requests(id,community_id,user_id,description) VALUES($1,$2,$3,'QA sin destinatario')",[randomUUID(),noAdmin,loneResident]), /no-responsible-profile/);
    checks.push('No se confirma una solicitud si no tiene ningún responsable; se revierte la escritura.');
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[resident]);
    await db.exec('SET ROLE authenticated');
    assert.equal((await db.query("UPDATE service_requests SET description='intrusión' WHERE id=$1 RETURNING id",[request])).rows.length,0);
    await db.exec('RESET ROLE');
    checks.push('El cliente residente no puede saltarse el API modificando solicitudes directamente.');
    const participation = randomUUID();
    await db.query('INSERT INTO community_participation_requests(id,community_id,requester_id,coordinator_id,initiative_type,initiative_id) VALUES($1,$2,$3,$4,$5,$6)',[participation,community,resident,admin,'time_bank',randomUUID()]);
    await assert.rejects(db.query('UPDATE community_participation_requests SET requester_id=$1 WHERE id=$2',[admin,participation]), /identity-immutable/);
    await db.query("UPDATE community_participation_requests SET status='accepted' WHERE id=$1",[participation]);
    await assert.rejects(db.query("UPDATE community_participation_requests SET status='pending' WHERE id=$1",[participation]), /invalid-participation-transition/);
    checks.push('Participación: no se puede cambiar el vecino, iniciativa, coordinador ni reabrir una resolución.');
    const unit = randomUUID(), expense = randomUUID(), payment = randomUUID();
    await db.query('INSERT INTO units VALUES($1,$2,$3)',[unit,community,'QA-101']);
    await db.query('INSERT INTO expenses VALUES($1,$2,$3,$4,$5)',[expense,community,unit,'2026-10',100000]);
    await db.query('INSERT INTO unit_payments VALUES($1,$2,$3,$4,$5)',[payment,community,unit,expense,40000]);
    const tables = ['communities','profiles','units','expenses','unit_payments','service_requests','notifications','community_participation_requests'];
    async function snapshot(connection) {
        const result = {};
        for (const table of tables) result[table] = (await connection.query(`SELECT row_to_json(t) row FROM ${table} t ORDER BY id`)).rows;
        return JSON.stringify(result);
    }
    const before = await snapshot(db);
    const backup = await db.dumpDataDir();
    const bytes = Buffer.from(await backup.arrayBuffer());
    const hash = createHash('sha256').update(bytes).digest('hex');
    // Restore from the saved backup bytes, rather than the still-live source instance.
    const dir = new URL('../artifacts/operational-recovery/', import.meta.url);
    await mkdir(dir,{recursive:true});
    await writeFile(new URL('synthetic-postgres-backup.tar',dir),bytes);
    await db.close();
    const savedBytes = await readFile(new URL('synthetic-postgres-backup.tar',dir));
    assert.equal(createHash('sha256').update(savedBytes).digest('hex'),hash);
    restored = await PGlite.create({loadDataDir:new Blob([savedBytes])});
    assert.equal(await snapshot(restored), before);
    assert.equal((await restored.query('SELECT ((SELECT sum(amount) FROM expenses)-(SELECT sum(amount) FROM unit_payments))::int balance')).rows[0].balance,60000);
    await assert.rejects(restored.query('INSERT INTO unit_payments VALUES($1,$2,$3,$4,$5)',[randomUUID(),community,unit,randomUUID(),1000]), /foreign key/);
    checks.push('Backup leído desde disco y restaurado en otra instancia: filas idénticas, saldo $60.000 y claves foráneas conservadas.');
    const report = {passed:true,generatedAt:new Date().toISOString(),scope:'PostgreSQL aislado con datos sintéticos; no acredita restauración completa del proyecto gestionado de Supabase ni Storage/Auth.',backupSha256:hash,checks};
    await writeFile(new URL('resultado.json',dir),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
} finally {
    if (!db.closed) await db.close();
    if (restored && !restored.closed) await restored.close();
}
