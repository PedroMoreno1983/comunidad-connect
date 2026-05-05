# CLAUDE.md — ComunidadConnect

Archivo maestro del proyecto para agentes de IA (Antigravity, Claude Code, Cursor, etc.).
Lee este archivo completo antes de modificar cualquier cosa.

---

## Descripción del Proyecto

**ComunidadConnect** (CoCo) es una plataforma SaaS multi-tenant para gestión de condominios en Chile.
Combina gestión de residentes, pagos, amenidades, IoT, marketplace vecinal y un agente de IA conversacional.

- **URL producción:** https://comunidadconnect.vercel.app
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
| IA Agent | Anthropic Claude | @anthropic-ai/sdk ^0.89 |
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

# Pagos (pendiente permisos Haulmer)
# HAULMER_API_KEY=       # No configurado aún

# Deploy
NEXT_PUBLIC_SITE_URL=    # https://comunidadconnect.vercel.app
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

La validación de roles de superadmin ocurre en `src/middleware.ts`.
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
| Gastos comunes | `/expenses` | ✅ Activo (pago = mock) | Supabase real |
| Feed/Anuncios | `/feed` | ✅ Activo | Supabase real |
| Chat (CoCo AI) | `/chat` | ✅ Activo | Agente local + Anthropic |
| Social | `/social` | ✅ Activo | Supabase real |
| Directorio | `/directorio` | ✅ Activo | Datos mixtos |
| Servicios | `/services` | 🟡 Parcial | Mock/parcial |
| Admin Panel | `/admin` | ✅ Activo | Supabase real |
| Concierge Panel | `/concierge` | ✅ Activo | Supabase real |
| SuperAdmin | `/superadmin` | ✅ Activo | Supabase real |

---

## Integraciones Externas

| Servicio | Estado | Notas |
|---|---|---|
| Supabase (DB + Auth) | ✅ Funcionando | Proyecto: `sxtnhhblunvorbwbmmbg` |
| Anthropic Claude | ✅ Funcionando | Motor del agente CoCo |
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
5. **No hardcodear IDs:** El `condo_id` por defecto para demo es `11111111-1111-1111-1111-111111111111` — usar la constante, no el string suelto.
6. **Vercel:** Los headers de seguridad están en `vercel.json`. No eliminarlos.
7. **Mobile:** `capacitor.config.ts` apunta al directorio `out` del build estático. No cambiar sin coordinar.

---

## Agente CoCo (AI)

El agente CoCo tiene dos capas:

1. **`agentBrain.ts`** — `SupermarketAgent`: agente de supermercado y recetas. Catálogo de productos de supermercados chilenos + 6 recetas. Usa keyword matching + integración con Marketplace real.

2. **`/api/coco/`** — Agente conversacional principal: usa Anthropic Claude con tools para gestión del condominio (IoT, gastos, solicitudes, etc.).

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

## Próximos Pasos Planificados

- [ ] **Búsqueda híbrida** — pgvector + Full Text Search en Supabase para Marketplace y Directorio (Anthropic embeddings)
- [ ] **Email.ts** — Completar integración Resend: alerta gastos, confirmación amenities, bienvenida
- [ ] **Haulmer** — Integrar pagos reales cuando se obtengan los permisos API
- [ ] **Twilio** — Configurar WhatsApp notifications
- [ ] **Empty states** — Mejorar UX de estados vacíos en módulos
- [ ] **SEO** — Meta tags en todas las páginas del dashboard
