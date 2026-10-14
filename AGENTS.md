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
│   ├── api.ts           # ← TODOS los Services de datos van aquí
│   ├── types.ts         # ← TODOS los tipos TypeScript centralizados
│   ├── agentBrain.ts    # Lógica del agente de supermercado/recetas
│   ├── authContext.tsx  # Contexto global de autenticación
│   ├── supabase.ts      # Cliente Supabase (cliente)
│   └── config.ts        # Configuración global del proyecto
├── components/          # Componentes reutilizables
└── hooks/               # Custom React hooks
```

### 2. Reglas de arquitectura — NO ROMPER

- **Las páginas NO hacen llamadas directas a Supabase.** Toda lógica de datos va encapsulada en un `Service` dentro de `src/lib/api.ts`.
- **Todos los tipos van en `src/lib/types.ts`.** No definir tipos inline en componentes o páginas.
- **Las rutas de API van en `src/app/api/`** como Route Handlers de Next.js (`route.ts`).
- **`src/lib/supabase.ts`** exporta el cliente Supabase — importar siempre desde ahí, nunca instanciar Supabase directamente.
- **No usar `any` en TypeScript.** El modo strict está activo.

### 3. Patrón de Services (api.ts)

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

El Agent Center (`src/lib/agent-center/`) opera la cobranza y la mantención del condominio con herramientas (`agentTools.ts`), riesgos (`domain.ts`, `TOOL_RISK_LEVELS`) y playbooks (`taskPlaybooks.ts`). Se construyó por fases (PR #161 a #166, octubre 2026). Respeta estas reglas al tocarlo:

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
  - La primera cuota vence el día 5 del mes siguiente.
  - Si existe comité, el convenio queda `pending_committee`.
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
  - `MaintenanceService.completeTask` en `src/lib/api.ts` quedó obsoleto: usa la ruta.

**Al agregar una herramienta**, regístrala en `ToolName`, `AGENT_TOOL_NAMES`, `TOOL_AGENT_KEYS`, `TOOL_RISK_LEVELS` (y `READ_ONLY_AGENT_TOOLS` si solo lee) en `domain.ts`, y también en la etiqueta de `src/app/api/agent-center/route.ts` y en el arreglo de herramientas de `agentTools.ts`.

**Migraciones:** en `supabase/migrations/`, idempotentes. Se aplican en Supabase al mismo tiempo que se mergea el PR que las usa.

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
