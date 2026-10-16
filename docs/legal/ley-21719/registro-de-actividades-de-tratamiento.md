# Registro de actividades de tratamiento — ConviveConnect (BORRADOR)

> Borrador para revisión de abogado. Construido desde el código (`schema.sql`, `supabase/migrations/`, `src/app/api/`, `src/lib/`) al commit `0ff85e6`. Los plazos de conservación son **propuestas** que requieren validación legal, tributaria y laboral.

**Responsable (R):** comunidad / administración que contrata el servicio, salvo donde se indique "ConviveConnect = R".
**Encargado (E):** ConviveConnect (DataWise SPA u operador que se designe), con los subencargados de la sección 3.

Bases de licitud (Ley 19.628 reformada): **consentimiento** (art. 12; sensibles art. 16, expreso), **obligación legal** (art. 13 b), **contrato** (art. 13 c), **interés legítimo** (art. 13 d), **defensa de derechos** (art. 13 e). Niños, niñas y adolescentes: art. 16 quáter.

---

## 1. Inventario de datos personales encontrado en el código

### 1.1 Tablas con datos personales (selección relevante)

| Ámbito | Tablas | Campos personales / sensibles |
|---|---|---|
| Identidad y cuenta | `auth.users`, `profiles` | email, `full_name`/`name`, `role`, `avatar_url`, `department_number`, `unit_id`, `whatsapp_enabled`, `whatsapp_last_inbound_at`, `embedding_voyage` (vector semántico del perfil), `search_vector`; **teléfono** en producción como `phone_number` (no está en migraciones; ver deriva en `schema.sql`) |
| Unidades y derechos | `units`, `unit_rights_revisions`, `assembly_eligibility_*` | relación persona-unidad (`owner_id`, `resident_profile_id`), prorrateo (`share_permille`) |
| Onboarding masivo | `onboarding_import_batches/documents/rows`, bucket `onboarding-documents` | nombre, email, **teléfono**, unidad, `raw_data` (JSONB con lo que traiga la planilla del administrador) |
| Gastos comunes y pagos | `unit_charges`, `unit_payments`, `payment_agreements`, `payment_agreement_installments`, `transfer_reports`, `bank_transactions`, `journal_*`, `expenses`, `community_expenses`, `billing_runs`, `tax_documents` (`receiver` JSONB) | deudas, pagos, convenios de pago, glosas bancarias, datos del receptor de DTE → **datos de obligaciones económicas** (notificación reforzada de brechas, art. 14 sexies) |
| Trabajadores del condominio | `community_employees`, `payroll_runs`, `payroll_lines` | **RUT**, nombres y apellidos, sexo, nacionalidad extranjera, AFP, **sistema de salud / Isapre / plan UF**, cargas familiares, remuneraciones |
| Estacionamientos | `parking_drivers`, `parking_bookings`, `parking_access_events`, `parking_charges`, `parking_owner_payout_settings`, `parking_payouts` | nombre, **teléfono**, **patente** (`plate`), descripción del vehículo, **RUT del titular de cuenta**, **número de cuenta bancaria** (en texto plano), `bank_snapshot` |
| Accesos y visitas | `visitors`, `visitor_logs`, `qr_invitations`, `intercom_calls`, `packages` | nombre de visita, **RUT/DNI de invitado** (`guest_dni`), horarios de entrada/salida, propósito, encomiendas por unidad |
| Asambleas (Ley 21.442) | `assemblies`, `assembly_attendance`, `assembly_proxies`, `assembly_votes`, `assembly_minutes` | asistencia, verificación de identidad, poderes, **votos nominativos**, actas, `video_url` (enlace a sesión/grabación: **imagen y voz** de asistentes si se graba fuera de la plataforma) |
| Votaciones y reservas | `polls`, `poll_votes`, `bookings`, `amenities` | voto por usuario, uso de espacios comunes |
| CoCo e IA | `agent_memories` (contenido + embedding), `coco_user_memory` (`facts`), `coco_cases`, `coco_case_events`, `agent_runs` (`user_message`), `agent_tasks`, `agent_tool_calls`, `agent_action_approvals`, `ai_usage_events` | conversaciones libres (pueden contener **cualquier dato, incluso sensible**), memorias persistentes, clasificación de casos/urgencia, perfilado implícito |
| Convivencia | `neighbor_mediations`, `community_participation_requests`, `social_posts`, `social_comments`, `announcements` | conflictos vecinales (observación, sentimiento, necesidad), unidad objetivo, contenido publicado, imágenes |
| Fondo solidario | `solidarity_applications`, `solidarity_contributions`, `solidarity_ledger` | categoría `medical`, `unemployment`, `pensioner`, `emergency` y descripción libre → **datos sensibles (salud, situación socioeconómica)**; consentimiento en `sensitive_consent_*` |
| Marketplace y servicios | `marketplace_items` (+embeddings), `marketplace_conversations/messages`, `service_requests`, `service_providers`, `reviews`, `time_bank_offers` | mensajería entre vecinos, fotos, datos de contacto de proveedores |
| Mantención e IoT | `maintenance_tasks` (`completion_photo_path`), `maintenance_quotes`, eventos IoT (webhook `/api/webhooks/iot`: `sensor_id`, `unit_id`, `location_detail`, `severity`) | eventos asociados a una unidad (indirectamente a sus residentes) |
| Supermercado | `supermarket_purchase_history`, `supermarket_saved_lists`, `supermarket_group_orders*`, `supermarket_cart_plans` | **hábitos de consumo** del hogar |
| Comercial y marketing | `commercial_leads` (nombre, email, mensaje, `user_agent`), `marketing_reels*`, `instagram_connections` | prospectos B2B, contenido de marketing |
| Privacidad | `privacy_consent_events`, `data_subject_requests` | evidencia de consentimiento, solicitudes de derechos |
| Seguridad y auditoría | `operation_events`, `platform_operation_events` (`actor_email`), `api_rate_limits`, `agent_activity_log`, `community_api_keys`, `oversight_links` | logs de actor, IP/llaves con hash |
| Comunidad | `communities` | dirección y **geolocalización** del condominio (`address_latitude/longitude`, Mapbox/Nominatim) |

Buckets de Storage: `avatars`, `social-images`, `marketplace`, `onboarding-documents`, `marketing-reels`, `marketing-reels-audio`.

### 1.2 Hallazgos sobre categorías especiales

- **RUT:** `community_employees.rut`, `parking_owner_payout_settings.holder_rut`, `qr_invitations.guest_dni`; posiblemente en `raw_data` de onboarding y `tax_documents.receiver`.
- **Teléfono:** `profiles.phone_number` (prod), `parking_drivers.phone`, `onboarding_import_rows.phone`, `service_providers.contact_phone`; WhatsApp vía Twilio.
- **Patentes:** `parking_drivers.plate`.
- **Salud:** fondo solidario (`category = 'medical'` + descripción libre); previsión de salud de trabajadores (`health_system`, `isapre_*`). `building_assets.health_status` es estado de equipos, **no** dato personal.
- **Imágenes y voz de asambleas:** solo enlace `assemblies.video_url`; la grabación vive en la plataforma externa de videollamada (fuera del inventario; debe documentarse por la comunidad). La voz en CoCo es síntesis local del navegador (no se captura audio del usuario).
- **Menores:** no hay campos de fecha de nacimiento ni verificación de edad. Pueden aparecer menores como residentes con cuenta, visitas, en fotos sociales, conversaciones con CoCo o descripciones del fondo solidario; `community_employees.family_dependents` es solo un conteo.
- **Cámaras/CCTV, biometría, LPR:** no se encontraron en el código.
- **Decisiones automatizadas:** CoCo clasifica casos y urgencia, propone acciones; Agent Center ejecuta acciones con aprobación (`agent_action_approvals`); IoT autónomo opt-in por comunidad (`20260720160000_iot_autonomy_opt_in.sql`).

---

## 2. Registro por actividad

| # | Actividad | Rol CC | Finalidad | Base de licitud | Categorías de datos | Titulares | Destinatarios y encargados | Transferencia internacional | Conservación (propuesta) | Medidas |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | Gestión de cuentas y directorio de residentes | E | Dar acceso a la plataforma, vincular persona-unidad, roles | Contrato (art. 13 c) con el residente / interés legítimo de la comunidad (13 d) en administrar la copropiedad | Identificación, contacto, unidad, rol, avatar | Copropietarios, arrendatarios, residentes, conserjes, administradores | Administración, comité; Supabase, Vercel, Resend | Sí: EE. UU. (Supabase/Vercel/Resend; región exacta por confirmar) | Mientras la persona esté vinculada a la comunidad + 6 meses; luego supresión o anonimización | RLS por comunidad, control por rol, rate limit, auditoría |
| A2 | Onboarding masivo de residentes por documento | E | Cargar padrón desde planillas del administrador | Interés legítimo de la comunidad (13 d) / obligación de llevar registro de copropietarios (Ley 21.442, a validar) | Nombre, email, teléfono, unidad, `raw_data` | Residentes y copropietarios | Administración; Gemini/Anthropic para extracción | Sí: EE. UU. (IA) | Documentos y filas staging: 30 días después de sincronizar | Bucket privado, minimizar `raw_data`, borrar originales |
| A3 | Cobro de gastos comunes, pagos y convenios | E | Emitir cobros, registrar pagos, conciliar banco, morosidad | Obligación legal (13 b, Ley 21.442) y contrato (13 c) | Deudas, pagos, glosas bancarias, convenios | Copropietarios/residentes obligados al pago | Administración, comité de finanzas, fiscalizadores (`oversight_links`), Haulmer/Tuu, Transbank (si se activa), Resend | Parcial: Resend (EE. UU.); Haulmer en Chile (confirmar) | Plazo tributario/contable (propuesta 6 años desde el cierre del ejercicio, validar) | Funciones atómicas, cierre de periodos, RLS financiero admin-only |
| A4 | Facturación electrónica | E | Emitir DTE de la comunidad | Obligación legal (13 b) | Datos del receptor (`tax_documents.receiver`) | Receptores de DTE | SII vía Haulmer | No (confirmar) | Plazo tributario (validar) | Acceso admin |
| A5 | Remuneraciones de trabajadores del condominio | E | Calcular liquidaciones y pagos | Obligación legal laboral/previsional (13 b) y contrato de trabajo (13 c) | RUT, nombres, sexo, nacionalidad, AFP, salud/Isapre, cargas, remuneraciones | Trabajadores del condominio | Administración; instituciones previsionales (fuera de la plataforma) | No en principio (Supabase: sí) | Plazo laboral/previsional (validar; registros de remuneraciones suelen conservarse largo plazo) | Acceso solo admin; evaluar cifrado de RUT |
| A6 | Accesos, visitas, QR y citófono digital | E | Control de acceso y seguridad del condominio | Interés legítimo de la comunidad (13 d) | Nombre e RUT/DNI de visitas, horarios, unidad visitada, encomiendas | Visitas, residentes, conserjes | Conserjería, administración | Sí (Supabase/Vercel) | Propuesta: 90 días para logs de visitas y QR usados; encomiendas 90 días tras retiro | RLS, QR con vigencia, minimizar `guest_dni` (opcional) |
| A7 | Estacionamientos compartidos (marketplace) | E de la comunidad para reglas; **R propio** si CC cobra comisión y paga a dueños (a definir) | Reservas, acceso de conductores, cobros y pagos a dueños | Contrato (13 c) | Nombre, teléfono, **patente**, vehículo, RUT y cuenta bancaria del dueño | Residentes, conductores, dueños de estacionamiento | Comunidad, conserjería, Haulmer | Sí (Supabase) | Reservas 2 años; datos bancarios hasta baja + plazo tributario de pagos | **Cifrar cuenta bancaria y RUT**, acceso estricto |
| A8 | Asambleas y votaciones (Ley 21.442) | E | Citación, quórum, asistencia, poderes, votos, actas | Obligación legal (13 b, Ley 21.442) | Identidad, unidad, derechos, asistencia, poderes, votos nominativos, actas; imagen/voz si se graba | Copropietarios, apoderados, secretario, notario | Administración, comité, copropietarios (actas); Anthropic (redacción), **DeepSeek (respaldo, China)** | Sí: EE. UU. y potencialmente **China** | Actas y evidencia de quórum: plazo de la Ley 21.442/reglamento (validar); grabaciones: definir | Revisión humana de actas; no enviar votos nominativos a IA |
| A9 | Encuestas, reservas de espacios comunes | E | Consulta y uso de amenities | Contrato/interés legítimo (13 c/d) | Voto, reservas | Residentes | Administración | Sí (Supabase) | Reservas 1 año; votos de encuestas no vinculantes 1 año | RLS |
| A10 | Comunicaciones, avisos, notificaciones, WhatsApp | E | Avisos de la comunidad y alertas | Contrato/interés legítimo (13 c/d); **WhatsApp: consentimiento** (12) | Email, teléfono, contenido del mensaje | Residentes | Resend, Twilio (WhatsApp/Meta) | Sí: EE. UU. | Notificaciones 1 año; logs de entrega 90 días | WhatsApp opt-in por defecto en `false`, deduplicación |
| A11 | CoCo: asistente IA, casos y memoria | E (para la comunidad); **R** para mejora/seguridad del servicio | Responder consultas, crear casos, recordar contexto | Contrato (13 c) para la función; **consentimiento** (12) para memoria persistente y `ai_processing` | Mensajes libres, memorias, embeddings, clasificación de casos | Residentes, conserjes, administradores (y terceros mencionados) | Anthropic, OpenAI, Google Gemini, Voyage AI, DeepSeek (solo tareas "light" con credencial) | Sí: EE. UU. y potencialmente China | Propuesta: conversaciones y `agent_runs` 12 meses; memorias hasta retiro del consentimiento o baja; casos según su naturaleza | Confirmación humana de acciones, budgets de IA, oposición a perfilado (pendiente), EIPD |
| A12 | Agent Center / automatización operativa e IoT | E | Ejecutar tareas operativas, triggers proactivos, sensores | Interés legítimo (13 d); IoT autónomo opt-in de la comunidad | Eventos por unidad, tareas, aprobaciones | Residentes, personal | Anthropic | Sí: EE. UU. | Eventos IoT 12 meses; logs de agente 12 meses | Secreto por comunidad, aprobación humana |
| A13 | Fondo solidario | E | Gestionar ayudas entre vecinos | **Consentimiento expreso** (art. 16) | Salud, desempleo, pensión, emergencia, descripción, montos | Postulantes, aportantes | Comité/administración autorizada | Sí (Supabase) | Solicitud resuelta + 2 años, luego anonimización | Consentimiento versionado separado, acceso restringido, EIPD |
| A14 | Convivencia y mediación | E | Registrar y mediar conflictos | Interés legítimo (13 d) | Relatos, sentimientos, unidad objetivo | Denunciante y vecino aludido | Administración; IA para borrador de mensaje | Sí | 2 años desde cierre | Informar al aludido según corresponda; acceso restringido |
| A15 | Comunidad social, marketplace, banco de tiempo, servicios | E (contenido de la comunidad); R para moderación de plataforma | Interacción vecinal, compraventa, oficios | Contrato (13 c) / consentimiento para publicar | Contenido, fotos, mensajes, reseñas, embeddings | Residentes, proveedores | Voyage AI (embeddings) | Sí: EE. UU. | Mientras esté publicado + 6 meses; mensajes 12 meses tras última actividad | Moderación, reportes |
| A16 | Supermercado y compras grupales | **R** (servicio propio de CC al residente, a confirmar) | Comparar precios, armar carros, compras grupales | Consentimiento (`supermarket_history_enabled`) / contrato | Historial de compras, listas, pedidos | Residentes | Worker en VPS (`services/supermarket-cart-worker`), supermercados | Por confirmar (ubicación VPS) | Historial 12 meses o hasta desactivar | Opt-in, minimizar |
| A17 | Geolocalización de comunidades | R/E | Ubicar el condominio | Interés legítimo / contrato | Dirección y coordenadas del edificio (art. 16 sexies si se vincula a personas) | Comunidades (indirecto: residentes) | Mapbox, OpenStreetMap Nominatim | Sí: EE. UU. / UE | Mientras la comunidad sea cliente | Informar (art. 16 sexies) |
| A18 | Prospectos comerciales | **R** | Responder solicitudes de demo/cotización | Medidas precontractuales (13 c); suprimir si no prospera (art. 14 d) | Nombre, email, condominio, mensaje, user agent | Administradores prospectos | Resend | Sí: EE. UU. | 12 meses sin conversión → supresión | Acceso equipo comercial |
| A19 | Facturación del SaaS a comunidades/administradoras | **R** | Cobrar la suscripción | Contrato y obligación tributaria | Datos del administrador/representante | Representantes de clientes | Haulmer/Tuu | No (confirmar) | Plazo tributario | — |
| A20 | Seguridad, logs, auditoría, analítica | **R** | Proteger la plataforma, prevenir fraude, medir uso | Interés legítimo (13 d); analítica: **consentimiento** (cookies no esenciales) | IP, user agent, eventos, email del actor | Todos los usuarios | Vercel, Supabase, Google Analytics | Sí: EE. UU. | Logs de seguridad 12 meses; analítica según configuración de GA | Hash de llaves, rate limiting; banner de cookies (pendiente) |
| A21 | Marketing (reels, Instagram) | **R** | Promoción de ConviveConnect | Interés legítimo / consentimiento si aparecen personas | Contenido de marketing; voces sintéticas | Equipo; eventualmente personas que aparezcan | OpenAI, HeyGen, Creatomate, Higgsfield, Meta | Sí: EE. UU. | Según campaña | No usar datos de residentes |
| A22 | Atención de derechos y consentimientos | R (sus tratamientos) / E (apoya a la comunidad) | Gestionar solicitudes y evidencia | Obligación legal (13 b) | Email, tipo de solicitud, evidencia | Titulares | Comunidad responsable | Sí (Supabase) | Mientras dure la relación + plazo de prescripción de acciones (validar) | Tablas inmutables con RLS |

---

## 3. Encargados y subencargados (proveedores)

| Proveedor | Uso en el código | País/jurisdicción probable | Datos que recibe | Instrumento requerido (art. 27-28) |
|---|---|---|---|---|
| Supabase | Base de datos, auth, storage, edge functions | EE. UU. (región del proyecto por confirmar) | Todos | DPA + cláusulas contractuales |
| Vercel | Hosting, funciones, crons | EE. UU. | Tráfico y datos en tránsito, logs | DPA |
| Anthropic (Claude) | CoCo, Agent Center, asambleas | EE. UU. | Prompts con datos de residentes | DPA, no-entrenamiento, retención |
| OpenAI | Imágenes, TTS, otros | EE. UU. | Prompts, contenidos | DPA |
| Google (Gemini, Analytics) | Extracción de documentos, capacitación, analítica | EE. UU. | Documentos de onboarding, prompts; datos de navegación | DPA / términos de procesamiento |
| Voyage AI | Embeddings semánticos de perfiles y marketplace | EE. UU. | Texto de perfiles/publicaciones | DPA |
| **DeepSeek** | Respaldo "light" de CoCo y de redacción de asambleas | **China** | Prompts | Garantías adecuadas o eliminar — **riesgo alto** |
| Resend | Email transaccional | EE. UU. | Email, nombre, contenido | DPA |
| Twilio | WhatsApp | EE. UU. | Teléfono, mensajes | DPA |
| Haulmer / Tuu | Pagos y DTE | Chile (confirmar) | Datos de pago, receptor DTE | Contrato de encargo |
| Transbank | Pagos (si se activa) | Chile | Datos de pago | Contrato |
| Mapbox / OSM Nominatim | Geocodificación | EE. UU. / UE | Dirección del condominio | Términos; minimizar |
| HeyGen, Creatomate, Higgsfield, Meta/Instagram | Marketing | EE. UU. | Contenido de marketing | Solo si contiene datos personales |
| VPS del worker de supermercado | Automatización de carros | Por confirmar | Listas y pedidos | Contrato de encargo |

---

## 4. Medidas de seguridad transversales (existentes en el código)

- RLS multi-tenant y endurecimientos (`014_enforce_multitenant_rls.sql`, `20260717120000_fix_confirmed_privilege_escalation.sql`, `20260717140000_p0_remaining_rls_hardening.sql`, `048_profile_role_privacy_hardening.sql`).
- Rate limiting distribuido (`042_distributed_api_rate_limits.sql`).
- Evidencia de consentimiento inmutable y solicitudes de titulares (`20260720120000_privacy_compliance_foundation.sql`).
- Consentimiento sensible del fondo solidario (`20260720140000_solidarity_sensitive_consent.sql`).
- Llaves de API y enlaces de fiscalizador guardados como hash SHA-256 (`20261013010000_public_api_and_oversight.sql`).
- Workflows de CI con secret scan (`.github/workflows/secret-scan.yml`).

Pendientes: ver `brechas-del-producto.md`.
