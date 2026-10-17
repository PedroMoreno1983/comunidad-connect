# Modo oscuro: contraste — estado y pendientes

`ThemeProviders` usa `defaultTheme="system"`, así que un iPhone en modo oscuro recibe
la clase `.dark`. En `.dark`, `src/app/tokens.css` invierte `--cc-ink` (pasa a claro) y
`--cc-paper`/`--cc-ivory` (pasan a oscuro). Cualquier superficie fija clara con texto
`--cc-ink`, o superficie `--cc-ink` con `text-white`, queda sin contraste.

## Reglas
- Texto sobre una superficie que **siempre** es clara (`bg-white`, `bg-amber-50`, hex claro):
  `var(--cc-on-light)` / `text-on-light` (y `--cc-on-light-muted`). No cambia en dark.
- Superficie que debe seguir el tema: `bg-[var(--cc-paper)]` / `bg-[var(--cc-ivory)]`, no `bg-white`.
- Botón/insignia con fondo `var(--cc-ink)`: texto `var(--cc-paper)` (se invierte con el tema).
- Bloques que deben quedar siempre oscuros (héroes con foto): `var(--cc-carbon)` + texto claro fijo.
- Páginas o bloques diseñados sólo en paleta clara (hex fijos): clase `cc-force-light`
  en el contenedor. Dentro usa valores arbitrarios con los tokens `--cc` (p. ej. fondo `var(--cc-paper)`), no `bg-ivory`/`text-ink` (esas utilidades
  de `@theme` se resuelven en `:root`).
- `npm run qa:dark-contrast` (en CI) bloquea las dos combinaciones directas en un mismo tag.
  `node scripts/dark-contrast-qa.js --audit` lista además los `bg-white` sin color de texto.

## Pendiente (no cubierto por el QA, revisar a mano)
- El QA mira un tag a la vez: un hijo con `cc-text-primary`/`text-ink` dentro de un padre
  `bg-white`/`bg-*-50` no se detecta. Revisar con `--audit` y capturas.
- Superficies `bg-*-50` / `bg-*-100` de Tailwind (estados, alertas) con hijos `cc-text-*`
  sin variante `dark:` (≈ cientos de apariciones; muchas ya tienen `dark:`).
- `/onboarding`, `/support` y el banner de cookies quedaron fijos en claro con
  `cc-force-light`; si se quiere un diseño oscuro real, reemplazar los hex por tokens.
- `src/components/ui/Input.tsx` y `Toast.tsx` usan `bg-white text-slate-900` fijo:
  legibles, pero no siguen el tema.
- QR (`QRInvitationGenerator`, `ParkingAccessPassModal`) quedan blancos a propósito
  (lectura del código); su texto ya es `text-zinc-900`.
- Pantallas internas con `text-black` o hex oscuros fijos sobre superficies con tokens `--cc` no se auditaron
  una por una (búsqueda directa no encontró casos en un mismo tag).
- Contenedores con fondo `var(--cc-ink)` sin color propio y con hijos `var(--cc-paper)`
  (p. ej. `MaintenanceDashboard`, tooltip de `UnitStatusGrid`) se invierten bien; revisar
  visualmente.
