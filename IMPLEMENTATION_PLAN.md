# ComunidadConnect - Plan de Mejoras v3.0

## Estado: EN PROGRESO

### ✅ Bug Fix #1: TypeScript errors en mockData.ts
- `unitId` → `unit_id` en MOCK_WATER_READINGS (CORREGIDO)

---

## Fase 1: Bugs & Estabilidad (Punto 5)
- [x] Fix TypeScript errors en mockData.ts
- [x] Verificar build completo sin errores
- [x] Revisar hidratación de componentes

## Fase 2: Conectar Módulos a Supabase (Punto 1)
- [x] Marketplace → Supabase (tabla marketplace_items ya existe)
- [x] Amenities & Bookings → crear tablas + API
  - **Acción:** Verificar/crear las tablas `amenities` y `bookings` en el panel de Supabase usando la estructura de `schema.sql`.
  - **Acción:** Crear la clase `AmenitiesService` en `src/lib/api.ts` con los métodos `getAmenities()`, `getBookings(userId)`, y `createBooking()`.
  - **Acción:** Modificar `src/app/(dashboard)/amenities/page.tsx` para usar la API real en lugar de `MOCK_AMENITIES` y `MOCK_BOOKINGS`.
- [x] Votaciones/Polls → crear tablas + API
- [x] Gastos/Expenses → crear tablas + API
- [x] Feed/Anuncios → crear tablas + API

## Fase 3: UI/UX Polish (Punto 3)
- [x] Mejorar landing page (colores dinámicos con Tailwind v4)
- [x] Agregar micro-animaciones con framer-motion
- [x] Mejorar responsive en mobile
- [x] Loading states y skeleton screens
- [ ] Empty states bonitos
- [ ] SEO meta tags

## Fase 4: Deploy (Punto 4)
- [ ] Configurar Vercel deploy
- [ ] Variables de entorno para producción
- [ ] Headers de seguridad (ya tiene vercel.json)
- [ ] Dominio personalizado

---

# Plan de Implementación: Fase 8 - Conversión a App Móvil Nativa (Capacitor)

## Objetivo
Transformar el proyecto web Next.js maduro en una aplicación móvil instalable nativa para Android y iOS utilizando Ionic Capacitor, preservando todas las funcionalidades y el diseño responsivo ya desarrollado.

## Proposed Changes

### 1. Preparar Arquitectura Next.js para Exportación Estática
Capacitor envuelve un directorio estático (`out` folder) dentro de las aplicaciones nativas. Next.js debe ser configurado para esto.
#### [MODIFY] [next.config.ts](file:///C:/Users/pedro.moreno/.gemini/antigravity/scratch/comunidad-connect/next.config.ts)
> [!WARNING]
> Next.js Image Optimization nativo (`<Image>`) requiere un servidor Node.js activo por defecto. Para `output: 'export'`, debemos configurar un `loader` personalizado (ej. Supabase public URL builder) o pasar temporalmente a imágenes web estándar (unoptimized) si falla el build estático.
- Añadir `output: 'export'` a la configuración principal para permitir la generación del directorio estático.
- Desactivar temporalmente la optimización estricta de imágenes en caso de conflictos durante el renderizado estático (`unoptimized: true` en la config de images).

### 2. Integración Core de Capacitor
Capacitor actuará como el puente ("bridge") entre nuestros componentes web JS/React y la API nativa de los teléfonos.
- Instalar las dependencias de Capacitor en la raíz del proyecto web.
- Ejecutar `npx cap init` para generar el archivo maestro de configuración `capacitor.config.ts`.
- Configurar el `webDir` hacia `out` (carpeta generada por `npm run build` con static export de Next).

### 3. Integración de Plataformas Nativas Destino (Android/iOS)
Se agregarán localmente las carpetas de proyectos nativos "Wrappers".
- Añadir las plataformas destino: Ionic CLI (`@capacitor/android` y `@capacitor/ios`).
- Inyectar el código de nuestra app en dichas plataformas ejecutando `npx cap add android` y `npx cap add ios`.

## Verification Plan

### Manual Verification
1. **Comprobación de Exportación:** El Agente verificará si Next.js logra resolver todo el ruteo dinámico con `npm run build` en modo static export, revisando los logs por conflictos de `next/image` y arreglándolos sobre la marcha.
2. **Sincronización:** Validar ejecutar `npx cap sync` libre de errores tras compilar.
3. **Simulador Android (Opcional):** Si el USER cuenta con un emulador en su máquina Windows (`C:\Program Files\Android\Android Studio\`), la meta es abrir el proyecto Android sub-mapeado con `npx cap open android`. En su defecto, se garantizará que la estructura nativa esté intacta lista para compilar un `APK`/`AAB`.
