# ComunidadConnect (CoCo) — Plataforma SaaS de Gestión Residencial

¡Bienvenido al repositorio oficial de **ComunidadConnect**! 🏢

**ComunidadConnect (CoCo)** es una plataforma SaaS multi-tenant diseñada específicamente para la administración de condominios y edificios en Chile. Centraliza la comunicación entre la administración, conserjes y residentes, integrando automatización hídrica (IoT), votaciones comunitarias, marketplace vecinal de modalidad múltiple (venta, permuta y trueque), cobro tributario de gastos comunes (Haulmer) y un tutor virtual conversacional potenciado por Inteligencia Artificial (Anthropic Claude).

---

## 🚀 Arquitectura y Principios de Diseño

El proyecto está diseñado bajo estrictos estándares de ingeniería para asegurar escalabilidad y modularidad:

```
src/
├── app/                  # Next.js App Router (Páginas y APIs)
│   ├── (auth)/           # Rutas públicas/semi-protegidas de autenticación
│   ├── (dashboard)/      # Dashboard unificado (Sub-módulos y vistas por rol)
│   │   ├── home/         # Inicio y KPI boards
│   │   ├── marketplace/  # Compra y venta vecinal
│   │   ├── social/       # Red social interna
│   │   └── ...           # Otros módulos (amenities, votaciones, expenses)
│   ├── api/              # Route Handlers / API endpoints nativos
│   └── page.tsx          # Landing page principal
├── lib/                  # Lógica del Core, Configuración y Servicios
│   ├── api.ts            # ← UNICA FUENTE de interacción de datos con Supabase
│   ├── types.ts          # ← Tipos TypeScript centralizados
│   ├── supabase.ts       # Cliente instanciado de Supabase
│   └── agentBrain.ts     # Cerebro conversacional y base de conocimiento local
├── components/           # Componentes visuales y layouts reutilizables
│   ├── ui/               # Componentes UI básicos (Botones, Inputs, Cards, etc.)
│   └── training/         # Componentes dedicados al aula virtual multi-agente
└── hooks/                # Hooks de React personalizados
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Versión | Propósito |
|---|---|---|---|
| **Framework** | Next.js (App Router) | `16.2.6` | Motor principal SSR/SSG/ISR |
| **Runtime** | React | `19.2.6` | Interfaz de usuario dinámica |
| **Lenguaje** | TypeScript | `^5` | Tipado estático estricto |
| **Estilos** | Tailwind CSS | `v4` | Framework CSS moderno y utilitario |
| **Animaciones** | Framer Motion | `^12` | Micro-interacciones y transiciones fluidas |
| **BaaS** | Supabase | `^2.95` | Base de datos PostgreSQL, RLS y Auth |
| **Motores de IA** | Anthropic Claude SDK | `^0.95` | Agente CoCo Conversacional y generador |
| **Email** | Resend SDK | `^6.9` | Envío de notificaciones transaccionales |
| **Mobile** | Capacitor CLI | `^8.1` | Compilación nativa en Android e iOS |

---

## 🔑 Variables de Entorno Requeridas

Crea un archivo `.env.local` en la raíz basado en `.env.example`:

```bash
# Supabase (Obligatorio)
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui

# Inteligencia Artificial
# Clave principal de Anthropic para el Agente CoCo y generación de contenido
ANTHROPIC_API_KEY=tu-anthropic-key-aqui
# Clave de Gemini (usada en orquestación multi-agente y fallback de entrenamiento)
GEMINI_API_KEY=tu-gemini-key-aqui

# Comunicaciones y Alertas
# Proveedor para notificaciones transaccionales
RESEND_API_KEY=tu-resend-key-aqui
# Twilio WhatsApp (Opcional - Notificaciones PWA alternativas)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# Entorno de Despliegue
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 📂 Sistema de Roles

La plataforma divide la experiencia de usuario y los paneles mediante cuatro roles clave:
* **Superadmin:** Acceso exclusivo a `/superadmin` para la creación y monitoreo global de comunidades SaaS y facturación.
* **Admin:** Gestiona el condominio, usuarios, áreas comunes, control hídrico e ingresos en `/admin`.
* **Resident:** Residente o propietario. Puede reservar, comprar/vender, votar, pagar gastos comunes e interactuar en `/feed` y `/social`.
* **Concierge:** Personal de seguridad. Registra visitas, encomiendas y valida códigos QR en `/concierge`.

---

## ⚙️ Configuración y Puesta en Marcha Local

### 1. Clonar e Instalar dependencias
```bash
git clone <repositorio-url>
cd comunidad-connect
npm install
```

### 2. Configurar Base de Datos (Supabase)
Si utilizas el **Supabase CLI** (Recomendado):
```bash
# Vincular con tu proyecto de Supabase Cloud
npx supabase link --project-ref <tu-project-id>

# Aplicar las migraciones locales en tu DB remota
npx supabase db push
```
Si prefieres configurar manualmente en el **SQL Editor de Supabase**:
1. Copia y ejecuta el contenido de `schema.sql` (ubicado en la raíz) en una nueva consulta SQL.
2. Este archivo crea de forma ordenada todas las tablas, vistas, funciones, índices y políticas RLS necesarias.

### 3. Iniciar Servidor de Desarrollo
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

---

## 🛡️ Guardrails de Desarrollo (Reglas Fundamentales)

* **Ninguna página hace llamadas directas a Supabase:** Toda consulta o mutación de base de datos debe estar encapsulada dentro de un `Service` en `src/lib/api.ts` para garantizar modularidad y simplificar refactorizaciones de DB.
* **Tipado Estricto:** Está estrictamente prohibido el uso del tipo `any` en TypeScript. Todos los tipos y contratos de datos deben residir en `src/lib/types.ts`.
* **Importación unificada de cliente de base de datos:** El cliente de base de datos debe importarse siempre desde `@/lib/supabase`, nunca instanciarse directamente en otros archivos.
* **ID de Comunidad Demo:** En pruebas o entornos locales que requieran un identificador por defecto para retrocompatibilidad, usa siempre la constante `00000000-0000-0000-0000-000000000000` (ID de Comunidad Demo) en lugar de cadenas de texto aleatorias.

---

## 📈 Scripts y Comandos Útiles

El proyecto cuenta con un riguroso entorno de integración continua y control de calidad (QA). Puedes ejecutar estos comandos localmente antes de realizar cualquier commit:

```bash
# --- Desarrollo ---
npm run dev              # Servidor local de desarrollo
npm run build            # Generar compilación optimizada para producción (Next.js/Turbopack)

# --- Verificación Estática ---
npx tsc --noEmit         # Verificación de compilación y sanidad de tipos TypeScript
npm run lint             # Análisis estático de ESLint

# --- Scripts de QA de Negocio (Integrados en scripts/) ---
npm run qa:readiness     # Evalúa preparación general para producción
npm run qa:security-headers  # Evalúa cumplimiento de cabeceras CSP
npm run qa:multitenant   # Valida aislamiento de datos por community_id (RLS)
npm run qa:human-flows   # Pruebas automatizadas de flujos de usuario (Playwright)
```
