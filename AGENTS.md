# AGENTS.md — ComunidadConnect

Archivo maestro del proyecto para agentes de IA (Antigravity, Codex, Cursor, etc.).
Lee este archivo completo antes de modificar cualquier cosa.

---

## Descripción del Proyecto

**ComunidadConnect** (CoCo) es una plataforma SaaS multi-tenant para gestión de condominios en Chile.
Combina gestión de residentes, pagos, amenidades, IoT, marketplace vecinal y un agente de IA conversacional.

- **URL producción:** https://conviveconnect.com
- **Repositorio:** `c:\Users\pedro.moreno\Documents\GitHub\comunidad-connect`
- **Deploy:** Vercel (automático desde main)

---

## Stack Técnico

| Capa | Tecnología | Versión |
|---|---|---|
| Framework | Next.js (App Router) | 16.1.6 |
| Runtime | React | 19.2.3 |
| Lenguaje | TypeScript (strict) | ^5 |
| Estilos | Tailwind CSS | v4 |
| Animaciones | Framer Motion | ^12 |
| Base de datos | Supabase (PostgreSQL) | ^2.95 |
| Auth | Supabase Auth + SSR | — |
| Storage | Supabase Storage | — |
| IA Agent | Anthropic Codex | @anthropic-ai/sdk ^0.89 |
| Email | Resend | ^6.9 |
| Iconos | Lucide React | ^0.563 |
| Gráficos | Recharts | ^3.7 |
| Mobile | Capacitor (Android + iOS) | ^8.1 |
| Markdown | react-markdown + remark-gfm | — |

---

## Variables de Entorno Requeridas

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# IA
ANTHROPIC_API_KEY=       # Motor principal del agente CoCo
GEMINI_API_KEY=          # Legado / fallback

# Emails
RESEND_API_KEY=          # Proveedor de emails transaccionales

# WhatsApp (pendiente configuración)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Pagos (pendiente credenciales Haulmer/Tuu)
HAULMER_ACCOUNT_ID=
HAULMER_SECRET_KEY=
HAULMER_ENVIRONMENT=production
PARKING_HAULMER_ENABLED=   # Opcional. 'true' habilita Haulmer para arriendos de estacionamiento (además la comunidad debe elegirlo). Sin esto, se cargan a gastos comunes

# Deploy
NEXT_PUBLIC_SITE_URL=    # https://conviveconnect.com
```

---

## Arquitectura y Reglas Fundamentales

### 1. Estructura de directorios

```
src/
├── app/
│   ├── (auth)/          # Login, registro, recuperación de clave
│   ├── (dashboard)/     # Todas las rutas protegidas del dashboard
│   │   ├── home/        # Dashboard principal
│   │   ├── marketplace/ # Compraventa vecinal
│   │   ├── amenities/   # Reservas de instalaciones
│   │   ├── votaciones/  # Votaciones comunitarias
│   │   ├── expenses/    # Gastos comunes
│   │   ├── feed/        # Anuncios y comunicaciones
│   │   ├── chat/        # CoCo AI Agent
│   │   ├── social/      # Red social del condominio
│   │   ├── directorio/  # Directorio de residentes y proveedores
│   │   ├── services/    # Solicitud de servicios (plomería, etc.)
│   │   ├── admin/       # Panel administrador
│   │   ├── concierge/   # Panel conserje
│   │   ├── resident/    # Panel residente
│   │   └── superadmin/  # Panel super-administrador global
│   ├── api/             # Route Handlers de Next.js
│   └── page.tsx         # Landing page pública
├── lib/
│   ├── api.ts           # ← Barrel: re-exporta src/lib/api/*. No agregues código aquí
│   ├── api/             # ← Services de datos, un archivo por dominio (ver "Patrón de Services")
│   ├── types.ts         # ← TODOS los tipos TypeScript centralizados
│   ├── agentBrain.ts    # Lógica del agente de supermercado/recetas
│   ├── authContext.tsx  # Contexto global de autenticación
│   ├── supabase.ts      # Cliente Supabase (cliente)
│   └── config.ts        # Configuración global del proyecto
├── components/          # Componentes reutilizables
└── hooks/               # Custom React hooks
```

### 2. Reglas de arquitectura — NO ROMPER

- **Las páginas NO hacen llamadas directas a Supabase.** Toda lógica de datos va encapsulada en un `Service` dentro de `src/lib/api/<dominio>.ts` y se importa desde `@/lib/api`.
- **Todos los tipos van en `src/lib/types.ts`.** No definir tipos inline en componentes o páginas.
- **Las rutas de API van en `src/app/api/`** como Route Handlers de Next.js (`route.ts`).
- **`src/lib/supabase.ts`** exporta el cliente Supabase — importar siempre desde ahí, nunca instanciar Supabase directamente.
- **No usar `any` en TypeScript.** El modo strict está activo.

### 3. Patrón de Services (`src/lib/api/`)

`src/lib/api.ts` es solo un barrel (`export * from './api/<dominio>'`); el código vive en `src/lib/api/`. Los consumidores importan siempre desde `@/lib/api`, nunca desde `@/lib/api/<dominio>`.

| Archivo | Services |
|---|---|
| `finance.ts` | `FinanceCommitteeService`, `ExpensesService`, `AdminFinanceService`, `ResidentFinanceService` |
| `invoicing.ts` | `InvoicingService` |
| `users.ts` | `AdminUsersService`, `DirectoryService`, `ProfileService` |
| `community.ts` | `CommunityCollaborationService` |
| `dashboard.ts` | `HomeService`, `AdminDashboardService` |
| `announcements.ts` | `AnnouncementsService` |
| `maintenance.ts` | `MaintenanceService` |
| `coco-cases.ts` | `CocoCasesService` |
| `water.ts` | `WaterService` |
| `marketplace.ts` | `MarketplaceService`, `MarketplaceMessagingService` |
| `amenities.ts` | `AmenitiesService` |
| `polls.ts` | `PollsService` |
| `platform.ts` | `NavigationService`, `ProductCapabilitiesService`, `CommercialService`, `ApiKeysService`, `OversightLinksService` |
| `supermarket.ts` | `SupermarketCartService`, `SupermarketCatalogService`, `SupermarketGroupService` |
| `parking.ts` | `ParkingService` |
| `access.ts` | `IntercomService`, `AccessGateService` |
| `_shared.ts` | Helpers internos usados por más de un dominio (`readApi`, `financeWrite`, `isUuid`, `textValue`, `nullableText`, `mapCocoCase`, `DbRow`). No se re-exporta. |

Dónde agregar código nuevo:
- **Función de un dominio existente:** agrégala al Service de su archivo.
- **Dominio nuevo:** crea `src/lib/api/<dominio>.ts` y suma `export * from './api/<dominio>';` en `src/lib/api.ts`.
- **Helper:** privado en el archivo de su dominio; súbelo a `_shared.ts` solo si lo usa más de un dominio. `_shared.ts` no importa de otros módulos de `api/`.
- **Dependencias entre dominios:** importa el Service del archivo hermano (`import { ResidentFinanceService } from './finance'`). Evita ciclos; si dos dominios se necesitan mutuamente, mueve lo común a `_shared.ts`.
- `qa:architecture-boundaries` verifica que `api.ts` siga siendo solo barrel y que ningún archivo de `src/lib/api/` pase de 1.500 líneas.


Todos los servicios siguen este patrón:

```typescript
export const XxxService = {
  async getItems() { ... },
  async createItem(data: Partial<XxxType>) { ... },
  async updateItem(id: string, data: Partial<XxxType>) { ... },
};
```

Services existentes:
- `WaterService` — Lecturas de agua e IoT
- `MarketplaceService` — Artículos de compraventa
- `AmenitiesService` — Amenidades y reservas
- `PollsService` — Votaciones
- `ExpensesService` — Gastos comunes (pagos via Haulmer, pendiente de permisos)
- `AnnouncementsService` — Anuncios del feed

---

## Sistema de Roles

| Rol | Acceso | Notas |
|---|---|---|
| `superadmin` | Panel global `/superadmin` | Gestionado via `SUPERADMIN_EMAILS` en middleware |
| `admin` | Panel administrador `/admin` | Gestión del condominio |
| `resident` | Módulos de residente `/resident` | Residente/propietario |
| `concierge` | Panel conserje `/concierge` | Conserjería y accesos |

La validación de roles de superadmin ocurre en `src/proxy.ts`.
La validación de roles internos (admin/resident/concierge) ocurre en `src/lib/authContext.tsx`.

---

## Convenciones de Naming

| Elemento | Convención | Ejemplo |
|---|---|---|
| Services | `XxxService.metodoCamelCase()` | `PollsService.getActivePolls()` |
| Componentes | PascalCase | `BookingCard.tsx` |
| Hooks | `useXxx` | `useAuth()` |
| Tipos | PascalCase | `MarketplaceItem` |
| Archivos de página | `page.tsx` | `src/app/(dashboard)/home/page.tsx` |
| Route handlers | `route.ts` | `src/app/api/search/route.ts` |
| Tablas Supabase | snake_case | `marketplace_items`, `poll_options` |
| Columnas Supabase | snake_case | `unit_id`, `created_at` |

---

## Estado de los Módulos

| Módulo | Ruta | Estado | Datos |
|---|---|---|---|
| Home Dashboard | `/home` | ✅ Activo | Supabase real |
| Marketplace | `/marketplace` | ✅ Activo | Supabase real |
| Amenities | `/amenities` | ✅ Activo | Supabase real |
| Votaciones | `/votaciones` | ✅ Activo | Supabase real |
| Asambleas (Ley 21.442) | `/votaciones/asambleas` (residentes y comité), `/admin/asambleas` (admin) | ✅ Activo | Supabase real |
| Gastos comunes | `/expenses` | ✅ Activo \(pagos reales pendientes de permisos Haulmer\) | Supabase real |
| Feed/Anuncios | `/feed` | ✅ Activo | Supabase real |
| Chat (CoCo AI) | `/chat` | ✅ Activo | Agente local + Anthropic |
| Social | `/social` | ✅ Activo | Supabase real |
| Directorio | `/directorio` | ✅ Activo | Datos mixtos |
| Servicios | `/services` | ✅ Activo comercial | Supabase real |
| Admin Panel | `/admin` | ✅ Activo | Supabase real |
| Concierge Panel | `/concierge` | ✅ Activo | Supabase real |
| SuperAdmin | `/superadmin` | ✅ Activo | Supabase real |

---

## Integraciones Externas

| Servicio | Estado | Notas |
|---|---|---|
| Supabase (DB + Auth) | ✅ Funcionando | Proyecto: `sxtnhhblunvorbwbmmbg` |
| Anthropic Codex | ✅ Funcionando | Motor del agente CoCo |
| Resend (emails) | ✅ Clave disponible | Integración básica en `email.ts` |
| Haulmer (pagos) | ⏸️ Pendiente | Real pero sin permisos API aún |
| Twilio WhatsApp | ❌ No configurado | Placeholder en `.env.local` |
| Capacitor (mobile) | 🟡 Estructura lista | Android e iOS listos, no desplegados |

---

## Guardrails de Desarrollo

1. **Build:** El proyecto debe pasar `npm run build` sin errores antes de cualquier merge.
2. **TypeScript:** No introducir errores de compilación. Verificar con `npx tsc --noEmit`.
3. **Lint:** Usar `npm run lint` para verificar. El archivo `eslint.config.mjs` contiene las reglas.
4. **Supabase schema:** Los cambios de schema van en `schema.sql` en la raíz. Siempre documentar migraciones.
5. **No hardcodear IDs:** El `condo_id` de desarrollo local es `11111111-1111-1111-1111-111111111111` - usar la constante, no el string suelto.
6. **Vercel:** Los headers de seguridad están en `vercel.json`. No eliminarlos.
7. **Mobile:** `capacitor.config.ts` apunta al directorio `out` del build estático. No cambiar sin coordinar.
8. **Copy pública:** Producción es https://conviveconnect.com. No hardcodear "Pedro Moreno" ni otros nombres reales como valor o placeholder de formularios.

---

## Agente CoCo (AI)

El agente CoCo tiene dos capas:

1. **`agentBrain.ts`** — `SupermarketAgent`: agente de supermercado y recetas. Catálogo de productos de supermercados chilenos + 6 recetas. Usa keyword matching + integración con Marketplace real.

2. **`/api/coco/`** — Agente conversacional principal: usa Anthropic Codex con tools para gestión del condominio (IoT, gastos, solicitudes, etc.).

El gateway IoT está en `coco-gateway.js` (Node.js standalone) para recibir datos de sensores.

---

## Comandos Útiles

```bash
# Desarrollo
npm run dev              # Servidor de desarrollo (localhost:3000)

# Verificación antes de commit
npm run build            # Build de producción
npx tsc --noEmit         # Verificar TypeScript
npm run lint             # ESLint

# Supabase
# Panel: https://supabase.com/dashboard/project/sxtnhhblunvorbwbmmbg

# Deploy
# Automático desde GitHub → Vercel en rama main
```

---

## Agente Operador (Agent Center) — reglas de fondo

El Agent Center (`src/lib/agent-center/`) opera la cobranza, la mantención y el resumen semanal para el comité del condominio con herramientas (`agentTools.ts`), riesgos (`domain.ts`, `TOOL_RISK_LEVELS`) y playbooks (`taskPlaybooks.ts`). Se construyó por fases (PR #161 a #166, octubre 2026). Respeta estas reglas al tocarlo:

**Principios generales**
- **Humano en el circuito.** Toda escritura pasa por la confirmación del administrador según la política de autonomía (`riskRequiresConfirmation`). Lo que mueve plata, notifica a terceros o corre en lote es `write_high`.
- **Nunca contrata, paga ni gasta.** Elegir una cotización o proponer un convenio queda registrado; la decisión y el pago son humanos.
- **Solo notifica dentro de la app** (tabla `notifications`). No envía WhatsApp ni correo masivo por su cuenta.
- **Todo se audita** con `recordOperationEvent` (acciones `agent.*`).
- **Releer antes de escribir.** Se usa bloqueo optimista (`.eq('status', previo)`) y se vuelve a verificar contra la base para no usar datos obsoletos ni duplicar.

**Cobranza** (`src/lib/finance/`; cobranza unificada de `expenses` + `unit_charges`, con una escalera de mensajes)
- La cobranza construye comunidad. Los avisos van **sin montos**, sin lenguaje de deudor ni amenazas, y siempre ofrecen una salida: conversar o un convenio, con reserva.
- Convenios (`agreementProposal.ts`; `preview_payment_agreement` solo lee, `propose_payment_agreement` es `write_high` y solo para admin):
  - La cuota apunta a cerca de media cuota de gasto común: se sugieren 2 a 12 cuotas y el admin puede llegar a 36.
  - Si existe comité, el convenio queda `pending_committee`.
  - **La primera cuota vence al firmar** (Ley 21.442 art. 6; DS 7 art. 9: el copropietario es hábil desde que paga la primera cuota; así, quien firma y paga en el acto puede votar). "Firmar" es el momento en que el convenio queda `active`: al abrirlo si no hay comité, o el día en que el comité lo aprueba (no hay paso de aceptación del residente). Las siguientes vencen el día 5 de cada mes, partiendo por el primer día 5 que quede a **15 días o más** de la primera (`agreementDueDates` en `operationalFlows.ts`; firmado el 14/10 → 14/10, 5/11, 5/12…; firmado el 25/10 → 25/10, 5/12, 5/1…).
  - Las fechas las fija el servidor (`createAgreement` con la fecha de hoy en Chile); el `startDate` que manda el cliente se ignora. Con comité, las fechas de la creación son provisorias: `decideAgreementReview` las recalcula desde el día de la aprobación **antes** de pasar el convenio a `active` (si falla, no se aprueba).
  - Textos (`agreementCopy.ts`, puro): sin montos ni lenguaje de deudor, en positivo: "Al firmar pagas la primera cuota y quedas habilitado para votar en asambleas."
  - Los intereses (`applyLateInterest`) todavía no están implementados.

**Mantención**
- Plan preventivo (`src/lib/maintenance/preventivePlan.ts`, playbook `maintenance_preventive_plan`):
  - La frecuencia depende del tipo de activo y se agenda con un horizonte de 45 días.
  - Se mantiene como máximo una tarea abierta por activo.
  - La salud del activo solo empeora hasta `warning`, nunca llega a `critical` de forma automática ni mejora sola.
- Riesgo predictivo (`assetRisk.ts`, `get_maintenance_risk`):
  - Puntaje explicable de 0 a 100: edad frente a vida útil, fallas correctivas (bitácora sin `task_id`), aceleración, atraso y costo.
  - Riesgo alto desde 60 y medio desde 30. Un riesgo alto adelanta la preventiva a 7 días.
- Cotizaciones (`quotes.ts`, `quoteService.ts`, tabla `maintenance_quotes`):
  - Se piden a 2 o 3 proveedores **verificados**.
  - Para elegir hacen falta ≥2 cotizaciones recibidas y la más baja; si no se cumple, se exige una justificación escrita.
- **Cierre con foto obligatorio.**
  - Ruta: `POST /api/admin/maintenance/tasks/[id]/complete`; la foto queda en el bucket privado `maintenance-photos`.
  - El trigger `trg_maintenance_task_requires_photo` rechaza completar una tarea sin `completion_photo_path`, así que **no actualices `maintenance_tasks.status` a `completed` directo desde el cliente.**
  - Al completar, `trg_maintenance_task_completed_update_asset` actualiza `last_maintenance`.
  - `MaintenanceService.completeTask` en `src/lib/api/maintenance.ts` quedó obsoleto: usa la ruta.

**Resumen semanal para el comité** (`src/lib/committeeDigest/`, playbook `committee_weekly_digest`, tabla `committee_digests`)
- Cada lunes a las 8:00 de Chile (cron `/api/agent-center/committee-digest/cron`, agendado a las 11:00 y 12:00 UTC con guarda de hora local para cubrir el horario de verano; `CRON_SECRET`) o a pedido (botón en la tarjeta "Resumen semanal" del Agent Center, o el playbook), se arma **un solo resumen por comunidad y semana** (`UNIQUE (community_id, week_start)`, con `week_start` = lunes chileno).
- Datos **solo agregados** (`metrics.ts`, función pura): % de unidades al día y convenios vigentes, nuevos o por revisar; tareas abiertas, atrasadas y cerradas, preventivas que vienen, activos de riesgo alto (`scoreAssetRisks`) y cotizaciones pendientes; solicitudes y casos abiertos o resueltos y temas que se repiten; reservas, avisos, votaciones en curso y lo que viene en 7 días.
- Redacción con Anthropic (`aiWriter.ts`, tarea `agent-center.committee-digest` del `modelRouter`, con presupuesto de IA) y **fallback determinista** (`compose.ts`) si la IA falla, no está configurada o su texto no pasa las reglas. Siempre termina con 2 o 3 "Decisiones sugeridas para el comité".
- Privacidad (`privacy.ts`, `checkDigestPrivacy`): nunca unidades, personas (incluye los nombres de los perfiles de la comunidad), montos, datos de contacto, lenguaje de deudor ni amenazas. Se aplica a los títulos que entran, al texto de la IA y a la edición del admin (la API responde 422).
- Flujo: borrador → tarjeta en la cola de aprobaciones del Agent Center (`run_playbook` con `digestId`) y aviso en la app a los admins → el admin edita y aprueba (`POST /api/agent-center/committee-digest`, bloqueo optimista por `updated_at`) → lo ve el comité vigente (`finance_committee_members`) en `/expenses/committee-digest`, o los admins si no hay comité. Solo avisos en la app (`notifications`, categoría `committee_digest`).
- RLS: lectura para admins de la comunidad y, ya publicado, para integrantes vigentes del comité (`is_active_committee_member`); escrituras solo por el servidor. Auditoría `agent.committee_digest.*`.
- Los tipos del resumen viven en `src/lib/committeeDigest/types.ts` y el cliente en `src/lib/services/committeeDigestService.ts`, porque `src/lib/types.ts` ya no se puede publicar por la API de GitHub (antes también `src/lib/api.ts`, ahora dividido en `src/lib/api/`). No los muevas ahí.

**Asambleas en línea (Ley 21.442 y DS 7 de 2025)** (`src/lib/assemblies/`, ruta `/api/assemblies`, migración `20261014230000_assemblies_ley_21442.sql`)
- Tablas: `assemblies` (tipo `ordinary | extraordinary | reinforced`, modalidad `in_person | remote | hybrid`, estado `draft → cited → in_progress → closed → minutes_signed`, más `cancelled`), `assembly_agenda_items`, `assembly_attendance` (una fila por unidad), `assembly_proxies`, `assembly_votes` (uno por unidad y punto) y `assembly_minutes`.
- Reglas en `rules.ts`, módulo **puro** con sus cifras y artículos (verificadas en bcn.cl el 2026-10-14). El catálogo de materias del cuadro del art. 15 está en `catalog.ts`: el quórum de cada punto sale de su materia, no lo elige el admin.
  - Citación de 5 a 15 días (art. 16). La publicación se bloquea fuera de ese rango.
  - Constitución: ordinaria ≥33%, extraordinaria >50% y reforzada ≥66% de los derechos.
  - Acuerdo: ordinaria con más de la mitad de los derechos presentes, mayoría absoluta con más de la mitad del total y reforzada con ≥66% del total (art. 15).
  - Si piden la sesión copropietarios con ≥10% (art. 14), se cita dentro de 10 días corridos (DS 7, art. 15).
  - El acta se firma en 30 días (art. 15).
  - Hay notario en las reforzadas y en la modificación del reglamento 2) a).
  - Los gastos sobre 6 cuotas en 12 meses solo se aprueban en extraordinaria.
  - El administrador no representa a nadie (art. 15; DS 7 art. 22). Además lo bloquea un trigger.
  - El ocupante representa por ley y en las reforzadas necesita autorización expresa (DS 7 art. 12).
- Derechos: `units.share_permille` (guardado en ‰; la interfaz lo muestra en %, ver abajo). Si falta en alguna unidad se cuenta **1 unidad = 1 voto para todas**, con una advertencia al admin, igual que el prorrateo. Al iniciar la sesión se guarda la foto en `assemblies.rights_snapshot`.
- **Derechos de cada unidad (en %)** (`unitRights.ts` puro, `unitRightsService.ts`, ruta `/api/assemblies/unit-rights`, cliente `src/lib/services/unitRightsService.ts`, sección `UnitRightsEditor` en `/admin/asambleas#derechos`; migración `20261015020000_unit_rights_permille.sql`):
  - **Porcentaje para el usuario, ‰ en la base.** Toda la interfaz (editor de derechos, onboarding, `/admin/units`, panel y acta de asamblea, mensajes de validación) muestra y acepta **%** con hasta 4 decimales y coma decimal (los reglamentos chilenos suelen decir "0,532 %"); el total es **100 %**. Internamente se sigue guardando `units.share_permille` en ‰: **‰ = % × 10** (`percentToPermille` / `permilleToPercent`). No cambies la tabla ni la RPC. Los valores que se muestran con 4 decimales conservan el ‰ exacto al volver a guardar (el editor no pierde el 5.º decimal de %).
  - **Herramientas de CoCo para alícuotas** (`create_unit`, `set_unit_alicuota`, `distribute_alicuotas_equally`; definiciones y ejecución en `src/lib/coco/alicuotaTools.ts`, lectura pura en `src/lib/coco/alicuotaInput.ts`, tests en `tests/unit/coco-alicuota-tools.test.ts`): reciben y devuelven **%**. El parámetro es `alicuota_porcentaje` (coma decimal, hasta 4 decimales) y el system prompt pide hablar siempre en % (suma 100 % ± 0,05). Por compatibilidad aceptan el parámetro viejo en ‰ (`share_permille` en `create_unit`, `permille` en `set_unit_alicuota`) y lo convierten; si vienen ambos, manda el %. Validan con `validateUnitRights` y escriben **solo** por `unitRightsService` (`setUnitShare`, `distributeUnitRightsEqually`, `unitRightsLock`), nunca `share_permille` directo:
    - Si tras el cambio todas las unidades suman 100 % ± 0,05 (o al repartir en partes iguales), se guarda por `save_unit_rights` con método `manual`, quien guarda como "Nombre (vía CoCo)" y el evento con `channel: 'coco'`. Con el parámetro opcional `fuente` queda verificada; sin él, provisoria.
    - Si no cuadra todavía (carga unidad por unidad, o falta alguna), se escribe solo esa unidad desde el servicio: el trigger `units_share_permille_audit` la registra como `direct`, provisoria, y la herramienta devuelve la suma actual y lo que falta o sobra en %.
    - `create_unit` crea la unidad **sin** derechos y luego carga la alícuota por `setUnitShare` (el trigger de auditoría solo mira UPDATE). Si viene alícuota y hay una votación abierta, no crea la unidad.
    - Con una votación abierta las tres responden el mensaje de bloqueo (`bloqueado_por_votacion: true`) sin escribir.
  - **Números es-CL** (punto de miles, coma decimal) al formatear y al leer: `formatDecimalEsCl` / `parseDecimalEsCl`. "1.000" es mil (no uno); "1.000,25" es mil coma veinticinco. Sin coma, un punto que no agrupa de a tres (o tras un 0 inicial: "0.532") se tolera como decimal de archivos exportados. Usa estas funciones; no uses `toLocaleString` ni `Number()` sueltos para derechos.
  - Ley 21.442, arts. 3 y 15: los derechos para votar son la proporción que fija el **reglamento de copropiedad**. Suele coincidir con el prorrateo de gastos comunes, pero no es lo mismo: **no copies valores como definitivos**. El mismo `share_permille` también prorratea los gastos comunes con método `share`.
  - Carga: tabla editable en %, pegado o CSV (`unidad;derechos` en %, acepta coma decimal; en ‰ si el encabezado es `derechos_permil`/‰ o, sin encabezado claro, si suman ≈1000) y, solo si existe, "Usar prorrateo de gastos comunes como punto de partida" (`loadExpenseProrate`: último cobro emitido repartido por alícuota, sin caer a partes iguales y con todas las unidades; si no hay, el botón no aparece). Lo precargado del prorrateo entra **siempre como provisorio**.
  - Validación (cliente, servidor y `save_unit_rights` en la base): todas las unidades, cada una > 0 % y ≤ 100 %, y la suma en **100 % ± 0,05** (en la base, 1000‰ ± 0,5); si no cuadra no se guarda y se muestra la diferencia en %: "La suma debe ser 100 % (hoy: 98,7 %): falta 1,3 % (tolerancia ± 0,05 %)".
  - **Provisorio vs. verificado.** Fuente opcional ("Reglamento de copropiedad, art. X / escritura"). Sin fuente la carga queda provisoria (`verified = false`) y la UI la marca "no verificados" hasta que alguien registre la fuente (`action: 'verify'`, no cambia valores). Con derechos provisorios, la vista de la asamblea avisa al admin, la foto guarda `rights_snapshot.provisional` y el acta lo dice.
  - Auditoría: `unit_rights_revisions` (append-only: ni el servidor edita ni borra) guarda quién, cuándo, método, fuente y los valores anteriores y nuevos. Cualquier cambio de `share_permille` que no pase por `save_unit_rights` (p. ej. herramientas de CoCo con service_role) queda registrado como `direct`, provisorio. Eventos `assembly.unit_rights_saved` / `assembly.unit_rights_verified`.
  - **Bloqueo:** mientras una asamblea `in_progress` tenga un punto con `voting_status = 'open'`, nadie cambia `share_permille` (trigger `units_share_permille_guard`, también para el servidor).
  - **Desde el onboarding** (`/admin/onboarding`; `src/lib/onboarding/unitRightsImport.ts` puro, `unitRightsOnboarding.ts` del servidor, tipos en `src/lib/onboarding/types.ts`; migración `20261015030000_unit_rights_onboarding.sql`, que solo agrega el método `onboarding`):
    - La nómina acepta la columna opcional `derechos_porcentaje` (en %, la de la plantilla `public/plantillas/nomina-unidades.csv`). También acepta `derechos_permil` y los encabezados con ‰ (no se convierte: ya está en ‰), "%" y "porcentaje", y "prorrateo", "alícuota" o "derechos": con un encabezado ambiguo manda el símbolo de las celdas y, si no hay, la suma (≈100 → %, ≈1000 → ‰; si no da ninguna, la más cercana). En CSV/TXT/XLSX se lee de la tabla original (no de la IA; en XLSX los números salen con coma decimal y las celdas con formato % se leen en %); en PDF/Word, lo que copia la IA, con la misma conversión. El valor viaja en % como texto en `onboarding_import_rows.raw_data.derechos_porcentaje` (los lotes antiguos con `derechos_permil` en ‰ se convierten al leerlos) y se edita en la columna "Derechos (%)" de la revisión. El servidor lo pasa a ‰ antes de guardar.
    - El paso explica: "Con esto las votaciones de asamblea y el prorrateo de gastos comunes quedan según el reglamento." Fuente opcional ("Reglamento de copropiedad, art. X").
    - Validación: la de `validateUnitRights` (no la dupliques), en la vista previa con las unidades del lote y al sincronizar contra **todas** las unidades de la comunidad. Si está completa y suma 100 % ± 0,05 se guarda con `saveUnitRights` (método `onboarding`, revisión auditable): verificada con fuente, provisoria sin ella.
    - Si vienen parciales, ilegibles, con dos valores para una unidad o no suman, se avisa en la vista previa y **no se bloquea** la sincronización: las unidades se crean sin derechos y aparece la tarea "Cargar derechos de cada unidad" → `/admin/asambleas#derechos`. Si no vienen, la misma tarea queda en "Pendientes del onboarding" mientras el estado sea `missing`. Un error al guardar derechos nunca rompe la sincronización.
  - Permisos: solo admin del tenant (ruta) y escrituras solo por `save_unit_rights` (service_role). El registro tiene RLS de lectura solo para el admin de su comunidad. `anon`/`authenticated` no escriben `units.share_permille` (UPDATE e INSERT por columna sin ella) ni tienen TRUNCATE en `units`; por eso `/admin/units` solo muestra la alícuota (en %) y enlaza a esta sección. No vuelvas a escribir `share_permille` desde el cliente.
- Imagen y voz (DS 7 art. 16): las marca **a mano** el admin o la secretaría designada (`secretary_profile_id`, un residente) al acreditar y en cada voto en línea. Un voto en línea sin verificar no se cuenta. No hay videollamada integrada: el enlace es externo.
- La IA (`aiWriter.ts`: Anthropic y luego DeepSeek si hay clave, tareas `assemblies.writer*` del `modelRouter`) solo redacta prosa: la apertura de la citación y el "desarrollo" del acta. La tabla, los quórums, la asistencia por unidad y los resultados los arma `compose.ts` desde los datos. Si la IA falla, se usa el texto determinista.
- Escrituras solo por el servidor. RLS:
  - Admin: ve todo.
  - Comité vigente: ve todo en solo lectura (`assembly_can_oversee`).
  - Residente: ve las asambleas ya citadas y solo la asistencia, los votos y los poderes de sus unidades (`assembly_unit_is_mine`). Ve el acta cuando está firmada.
- Los avisos son solo dentro de la app (`notifications`, categoría `assembly`). Se auditan las acciones `assembly.*`.
- Tipos en `src/lib/assemblies/types.ts` y cliente en `src/lib/services/assemblyService.ts`, no en `api.ts`/`types.ts`.
- **Copropietarios hábiles** (`eligibility.ts` puro, `eligibilityService.ts`, `eligibilityCopy.ts`; migración `20261015000000_assembly_eligibility_certificates.sql`; textos revisados en bcn.cl el 2026-10-14):
  - **Regla.** Solo votan los hábiles (Ley 21.442, art. 15): al día en toda obligación económica a la fecha de corte (art. 2 N°13). Un cobro vence el día siguiente a su vencimiento (vence el mismo día del corte: sigue al día). La deuda sale de la cobranza unificada del Agente Operador (`readCollectionExpenses`: `expenses` + `unit_charges`, y `daysOverdue`); los convenios, de `listAgreements`. **No dupliques esa lógica.**
  - **Convenio** (art. 6; DS 7 art. 9): habilita si está `active`, con la **primera cuota pagada** (con `paid_at` a más tardar en la fecha de corte) y sin cuotas vencidas impagas. Como la primera cuota vence al firmar, quien firma y paga en el acto queda hábil ese mismo día; firmado sin pagar, todavía no. Cubre lo vencido hasta el día en que se abrió (`created_at`, leído en calendario de Chile: es el saldo que entró al convenio); lo que vence después ("otras obligaciones") debe estar al día. Un convenio caído o pendiente de comité no habilita.
  - **Varias unidades** (DS 7 art. 14): si un mismo `owner_id` tiene una unidad no habilitada, ninguna de sus unidades lo está.
  - **Representantes**: el apoderado o el ocupante vota con la habilidad de la unidad que representa (no puede ejercer más que el copropietario). Todas las unidades asisten y hablan; las no habilitadas, "con voz".
  - **Certificado** (art. 15; DS 7 art. 14: lo expide "el administrador o quien haga sus veces"; ninguna norma fija anticipación): lo emite el admin en la sesión en curso, con fecha de corte = hoy, **antes de abrir la primera votación** (`certify_eligibility` en `/api/assemblies`). Se puede reemitir (reemplaza al anterior) hasta que se abre la primera votación. Guarda fecha de corte, totales de unidades y derechos habilitados, quién y cuándo. Sin certificado vigente no se abre ninguna votación (servidor y trigger).
  - **Quórums** (lectura conservadora; el cuadro del art. 15 habla de "los derechos del condominio" y, en la ordinaria, de "los asistentes"): el denominador es siempre el total de derechos del condominio; la **constitución** se cuenta solo con los derechos **hábiles** presentes; el acuerdo ordinario exige más de la mitad de los derechos de **todos** los asistentes (hábiles o no); absoluta y reforzada, sobre el total del condominio. Los votos a favor solo vienen de hábiles. `evaluateAgendaItem({ eligiblePresent })` no guarda esa cifra en el resultado.
  - **Votos**: el de una unidad no habilitada no se registra (`writeVote` y el trigger `assembly_votes_eligible_only`); la UI se lo explica con amabilidad y le da la salida.
  - **Privacidad**: cada unidad ve solo su estado (`myEligibility`: "Puedes votar" / "Para votar, ponte al día o conversa un convenio", con "Ver mi estado de cuenta" y "Pedir un convenio", que avisa solo a los admins). El panel en vivo, el quórum y el acta muestran **solo totales** (N unidades y X % de los derechos habilitados). En la acreditación, solo el admin ve "No habilitada para votar (asiste con voz)" (`view.conductor`), para la unidad que está acreditando; nunca en la tabla de asistencia, pantallas compartidas ni el acta. El detalle por unidad (`assembly_eligibility_units`, con la razón) tiene RLS **solo admin**: ni el comité ni los residentes. Los totales (`assembly_eligibility_certificates`) los lee la comunidad. Auditoría `assembly.eligibility_*` solo con conteos. `checkEligibilityPrivacy` detecta montos, lenguaje de deudor y unidades.
  - **Aviso privado 7 días antes**: cron diario `/api/assemblies/eligibility-notice/cron` (13:00 UTC, `CRON_SECRET`). Desde 7 días antes hasta la víspera de cada asamblea `cited`, avisa en la app solo a las unidades que hoy no estarían habilitadas (al titular; si no hay, a quien la habita), sin montos ni lenguaje de deudor y con las dos salidas. Idempotente: id estable por asamblea y persona.
- Pendiente: la consulta por escrito con sesión informativa (art. 15) y la recolección en la app de firmas para la petición del 10% (hoy el admin registra la fecha y el porcentaje).

**Al agregar una herramienta**, regístrala en `ToolName`, `AGENT_TOOL_NAMES`, `TOOL_AGENT_KEYS`, `TOOL_RISK_LEVELS` (y `READ_ONLY_AGENT_TOOLS` si solo lee) en `domain.ts`, y también en la etiqueta de `src/app/api/agent-center/route.ts` y en el arreglo de herramientas de `agentTools.ts`.

**Migraciones:** en `supabase/migrations/`, idempotentes. Se aplican en Supabase al mismo tiempo que se mergea el PR que las usa.

---

## Estacionamientos — cobro al arrendatario y liquidación al dueño

- **Cobro** (`parking_charges`, migración `20261013160000_parking_charges_ledger.sql`): un cobro por reserva, creado por triggers de base. Por defecto se carga a gastos comunes de la unidad del arrendatario (`charged`); pasa a `paid` cuando la cartola registra el pago real de ese cargo (`paid_in_common_expenses`) o cuando Haulmer confirma el pago (`provider_paid`).
- **Liquidación al dueño** (`parking_payouts`, migración `20261015060000_parking_owner_payouts.sql`; reglas puras en `src/lib/parkingPayouts/payouts.ts`, tipos en `src/lib/parkingPayouts/types.ts`, cliente en `src/lib/services/parkingPayoutService.ts`; UI `ParkingOwnerPayouts` en el modo propietario y `ParkingPayoutsAdmin` en la pestaña de administración). El dinero del arriendo es del dueño del cupo, no de la comunidad:
  - **Solo se liquida un cobro `paid`.** `charged` ("cargado a gastos comunes") es deuda del arrendatario, no dinero: no se liquida hasta que lo pague. La crea el trigger `trg_parking_charges_payout` (idempotente: `UNIQUE (charge_id)`); un error al liquidar se registra como evento `payout_error` del cobro y nunca rompe el cobro (`admin_sync_parking_payouts` crea las que falten).
  - **Comisión de la comunidad**: `communities.parking_commission_percent`, 0–100 % con hasta 2 decimales, 0 % por defecto; la fija solo el admin (`admin_set_parking_commission_percent` o el ajuste de la vista). Se usa la que quedó fijada en la reserva (`parking_bookings.community_fee_amount`); si la reserva no cuadra con el cobro, la tasa vigente. Pesos enteros, comisión redondeada al peso con la mitad hacia arriba, **bruto = comisión + neto exacto** (`parking_payout_split` en la base = `splitParkingPayout` en la app; si cambias una, cambia la otra y sus tests). La comisión queda en la comunidad; el neto va al destino del dueño.
  - **Destino, lo decide el dueño** (`parking_owner_payout_settings`, RPC `parking_set_my_payout_settings`): `bank_transfer` (la administración transfiere fuera de la app y la marca pagada con fecha, comprobante y nota opcionales: `admin_mark_parking_payout_paid`), `common_expenses_credit` (abono automático: un `unit_payments` sin imputar con `reference = 'parking_payout:<id>'` y método `other`, que baja el saldo de su unidad) o `reserve_fund_donation` (aporte automático en `reserve_fund_movements`, fondo legal). **Sin elección**: transferencia si tiene datos bancarios completos; si no, abono a gastos comunes. El destino y los datos bancarios se **congelan** al crear la liquidación; cambiar la preferencia solo afecta a las siguientes.
  - **Contabilidad.** El abono **no es dinero que entra al banco**: `finance_journal_unit_payment` lo contabiliza contra la cuenta `2400 Liquidaciones a dueños de estacionamientos` (no `1100 Banco`). Recaudación (`reportingService`), flujo de caja (`financialStatements`) y conciliación bancaria lo excluyen con `isParkingPayoutCredit`: no lo cuentes como recaudación. Marcar una transferencia pagada registra en la misma transacción el asiento 2400 (debe) contra 1100 Banco (haber), con `source = 'manual'` y `source_record_id` = la liquidación; con el período cerrado no se puede marcar. La donación registra 2400 (debe) contra `3100 Fondo de reserva` (haber), también `source = 'manual'` con la liquidación (trigger `trg_parking_payouts_journal_donation`). En los estados financieros el arriendo entra completo como ingreso y lo transferido o abonado al dueño es la línea de gasto "Liquidaciones a dueños de estacionamientos"; la transferencia es además salida de caja. La donación ya cuenta como aporte al fondo de reserva y no se repite como gasto.
  - **Reconocimiento del arriendo pagado** (migración `20261016020000_parking_charge_income_journal.sql`, trigger `trg_parking_charges_payout_ledger`, que corre después de `trg_parking_charges_payout` por orden de nombre). Cuando un cobro pasa a `paid`, por cualquiera de los dos caminos, se registra en la misma transacción **un** asiento `source = 'parking_charge'`: debe `1100 Banco` (Haulmer: el dinero entró al banco) o `1200 Cuentas por cobrar` (gastos comunes: el pago de la unidad ya entró a 1100 contra 1200) por el **bruto**; haber `2400` por el **neto** y `4300 Comisiones por arriendo de estacionamientos` por la **comisión** (la de la liquidación; si no se pudo crear, la misma regla de `parking_payout_open`). El neto queda en la 2400 hasta liquidar; transferencia, abono o donación la dejan en 0. Ejemplo: bruto 1.999 con 12,5 % → debe 1100 1.999 / haber 2400 1.749 / haber 4300 250; al transferir, 2400 1.749 contra 1100: banco 250 = comisión, 2400 = 0, resultado = 250.
  - **Idempotencia del reconocimiento**: el asiento cuelga de un evento `ledger_recorded` de `parking_charge_events` (`journal_entries.source_record_id` = id del evento; los detalles traen `journal_entry_id`). Solo se registra si el último evento contable del cobro no es ya `ledger_recorded`; el webhook repetido ni siquiera cambia el estado (`idempotent`).
  - **Reversa del reconocimiento**: si el cobro sale de `paid` (pago de la unidad eliminado → `charged`, o reembolso → `refunded`) se registra el espejo exacto del asiento vigente (`source = 'parking_charge_reversal'`, evento `ledger_reversed`); al volver a pagarse se registra uno nuevo. En Haulmer, marcar reembolsado (`admin_mark_parking_charge_refunded`) ya registra la salida de banco: **no lo registres de nuevo en finanzas**. La liquidación sigue sus propias reglas (abajo): si ya se entregó al dueño, no se revierte y la 2400 queda deudora por ese neto hasta regularizar con él.
  - Un error al registrar el reconocimiento **sí rompe** la transición (a diferencia de la liquidación): el dinero no puede quedar fuera del libro. Con el mes en curso cerrado, el webhook de Haulmer responde error y Haulmer reintenta.
  - **Estados financieros con Haulmer**: un arriendo cobrado por Haulmer no tiene cargo en la cuenta de la unidad; `financialStatements` lo lee de `parking_charges` (`method = 'haulmer'`, `paid`/`refunded`) y lo suma a "Cargos extraordinarios y servicios" y a la entrada de caja el mes del pago; si se reembolsó, sale de ambos el mes del reembolso. Recaudación (`reportingService`) y conciliación bancaria todavía no lo muestran.
  - **Estado de la unidad abonada.** La base inserta el abono, pero el estado de los cobros (pendiente, vencido o pagado) lo recalcula `reconcileUnitStatuses` en TypeScript. Por eso la liquidación abonada queda con `credit_reconciled_at = NULL` y `reconcileParkingPayoutCredits` (`src/lib/parkingPayouts/reconcileCredits.ts`) la recalcula y la marca. Se llama al final de cada `reconcileUnitStatuses`, tras el webhook de Haulmer y desde la vista de administración (`POST /api/parking/payouts/reconcile`, solo admin). Si insertas un abono por otro camino, llama a ese recálculo.
  - Si en finanzas se elimina el pago que respalda un abono (`reference = 'parking_payout:<id>'`), la liquidación vuelve a `pending` y queda para revisión (trigger `trg_unit_payments_parking_payout_deleted`). Nunca queda "abonada" sin abono.
  - La administración **no puede anular a mano** una liquidación mientras el arriendo siga cobrado o pagado (`admin_cancel_parking_payout` lo rechaza): el dinero es del dueño. Se anula sola cuando el cobro se anula o se reembolsa.
  - **Reversas**: si el pago del arrendatario se revierte, la liquidación pendiente queda `on_hold` y se reanuda sola al volver a pagarse; si el cobro se anula o reembolsa, la pendiente se anula. Una cancelación sin costo sobre un arriendo ya pagado pausa la pendiente para revisión. Una liquidación ya transferida, abonada o donada **nunca se revierte sola**: queda `needs_review` para la administración (`admin_resolve_parking_payout_review`).
  - Estados: `pending → paid | credited | donated | retained | on_hold | cancelled` (`retained` = neto 0 por comisión del 100 %). Solo se reabren `on_hold → pending`, `credited → pending` (abono eliminado) y `retained → on_hold | cancelled` (reversa o reembolso; al dueño no se le entregó nada); `paid`, `donated` y `cancelled` son terminales. Ni la service role cambia montos, destino ni dueño (trigger `enforce_parking_payout_rules`). Bitácora `parking_payout_events`.
  - **RLS**: liquidaciones y datos bancarios los ven solo el dueño (lo suyo) y el admin de su comunidad; conserjería no (el dinero no es dato operativo). Nadie escribe directo: todo por RPCs `SECURITY DEFINER` con `search_path` fijo; `anon` no tiene acceso.
  - Textos al dueño en positivo, sin lenguaje de deudor ni amenazas.

---

## Inicio del residente: "Lo próximo a la vista" y bloqueo biométrico

- **Lo próximo a la vista** (`src/lib/home/nextUp.ts` y `nextUpCopy.ts`, puros; tipos en `src/lib/home/types.ts`; datos en `HomeService.getResidentHome`/`getResidentNextUp` de `src/lib/api/dashboard.ts`; UI `src/components/home/NextUpCard.tsx`). Muestra el próximo vencimiento (cartola unificada `chargeBalances`: `expenses` + `unit_charges`), la próxima cuota del convenio (`agreementDueDates`) y la próxima reserva (`bookings`) o asamblea citada/en curso.
  - Al residente, sobre su propia cuenta, sí se muestra el monto; sin lenguaje de deudor (`NEXT_UP_FORBIDDEN_LANGUAGE`) y siempre con salida: pagar en línea, conversar (`/chat`) o pedir un convenio.
  - Multas, intereses y otros cargos se rotulan "Otro cargo de <mes>": nunca la glosa interna.
  - Un convenio vigente cubre lo vencido hasta el día en que se abrió (como en la habilidad para votar): esos cobros no se repiten en la tarjeta.
  - "Pedir un convenio": `POST /api/resident/agreement-request` (solo residentes) avisa en la app solo a los admins, sin montos, idempotente por unidad y día; auditado como `finance.agreement_conversation_requested`. No crea el convenio.
- **Bloqueo con Face ID o huella** (app nativa; `src/lib/native/biometricLock.ts` puro, `biometricBridge.ts`, `components/native/BiometricLockGate.tsx` en el layout del dashboard y `BiometricLockSetting.tsx` en el perfil). Plugins gratuitos `@capgo/capacitor-native-biometric` (MPL-2.0) y `@capacitor/app`.
  - Opcional, por persona y teléfono (localStorage `cc:biometric-lock:<userId>`). Se verifica la biometría antes de activarlo. En web no hace nada (el plugin tiene una implementación web de prueba que siempre "verifica": nunca la llames fuera de `isNativeApp()`).
  - Pide biometría al abrir la app y al volver del fondo tras `LOCK_AFTER_BACKGROUND_MS` (10 s). Durante la verificación y `POST_VERIFY_SUPPRESS_MS` después se ignoran `pause`/`resume`, porque el propio aviso los dispara en Android: si no, entra en bucle.
  - Si el teléfono ya no tiene biometría, la única salida es cerrar sesión, que además apaga el bloqueo en ese teléfono.
  - `NSFaceIDUsageDescription` en `ios/App/App/Info.plist` y `USE_BIOMETRIC` en el `AndroidManifest.xml`.

---

## Tests de punta a punta de los flujos de dinero

`npm run test:e2e:money` (`vitest.money.config.ts`, `tests/e2e-money/`; corre en el job `validate` del CI). Sin red ni secretos:

- **Base real:** `tests/fixtures/moneyDb.ts` levanta PGlite y aplica **todas** las migraciones de `supabase/migrations/` en orden. Lo que se creó fuera de las migraciones (panel, `legacy_migrations/`, `schema_rpc_match_memories.sql`) entra por `DRIFT_BRIDGES`, una lista corta y explicada que toma la definición de `schema.sql` o de la migración que la define; ninguna migración de dinero necesita puente. Si una migración nueva no aplica sobre la cadena, el test lo dice: corrige la migración, no el puente.
- **Servicios reales:** `tests/fixtures/supabasePglite.ts` es un cliente con la forma de supabase-js que traduce a SQL (select con embebidos por FK, filtros, insert/update/upsert/delete, rpc) y ejecuta cada llamada como una transacción con el rol de PostgREST (`service_role`, `authenticated` con `auth.uid()` o `anon`). Los tests mockean `getSupabaseAdmin` (y `@/lib/supabase` para servicios del cliente) con él, así que pasan por `billingService`, `collectionService`, `agreementService`, `reconcileCredits`, el webhook de Haulmer, etc. Si un servicio usa algo de PostgREST que el cliente no cubre, falla con un error `[supabasePglite]` explícito: agrégalo ahí.
- **Invariante contable** (`expectLedgerInvariant` en `tests/fixtures/moneyFlows.ts`): al final de cada flujo, cada asiento cuadra, cada pago tiene un solo asiento, el banco 1100 = pagos en dinero + arriendos pagados por Haulmer − transferencias a dueños, cada arriendo pagado tiene exactamente un asiento de reconocimiento vigente y la 2400 = neto de los arriendos pagados que falta entregar al dueño (0 cuando todo está liquidado). Los avisos se revisan con `MONEY_PATTERN`/`DEBTOR_PATTERN`.
- Un bug conocido sin corregir se deja como `it.fails` con su explicación; al corregirlo, quita el `.fails`.

---

## Próximos Pasos Planificados

- [ ] **Búsqueda híbrida** — pgvector + Full Text Search en Supabase para Marketplace y Directorio (Anthropic embeddings)
- [ ] **Email.ts** — Completar integración Resend: alerta gastos, confirmación amenities, bienvenida
- [ ] **Haulmer** — Integrar pagos reales cuando se obtengan los permisos API
- [ ] **Twilio** — Configurar WhatsApp notifications
- [ ] **Empty states** — Mejorar UX de estados vacíos en módulos
- [ ] **SEO** — Meta tags en todas las páginas del dashboard

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
