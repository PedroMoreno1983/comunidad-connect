# Adaptadores de carro por API

Este archivo documenta lo que se **observó contra las tiendas reales**, con fecha.
Nada acá es deducido ni plausible: si un dato no fue verificado, dice que no lo fue.

La regla que ordena todo esto: un adaptador sólo puede existir si la tienda
permite **releer el carro** después de cargarlo. Sin esa lectura no hay forma de
saber qué entró, y un carro que se informa lleno pero llega vacío es peor que no
cargarlo. Ver `cartApi` en `store-config.js`.

---

## Lider — `super.lider.cl`

Observado el **2026-08-16/17** en sesión anónima (`customer.isGuest: true`).

### Endpoint y operación

```
POST https://super.lider.cl/orchestra/graphql
mutation updateItems($input: UpdateItemsInput!, …)
```

No existe `/api/cart/items` ni `/api/graphql`: son las rutas que asumía una
versión anterior del cargador, y por eso nunca cargó nada. Lider corre sobre
Orchestra, el BFF GraphQL de Walmart.

### Variables

```json
{
  "input": {
    "cartId": "6a717650-99e4-11f1-a7e6-075c95fcd6c6",
    "items": [
      {
        "offerId": "821920",
        "quantity": 3,
        "usItemId": "00780433000693",
        "salesUnit": "EACH",
        "additionalInfo": {},
        "name": "Vino Tinto Merlot Reserva 13° Botella, 750 cc"
      }
    ],
    "enableLiquorBox": false,
    "skipPolicyCheck": false,
    "cartLeanMode": false,
    "enableCartSplitClarity": false,
    "features": ["lmpdel"]
  }
}
```

### Cabeceras

```
X-APOLLO-OPERATION-NAME: updateItems      ← sin esta, 400
x-o-platform-version: main-1.193.0-…      ← sin esta, 200 pero NO carga
x-o-gql-query: mutation updateItems
x-o-bu: LIDER-CL
x-o-platform: rweb
x-o-mart: B2C
x-o-vertical: OD
x-o-segment: oaoh
x-o-ccm: server
WM_MP: true
Content-Type: application/json
```

`x-o-platform-version` **no se debe fijar a mano**: cambia en cada release y se
lee de `<script id="release-metadata">`, que contiene
`{"appVersion":"main-1.193.0-…","dataCenter":"eus2"}`.

### Hechos verificados

**Carga varios productos en UNA llamada.** Se enviaron dos y la tienda devolvió
los dos, con sus cantidades exactas:

```
enviados:     00780433000693 x2 · 00780433000692 x3
confirmados:  00780433000692 x3 · 00780433000693 x2
subTotal:     $22.450
```

**Es un upsert, no reemplaza.** Enviando después un tercer producto solo, el
carro quedó con los tres y el subtotal subió a $26.940. No hay que leer ni
fusionar el carro previo: lo que la persona ya tenía se conserva.

**`usItemId` es exactamente nuestro `sku`**, con sus 14 dígitos y los ceros a la
izquierda. No hay que transformarlo — pasarlo por `Number` lo destruye.

**`cartId` es opcional.** Omitirlo devuelve igual un carro con su `id`. Importa
porque la cookie `cartId` no existe hasta que la persona tuvo un carro alguna
vez, que es justo el caso de quien nunca compró en Lider.

**La respuesta trae la lectura del carro**, que es lo que hace viable el
adaptador:

```
data.updateItems.lineItems[].quantity
data.updateItems.lineItems[].product.usItemId
data.updateItems.priceDetails.subTotal.value
```

**`errors` NO decide.** Las llamadas exitosas trajeron
`{"status":500,"message":"CE-SPENDMANAGER-MX/prod is NOT_IMPLEMENTED"}` en
`errors` y el carro quedó perfecto igual. Al revés también aplica: GraphQL
responde 200 aunque la operación falle. **Sólo `lineItems` prueba que un
producto entró.**

**El BFF sólo acepta sus propios documentos de query.** Una mutación mínima
nuestra, con las mismas variables y cabeceras, responde
`400 {"code":400,"message":"Something went wrong while processing the query."}`.
El documento mide 47.058 caracteres y está en el chunk `_app-*.js` que la ficha
referencia (servido desde `i5.walmartimages.cl`, con CORS abierto, así que la
propia página puede leerlo). Se delimita buscando `mutation updateItems` y
avanzando hasta la comilla de cierre no escapada. Se lee en caliente porque
caduca con cada release.

### `offerId`

La mutación lo exige y es distinto del SKU (`821920` para el SKU
`00780433000693`). Viene en el `__NEXT_DATA__` de cada ficha, junto a
`usItemId`, `salesUnit` y `name` — y no sólo el de la ficha: el carrusel de
relacionados aportó 23 pares en una sola página, así que recorrer fichas
converge mucho más rápido que una petición por producto.

Dos detalles que rompen las versiones ingenuas: el HTML viene minificado con los
atributos del `<script>` **sin comillas**, y el `usItemId` debe tratarse como
string. Las páginas de **búsqueda** no exponen `__NEXT_DATA__` parseable: el
`offerId` sólo se obtiene desde fichas de producto.

Implementado en `parseLiderOfferRefs` (`src/lib/supermarketLive.ts`). Para
completar el catálogo:

```bash
npm run supermarket:backfill-lider-offer-id -- --apply
```

Estado al 2026-08-17: **9.897 de 11.263 productos (88%)** con `offerId`.

### Implementación

`liderCartApi` en `store-config.js`, invocado desde `tryCartApi` en
`retailer-loader.js`, y cerrado por `REPORT_CART_API_RESULTS` en `background.js`.

Corre en el **content script**, no en el service worker: la llamada necesita la
cookie `cartId` y el bundle de la página. Desde el service worker haría falta el
permiso `cookies` en el manifest, que dispara una revisión nueva de Chrome Web
Store sin dar nada a cambio.

El adaptador devuelve `null` ante cualquier duda — sin `offerId`, sin documento,
sin `lineItems` — y entonces la carga sigue por el recorrido de la interfaz, que
verifica producto a producto. Nunca reporta lo que la tienda no devolvió.

---

## aCuenta — `www.acuenta.cl`

Sin observar. Es banner de Walmart Chile igual que Lider, así que lo esperable
es el mismo Orchestra con `x-o-bu` distinto, pero **eso es una hipótesis, no un
dato**, y no debe implementarse sin la misma captura.

## Tottus — `www.tottus.cl`

Plataforma Falabella, no VTEX ni Orchestra. Sin capturar.

## Jumbo, Santa Isabel, Unimarc

Plataforma VTEX. No necesitan adaptador de extensión si se arma el carro
servidor a servidor con la Checkout API, que devuelve lo que la tienda confirmó.
