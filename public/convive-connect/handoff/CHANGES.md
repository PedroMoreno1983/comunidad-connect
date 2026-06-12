# CHANGES.md — Migración por módulo

Guía para reemplazar tu UI actual con el rediseño premium **sin tocar tu lógica de Services, Auth, Supabase o middleware**.

Cada módulo lista:
- 📁 Archivo del codebase a editar
- 🎨 Pantalla del prototipo a replicar (abre `index.html`)
- 🧩 Componentes de `handoff/components/` a usar
- 📝 Cambios concretos

---

## 0 · Pre-migración

- [ ] `handoff/tokens.css` → `src/app/tokens.css`
- [ ] Asegúrate de que `src/app/globals.css` importe tokens (ver `globals.example.css`)
- [ ] Copia `handoff/components/` → `src/components/cc/`
- [ ] **Borra o renombra** tu `src/app/design-system.css` actual — sus variables (`--cc-bg-canvas`, role-admin, role-conserje, role-residente) ya no se usan
- [ ] En `src/components/BrandWordmark.tsx`, reemplaza por re-export: `export { Brand as BrandWordmark } from "@/components/cc/Brand";`

---

## 1 · Landing pública

📁 `src/app/page.tsx`
🎨 Prototipo: artboard **"Landing — hero editorial"**

**Cambios:**
- Reemplaza el hero actual ("Tu edificio, más humano…") por:
  - Eyebrow pill con badge `v 2.0` + microcopy de Coco AI
  - Display heading "**La buena vida en comunidad, sin papeleo.**" (con "buena vida" en italic copper)
  - Subhead, dos CTAs (Probar 30 días — primary ink / Demo en vivo — ghost), trust strip con 3 stats
- AppMockup → reemplaza por dos cards apiladas (gasto común pagado + Coco AI confirmando reserva) con leve rotación
- Elimina el "Bienestar comunitario inspirado en WELL v2" badge (no aporta)
- Quitar gradientes saturados y reemplazar por radial-gradient sutiles ivory→copper@7%

---

## 2 · Auth (login + signup)

📁 `src/app/(auth)/login/page.tsx` · `src/app/(auth)/signup/page.tsx`
🎨 Prototipo: artboard **"Ingreso"** y **"Bienvenida · onboarding"**

**Cambios:**
- Display heading "Ingresa a tu **comunidad**." (italic copper)
- Tabs Mail / RUT con segmented pill
- Input minimalista con label uppercase + focus copper
- "O continúa con" divider + 3 social buttons (Google · Apple · Clave Única)
- Onboarding: hero dark con gradiente cálido, card flotante "Coco AI te está esperando", dots de paginación

---

## 3 · Dashboard layout

📁 `src/app/(dashboard)/layout.tsx`
🎨 Prototipo: artboard **"Resumen del edificio"**

**Reemplaza el layout entero por:**

```tsx
import { AdminShell } from "@/components/cc/AdminShell";
import { useAuth } from "@/lib/authContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <AdminShell
      activeHref={/* deriva del pathname */}
      role={user.role}
      user={{ name: user.fullName, initials: user.initials, roleLabel: roleLabels[user.role] }}
      building={user.condoName}
      rightSubtitle={new Date().toLocaleString("es-CL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
    >
      {children}
    </AdminShell>
  );
}
```

> Si el dashboard residente es **mobile-first puro** (sin sidebar), mueve `AdminShell` solo a `(dashboard)/admin/layout.tsx` y `(dashboard)/concierge/layout.tsx`. Para residentes usa un layout simple full-width.

---

## 4 · Home residente

📁 `src/app/(dashboard)/home/page.tsx`
🎨 Prototipo: artboard **"Home — Martina"** (+ variante "Home · modo noche")
🧩 Ejemplo: `handoff/examples/HomePage.tsx`

**Cambios:**
- Tarjeta pendiente de pago en dark ink + halo copper en lugar del actual "Conectados" / amenities placeholders
- Greeting con DisplayHeading 46px y "Martina." italic copper
- Grid 2×1 de quick cards (reserva + agua) con tints semánticos
- Sticky pill "Pregúntale a Coco…" abajo

---

## 5 · Gastos comunes (residente)

📁 `src/app/(dashboard)/expenses/page.tsx`
🎨 Prototipo: artboards **"Gasto común"** + flujo **Pago · 3 pasos**
🧩 Ejemplo: `handoff/examples/ExpensesPage.tsx`

**Cambios:**
- Detalle del mes con desglose por categoría (administración, agua, electricidad, ascensores, conserjería, fondo)
- Histórico en barras stacked (último 5 meses), mes vigente en copper
- Flujo de pago: Revisar → Método (Webpay / crédito / transferencia / Klap) → Confirmación con boleta SII
- Mantén `ExpensesService` igual — solo cambia render

---

## 6 · Amenities (reservas)

📁 `src/app/(dashboard)/amenities/page.tsx` + sub-rutas
🎨 Prototipo: artboard **"Reserva amenidad"**

**Cambios:**
- Hero con striped placeholder (color por amenidad: piscina=copper, quincho=sage, gimnasio=plum)
- Stats row: disponibilidad % · tarifa · mín-máx hora
- Date strip 7 días + slots como cards con estados (libre/seleccionado/reservado)
- CTA fija "Confirmar viernes 30, 15:00"

---

## 7 · Votaciones

📁 `src/app/(dashboard)/votaciones/page.tsx`
🎨 Prototipo: artboards **"Votación · vista activa"** + flujo **Asamblea · 3 pasos**

**Cambios:**
- Card con tag "En sesión" (dot) + microcopy "cierra en X días"
- DisplayHeading con keyword en italic
- Quórum con marcador 75% (línea vertical copper sobre la barra)
- Opciones como cards expandidas con radio grande (selected = ink fill + check copper)
- Asamblea en vivo: contador 04:32, propuesta con pros/cons, documentos adjuntos
- Resultado: donut + breakdown + comprobante hash blockchain

---

## 8 · Feed / Comunicaciones (residente)

📁 `src/app/(dashboard)/feed/page.tsx` o `comunicaciones/`
🎨 Prototipo: artboard **"Anuncios"**

**Cambios:**
- Tabs Todos / Urgentes / Mantención / Comunidad con contador mono
- "Fijado" → card dark ink con halo amber + tag categoría
- Lista con left-bar vertical de color por categoría (sage / amber / rose / plum)
- Removidos los emojis de la versión actual

---

## 9 · Comunicaciones (admin publisher)

📁 `src/app/(dashboard)/comunicaciones/page.tsx`
🎨 Prototipo: artboard **"Publicar comunicación"**

**Cambios:**
- 2 columnas: form + preview
- Category chips con tints semánticos
- Inputs estilo editorial (label uppercase, input con border-ink en focus)
- Preview push real-time + alcance estimado por canal (App / Mail / WhatsApp)
- Lista "Enviadas esta semana" con % de lectura

---

## 10 · Chat (Coco AI)

📁 `src/app/(dashboard)/chat/page.tsx`
🎨 Prototipo: artboard **"Coco AI · chat"**

**Cambios:**
- Pantalla dark warm (#0E0B08 + grain copper)
- Hero "¿En qué te ayudo hoy, Martina?" con italic copper en "ayudo"
- Messages con cards embebidas (charts inline, listas, etc.)
- Suggestion chips contextuales
- Input rounded pill con send button en copper

---

## 11 · Social

📁 `src/app/(dashboard)/social/page.tsx`
🎨 Prototipo: artboard **"Plaza social"**

**Cambios:**
- Title editorial "Plaza social" (italic en "Plaza")
- Stories row con avatares mono (border dashed copper para "+ Tu")
- Posts con author + unit code + body + image striped placeholder
- Actions: heart (svg outlined) + comments + "Ver conversación →" en copper

---

## 12 · Directorio (residentes + servicios)

📁 `src/app/(dashboard)/directorio/page.tsx`
🎨 Prototipo: artboard **"Directorio"**

**Cambios:**
- Toggle Servicios / Vecinos como segmented control
- Grid 4 col de categorías con íconos line
- Lista de proveedores con badge "Recomendado por X vecinos" en copper
- Rating con ★ mono

---

## 13 · Marketplace

📁 `src/app/(dashboard)/marketplace/page.tsx`
🎨 Prototipo: artboard **"Marketplace vecinal"**

**Cambios:**
- Title editorial "Mercado" + chip "Vecinos"
- Featured item full-width con striped placeholder dark
- Grid 2-col de items con cover colorblock + categoría mono
- Tag "Verificado" sobre featured
- Botón nuevo item = pill copper en top-right

---

## 14 · Servicios / Solicitudes

📁 `src/app/(dashboard)/services/page.tsx`
🎨 Prototipo: artboard **"Solicitar servicio"**

**Cambios:**
- Flujo 3 pasos con StepDots
- Step 2: opciones con ícono tintado por categoría (filtración=blue, electricidad=amber, cerrajería=copper, áreas comunes=sage)
- Card "Adjuntar foto" dashed + opcional

---

## 15 · Profile

📁 `src/app/(dashboard)/profile/page.tsx`
🎨 Prototipo: artboard **"Mi perfil"**

**Cambios:**
- Avatar grande circular en ink con inicial en italic serif copper-soft
- Badge "Residente verificada" con dot sage
- Stats row (reservas / al día % / años aquí)
- Menús "Tu unidad" + "Cuenta" agrupados en lists con rows + chevron

---

## 16 · Notificaciones

📁 `src/app/(dashboard)/notifications/page.tsx` (o donde estén)
🎨 Prototipo: artboard **"Bandeja de entrada"**

**Cambios:**
- Title editorial "Hoy" italic
- Tabs Todas / Sin leer / Importantes con contador
- Lista con ícono tintado + dot copper si fresca
- Acción "Marcar todo" en copper

---

## 17 · Concierge

📁 `src/app/(dashboard)/concierge/page.tsx`
🎨 Prototipo: artboard **"Recepción · turno activo"**

**Cambios:**
- AdminShell con `role="conserje"` (acento ámbar)
- 4 KPIs (en edificio · encomiendas · incidencias · próximos retiros)
- Bitácora del turno como tabla con timestamp mono + tipo + estado
- Acceso rápido "Registrar nueva visita" → Manual / QR pre-autorizado
- Encomiendas por avisar con botón "Avisar" inline

---

## 18 · Residentes admin

📁 `src/app/(dashboard)/admin/residentes/page.tsx`
🎨 Prototipo: artboard **"Residentes · gestión"**

**Cambios:**
- Summary strip con métricas (Unidades / Activos / Al día / Pendientes / Vencidos / Sin app)
- Filtros pill (Todos / Propietarios / Arrendatarios / Inactivos)
- Tabla densa con avatar mono + estado de pagos en color (sage/amber/rose)
- Paginación mono al pie

---

## Resumen — qué se mantiene igual

✅ Todos los **Services** en `src/lib/api.ts` — sin cambios
✅ **Auth**, middleware, supabase client
✅ Estructura de rutas Next.js
✅ Hooks personalizados
✅ Capacitor config (mobile)

❌ Lo que se reemplaza es **solo render** — JSX, classes, styles.

---

## Checklist final

- [ ] `npm run build` sin errores
- [ ] `npx tsc --noEmit` limpio
- [ ] `npm run lint` sin warnings nuevos
- [ ] Visual diff contra prototipo (abre artboard al lado)
- [ ] Test responsive: móvil 390px / tablet 768px / desktop 1280px
- [ ] Modo noche solo en `/home` residente (no afecta resto)
- [ ] Iconos lucide consistentes en tamaño y stroke
