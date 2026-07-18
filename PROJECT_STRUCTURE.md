# Mapa de carpetas — ComunidadConnect (Convive Connect)

Guía de orientación para un desarrollador nuevo en el repo. Describe qué hay
en cada carpeta, verificado contra el estado real del repo (no solo lo que
dice `CLAUDE.md`, que en algunos puntos había quedado desactualizado — ver
notas de "⚠️ desalineado" abajo). Léelo junto con [CLAUDE.md](CLAUDE.md)
(reglas de arquitectura y convenciones) y
[SECURITY_AUDIT_STATUS.md](SECURITY_AUDIT_STATUS.md) (estado de la auditoría
de seguridad) si vas a tocar código.

---

## 1. Raíz del proyecto

```
comunidad-connect/
├── src/                  ← todo el código de la app (ver sección 2)
├── supabase/             ← migraciones SQL y edge functions (ver sección 3)
├── scripts/              ← scripts de QA, mantenimiento y backfill (ver sección 4)
├── tests/                ← tests unitarios (Vitest) y e2e (Playwright)
├── public/                ← estáticos servidos tal cual (íconos, imágenes)
├── android/, ios/        ← proyectos nativos de Capacitor (mobile)
├── docs/comercial/       ← documentación COMERCIAL (contratos, precios), no técnica
├── Convive Connect/      ← export de un canvas de diseño (mockups .jsx, capturas) — material de referencia visual, no se importa en la app
├── .tmp_design/          ← otro export de design system (componentes de referencia), tampoco se usa en runtime
├── .github/workflows/    ← CI (lint, typecheck, tests, build)
├── schema.sql            ← esquema "maestro" para una instalación desde cero (ver nota abajo)
├── schema_coco_memories.sql, schema_rpc_match_memories.sql ← igual que schema.sql pero para la memoria IA de CoCo
└── *.md                  ← documentación (ver lista al final)
```

**Nota sobre `schema.sql`:** es un intento de "esquema completo desde cero",
pero **no es lo que corre en producción** — producción se construye con las
68 migraciones incrementales en `supabase/migrations/`. `schema.sql` se
usó históricamente para debugging/referencia y se dejó desalinearse de las
migraciones reales varias veces (ver `SECURITY_AUDIT_STATUS.md`, sección 1,
para un ejemplo concreto de esto). Si necesitas levantar una base nueva,
**usa las migraciones**, no `schema.sql`, y si tocas `schema.sql` verifica
que coincida con el estado real antes de confiar en él.

**⚠️ Clutter en la raíz — no es código de la app, se puede ignorar o
limpiar:** `check_matriz*.js`, `check_polls*.js`, `check_votes_*.js`,
`fetch-test.js`, `generate_shopify_images.py`, `generate_sql.mjs`,
`get-units-ids.mjs`, `seed_amenities.mjs`, `test-iot-webhook.mjs`,
`update_mocks.js`, `units.json`, `units_data.json`, `expenses.json`,
`git_status.txt` — son scripts sueltos de debugging de sesiones anteriores,
no forman parte del build ni se importan desde `src/`. `coco-gateway.js` y
`session-store.js` son un gateway IoT legacy que requiere el paquete
`express`, que **no está en `package.json`** — no corre tal cual, tratarlo
como código muerto salvo que alguien confirme que se usa en algún deploy
externo.

---

## 2. `src/` — la aplicación

### 2.1 `src/app/` — rutas (Next.js App Router)

```
src/app/
├── (auth)/              ← páginas públicas de autenticación
│   ├── login/
│   ├── signup/
│   └── admin-onboarding/    ← alta self-service de un admin + su condominio
├── (dashboard)/         ← TODAS las rutas protegidas (requieren sesión)
│   ├── home/                Dashboard principal
│   ├── admin/                Panel administrador (finanzas, unidades, consumo, mantenimiento, votaciones, usuarios, onboarding masivo, training)
│   ├── agent-center/          Agent Center — el "orquestador" de tareas IA para admin
│   ├── amenities/              Reservas de espacios comunes
│   ├── chat/                    CoCo AI Agent (chat conversacional)
│   ├── comunicaciones/           Anuncios/feed + muro social (reemplaza rutas viejas /feed y /social, ver nota)
│   ├── concierge/                  Panel conserje (visitas, encomiendas)
│   ├── convivencia/                 Mediación vecinal, banco de tiempo, compras colectivas
│   ├── directorio/                   Directorio de residentes/proveedores
│   ├── expenses/                      Gastos comunes (incluye /expenses/solidaridad, el fondo solidario)
│   ├── feed/                           Anuncios (⚠️ ver nota de solapamiento con comunicaciones)
│   ├── marketing/                       Marketing Reels — generación de contenido IA para redes + conexión Instagram
│   ├── marketplace/                      Compraventa vecinal
│   ├── payment-sandbox/                   Sandbox de pruebas de pago Haulmer
│   ├── profile/                            Perfil del usuario
│   ├── resident/                            Sub-rutas propias del residente (finances, cases, consumo, invitations)
│   ├── services/                             Directorio de proveedores de servicios + solicitudes
│   ├── showcase/                              Página de demo/showcase para prospectos
│   ├── social/                                 Muro social (⚠️ ver nota)
│   ├── staff/                                   staff/training — Aula Virtual IA compartida entre admin y conserje
│   ├── superadmin/                               Panel super-administrador global (multi-condominio)
│   ├── training/                                  Centro de Capacitación (catálogo de cursos, distinto de staff/training)
│   └── votaciones/                                 Votaciones comunitarias
├── api/                 ← Route Handlers (backend). Ver sección 2.2
├── onboarding/, privacy/, recorrido/, soporte/, support/, terms/  ← páginas públicas sueltas fuera de (auth)/(dashboard)
├── mock-checkout/, test-card/  ← carpetas vacías (sin page.tsx) — no son rutas activas
├── page.tsx             ← landing pública (/)
└── layout.tsx           ← layout raíz (monta el widget CoCo global en todo el dashboard)
```

**⚠️ Desalineado / a confirmar con el equipo:** existen `feed/` y `social/`
como carpetas propias Y `comunicaciones/` que el prompt de CoCo describe
como "Chat, avisos oficiales y muro social" (o sea, las reemplaza
conceptualmente). También hay `soporte/` y `support/` (ES/EN duplicados) y
`training/` (catálogo general) vs `staff/training` (aula virtual IA) que
suenan a lo mismo pero no lo son. No asumas cuál es la vigente sin revisar
`Sidebar.tsx` (`src/components/cc/Sidebar.tsx`) para ver qué está
efectivamente linkeado en la navegación — algunas de estas rutas pueden ser
residuos de una migración de nombres.

### 2.2 `src/app/api/` — backend (Route Handlers)

Carpetas principales, agrupadas por dominio:

| Carpeta | Qué hace |
|---|---|
| `coco/` | Agente conversacional principal (Claude + tools), incluye `coco/whatsapp/` (webhook Twilio) y `coco/cases/` |
| `agent-center/` | Motor del Agent Center: inferencia de acciones, playbooks, `scheduler/` (cron diario) |
| `admin-onboarding/` | Alta self-service de un condominio nuevo |
| `onboarding/` | Carga masiva de residentes (batches, extracción de documentos) |
| `marketing/` | Reels IA + integración Instagram (`reels/cron` es el cron de publicación diaria) |
| `payments/` | Generación de links de pago Haulmer |
| `webhooks/` | Webhooks entrantes: `haulmer/` (pagos), `iot/` (sensores) |
| `email/` | Envío de correos transaccionales (bienvenida, confirmación de reserva, alerta de gasto) vía Resend |
| `training/` | Generación de cursos IA (`parse`, `generate-slides`) y progreso |
| `solidarity/` | Fondo solidario vecinal (aportes, tareas, verificación con PIN) |
| `superadmin/` | Gestión global de comunidades (solo `SUPERADMIN_EMAILS`) |
| `whatsapp/`, `whatsapp-notify/` | Estado de configuración de WhatsApp y notificaciones salientes |
| `search/` | Búsqueda híbrida (lexical + semántica vía Voyage embeddings) |
| `ai/health/`, `health/` | Endpoints de diagnóstico/monitoreo |

### 2.3 `src/components/`

| Carpeta | Contenido |
|---|---|
| `CoCo/` | El widget flotante de CoCo (chat overlay visible en todo el dashboard) |
| `cc/` | Design system principal: `Sidebar.tsx`, layout shell, tipografía (`Eyebrow.tsx`), estilos inline propios de la marca |
| `ui/` | Design system secundario (18 componentes, patrón cva+Tailwind) — **⚠️ hay dos design systems paralelos conviviendo** (`cc` vs `ui`), no es un error tuyo si ves componentes que se parecen pero no son el mismo |
| `admin/` | Componentes específicos del panel administrador |
| `resident/`, `services/`, `marketplace/`, `polls/`, `training/`, `charts/`, `commercial/` | Componentes específicos de cada módulo/rol |
| `education/` | Carpeta vacía (0 archivos) — código muerto o pendiente |

### 2.4 `src/lib/` — lógica de negocio y servicios

**Los dos archivos centrales que dicta `CLAUDE.md`:**
- `lib/api.ts` (2000+ líneas) — capa de Services (`XxxService.metodo()`)
- `lib/types.ts` — todos los tipos TypeScript centralizados

**⚠️ Importante para entender el código:** `CLAUDE.md` dice "las páginas NO
hacen llamadas directas a Supabase, todo pasa por `lib/api.ts`" — en la
práctica **eso ya no es cierto en todo el código**. Existe una segunda capa
paralela, `lib/services/supabaseServices.ts` (1000+ líneas), con servicios
que se solapan casi nombre a nombre con los de `api.ts`
(`AmenitiesService`/`AmenityService`, `PollsService`/`PollService`, etc.), y
además 57 rutas en `app/api/` acceden a Supabase directamente con
`supabaseAdmin`. Antes de agregar una función nueva, busca si ya existe en
ambas capas para no triplicarla otra vez. Este es un ítem P2 pendiente en
`SECURITY_AUDIT_STATUS.md`.

Subcarpetas:

| Carpeta | Qué hace |
|---|---|
| `coco/` | Cerebro del agente CoCo: `agent.ts` (loop principal con Claude), `tools.ts` (tool definitions + `MUTATING_TOOLS`), `system-prompt.ts`, `caseService.ts` (clasificación automática de casos), `navigation.ts` (whitelist de navegación segura, nuevo) |
| `agent-center/` | Motor del Agent Center: `planner`, `domain`, `proactiveEngine` (triggers proactivos), `taskPlaybooks`, `taskEngine`, `actionValidation` |
| `ai/` | Orquestador de IA multi-proveedor (`orchestrator.ts`), telemetría, presupuesto de gasto en IA (`budget.ts`) |
| `marketing/` | `reelWorkflow.ts` — ciclo de vida completo de un reel (generar → aprobar → publicar) |
| `security/` | `rateLimit.ts` (rate limiting en memoria y distribuido vía Postgres RPC) |
| `payments/` | Cálculo de comisiones Haulmer |
| `onboarding/` | Extracción de datos de documentos (`documentExtractor.ts`) para carga masiva |
| `operations/` | Auditoría de operaciones (`audit.ts` — registra eventos administrativos) |
| `observability/` | `logger.ts` — logging estructurado + `apiErrorResponse` (helper nuevo para no filtrar `error.message` al cliente) |
| `server/` | Helpers de identidad/sesión del lado servidor (`agentIdentity.ts`) |
| `supabase/` | Clientes Supabase: `supabaseAdmin.ts` (service role, solo servidor), `client.ts` |
| `education/` | 1 archivo, relacionado al módulo de capacitación |

**`src/ai/` (fuera de `lib/`, ojo con la carpeta hermana):** contiene
`memoryService.js` (memoria vectorial de CoCo, usado por
`lib/ai/orchestrator.ts`, sí está vivo) y `cocoParser.js`/`cocoPrompts.js`
(marcados como código muerto en la auditoría — confirmar antes de tocar o
borrar).

Archivos sueltos directamente en `src/lib/` (no en subcarpeta): `api.ts`,
`types.ts`, `authContext.tsx` (contexto global de auth), `supabase.ts`
(cliente Supabase básico — **hay un segundo cliente casi idéntico en
`lib/supabase/client.ts`**, otro caso de duplicación), `config.ts`,
`email.ts` (integración Resend), `agentBrain.ts` (agente de supermercado,
distinto de CoCo), `search.ts`, `notificationContext.tsx`,
`platformAccess.ts`, `productCapabilities.ts`, `whatsapp.ts`,
`waterPeriod.ts`, `utils.ts`.

### 2.5 `src/hooks/`

Solo `useProductCapabilities.ts` por ahora.

---

## 3. `supabase/`

```
supabase/
├── migrations/          ← 68 archivos .sql, la fuente de verdad del schema de producción. Nombrados por fecha/número secuencial.
├── legacy_migrations/    ← 2 archivos, migraciones viejas ya no aplicables
├── functions/            ← Edge Functions: coco/, commercial-email/
└── .temp/                ← temporal de la CLI de Supabase, no tocar
```

Para entender el estado real de una tabla o política RLS, **lee las
migraciones en orden cronológico**, no `schema.sql` (ver nota en sección 1).
Las dos más recientes (`20260717120000_*` y `20260717140000_*`) son la
remediación de seguridad de julio 2026 — ver `SECURITY_AUDIT_STATUS.md`.

---

## 4. `scripts/`

29 scripts npm-invocables (`package.json` tiene los alias `qa:*`,
`test:*`, `search:*`). Dos categorías:

- **QA/diagnóstico** (`*-qa.js`): chequeos de integridad que corren contra
  una base real (multitenant, agent-center, marketplace-chat, training,
  etc.) — varios apuntan a producción por defecto, ver
  `SECURITY_AUDIT_STATUS.md` sección 4 antes de correrlos a la ligera.
- **Mantenimiento puntual**: `backfill-marketplace-embeddings.js`,
  `backfill-profiles-embeddings.js` (recalculan embeddings faltantes),
  `check-excel.js`.

`envios-completados.json` sigue existiendo **en disco** dentro de esta
carpeta (es el log de una campaña de outreach por email) pero ya no está
trackeado en git — no lo vuelvas a agregar.

---

## 5. `tests/`

- `tests/unit/` — Vitest. 9 archivos, 57 tests (fees Haulmer, firma Twilio,
  clasificación de casos CoCo, planner/validación del Agent Center). Corre
  en CI como gate desde julio 2026.
- `tests/e2e/` — Playwright. Un solo spec (`security-boundaries.spec.ts`),
  no corre en CI todavía, apunta a `localhost:3000` por defecto (antes
  apuntaba a producción, corregido en la remediación de seguridad).

---

## 6. Mobile — `android/`, `ios/`

Proyectos nativos generados por Capacitor 8. `capacitor.config.ts` (raíz)
apunta al directorio `out/` del build estático de Next.js. Estructura lista
pero **no desplegada** a stores según `CLAUDE.md`. `android/` tenía varios
logs de build (`error*.txt`, `output*.txt`) commiteados por error — ya
removidos del tracking.

---

## 7. Documentación de la raíz

| Archivo | Para qué |
|---|---|
| `CLAUDE.md` | Reglas de arquitectura, convenciones de naming, stack técnico — léelo primero |
| `README.md` | Genérico de Next.js (create-next-app), poco útil |
| `AGENTS.md` | Documentación de los agentes IA (desactualizada según la auditoría — verifica antes de confiar) |
| `DEPLOYMENT.md` | Notas de despliegue en Vercel |
| `SUPABASE_SETUP.md` | Setup inicial de Supabase |
| `MOBILE_NATIVE_GUIDE.md` | Guía de Capacitor/mobile |
| `IMPLEMENTATION_PLAN.md` | Plan de implementación viejo — producción ya está desplegada, tratar como histórico |
| `SECURITY_AUDIT_STATUS.md` | **Léelo antes de tocar RLS o endpoints sensibles** — estado de la remediación de la auditoría de julio 2026 |
| `PROJECT_STRUCTURE.md` | Este documento |

---

## 8. Regla práctica para no perderte

Cuando busques dónde vive algo, en este orden:
1. `src/app/(dashboard)/<módulo>/page.tsx` — la UI de esa pantalla.
2. `src/lib/api.ts` **y** `src/lib/services/supabaseServices.ts` — busca en
   ambos, la función que necesitas puede estar en cualquiera de los dos.
3. `src/app/api/<módulo>/route.ts` — si la página llama a un endpoint
   propio en vez de a un Service directamente.
4. `supabase/migrations/` (grep por nombre de tabla) — para entender el
   schema y las políticas RLS reales de esa tabla.
