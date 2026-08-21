# CoCo · Cargador de carros

Extensión Manifest V3 que recibe una canasta de Convive Connect y agrega los
productos en la sesión real del comprador. Conecta el botón de Convive, abre una
única pestaña del supermercado, recorre la lista producto por producto
conservando el avance, e incluye adaptadores independientes para Lider, Jumbo,
Santa Isabel, Unimarc, Tottus, aCuenta e Irurzun.

Las capacidades que anuncia al sitio (`convive-bridge.js`) deben corresponder
siempre con lo que el código hace. Este README describió durante un tiempo un
vaciado del carro anterior y una comprobación del contador que ya no existían,
y la web las siguió dando por buenas.

## Alcance de seguridad

- Sólo acepta planes iniciados desde `conviveconnect.com`.
- Sólo navega y actúa en los dominios de supermercados declarados en el manifest.
- Cada URL exacta de producto se valida contra los dominios de su propia tienda.
- No lee contraseñas, medios de pago ni datos del checkout.
- No confirma pedidos, no reserva horarios y no ejecuta pagos.
- Pausa ante CAPTCHA, verificación humana o selección de entrega y permite reanudar.
- Expone versión y capacidades para impedir que Convive use un cargador antiguo.
- Persiste el avance para continuar producto por producto y no detiene toda la lista por un faltante.

### Lo que este cargador **no** hace

No vacía ni reemplaza el carro anterior de la tienda: la lista nueva se agrega
sobre lo que ya hubiera. El comprador debe revisar el carro antes de pagar.

## Comportamiento por tienda

| Tienda | Flujo |
| --- | --- |
| Lider | Ficha exacta o búsqueda; pausa ante el control humano de Walmart. |
| Jumbo | Ficha o búsqueda Cencosud; carga y ajusta cantidades. |
| Santa Isabel | Ficha o búsqueda Cencosud; carga y ajusta cantidades. |
| Unimarc | Pausa para elegir despacho/retiro cuando el sitio lo exige. |
| Tottus | Pausa ante Cloudflare; reanuda en la ficha exacta después de la validación humana. |
| aCuenta | Pausa para elegir despacho/retiro cuando el sitio lo exige. |
| Irurzun | Prepara el carro mayorista de cotización; no inventa un precio final. |

Los sitios externos pueden cambiar sus controles sin aviso. Por eso los
adaptadores y sus pruebas deben mantenerse por separado y nunca se debe asumir
éxito sólo porque el clic fue ejecutado.

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
2. La extensión abre una única pestaña del supermercado en la sesión del comprador.
3. Recorre los productos, ajusta cantidades y conserva el avance.
4. Los faltantes se registran y la carga continúa con el siguiente producto.
5. El comprador revisa disponibilidad, reemplazos, despacho y pago.
