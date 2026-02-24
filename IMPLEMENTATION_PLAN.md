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
