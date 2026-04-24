# ComunidadConnect — Design System v1.0

> Sistema de diseño para la plataforma ComunidadConnect.
> Unifica la experiencia de Administración, Conserjería y Residentes.

---

## Filosofía

Cuatro principios rigen el sistema:

**1. Profesional pero humano.** Nuestros usuarios manejan dinero, temas legales y convivencia. La estética debe transmitir confianza (como Stripe o Linear) sin caer en frialdad corporativa. La tipografía display (Bricolage Grotesque) aporta carácter; la estructura mantiene seriedad.

**2. Dark by default.** El modo oscuro reduce fatiga visual en sesiones largas de administración y diferencia la plataforma de competidores chilenos (ComunidadFeliz, GastoComunChile) que usan light themes convencionales. Es identidad.

**3. Role-aware.** Los tres roles (Admin, Conserje, Residente) comparten el mismo sistema pero se distinguen por acentos cromáticos: violeta, ámbar y esmeralda. Un usuario sabe en qué rol está sin leer — lo siente.

**4. Densidad con claridad.** Los administradores ven mucha data; los residentes ven poca. Los mismos componentes deben funcionar bien en ambos extremos: jerarquía tipográfica fuerte, espaciado predecible, íconos consistentes.

---

## Estructura de archivos

```
comunidadconnect-design-system/
├── tokens.css                  ← Source of truth (CSS variables)
├── tailwind.config.ts          ← Extensión Tailwind (mapea tokens)
├── showcase.html               ← Referencia visual navegable (ábrelo en el navegador)
├── design-system.md            ← Este documento
└── components/
    ├── Button.tsx              ← Botón con variantes + tamaños
    ├── Badge.tsx               ← Badge de rol y estado
    ├── StatCard.tsx            ← KPI card con trend
    ├── ActionCard.tsx          ← Acceso rápido
    └── EmptyState.tsx          ← Estado vacío con CTA
```

---

## Instalación en tu proyecto Next.js

**1. Copia `tokens.css` a tu proyecto**

Pégalo en `app/tokens.css` (o donde tengas tus estilos globales).

**2. Impórtalo en tu layout raíz**

En `app/globals.css`:
```css
@import './tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: var(--cc-bg-canvas);
  color: var(--cc-text-primary);
  font-family: var(--cc-font-sans);
}
```

**3. Reemplaza tu `tailwind.config.ts`**

Con el archivo `tailwind.config.ts` de este paquete. Si ya tienes customizaciones, mergéalas.

**4. Usa los componentes**

```tsx
import { Button } from '@/components/Button';
import { StatCard } from '@/components/StatCard';

<StatCard
  icon={<Users className="h-5 w-5" />}
  value={48}
  label="Residentes activos"
  trend={{ direction: 'up', value: '+3 este mes' }}
  role="admin"
/>
```

---

## Tokens — Referencia rápida

### Color

Tres capas:

**Superficies** (el fondo, los bordes, el texto) — prefijo `bg-`, `text-`, `border-`.
```
bg-canvas   #0A0A12   Página (fondo general)
bg-surface  #12121D   Cards y panels
bg-elevated #1A1A28   Modales, popovers, hover
bg-overlay  #252538   Hover sobre elevated
```

**Marca** — una escala de 10 stops para el violeta.
Usa `brand-500` para CTAs primarios, `brand-400` para hover, `brand-300` para links.

**Roles** — acentos de cada rol (bg, fg, border).
```
role-admin-*       Violeta (usa brand-*)
role-conserje-*    Ámbar (#F59E0B base)
role-residente-*   Esmeralda (#10B981 base)
```

**Semánticos** — feedback universal.
```
success  Verde    Pagos exitosos, estados OK
warning  Ámbar    Pendientes, alertas leves
danger   Rojo     Vencidos, errores, destructivo
info     Azul     Informacional, programado
```

### Tipografía

**Display**: `Bricolage Grotesque` — para headings grandes. Personalidad humanista, variable, italic disponible para acentos.
**Body**: `Geist` — limpia, legible, técnica. Default para todo el UI.
**Mono**: `Geist Mono` — números, IDs, código, fechas estructuradas.

Escala:
```
text-xs    12px    Captions, metadata
text-sm    13px    Helper text
text-base  14px    Body default (valor recomendado para UI)
text-md    16px    Emphasis, inputs
text-lg    18px    Títulos de sección
text-xl    20px    Títulos de card
text-2xl   24px    H2 de página
text-3xl   30px    H1 de página
text-4xl   36px    Display M
text-5xl   48px    Display L (hero)
```

Pesos: usa solo **400 (regular)** y **600 (semibold)**. Evita 500 excepto en casos específicos como caption uppercase.

### Spacing

Escala base 4px, usa los tokens tailwind: `p-1` (4px) → `p-20` (80px).
Múltiplos principales para UI: 8, 12, 16, 24. Para cards usar padding 24.

### Radius

```
radius-sm   6px    Tags, pills internos
radius-md   8px    Botones, inputs
radius-lg   12px   Cards (default)
radius-xl   16px   Cards elevadas, feature cards
radius-2xl  24px   Modales, hero elements
```

### Shadows

Dark theme: las sombras tradicionales son poco visibles. Usamos **glows selectivos** para elementos interactivos importantes (`shadow-glow-brand` en botones primarios hover, por ejemplo).

---

## Componentes — Guía de uso

### Button

Cuatro variantes, tres tamaños. **Regla clave**: usar `btn-primary` máximo una vez por pantalla. Si necesitas dos CTAs, uno debe ser secondary.

### Badge

Dos familias: rol y estado. El dot (`<span class="dot">`) es opcional — úsalo cuando el estado es "vivo" o presente (ej: "Admin conectado"). Omítelo para metadata estática.

### StatCard

El KPI del dashboard. **Siempre** incluye:
- Ícono en icon-wrap con color semántico o de rol
- Value (el número grande) en font-display
- Label descriptivo
- Trend indicator (↑ o ↓ con comparación) cuando hay datos temporales

Sin trend, el número es solo ruido. Si aún no tienes comparación histórica, omite el trend hasta que la tengas.

### ActionCard

Para el patrón "Acceso Rápido". A diferencia del actual (solo botón con texto), incluye:
- Ícono con color semántico
- Título
- Subtítulo (contexto: "Nuevo visitante o proveedor")
- Chevron animado en hover

Esto convierte cada acción de "botón genérico" en "tarea clara".

### EmptyState

**El componente más importante en tu situación actual.** Cada lista, tabla o sección que pueda estar vacía necesita un empty state. Estructura:
- Ícono contextual (checkmark verde si es "todo al día", campana si son "avisos", etc.)
- Título corto
- Descripción que explique qué verá el usuario cuando haya datos
- CTA con la acción más probable

---

## Principios de aplicación

### Un rol = un acento cromático

- En cada página, el acento dominante coincide con el rol del usuario
- En badges de rol, el dot se anima con pulse sutil cuando está activo
- Los íconos de header usan el color del rol; los íconos de contenido usan semánticos (success, warning, etc.)

### Data-first

- Nunca muestres "0" si la causa es "cuenta vacía" — muestra un empty state
- Siempre acompaña números grandes con contexto (trend, comparación, período)
- Usa mono font para datos tabulares (`font-mono`): CLP amounts, fechas, IDs

### Motion

- Transitions default: `200ms cubic-bezier(0.16, 1, 0.3, 1)` — suave, sin rebote
- Hovers siempre sutiles: translate 2px, cambio de border color, nunca scale grande
- Focus visible: ring violeta 3px — accesibilidad no negociable
- Respeta `prefers-reduced-motion` (ya configurado en tokens.css)

---

## Qué sigue (Fase 2)

Este documento cubre las **foundations y componentes primitivos**. Los próximos pasos:

1. **Refactor de las 3 dashboards** usando los nuevos componentes
2. **Librería de patterns**: layouts de lista, detalle, formulario, flujos
3. **Iconografía**: definir set consistente (recomiendo `lucide-react` por cohesión con la estética actual)
4. **Motion system**: animaciones de entrada (staggered reveal en dashboards)
5. **Populado de la cuenta demo**: datos realistas en las 3 vistas (crítico para conversión)
6. **Landing refresh**: aplicar sistema a la landing (y eliminar los ceros y testimonios genéricos)

---

## Créditos y versión

**v1.0** · Abril 2026 · ComunidadConnect
Basado en la identidad visual existente, refinada y formalizada.
