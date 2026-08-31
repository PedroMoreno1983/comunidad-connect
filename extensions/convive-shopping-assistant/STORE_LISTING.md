# Publicación oficial

## Nombre

CoCo · Asistente de Compras

## Descripción breve

Carga en tu supermercado la lista que comparaste en Convive Connect. Tú revisas, eliges despacho y pagas.

## Descripción detallada

CoCo · Asistente de Compras conecta el comparador de Convive Connect con la
sesión del supermercado que la persona ya usa en su navegador.

Al elegir una canasta, el asistente abre una sola pestaña, agrega los productos
uno por uno, verifica el cambio del carro y muestra cuáles entraron y cuáles
requieren atención. Funciona con Lider, Jumbo, Santa Isabel, Unimarc, Tottus,
aCuenta e Irurzun.

El asistente nunca confirma una compra, nunca elige el despacho y nunca ejecuta
pagos. La persona revisa precios, disponibilidad, reemplazos y condiciones
directamente en la tienda antes de continuar.

## Propósito único

Cargar y verificar en el carro del supermercado una lista iniciada
explícitamente por el usuario desde Convive Connect.

## Justificación de permisos

- `tabs`: abrir y reutilizar una única pestaña del supermercado durante la carga.
- `storage`: conservar el avance si la tienda navega, recarga o solicita un paso manual.
- Acceso a los dominios declarados: ejecutar exclusivamente el adaptador de cada
  uno de los siete supermercados compatibles.

No se solicita `<all_urls>`, historial, descargas, portapapeles, contraseñas ni
información de pago.

## Privacidad

- Política: `https://conviveconnect.com/privacy`
- La extensión recibe únicamente tienda, nombre del producto, cantidad, URL,
  SKU y, cuando corresponde, identificador de oferta.
- No lee contraseñas, tarjetas, direcciones de despacho ni datos del checkout.
- No vende ni comparte información de navegación.

## Instrucciones para revisión

1. Iniciar sesión en una cuenta de prueba de `https://conviveconnect.com`.
2. Abrir **Supermercado** y comparar una lista.
3. Elegir cualquiera de las siete cadenas.
4. Pulsar **Cargar compra** y confirmar el reemplazo del carro.
5. Comprobar la pestaña única del supermercado y el progreso visible.
6. No completar el pago: queda deliberadamente fuera del alcance.
