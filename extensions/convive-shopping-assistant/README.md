# CoCo · Asistente de Compras

Extensión Manifest V3 para cargar una canasta de Convive Connect dentro de la
sesión real del comprador en Lider, Jumbo, Santa Isabel, Unimarc, Tottus,
aCuenta e Irurzun.

Esta es una aplicación nueva y publicable en Chrome Web Store/Edge Add-ons. No
se distribuye como ZIP desde Convive Connect. La instalación para usuarios
finales debe ocurrir desde la tienda oficial del navegador.

## Límites

- Solo recibe listas desde `conviveconnect.com` o los puertos locales de prueba.
- Solo actúa en los siete dominios declarados en `manifest.json`.
- Valida que el carro cambie; un clic sin evidencia no se informa como éxito.
- Pausa ante inicio de sesión, ubicación, CAPTCHA o confirmaciones de la tienda.
- Nunca acepta términos, elige despacho, confirma pedidos ni ejecuta pagos.
- Reemplaza el carro anterior únicamente después de confirmación explícita.

## Flujo

1. La persona compara su lista en Convive Connect.
2. Pulsa **Cargar compra** y confirma si quiere reemplazar el carro anterior.
3. El asistente abre una sola pestaña de la tienda seleccionada.
4. Agrega y verifica cada producto, conservando el avance entre navegaciones.
5. Abre el carro oficial para que la persona revise, elija despacho y pague.

## Publicación

La carpeta completa se carga como paquete Manifest V3 en la cuenta oficial de
Chrome Web Store y, si se desea, Edge Add-ons. La revisión de la tienda y la
cuenta del titular son requisitos externos; no deben sustituirse por una
descarga directa desde el sitio.
