# Estado de la auditoría de seguridad — Julio 2026

Este documento resume el trabajo hecho a partir de una auditoría externa
integral del repositorio (10 auditores en paralelo, ~130 hallazgos), qué se
corrigió, qué quedó pendiente, y qué requiere una acción tuya que Claude no
pudo hacer. Léelo antes de tocar nada — te ahorra redescubrir lo mismo.

**Auditoría original:** `C:\Users\pedro.moreno\Documents\kimi\workspace\AUDITORIA_comunidad_connect.pdf`
(fecha 2026-07-16). Es la referencia completa de los ~130 hallazgos con
severidad, archivo y línea. Este documento solo resume qué se hizo con ellos.

**Rango de commits de la remediación:** `9b4bf50` → `21c2e6d` en `master`
(11 commits, todos con `tsc --noEmit` + `eslint` + `test:unit` en verde antes
de cada uno). `git log 9b4bf50..21c2e6d --oneline` los lista todos con detalle
en el cuerpo de cada commit.

---

## 1. Ya corregido y verificado en vivo (P0 crítico)

Estos eran los hallazgos CRÍTICOS de la auditoría — vulnerabilidades de
control de acceso confirmadas como explotables en producción, no solo
teóricas. Ambas migraciones que los corrigen **ya fueron ejecutadas** en
Supabase y verificadas en vivo:

- `supabase/migrations/20260717120000_fix_confirmed_privilege_escalation.sql`
- `supabase/migrations/20260717140000_p0_remaining_rls_hardening.sql`

Verificación en vivo confirmada:
- Un residente real ya **no puede** auto-escalar su `role` a `admin` vía
  PATCH directo a `profiles` (columna revocada + trigger defensivo).
- `service_providers` y `agent_memories` ya no son legibles con la anon key
  sin sesión.
- Los códigos de invitación demo (`ADMIN123`/`RESIDENTE123`/`CONSERJE123`)
  fueron rotados a valores aleatorios.

### Qué se corrigió exactamente

**Base de datos / RLS** (la capa más grave — control de acceso multi-tenant
vivía roto en varias tablas):
- `profiles`: política `profiles_update_own` sin `WITH CHECK` permitía a
  cualquier residente cambiar su propio `role`/`community_id`. Corregido con
  `REVOKE UPDATE(role, community_id, unit_id) FROM authenticated` + trigger
  `BEFORE UPDATE` defensivo.
- `agent_memories`, `service_providers`, `profiles_public_read`,
  `notifications_insert`, `marketplace_items`, `polls`/`poll_options`/
  `poll_votes`, mantenimiento (`building_assets`/`maintenance_tasks`/
  `maintenance_logs`), `social_posts`/`social_comments`/`chat_messages`:
  todas tenían una política `USING (true)` (a veces sin `TO`, aplicando a
  PUBLIC/anon) que una migración posterior nunca eliminó — Postgres las
  suma con OR lógico, así que la política restrictiva nueva no alcanzaba a
  bloquear nada. Se eliminaron las permisivas viejas y se re-scopearon por
  tenant.
- `poll_votes` insert no verificaba `user_id`/`community_id` — cualquiera
  podía insertar votos a nombre de otro residente o en otro condominio
  (relleno de urnas). Corregido.
- `coco_cases` insert no verificaba `community_id` — se podía inyectar un
  caso falso en el dashboard de otro condominio. Corregido.
- `agent_runs`/`agent_tool_calls`/`agent_action_approvals` (el log de
  auditoría del Agent Center) eran legibles por **cualquier residente** del
  tenant, no solo admin/conserje. Corregido.
- `search_profiles_lexical`/`search_profiles_semantic`: aceptaban un
  `community_filter_id` elegido por el cliente que podía usarse para leer
  perfiles (nombre/email/rol) de **otro** tenant. Se eliminó el parámetro;
  ahora siempre se deriva del perfil del que llama.
- `instagram_connections.encrypted_access_token` y
  `solidarity_tasks.pin_code`: `REVOKE` a nivel de columna para que
  PostgREST nunca los devuelva a una clave de cliente, sin importar la
  política de fila.
- `handle_new_user()`: le faltaba `SET search_path = public` (hardening
  estándar contra search-path hijacking en funciones `SECURITY DEFINER`).
- **Se casi reintroduce un bug de recursión infinita en RLS** al editar
  `schema.sql` (una política sobre `profiles` que subconsulta `profiles` a
  sí misma sin pasar por una función `SECURITY DEFINER` — el mismo bug que
  la migración `016_fix_rls_recursion.sql` corrigió en producción hace
  tiempo). Se detectó y corrigió antes de commitear, agregando
  `get_my_community_id()`/`get_my_role()` a `schema.sql` también. **Si vas
  a tocar políticas RLS sobre `profiles`, usa siempre esas dos funciones,
  nunca una subquery directa a `profiles` dentro de una policy `ON
  profiles`.**
- `schema.sql`, `schema_coco_memories.sql`, `schema_rpc_match_memories.sql`
  (los archivos "maestro" para una instalación desde cero) tenían las
  mismas versiones vulnerables que ya se habían corregido en producción vía
  migraciones incrementales. Se alinearon. También se agregó
  `ENABLE ROW LEVEL SECURITY` + políticas a `pricing_tiers`, `reviews`,
  `training_modules`/`training_lessons`, `user_training_progress`,
  `coco_cases`/`coco_case_events`, que en `schema.sql` no tenían RLS
  habilitado en absoluto.

**Bug de lógica real (no solo RLS)** — `src/app/api/solidarity/tasks/route.ts`:
la verificación de tareas del fondo solidario aceptaba el PIN real **o
literalmente el string `"1234"`** como comodín universal, sin importar el
PIN asignado a la tarea. Eliminado el bypass.

**Otros endpoints:**
- `ensure-resident-unit`: reasignaba silenciosamente una unidad ya reclamada
  por otro residente si el `department_number` (editable por el propio
  usuario) coincidía. Ahora rechaza con 409 si la unidad ya tiene dueño.
- `admin-onboarding/register`: el `planId` era 100% confiado del cliente
  (podías pedir el tier Enterprise gratis); ahora se valida contra
  `pricing_tiers` real. Además, **por decisión tuya**, se cambió
  `email_confirm: true` → `false`, así que ahora Supabase exige clickear el
  link de confirmación antes de poder loguear. **Verifica que el proyecto
  de Supabase tenga el envío de emails de confirmación bien configurado**
  (SMTP / plantilla de Auth) — si no, altas nuevas de admin podrían quedar
  bloqueadas sin poder confirmar. Pruébalo con una cuenta de prueba.

---

## 2. Higiene del repo — ya corregido

- `scripts/envios-completados.json` (1000 correos reales de una campaña de
  outreach), `TABLAS_INICIALES*.R`/`Matriz_Master.xlsx` (proyecto ajeno,
  CCCE), logs de build de Android, `get_schema.js` (script suelto con la
  anon key, no es secreto real pero no debía estar commiteado), y el
  gitlink huérfano `.tmp_openmaic` (submódulo sin `.gitmodules`, rompía
  clones frescos) — todos removidos del tracking de git (`git rm --cached`,
  siguen en disco localmente). `.gitignore` endurecido para que no vuelvan.
- **Siguen en el historial de git** hasta que se purgue con
  `git filter-repo` o BFG — ver sección 3.

---

## 3. Acción tuya pendiente — Claude no puede hacer esto

### Credenciales reales expuestas (requieren rotación externa)

1. **Contraseña root SSH real** (`Datawise2026#`) para el servidor
   `72.62.12.242` (datawiseconsultoria.com), hardcodeada en
   `download_scrapp.py` y `download_scrapp_zip.py` — **ya eliminados del
   árbol actual**, pero siguen en el historial de git. Acción:
   1. Cambia la contraseña root en el servidor (o mejor, migra a llaves SSH
      y desactiva login por password).
   2. Después de rotarla, purga el historial de git
      (`git filter-repo --path download_scrapp.py --path download_scrapp_zip.py --invert-paths`
      o BFG) y fuerza push — coordina con quien más tenga el repo clonado,
      porque reescribe el historial.
2. **API key real de OpenAI** en `.claude/launch.json` y
   `.claude/settings.local.json` — no está en git (`.claude/` está
   gitignored), pero vive en texto plano en disco. Rótala en la consola de
   OpenAI y actualiza esos archivos locales.

### Verificación de email en Supabase (por el cambio de la sección 1)

Confirma en el dashboard de Supabase (Authentication → Email) que el envío
de correos de confirmación funciona de verdad antes de que alguien intente
registrarse como admin nuevo — si no, quedará con una cuenta creada pero sin
poder loguear.

---

## 4. Lo que la auditoría marcó como P1/P2 y NO se tocó

La auditoría trae ~130 hallazgos; se atacó todo lo CRÍTICO/ALTO de
control de acceso más un puñado de arreglos P1 puntuales (ver commits). Lo
que sigue sin tocar, en orden de la propia auditoría (sección 6, "Plan de
acción priorizado"):

**P1 — próximas 2-4 semanas:**
- E2E y scripts QA de integración reorientados a un entorno de staging real
  (hoy `playwright.config.ts` ya no apunta a producción por defecto, pero
  no existe staging — sigue siendo local-only o requiere `E2E_BASE_URL`
  explícito).
- Wrapper de errores API aplicado solo a 3 rutas de email (`apiErrorResponse`
  en `src/lib/observability/logger.ts`) — quedan ~35 rutas más que devuelven
  `error.message` crudo al cliente.
- `training/parse` ya tiene límite de tamaño (10 MB) y rate limiting
  distribuido; falta validación de MIME real (hoy solo mira la extensión
  del nombre de archivo).
- Fondo solidario (`solidarity/fund` route): sigue aceptando `amount`
  arbitrario sin comprobación de pago real — el bug de lógica del PIN
  universal SÍ se corrigió, esto es un hallazgo aparte.
- Deriva de configuración Haulmer: el código lee `HAULMER_SECRET_KEY` pero
  `.env.example`/`.env.local` puede tener `HAULMER_API_KEY` huérfana — no
  verificado/alineado.
- Rate limiting distribuido: se migraron pagos/IoT/avatar/onboarding
  batches; quedan ~15 rutas más en `enforceRateLimit` (memoria, no
  compartido entre instancias serverless).

**P2 — trimestre (deuda arquitectónica, alto esfuerzo/riesgo — recomiendo
planificarlos aparte, no en un sprint de seguridad):**
- Unificar la capa de acceso a datos: hoy conviven `lib/api.ts` (2024
  líneas), `lib/services/supabaseServices.ts` (1042 líneas) y 57 rutas API,
  con servicios duplicados casi nombre a nombre.
- Fragmentar los 6 archivos >1000 líneas (`lib/api.ts`,
  `reelWorkflow.ts`, `agent-center/route.ts`, `coco/tools.ts`,
  `solidaridad/page.tsx`, `supabaseServices.ts`).
- Dos design systems paralelos (`components/cc` inline-styles vs
  `components/ui` cva+Tailwind).
- `next/dynamic` para CoCo/recharts/modales pesados (hoy 0 usos en todo
  `src`, 81% de páginas son `'use client'`).
- Tests RLS automatizados (pgTAP o integración con dos tenants) que fallen
  si una tabla pierde `ENABLE ROW LEVEL SECURITY` o se abre cross-tenant —
  esto habría atrapado varios de los bugs de la sección 1 automáticamente.

---

## 5. Dónde está todo

- Migraciones nuevas de esta remediación:
  `supabase/migrations/20260717120000_*.sql` y `20260717140000_*.sql`.
- Whitelist de navegación de CoCo (nuevo): `src/lib/coco/navigation.ts`.
- Helper de errores API (nuevo): `apiErrorResponse` en
  `src/lib/observability/logger.ts`.
- `git log 9b4bf50..21c2e6d --stat` da el diff completo de archivos
  tocados si necesitas el detalle línea por línea de algo específico.
