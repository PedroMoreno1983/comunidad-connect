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
