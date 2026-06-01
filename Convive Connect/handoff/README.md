# Convive & Connect — Premium Migration Package

Drop-in para tu codebase Next.js 16 + React 19 + **Tailwind v4** + TypeScript.

Este paquete traduce el rediseño premium al código real de tu plataforma.
No reemplaza nada por sí solo — sigue los pasos abajo.

---

## Cómo se organiza

```
handoff/
├── README.md                  ← este archivo
├── tokens.css                 ← variables CSS + @theme Tailwind v4
├── globals.example.css        ← cómo queda src/app/globals.css
├── CHANGES.md                 ← migración módulo por módulo
├── components/
│   ├── Brand.tsx              ← wordmark "Convive & Connect"
│   ├── Tag.tsx                ← pill / badge con dot
│   ├── Button.tsx             ← variantes primary / ghost / copper
│   ├── KpiCard.tsx            ← métrica con eyebrow + trend
│   ├── EmptyState.tsx         ← estado vacío con CTA
│   ├── Eyebrow.tsx            ← uppercase tracked label
│   ├── Sidebar.tsx            ← sidebar admin/conserje (role-aware)
│   ├── Topbar.tsx             ← topbar dashboard
│   ├── AdminShell.tsx         ← layout para (dashboard)/layout.tsx
│   └── viz/                   ← visualizaciones estilo Cotton
│       ├── FoldedBar.tsx      ← barra "ribbon" con doblez 3D + fold()/DATA_PALETTE
│       ├── BladeFan.tsx       ← abanico radial de cuchillas
│       ├── ScoreDonut.tsx     ← donut de puntaje + BigDonut
│       └── DotMatrix.tsx      ← unit chart de puntos
└── examples/
    ├── HomePage.tsx           ← /home reescrito
    ├── AdminDashboardPage.tsx ← /admin reescrito
    └── ExpensesPage.tsx       ← /expenses reescrito
```

---

## Paso 1 · Tokens y fuentes

Reemplaza `src/app/tokens.css` con `handoff/tokens.css`.

Las **fuentes** las cargamos desde Google Fonts via `@import` (ya está en tokens.css).
Si prefieres self-hosted, descarga Instrument Serif y Geist desde fontsource.

En `src/app/globals.css`, asegúrate de importar tokens antes de cualquier capa:

```css
@import "tw-animate-css";
@import "tailwindcss";
@import "./tokens.css";
```

> Tailwind v4 detecta `@theme` dentro de tokens.css automáticamente — las clases `bg-ink`, `text-copper`, etc. quedan disponibles sin tocar `tailwind.config`.

---

## Paso 2 · Componentes compartidos

Copia los archivos de `handoff/components/` a `src/components/cc/` (sufijo `cc` para
no chocar con los actuales).

Ningún componente toca Supabase ni tu lógica — son puros.

Importa desde `@/components/cc/Brand`, `@/components/cc/Tag`, etc.

---

## Paso 3 · Layout del dashboard

Reemplaza `src/app/(dashboard)/layout.tsx` por la implementación basada en
`AdminShell` (ver `examples/AdminDashboardPage.tsx`).

Mantén tu `AuthProvider` y middleware como están — solo cambia el chrome visual.

---

## Paso 4 · Páginas, una por una

Mira `CHANGES.md` — tiene la guía módulo por módulo:
- qué archivo del codebase tocar
- qué components reemplazan a lo actual
- qué Services siguen sirviendo igual

Sugerencia de orden:
1. `/home` (más visible, más rápido de migrar)
2. `/expenses` (impactante, usa StatCard + breakdown)
3. `/admin` (apalancas AdminShell)
4. Resto (marketplace, amenities, votaciones, feed, social, directorio, services)

---

## Paso 5 · Iconos

Mantén `lucide-react` — ya lo usas. El rediseño usa los siguientes con tamaños
14–18px y `strokeWidth={1.5}` en cuerpo, `2` en CTAs:

`Home, Users, Bell, Calendar, MessageSquare, Wrench, Receipt, Coins, Store,
ShoppingBag, MapPin, Settings, ChevronRight, ArrowRight, Plus, Search, Filter,
Check, Sparkles, Send, Mic, Droplets, Zap, Leaf, MoreHorizontal`.

---

## Visualizaciones (estilo Cotton)

Las viz viven en `components/viz/`. Reglas de uso:

- **Úsalas solo en momentos de datos** (dashboards, analítica, histórico, consumo).
  En listas, tablas, feed, perfil y flujos transaccionales **no** — el contraste entre
  pantallas calmas y pantallas vibrantes es lo que las hace destacar.
- Importa colores y el helper de doblez desde `FoldedBar`:
  ```ts
  import { FoldedBar, DATA_PALETTE, fold } from "@/components/cc/viz/FoldedBar";
  import { BladeFan } from "@/components/cc/viz/BladeFan";
  import { ScoreDonut, BigDonut } from "@/components/cc/viz/ScoreDonut";
  import { DotMatrix } from "@/components/cc/viz/DotMatrix";
  ```
- **FoldedBar** reemplaza cualquier barra plana (recaudación mensual, uso de amenidades,
  histórico de gasto común, gráfico de Coco). Vertical u horizontal.
- **BladeFan** para los abanicos radiales (Indicadores, Costos). `tipInset={0}` = punta
  cuadrada (default actual); súbelo para punta puntiaguda.
- **ScoreDonut / BigDonut** para indicadores circulares.
- **DotMatrix** para unit charts (ocupación de unidades, etc.).

Pantallas analíticas de referencia en el prototipo: artboards **Indicadores**, **Costos**
y **Residentes** (sección "Admin · analítica").

---

## Cosas que NO migran

- Variables de tema "role-admin / role-conserje / role-residente" del design system
  original — el rediseño las consolida bajo un único acento (`--copper`) que se
  swap-ea por rol vía la prop `accent` de AdminShell.
- El "Demo banner" amarillo arriba — queda como `<DemoBanner />` opcional, dejado
  fuera del shell por defecto. Llámalo desde tu middleware si sigue siendo demo.
- Dark theme global — desactiva tu `next-themes` o cambia el default a `light`.
  El residente tiene un "modo noche" propio (variante del Home); el resto de la
  plataforma vive en light tono cálido.

---

## Test
1. `npm install` (no hay nuevas deps; solo Instrument Serif)
2. `npm run dev`
3. Visita `/home` → debería verse igual que el artboard "Home — Martina"

Si algo no calza, abre el index.html del prototipo en paralelo para comparar.
