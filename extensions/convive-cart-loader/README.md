# CoCo · Cargador de carros

Extensión Manifest V3 que recibe una canasta de Convive Connect y agrega los
productos en la sesión real del comprador. La versión 0.3.11 conecta el botón de Convive, libera automáticamente cargas cuya pestaña fue cerrada, exige que el contador aumente cuando la tienda lo expone, evita falsos éxitos con el carro en cero, reemplaza el carro anterior sólo después de una confirmación explícita, reconoce el estado visual de carro vacío, abre el carro al terminar e incluye adaptadores
independientes para Lider, Jumbo, Santa Isabel, Unimarc, Tottus, aCuenta e
Irurzun.

## Alcance de seguridad

- Sólo acepta planes iniciados desde `conviveconnect.com`.
- Sólo navega y actúa en los dominios de supermercados declarados en el manifest.
- Cada URL exacta de producto se valida contra los dominios de su propia tienda.
- No lee contraseñas, medios de pago ni datos del checkout.
- No confirma pedidos, no reserva horarios y no ejecuta pagos.
- Pausa ante CAPTCHA, verificación humana, el modal de Términos de Puntos Cencosud o un modal real de entrega (el que cubre el centro de la pantalla) y permite reanudar. CoCo no acepta términos ni paga.
- Omite productos agotados con una nota visible y continúa con el resto de la lista.
- No confunde el widget permanente de despacho del header con una puerta de ubicación.
- Verifica que el carro cambió después de cada clic; un clic sin cambio no se reporta como éxito.
- Informa el contador observado antes y después sin asumir que cada producto crea una línea nueva.
- Vacía el carro anterior sólo cuando la persona confirma que quiere reemplazarlo. Si la tienda muestra copy de carro vacío (“Tu carro está vacío”) trata el carro como vacío y empieza a agregar, aunque el contador del header no parsea; no espera para siempre un API que nunca confirma 0. Si un panel de marketing tapa la ficha, cierra la X o pausa con Reanudar — nunca pulsa pagar ni “Inténtalo aquí”.
- Expone versión y capacidades para impedir que Convive use un cargador antiguo.
- Persiste el avance para continuar producto por producto y no detiene toda la lista por un faltante.

## Comportamiento por tienda

| Tienda | Flujo |
| --- | --- |
| Lider | Orchestra `updateItems` + ficha; ignora el skeleton; vacía leftovers por `getCart`. |
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
3. Si la persona eligió reemplazar, verifica y vacía el carro anterior antes de agregar el primer producto.
4. Recorre los productos, verifica cada alta, ajusta cantidades y conserva el avance.
5. Los faltantes —incluida una ficha agotada— se registran y la carga continúa con el siguiente producto.
6. Al finalizar, abre el carro oficial mediante el control visible de la tienda.
7. El comprador revisa disponibilidad, reemplazos, despacho y pago.
