# Deuda arquitectónica de la capa de datos

Plan para consolidar el acceso a datos de ComunidadConnect. Escrito tras medir
el estado real del repositorio, no por impresión: varias de las cifras que
circulaban sobrestimaban bastante el problema.

Las etapas están ordenadas para que cada una deje el proyecto en verde y sea
reversible por sí sola. **No conviene saltarse el orden**: la etapa 0 elimina
buena parte de lo que parecía trabajo de las siguientes.

---

## Estado medido

| Métrica | Antes de la etapa 0 | Ahora |
|---|---|---|
| `src/lib/api.ts` | 3.113 líneas, 22 servicios | barrel de reexports (~30 líneas, 21 servicios) |
| `src/lib/services/*.ts` (dominio) | no existía | un archivo por dominio, p. ej. `parking.ts` |
| `src/lib/services/supabaseServices.ts` | 1.043 líneas, 13 servicios | 424 líneas, 6 servicios |
| Duplicados vivos entre ambos | 1 (`PollService`) | 0 |
| Rutas API con Supabase inline | 51 de 78 | 51 de 78 |
| Tipos definidos fuera de `types.ts` | 171 en 92 archivos | 171 en 92 archivos |

Lo que **no** es un problema, y conviene no "arreglar": ninguna página ni
componente llama a Supabase directamente, y no hay un solo `any` en `src/`. Esas
dos reglas se cumplen.

---

## Etapa 0 — Borrar lo muerto ✅ hecha

Antes de mover código, medir qué está vivo.

Siete servicios no tenían **ni un solo consumidor** en todo el repositorio:
`AmenityService`, `AnnouncementService`, `ExpenseService`,
`ServiceRequestService`, `ReservationService` y `ChatService` en
`supabaseServices.ts`, más `ResidentFinanceService` en `api.ts`.

Eso disuelve solo tres de los cuatro duplicados que preocupaban: eran copias
muertas, no dos implementaciones compitiendo en producción.

## Etapa 1 — Unificar el duplicado real ✅ hecha

`PollService` era el único duplicado vivo, y `PollManager` usaba solo su
`getAll()`. No eran dos implementaciones de lo mismo sino dos vistas: la
administración necesita todas las votaciones y el residente las filtradas por
plazo. Se resolvió con `PollsService.getAllPolls()`.

---

## Etapa 2 — Partir `api.ts` por dominio ✅ hecha

**Problema.** 3.093 líneas y 21 servicios en un archivo hacen que cualquier
cambio choque en los merges y que las revisiones sean inmanejables.
`ParkingService` solo ya son 674 líneas; `SupermarketGroupService`, 266;
`AdminDashboardService`, 249.

**Cómo, sin tocar a los 39 consumidores.** Cada servicio vive en
`src/lib/services/<dominio>.ts` y `src/lib/api.ts` es un *barrel* que los
reexporta:

```ts
export { ParkingService } from './services/parking';
export { WaterService } from './services/water';
// …
```

Así `import { ParkingService } from '@/lib/api'` sigue funcionando en los 39
archivos. `AGENTS.md` y `CLAUDE.md` ya describen el barrel: la regla sigue
siendo "un solo lugar canónico y ninguna consulta suelta en las páginas", no
"un solo archivo".

**Riesgo:** bajo. Fue mover bloques y reexportar; `tsc` cubre importaciones
que se queden cortas.

## Etapa 3 — Disolver `supabaseServices.ts`

Los 6 servicios que quedan (`CondoFee`, `Invitation`, `Visitor`, `Package`,
`Concierge`, `Social`) **no tienen equivalente en `api.ts`**: no son duplicados,
solo están en el archivo equivocado. Con la etapa 2 hecha, cada uno se mueve a
su dominio (`services/finanzas.ts`, `services/conserjeria.ts`,
`services/social.ts`) y el archivo desaparece.

Aquí también van los tres tipos que hoy viven ahí y deberían estar en
`types.ts`: `ConciergeVisitorRow`, `ConciergePackageRow` y `ConciergeCaseRow`.

**Riesgo:** bajo. Son 10 importaciones que actualizar.

## Etapa 4 — Tipos a `types.ts`

171 definiciones repartidas en 92 archivos. No conviene un PR único de 92
archivos: hacerlo por dominio, aprovechando que la etapa 2 ya obliga a pasar por
cada uno.

Criterio para decidir qué se mueve: si el tipo describe **datos** (una fila, una
respuesta de API, una entidad del negocio) va a `types.ts`; si describe las
**props** de un componente, se queda donde está. Mover props a `types.ts` no
aporta nada y aleja la definición de su único uso.

Los peores casos por volumen son `agent-center/page.tsx` (9 definiciones,
incluidas respuestas de API) y las cuatro páginas de `admin/finanzas`.

## Etapa 5 — Rutas API (la más grande)

51 de 78 rutas construyen sus consultas a Supabase en línea y **ninguna** importa
`@/lib/api`. Esta es la parte que de verdad cuesta, y por eso va al final.

La razón por la que no se puede reutilizar `api.ts` tal cual es real, no
histórica: `api.ts` usa el cliente de navegador y las rutas necesitan un cliente
con la sesión del llamante (`getSupabaseUserClient`) o la service role key. Ya
hay 35 rutas usando `getAuthenticatedAgentProfile`, así que el patrón existe.

Propuesta: `src/lib/server/data/<dominio>.ts` con funciones que **reciben el
cliente como parámetro**, igual que se hizo al arreglar `SearchService` (ver
`src/lib/search.ts`). Eso permite que una misma consulta sirva a una ruta con
sesión de usuario y a un job con service role, sin duplicarla y sin ambigüedad
sobre qué permisos aplica.

**No hacerlo de golpe.** Migrar solo cuando una consulta esté repetida en dos
sitios o cuando ya haya que tocar la ruta por otro motivo. Una ruta corta con
una consulta que nadie más usa no gana nada por mudarse.

---

## Qué no está en el plan

**Los dos design systems** (`components/cc` con estilos en línea y
`components/ui` con cva+Tailwind, mezclados en 33 páginas) son deuda de diseño,
no de datos. Unificarlos es una decisión de producto sobre la identidad visual y
debería planificarse aparte.

**`next/dynamic`** no se usa en ningún sitio y el 72% de las páginas son
`'use client'`. Es una oportunidad de rendimiento real, pero se mide y se ataca
por separado: conviene partir de números de bundle, no de intuición.
