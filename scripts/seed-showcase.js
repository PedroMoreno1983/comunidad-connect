/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const env = fs.readFileSync(envPath, "utf8");
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) process.env[key] = rawValue.replace(/^"|"$/g, "");
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000);
}

function iso(days = 0) {
  return daysFromNow(days).toISOString();
}

function date(days = 0) {
  return daysFromNow(days).toISOString().slice(0, 10);
}

function month(offset = 0) {
  const value = new Date();
  value.setMonth(value.getMonth() + offset);
  return value.toISOString().slice(0, 7);
}

async function assertOk(label, result) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message || JSON.stringify(result.error)}`);
  }
  return result.data;
}

async function upsert(supabase, table, rows, options = {}) {
  if (!rows.length) return [];
  return assertOk(table, await supabase.from(table).upsert(rows, options).select());
}

async function removeWhere(supabase, table, column, value) {
  const result = await supabase.from(table).delete().eq(column, value);
  if (result.error) {
    console.warn(`[seed] Could not clear ${table}: ${result.error.message}`);
  }
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  return null;
}

async function ensureAuthUser(supabase, { email, password, name, role, communityId, unitNumber }) {
  const metadata = {
    name,
    role,
    community_id: communityId,
    unit_number: unitNumber || undefined,
  };
  const existing = await findAuthUserByEmail(supabase, email);

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: metadata,
      app_metadata: { role, community_id: communityId },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: { role, community_id: communityId },
  });
  if (error) throw error;
  return data.user;
}

async function main() {
  loadEnv();

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const communityId = "b392cf17-fd6b-47dd-b0b4-72b0e007824e";
  const adminEmail = "admin.showcase@conviveconnect.cl";
  const passwords = {
    admin: requiredEnv("SHOWCASE_ADMIN_PASSWORD"),
    resident: requiredEnv("SHOWCASE_RESIDENT_PASSWORD"),
    residentTwo: requiredEnv("SHOWCASE_RESIDENT_TWO_PASSWORD"),
    concierge: requiredEnv("SHOWCASE_CONCIERGE_PASSWORD"),
  };

  const admin = await ensureAuthUser(supabase, {
    email: adminEmail,
    password: passwords.admin,
    name: "Admin Showcase",
    role: "admin",
    communityId,
  });

  const resident = await ensureAuthUser(supabase, {
    email: "residente.showcase@conviveconnect.cl",
    password: passwords.resident,
    name: "Andrea Dupre",
    role: "resident",
    communityId,
    unitNumber: "1204",
  });

  const residentTwo = await ensureAuthUser(supabase, {
    email: "marta.showcase@conviveconnect.cl",
    password: passwords.residentTwo,
    name: "Marta Rojas",
    role: "resident",
    communityId,
    unitNumber: "805",
  });

  const concierge = await ensureAuthUser(supabase, {
    email: "conserje.showcase@conviveconnect.cl",
    password: passwords.concierge,
    name: "Conserje Torres",
    role: "concierge",
    communityId,
  });

  const units = {
    u805: "b392cf17-fd6b-47dd-b0b4-72b0e0000805",
    u1104: "b392cf17-fd6b-47dd-b0b4-72b0e0001104",
    u1204: "b392cf17-fd6b-47dd-b0b4-72b0e0001204",
    u1505: "b392cf17-fd6b-47dd-b0b4-72b0e0001505",
    u1702: "b392cf17-fd6b-47dd-b0b4-72b0e0001702",
  };

  await upsert(supabase, "pricing_tiers", [
    {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Enterprise",
      price_per_unit: 990,
      base_price: 49990,
      features: { amenities: true, maintenance: true, voting: true, coco_ai: true, custom_roles: true },
    },
  ], { onConflict: "id" });

  await upsert(supabase, "communities", [
    {
      id: communityId,
      name: "Edificio Convive Showcase",
      address: "Av. Apoquindo 4501, Las Condes",
      tier_id: "33333333-3333-3333-3333-333333333333",
      subscription_status: "active",
    },
  ], { onConflict: "id" });

  await upsert(supabase, "ai_budgets", [
    {
      community_id: communityId,
      plan: "pro",
      is_enabled: true,
      monthly_token_limit: 1000000,
      monthly_image_limit: 30,
      monthly_cost_limit_cents: 2500,
      resident_daily_token_limit: 8000,
      staff_daily_token_limit: 50000,
      heavy_action_daily_limit: 10,
    },
  ], { onConflict: "community_id" });

  await upsert(supabase, "profiles", [
    {
      id: admin.id,
      name: "Admin Showcase",
      full_name: "Administracion Edificio Convive Showcase",
      email: adminEmail,
      role: "admin",
      unit_id: null,
      phone_number: "+56940000001",
      whatsapp_enabled: true,
      community_id: communityId,
    },
    {
      id: resident.id,
      name: "Andrea Dupre",
      full_name: "Andrea Dupre",
      email: "residente.showcase@conviveconnect.cl",
      role: "resident",
      unit_id: units.u1204,
      department_number: "1204",
      phone_number: "+56940000002",
      whatsapp_enabled: true,
      community_id: communityId,
    },
    {
      id: residentTwo.id,
      name: "Marta Rojas",
      full_name: "Marta Rojas",
      email: "marta.showcase@conviveconnect.cl",
      role: "resident",
      unit_id: units.u805,
      department_number: "805",
      phone_number: "+56940000003",
      whatsapp_enabled: true,
      community_id: communityId,
    },
    {
      id: concierge.id,
      name: "Conserje Torres",
      full_name: "Conserje Torres",
      email: "conserje.showcase@conviveconnect.cl",
      role: "concierge",
      unit_id: null,
      phone_number: "+56940000004",
      whatsapp_enabled: true,
      community_id: communityId,
    },
  ], { onConflict: "id" });

  await upsert(supabase, "units", [
    { id: units.u805, number: "805", floor: 8, owner_id: residentTwo.id, community_id: communityId },
    { id: units.u1104, number: "1104", floor: 11, owner_id: null, community_id: communityId },
    { id: units.u1204, number: "1204", floor: 12, owner_id: resident.id, community_id: communityId },
    { id: units.u1505, number: "1505", floor: 15, owner_id: null, community_id: communityId },
    { id: units.u1702, number: "1702", floor: 17, owner_id: null, community_id: communityId },
  ], { onConflict: "id" });

  const userIds = [admin.id, resident.id, residentTwo.id, concierge.id];
  for (const table of ["operation_events", "ai_usage_events", "coco_cases", "service_requests", "bookings", "expenses", "marketplace_items", "amenities", "service_providers", "building_assets", "notifications", "visitors", "visitor_logs", "qr_invitations", "water_readings", "packages"]) {
    if (table === "notifications") {
      for (const userId of userIds) await removeWhere(supabase, table, "user_id", userId);
    } else {
      await removeWhere(supabase, table, "community_id", communityId);
    }
  }
  await removeWhere(supabase, "poll_votes", "community_id", communityId);
  await removeWhere(supabase, "polls", "community_id", communityId);

  await upsert(supabase, "announcements", [
    {
      id: "b392cf17-0001-4000-8000-000000000001",
      community_id: communityId,
      author_id: admin.id,
      title: "Bienvenida a Convive Connect",
      content: "Este entorno showcase muestra la operacion diaria de una comunidad: avisos, votaciones, pagos, reservas, mantenciones, marketplace y CoCo IA con datos ficticios pero realistas.",
      priority: "info",
      created_at: iso(-1),
    },
    {
      id: "b392cf17-0001-4000-8000-000000000002",
      community_id: communityId,
      author_id: admin.id,
      title: "Mantencion preventiva de ascensores",
      content: "El ascensor Torre B tendra revision este jueves entre 10:00 y 12:00. Conserjeria coordinara apoyo para adultos mayores durante el trabajo.",
      priority: "event",
      created_at: iso(-0.6),
    },
    {
      id: "b392cf17-0001-4000-8000-000000000003",
      community_id: communityId,
      author_id: admin.id,
      title: "Corte programado de agua caliente",
      content: "Proveedor revisara sala de calderas del piso -1. El servicio deberia normalizarse durante la tarde. Se publicara cierre cuando termine la inspeccion.",
      priority: "alert",
      created_at: iso(-0.2),
    },
  ], { onConflict: "id" });

  await upsert(supabase, "amenities", [
    { id: "b392cf17-0002-4000-8000-000000000001", community_id: communityId, name: "Quincho panoramico", description: "Espacio equipado para celebraciones familiares con parrilla, mesones y vista despejada.", max_capacity: 24, hourly_rate: 18000, icon_name: "Flame", gradient: "from-orange-500 to-red-600" },
    { id: "b392cf17-0002-4000-8000-000000000002", community_id: communityId, name: "Sala multiuso", description: "Sala para reuniones de comite, talleres y actividades vecinales.", max_capacity: 32, hourly_rate: 10000, icon_name: "PartyPopper", gradient: "from-blue-500 to-indigo-700" },
    { id: "b392cf17-0002-4000-8000-000000000003", community_id: communityId, name: "Gimnasio", description: "Bloques de entrenamiento para evitar sobrecupo en horarios punta.", max_capacity: 10, hourly_rate: 0, icon_name: "Dumbbell", gradient: "from-emerald-500 to-teal-700" },
    { id: "b392cf17-0002-4000-8000-000000000004", community_id: communityId, name: "Piscina temperada", description: "Reserva de turnos para uso familiar durante temporada habilitada.", max_capacity: 18, hourly_rate: 0, icon_name: "Waves", gradient: "from-cyan-500 to-blue-700" },
  ], { onConflict: "id" });

  await upsert(supabase, "bookings", [
    { id: "b392cf17-0003-4000-8000-000000000001", community_id: communityId, amenity_id: "b392cf17-0002-4000-8000-000000000001", user_id: resident.id, date: date(2), start_time: "19:00", end_time: "22:00", status: "confirmed", created_at: iso(-2) },
    { id: "b392cf17-0003-4000-8000-000000000002", community_id: communityId, amenity_id: "b392cf17-0002-4000-8000-000000000002", user_id: residentTwo.id, date: date(4), start_time: "17:00", end_time: "20:00", status: "pending", created_at: iso(-1) },
    { id: "b392cf17-0003-4000-8000-000000000003", community_id: communityId, amenity_id: "b392cf17-0002-4000-8000-000000000003", user_id: resident.id, date: date(1), start_time: "07:00", end_time: "08:00", status: "confirmed", created_at: iso(-0.5) },
  ], { onConflict: "id" });

  await upsert(supabase, "expenses", [
    { id: "b392cf17-0004-4000-8000-000000000001", community_id: communityId, unit_id: units.u1204, month: month(0), amount: 148600, status: "pending", due_date: date(6), created_at: iso(-5) },
    { id: "b392cf17-0004-4000-8000-000000000002", community_id: communityId, unit_id: units.u1204, month: month(-1), amount: 142300, status: "paid", due_date: date(-20), created_at: iso(-35) },
    { id: "b392cf17-0004-4000-8000-000000000003", community_id: communityId, unit_id: units.u805, month: month(0), amount: 132900, status: "overdue", due_date: date(-3), created_at: iso(-6) },
    { id: "b392cf17-0004-4000-8000-000000000004", community_id: communityId, unit_id: units.u1505, month: month(0), amount: 156400, status: "pending", due_date: date(6), created_at: iso(-5) },
    { id: "b392cf17-0004-4000-8000-000000000005", community_id: communityId, unit_id: units.u1702, month: month(-1), amount: 151200, status: "paid", due_date: date(-20), created_at: iso(-35) },
    { id: "b392cf17-0004-4000-8000-000000000006", community_id: communityId, unit_id: units.u1104, month: month(-2), amount: 139800, status: "paid", due_date: date(-50), created_at: iso(-65) },
  ], { onConflict: "id" });

  await upsert(supabase, "marketplace_items", [
    { id: "b392cf17-0005-4000-8000-000000000001", community_id: communityId, seller_id: resident.id, title: "Silla ergonomica home office", description: "Respaldo regulable, buen estado. Ideal para teletrabajo en departamento.", price: 65000, category: "furniture", status: "available", image_url: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?q=80&w=1200&auto=format&fit=crop", images: ["https://images.unsplash.com/photo-1580480055273-228ff5388ef8?q=80&w=1200&auto=format&fit=crop"], allow_sale: true, allow_swap: false, allow_barter: true, barter_details: "Acepto plantas grandes o repisa.", payment_status: "none", created_at: iso(-3) },
    { id: "b392cf17-0005-4000-8000-000000000002", community_id: communityId, seller_id: residentTwo.id, title: "Bicicleta plegable aro 20", description: "Uso liviano, se entrega en conserjeria con coordinacion previa.", price: 85000, category: "other", status: "available", image_url: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?q=80&w=1200&auto=format&fit=crop", images: ["https://images.unsplash.com/photo-1485965120184-e220f721d03e?q=80&w=1200&auto=format&fit=crop"], allow_sale: true, allow_swap: true, swap_details: "Acepto scooter o silla de escritorio.", allow_barter: false, barter_details: "", payment_status: "none", created_at: iso(-2) },
    { id: "b392cf17-0005-4000-8000-000000000003", community_id: communityId, seller_id: resident.id, title: "Monitor Samsung 24 pulgadas", description: "Full HD, entrada HDMI. Reservado para revision del comprador.", price: 72000, category: "electronics", status: "reserved", image_url: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=1200&auto=format&fit=crop", images: ["https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=1200&auto=format&fit=crop"], allow_sale: true, allow_swap: false, swap_details: "", allow_barter: false, barter_details: "", payment_status: "pending", created_at: iso(-4) },
    { id: "b392cf17-0005-4000-8000-000000000004", community_id: communityId, seller_id: admin.id, title: "Kit emergencia comunitario", description: "Pack sellado para demostracion de retiro seguro desde administracion: linterna, pilas y manta termica.", price: 24000, category: "other", status: "available", image_url: null, images: [], allow_sale: true, allow_swap: false, swap_details: "", allow_barter: false, barter_details: "", payment_status: "none", created_at: iso(-1.5) },
  ], { onConflict: "id" });

  await upsert(supabase, "service_providers", [
    { id: "b392cf17-0006-4000-8000-000000000001", community_id: communityId, name: "Gasfiter Certificado Torres", category: "plumbing", rating: 4.8, contact_phone: "+56988880001", created_at: iso(-20) },
    { id: "b392cf17-0006-4000-8000-000000000002", community_id: communityId, name: "Ascensores Andinos", category: "general", rating: 4.6, contact_phone: "+56988880002", created_at: iso(-25) },
    { id: "b392cf17-0006-4000-8000-000000000003", community_id: communityId, name: "Electricidad Segura SpA", category: "electrical", rating: 4.9, contact_phone: "+56988880003", created_at: iso(-18) },
  ], { onConflict: "id" });

  await upsert(supabase, "service_requests", [
    { id: "b392cf17-0007-4000-8000-000000000001", community_id: communityId, user_id: resident.id, provider_id: "b392cf17-0006-4000-8000-000000000001", preferred_date: date(1), preferred_time: "09:30", description: "Plomeria depto 1204: revision de fuga bajo lavaplatos y cambio de flexible si corresponde.", status: "pending", created_at: iso(-0.5) },
    { id: "b392cf17-0007-4000-8000-000000000002", community_id: communityId, user_id: admin.id, provider_id: "b392cf17-0006-4000-8000-000000000003", preferred_date: date(0), preferred_time: "15:00", description: "Electricidad sala bombas -1: normalizar tablero de emergencia y revisar rotulacion de circuitos criticos.", status: "accepted", created_at: iso(-2) },
    { id: "b392cf17-0007-4000-8000-000000000003", community_id: communityId, user_id: admin.id, provider_id: "b392cf17-0006-4000-8000-000000000002", preferred_date: date(-2), preferred_time: "11:00", description: "Ascensor Torre B: mantencion mensual y prueba de rescate.", status: "completed", created_at: iso(-5) },
  ], { onConflict: "id" });

  await upsert(supabase, "coco_cases", [
    { id: "b392cf17-0008-4000-8000-000000000001", community_id: communityId, user_id: resident.id, unit_id: units.u1204, unit_label: "1204", role: "resident", channel: "web", type: "incidencia", category: "plomeria", urgency: "alta", action: "escalar_conserjeria", title: "Filtracion activa en depto 1204", description: "Residente reporta agua cayendo desde cielo del bano principal.", reason: "Riesgo de dano a bienes y posible afectacion a depto inferior.", source_message: "Se esta filtrando agua del techo del bano y ya mojo el mueble.", assistant_reply: "Estoy alertando a conserjeria y dejando el caso abierto para seguimiento.", status: "in_progress", created_at: iso(-0.3), updated_at: iso(-0.1) },
    { id: "b392cf17-0008-4000-8000-000000000002", community_id: communityId, user_id: residentTwo.id, unit_id: units.u805, unit_label: "805", role: "resident", channel: "web", type: "reclamo", category: "ruido", urgency: "media", action: "escalar_admin", title: "Ruidos recurrentes desde depto 1505", description: "Cuarto reporte de ruido fuera de horario en el mes.", reason: "La recurrencia requiere intervencion formal de administracion.", source_message: "De nuevo el ruido del 1505, ya es la cuarta vez este mes.", assistant_reply: "Registre el reporte y lo eleve con historial a administracion.", status: "open", created_at: iso(-1.1), updated_at: iso(-1) },
    { id: "b392cf17-0008-4000-8000-000000000003", community_id: communityId, user_id: concierge.id, unit_label: "Estacionamiento -2", role: "concierge", channel: "web", type: "alerta_seguridad", category: "seguridad", urgency: "alta", action: "notificar_admin", title: "Persona no identificada en estacionamiento", description: "Conserje registra presencia prolongada de persona sin identificacion.", reason: "Zona sensible, no cooperacion y riesgo de intrusiones.", source_message: "Hay una persona dando vueltas en estacionamiento hace 20 minutos.", assistant_reply: "Alerta enviada a administracion. Mantener distancia y confirmar camaras.", status: "resolved", created_at: iso(-2.2), updated_at: iso(-2) },
  ], { onConflict: "id" });

  await upsert(supabase, "building_assets", [
    { id: "b392cf17-0009-4000-8000-000000000001", community_id: communityId, name: "Bomba presurizadora A", category: "pump", brand: "Grundfos", model: "CME 10", installation_date: "2020-03-12", location: "Sala bombas -1", health_status: "warning", last_maintenance: date(-22), next_maintenance: date(2), created_at: iso(-120) },
    { id: "b392cf17-0009-4000-8000-000000000002", community_id: communityId, name: "Ascensor torre B", category: "elevator", brand: "Otis", model: "Gen2", installation_date: "2019-09-18", location: "Torre B", health_status: "optimal", last_maintenance: date(-9), next_maintenance: date(9), created_at: iso(-120) },
    { id: "b392cf17-0009-4000-8000-000000000003", community_id: communityId, name: "Tablero emergencia", category: "electrical", brand: "Schneider", model: "Prisma", installation_date: "2018-06-03", location: "Sala electrica", health_status: "critical", last_maintenance: date(-45), next_maintenance: date(1), created_at: iso(-120) },
  ], { onConflict: "id" });

  await upsert(supabase, "maintenance_tasks", [
    { id: "b392cf17-0010-4000-8000-000000000001", community_id: communityId, asset_id: "b392cf17-0009-4000-8000-000000000001", title: "Revision sala de bombas", description: "Medir presion, revisar sellos y validar tablero de control.", frequency: "monthly", due_date: date(2), priority: "high", status: "pending", created_at: iso(-3) },
    { id: "b392cf17-0010-4000-8000-000000000002", community_id: communityId, asset_id: "b392cf17-0009-4000-8000-000000000002", title: "Prueba ascensor torre B", description: "Prueba de rescate, sensores de puerta y bitacora normativa.", frequency: "monthly", due_date: date(9), priority: "medium", status: "pending", created_at: iso(-4) },
    { id: "b392cf17-0010-4000-8000-000000000003", community_id: communityId, asset_id: "b392cf17-0009-4000-8000-000000000003", title: "Normalizar tablero emergencia", description: "Revisar termicos, rotulacion y continuidad de circuito critico.", frequency: "quarterly", due_date: date(1), priority: "high", status: "overdue", created_at: iso(-8) },
  ], { onConflict: "id" });

  await upsert(supabase, "maintenance_logs", [
    { id: "b392cf17-0011-4000-8000-000000000001", community_id: communityId, asset_id: "b392cf17-0009-4000-8000-000000000001", task_id: null, performed_by: "Mantencion interna", description: "Cambio de sello y prueba de presion.", cost: 180000, date: date(-7), attachments: [], created_at: iso(-7) },
    { id: "b392cf17-0011-4000-8000-000000000002", community_id: communityId, asset_id: "b392cf17-0009-4000-8000-000000000002", task_id: null, performed_by: "Proveedor ascensores", description: "Limpieza de sensores y ajuste de puertas.", cost: 95000, date: date(-4), attachments: [], created_at: iso(-4) },
    { id: "b392cf17-0011-4000-8000-000000000003", community_id: communityId, asset_id: "b392cf17-0009-4000-8000-000000000003", task_id: null, performed_by: "Electricista certificado", description: "Inspeccion de tablero y recomendacion de reemplazo de diferencial.", cost: 175000, date: date(-2), attachments: [], created_at: iso(-2) },
  ], { onConflict: "id" });

  const pollId = "b392cf17-0012-4000-8000-000000000001";
  await upsert(supabase, "polls", [
    { id: pollId, community_id: communityId, title: "Prioridad de mejora 2026", description: "Define en que proyecto debe enfocarse el fondo de mejoras del proximo trimestre.", category: "maintenance", status: "active", end_date: iso(7), created_by: admin.id, created_at: iso(-1), updated_at: iso(-1) },
  ], { onConflict: "id" });
  await upsert(supabase, "poll_options", [
    { id: "b392cf17-0013-4000-8000-000000000001", poll_id: pollId, text: "Renovar quincho y mobiliario exterior", display_order: 1, votes: 1 },
    { id: "b392cf17-0013-4000-8000-000000000002", poll_id: pollId, text: "Mejorar camaras de estacionamiento", display_order: 2, votes: 1 },
    { id: "b392cf17-0013-4000-8000-000000000003", poll_id: pollId, text: "Pintura de pasillos y senaletica", display_order: 3, votes: 0 },
  ], { onConflict: "id" });
  await upsert(supabase, "poll_votes", [
    { id: "b392cf17-0014-4000-8000-000000000001", poll_id: pollId, option_id: "b392cf17-0013-4000-8000-000000000001", user_id: resident.id, community_id: communityId, created_at: iso(-0.5) },
    { id: "b392cf17-0014-4000-8000-000000000002", poll_id: pollId, option_id: "b392cf17-0013-4000-8000-000000000002", user_id: residentTwo.id, community_id: communityId, created_at: iso(-0.4) },
  ], { onConflict: "id" });

  const currentReadingDate = date(0);
  const previousReadingDate = date(-30);
  await upsert(supabase, "water_readings", [
    { id: "b392cf17-0019-4000-8000-000000000001", community_id: communityId, unit_id: units.u805, reading_value: 118.4, reading_date: previousReadingDate, month: "Abril", year: 2026, created_by: admin.id, created_at: iso(-30) },
    { id: "b392cf17-0019-4000-8000-000000000002", community_id: communityId, unit_id: units.u805, reading_value: 132.9, reading_date: currentReadingDate, month: "Mayo", year: 2026, created_by: admin.id, created_at: iso(-0.2) },
    { id: "b392cf17-0019-4000-8000-000000000003", community_id: communityId, unit_id: units.u1104, reading_value: 141.2, reading_date: previousReadingDate, month: "Abril", year: 2026, created_by: admin.id, created_at: iso(-30) },
    { id: "b392cf17-0019-4000-8000-000000000004", community_id: communityId, unit_id: units.u1104, reading_value: 154.7, reading_date: currentReadingDate, month: "Mayo", year: 2026, created_by: admin.id, created_at: iso(-0.2) },
    { id: "b392cf17-0019-4000-8000-000000000005", community_id: communityId, unit_id: units.u1204, reading_value: 132.1, reading_date: previousReadingDate, month: "Abril", year: 2026, created_by: admin.id, created_at: iso(-30) },
    { id: "b392cf17-0019-4000-8000-000000000006", community_id: communityId, unit_id: units.u1204, reading_value: 151.9, reading_date: currentReadingDate, month: "Mayo", year: 2026, created_by: admin.id, created_at: iso(-0.2) },
    { id: "b392cf17-0019-4000-8000-000000000007", community_id: communityId, unit_id: units.u1505, reading_value: 149.5, reading_date: previousReadingDate, month: "Abril", year: 2026, created_by: admin.id, created_at: iso(-30) },
    { id: "b392cf17-0019-4000-8000-000000000008", community_id: communityId, unit_id: units.u1505, reading_value: 181.4, reading_date: currentReadingDate, month: "Mayo", year: 2026, created_by: admin.id, created_at: iso(-0.2) },
    { id: "b392cf17-0019-4000-8000-000000000009", community_id: communityId, unit_id: units.u1702, reading_value: 164.0, reading_date: previousReadingDate, month: "Abril", year: 2026, created_by: admin.id, created_at: iso(-30) },
    { id: "b392cf17-0019-4000-8000-000000000010", community_id: communityId, unit_id: units.u1702, reading_value: 177.8, reading_date: currentReadingDate, month: "Mayo", year: 2026, created_by: admin.id, created_at: iso(-0.2) },
  ], { onConflict: "id" });

  await upsert(supabase, "qr_invitations", [
    { id: "b392cf17-0020-4000-8000-000000000001", community_id: communityId, resident_id: resident.id, unit_id: units.u1204, guest_name: "Paula Herrera", guest_dni: "16.442.991-2", qr_code: "INV-SHOW-PAULA", valid_from: iso(-0.1), valid_to: iso(1), status: "active", created_at: iso(-0.1) },
    { id: "b392cf17-0020-4000-8000-000000000002", community_id: communityId, resident_id: resident.id, unit_id: units.u1204, guest_name: "Martin Silva", guest_dni: "18.245.110-8", qr_code: "INV-SHOW-MARTIN", valid_from: iso(-3), valid_to: iso(-2), status: "used", used_at: iso(-2.8), created_at: iso(-3) },
    { id: "b392cf17-0020-4000-8000-000000000003", community_id: communityId, resident_id: residentTwo.id, unit_id: units.u805, guest_name: "Camila Rojas", guest_dni: "19.330.221-4", qr_code: "INV-SHOW-CAMILA", valid_from: iso(-1), valid_to: iso(0.5), status: "active", created_at: iso(-1) },
  ], { onConflict: "id" });

  await upsert(supabase, "visitors", [
    { id: "b392cf17-0015-4000-8000-000000000001", community_id: communityId, visitor_name: "Paula Herrera", unit_id: units.u1204, entry_time: iso(-0.1), exit_time: null, purpose: "Visita autorizada por residente", created_at: iso(-0.1) },
    { id: "b392cf17-0015-4000-8000-000000000002", community_id: communityId, visitor_name: "Tecnico ascensores", unit_id: "Torre B", entry_time: iso(-0.3), exit_time: iso(-0.2), purpose: "Mantencion programada", created_at: iso(-0.3) },
  ], { onConflict: "id" });

  await upsert(supabase, "visitor_logs", [
    { id: "b392cf17-0021-4000-8000-000000000001", community_id: communityId, visitor_name: "Paula Herrera", unit_id: units.u1204, entry_time: iso(-0.1), exit_time: null, purpose: "Visita autorizada por QR", registered_by: concierge.id, is_qr: true, created_at: iso(-0.1) },
    { id: "b392cf17-0021-4000-8000-000000000002", community_id: communityId, visitor_name: "Tecnico Ascensores Andinos", unit_id: units.u1505, entry_time: iso(-0.35), exit_time: iso(-0.25), purpose: "Mantencion programada", registered_by: concierge.id, is_qr: false, created_at: iso(-0.35) },
    { id: "b392cf17-0021-4000-8000-000000000003", community_id: communityId, visitor_name: "Camila Rojas", unit_id: units.u805, entry_time: iso(-1.2), exit_time: iso(-1.1), purpose: "Visita familiar", registered_by: concierge.id, is_qr: true, created_at: iso(-1.2) },
  ], { onConflict: "id" });

  await upsert(supabase, "packages", [
    { id: "b392cf17-0016-4000-8000-000000000001", community_id: communityId, recipient_unit_id: units.u1204, description: "Caja Mercado Libre mediana", received_at: iso(-0.04), picked_up_at: null, status: "pending", created_at: iso(-0.04) },
    { id: "b392cf17-0016-4000-8000-000000000002", community_id: communityId, recipient_unit_id: units.u805, description: "Sobre Chilexpress", received_at: iso(-1), picked_up_at: iso(-0.8), status: "picked-up", created_at: iso(-1) },
  ], { onConflict: "id" });

  await upsert(supabase, "operation_events", [
    { id: "b392cf17-0017-4000-8000-000000000001", community_id: communityId, actor_id: admin.id, actor_role: "admin", action: "showcase.seed", entity_type: "community", entity_id: communityId, severity: "success", status: "success", summary: "Entorno showcase preparado para recorrido comercial.", metadata: { source: "seed:showcase" }, created_at: iso(-0.01) },
    { id: "b392cf17-0017-4000-8000-000000000002", community_id: communityId, actor_id: admin.id, actor_role: "admin", action: "poll.published", entity_type: "poll", entity_id: pollId, severity: "info", status: "success", summary: "Votacion de mejoras publicada para residentes.", metadata: { channel: ["app", "whatsapp_pending_config"] }, created_at: iso(-1) },
    { id: "b392cf17-0017-4000-8000-000000000003", community_id: communityId, actor_id: concierge.id, actor_role: "concierge", action: "case.escalated", entity_type: "coco_case", entity_id: "b392cf17-0008-4000-8000-000000000001", severity: "warning", status: "pending", summary: "Filtracion en 1204 escalada a conserjeria y administracion.", metadata: { unit: "1204", urgency: "alta" }, created_at: iso(-0.25) },
  ], { onConflict: "id" });

  await upsert(supabase, "notifications", [
    { id: "b392cf17-0018-4000-8000-000000000001", community_id: communityId, user_id: admin.id, type: "warning", category: "coco", title: "Caso CoCo requiere revision", body: "Filtracion activa en depto 1204 escalada por CoCo.", link: "/admin/mantenimiento", read: false, created_at: iso(-0.2) },
    { id: "b392cf17-0018-4000-8000-000000000002", community_id: communityId, user_id: admin.id, type: "info", category: "poll", title: "Votacion activa", body: "Prioridad de mejora 2026 ya tiene votos registrados.", link: "/admin/votaciones", read: false, created_at: iso(-0.5) },
    { id: "b392cf17-0018-4000-8000-000000000003", community_id: communityId, user_id: resident.id, type: "success", category: "reservation", title: "Reserva confirmada", body: "Tu reserva de quincho panoramico fue confirmada.", link: "/amenities", read: false, created_at: iso(-0.4) },
    { id: "b392cf17-0018-4000-8000-000000000004", community_id: communityId, user_id: concierge.id, type: "alert", category: "package", title: "Paquete pendiente", body: "Caja Mercado Libre pendiente para depto 1204.", link: "/concierge/packages", read: false, created_at: iso(-0.04) },
  ], { onConflict: "id" });

  console.log("\nShowcase listo para venta:");
  console.log(`- Admin:      ${adminEmail}`);
  console.log("- Residente:  residente.showcase@conviveconnect.cl");
  console.log("- Conserje:   conserje.showcase@conviveconnect.cl");
  console.log(`- Comunidad:  Edificio Convive Showcase (${communityId})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
