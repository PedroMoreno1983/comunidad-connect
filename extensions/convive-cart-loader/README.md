# CoCo · Cargador de carros

Extensión Manifest V3 que recibe una canasta de Convive Connect y agrega los
productos en la sesión real del comprador en Lider.

## Alcance de seguridad

- Sólo acepta planes iniciados desde `conviveconnect.com`.
- Sólo puede navegar y actuar en dominios de Lider declarados en el manifest.
- No lee contraseñas, medios de pago ni datos del checkout.
- No confirma pedidos, no reserva horarios y no ejecuta pagos.
- Pausa ante CAPTCHA o verificación humana y permite reanudar.
- Persiste el avance para continuar la carga producto por producto.

## Instalación de prueba

1. Descomprime `convive-cart-loader.zip`.
2. Abre `chrome://extensions`.
3. Activa **Modo desarrollador**.
4. Selecciona **Cargar extensión sin empaquetar** y elige esta carpeta.
5. Vuelve a Convive Connect y recarga la página de Supermercado.

Para usuarios finales debe publicarse en Chrome Web Store. La publicación exige
la cuenta de desarrollador del titular de Convive Connect y la revisión de
Google; el código no puede saltarse ese proceso.

## Flujo

1. CoCo envía productos exactos, cantidades y URLs al puente de la extensión.
2. La extensión abre una única pestaña de Lider en la sesión del comprador.
3. Recorre los productos, agrega cantidades y conserva un registro de avance.
4. Los faltantes no detienen el resto del carro.
5. El comprador revisa disponibilidad, reemplazos, despacho y pago.

## Desarrollo

Los dominios y permisos se mantienen deliberadamente acotados. Antes de sumar
otro supermercado, se debe validar su flujo real y agregar un adaptador
independiente; no se debe declarar una tienda compatible usando selectores
genéricos no verificados.
