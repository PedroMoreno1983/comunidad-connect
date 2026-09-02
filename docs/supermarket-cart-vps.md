# Carros de supermercado en VPS

Convive abre una sesión web temporal en el VPS para el supermercado elegido. La misma ruta funciona para Jumbo, Santa Isabel, Lider, Unimarc, Tottus, aCuenta e Irurzun; el cliente no instala una extensión ni una app.

## Flujo

1. `/api/supermarket/cart-handoff` valida al usuario de Convive y resuelve los enlaces directos disponibles.
2. El worker valida nuevamente el JWT contra Supabase, restringe todas las URL a los dominios oficiales y reserva uno de tres navegadores aislados.
3. El navegador carga y verifica los productos. Si la tienda exige ubicación, login o CAPTCHA, la sesión pausa y deja el control al usuario en la misma pestaña.
4. Al terminar se abre el carro. El usuario revisa cantidades, sustituciones y despacho antes de pagar.
5. Al cerrar o expirar la sesión, WebDriver termina y el contenedor del navegador se reinicia para eliminar cookies y datos del perfil.

## Límites y seguridad

- Tres sesiones simultáneas y una sesión activa por usuario.
- Seis aperturas por usuario y hora; máximo 200 líneas por lista.
- URL de visualización aleatoria, convertida inmediatamente en cookie `HttpOnly`, `Secure` y `SameSite=Lax`.
- WebDriver y noVNC no publican puertos; solo el worker escucha en `127.0.0.1:4387`.
- El proxy de Nginx no registra accesos de esta ruta, para no conservar tokens temporales.
- El worker no completa pagos, no rellena credenciales y no registra teclas, contraseñas ni datos bancarios.
- Solo se aceptan URLs HTTPS de los dominios exactos de cada supermercado.

## Operación

El servicio vive en `/opt/convive-cart-worker` y se administra desde allí:

```bash
docker compose ps
docker compose logs --tail=100 worker
curl -fsS http://127.0.0.1:4387/health
```

La ruta pública es `https://radareducativo.datawiseconsultoria.com/convive-cart/`. El bloque de Nginx versionado está en `services/supermarket-cart-worker/deploy/nginx-location.conf`.

## Cómo verificar si una tienda nos deja entrar

**No uses `curl` para responder esa pregunta.** Da respuestas falsas en las dos direcciones, y las dos aparecieron al probar desde el VPS el 2026-09-02:

- **Falso bloqueo.** Tottus le devuelve 403 con `cf-mitigated: challenge` a `curl`, pero le sirve la página completa a un Chromium real desde la *misma* IP. Cloudflare no filtraba por reputación de IP sino por huella TLS y ausencia de JavaScript. Quien mire solo el `curl` va a concluir que hace falta un proxy residencial que en realidad no hace falta.
- **Falso permiso.** aCuenta falla en `curl` de Linux con error 60, porque su servidor manda el certificado hoja dos veces y omite el intermedio de GlobalSign. Chrome lo resuelve descargando ese intermedio por su cuenta (AIA fetching), así que entra sin problema. El `curl` de Windows también entra, porque usa el almacén de Schannel. El `Verify return code: 21` es idéntico desde el VPS y desde un escritorio, o sea que no es el CA bundle del servidor: es el de ellos.

La forma correcta es abrir un Chromium real por WebDriver y mirar el título y el peso de la página. Resultado de esa verificación desde el VPS: Tottus, aCuenta y Lider sirven su página completa, sin desafío de Cloudflare ni de PerimeterX.

**Ojo con los slots al probar.** `SE_DRAIN_AFTER_SESSION_COUNT: 1` recicla cada navegador después de una sola sesión, y `SE_NODE_MAX_SESSIONS: 1` deja un solo espacio por contenedor. Una sesión que se abre y no se cierra deja ese contenedor inutilizable hasta que expire `SESSION_HARD_SECONDS` (90 minutos). Cierra siempre con `DELETE /session/:id`, o reinicia con `docker compose restart browser-N`.

## Lo que todavía no está verificado

Que las tiendas sirvan su página no garantiza que la automatización agregue productos: los selectores de "agregar" son los mismos que usaba el WebView y se rompen igual cuando una tienda cambia su HTML. Falta una carga de carro completa de punta a punta, que requiere un JWT de un usuario real de Convive.
