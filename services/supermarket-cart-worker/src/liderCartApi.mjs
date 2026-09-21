/**
 * Carga del carro de Lider por su propia API, desde el navegador remoto.
 *
 * Lider corre sobre el BFF "Orchestra" de Walmart y expone la mutacion
 * `updateItems`, que fija la cantidad de varios productos en UNA llamada y
 * devuelve el carro resultante (`lineItems`). Eso cambia dos cosas frente a
 * recorrer las fichas y hacer clic en "Agregar":
 *
 *   1. Una sola navegacion a super.lider.cl en vez de una por producto. Cada
 *      navegacion es una oportunidad para el anti-bot (PerimeterX/HUMAN); con
 *      una, el desafio humano se resuelve a lo mas una vez.
 *   2. La respuesta trae el carro real. Un producto que la tienda no devuelve
 *      NO entro, aunque el HTTP haya sido 200 y `errors` venga vacio. Solo
 *      `lineItems` decide.
 *
 * El script se ejecuta con `driver.executeAsyncScript` dentro de la pagina, asi
 * que la llamada sale con las cookies de la sesion y como una peticion normal
 * del sitio: no pasa por CDP ni por clics sinteticos.
 *
 * Contrato observado (2026-08-17, super.lider.cl), detalles no obvios:
 *   * `usItemId` es exactamente nuestro `sku`, ceros a la izquierda incluidos.
 *   * `offerId` es otro identificador y tambien es obligatorio.
 *   * Sin `x-o-platform-version` responde 200 pero no carga nada; el valor
 *     cambia en cada release y se lee de `<script id="release-metadata">`.
 *   * Orchestra solo acepta sus propios documentos GraphQL: el de `updateItems`
 *     mide ~47.000 caracteres y cambia por release, asi que se lee en caliente
 *     del bundle `_app-*.js` del sitio en vez de fijarlo aca.
 *   * `cartId` es opcional: omitiendolo la tienda resuelve o crea el carro.
 */

export const LIDER_CART_API_URL = 'https://super.lider.cl/';
export const LIDER_CART_API_HOSTS = ['super.lider.cl'];
const DEFAULT_SALES_UNIT = 'EACH';

/** Ceros a la izquierda fuera: `00000003448847` y `3448847` son el mismo producto. */
export function normalizeItemKey(value) {
  const key = String(value ?? '').trim();
  return /^\d+$/.test(key) ? key.replace(/^0+(?=\d)/, '') : key;
}

/** Solo puede ir por API lo que trae ambos identificadores; el resto va por la ficha. */
export function apiEligibleItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => item?.sku && item?.offerId);
}

/**
 * Lo que la pagina necesita para llamar a la mutacion. Se serializa antes de
 * cruzar al navegador, asi que solo viajan strings y numeros.
 */
export function apiRequestItems(items) {
  return apiEligibleItems(items).map(item => ({
    offerId: String(item.offerId),
    quantity: Number(item.quantity) || 1,
    usItemId: String(item.sku),
    salesUnit: String(item.salesUnit || DEFAULT_SALES_UNIT),
    name: String(item.name || ''),
  }));
}

/**
 * Traduce la respuesta cruda de `updateItems` a un mapa sku -> cantidad leida.
 * Devuelve null cuando la respuesta no trae el carro: sin esa lectura no hay
 * forma de saber que entro y no se asume nada.
 */
export function parseLiderCartResponse(payload) {
  const lineItems = payload?.data?.updateItems?.lineItems;
  if (!Array.isArray(lineItems)) return null;
  const landed = new Map();
  for (const lineItem of lineItems) {
    const key = normalizeItemKey(lineItem?.product?.usItemId);
    const quantity = Number(lineItem?.quantity) || 0;
    if (key && quantity > 0) landed.set(key, (landed.get(key) || 0) + quantity);
  }
  return landed;
}

/**
 * Cruza lo pedido contra lo que el carro devolvio. `updateItems` es un upsert
 * que FIJA la cantidad, asi que lo esperado es exactamente la cantidad pedida;
 * menos que eso es stock limitado y se informa, no se da por bueno.
 */
export function confirmLiderItems(items, landed) {
  const confirmed = [];
  const unconfirmed = [];
  for (const item of apiEligibleItems(items)) {
    const quantity = landed?.get(normalizeItemKey(item.sku)) || 0;
    if (quantity >= item.quantity) {
      confirmed.push({ item, quantity });
      continue;
    }
    unconfirmed.push({
      item,
      quantity,
      detail: quantity > 0
        ? `Lider dejo ${quantity} de ${item.quantity} unidades; revisa este producto en el carro.`
        : 'Lider no confirmo este producto en el carro.',
    });
  }
  return { confirmed, unconfirmed };
}

/**
 * Se ejecuta DENTRO de la pagina de super.lider.cl. Recibe los items como
 * `arguments[0]` y el callback de Selenium como ultimo argumento; siempre lo
 * llama, con `{ ok: true, payload }` o `{ ok: false, reason }`, para que el
 * worker nunca quede esperando.
 *
 * Es texto plano a proposito: no puede cerrar sobre nada de este modulo.
 */
export const LIDER_CART_API_SCRIPT = String.raw`
const items = arguments[0];
const done = arguments[arguments.length - 1];
(async () => {
  const readCookie = name => {
    const prefix = name + '=';
    const hit = String(document.cookie || '').split('; ').find(part => part.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : '';
  };

  const metadata = document.getElementById('release-metadata');
  if (!metadata) return done({ ok: false, reason: 'sin release-metadata' });
  let appVersion = '';
  try { appVersion = String(JSON.parse(metadata.textContent).appVersion || ''); } catch {}
  if (!appVersion) return done({ ok: false, reason: 'sin appVersion' });

  const bundle = [...document.querySelectorAll('script[src]')]
    .map(script => script.src)
    .find(url => url.includes('_app-'));
  if (!bundle) return done({ ok: false, reason: 'sin bundle _app-' });
  const bundleResponse = await fetch(bundle);
  if (!bundleResponse.ok) return done({ ok: false, reason: 'bundle ' + bundleResponse.status });
  const source = await bundleResponse.text();
  const start = source.indexOf('mutation updateItems');
  if (start < 0) return done({ ok: false, reason: 'sin mutation updateItems en el bundle' });
  const delimiter = source[start - 1];
  let query = '';
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === delimiter && source.charCodeAt(index - 1) !== 92) {
      query = source.slice(start, index);
      break;
    }
  }
  if (!query) return done({ ok: false, reason: 'documento updateItems truncado' });

  const cartId = readCookie('cartId');
  const response = await fetch('/orchestra/graphql', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-APOLLO-OPERATION-NAME': 'updateItems',
      'x-o-gql-query': 'mutation updateItems',
      'x-o-platform-version': appVersion,
      'x-o-platform': 'rweb',
      'x-o-bu': 'LIDER-CL',
      'x-o-mart': 'B2C',
      'x-o-vertical': 'OD',
      'x-o-segment': 'oaoh',
      'x-o-ccm': 'server',
      WM_MP: 'true',
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          ...(cartId ? { cartId } : {}),
          items: items.map(item => ({
            offerId: item.offerId,
            quantity: item.quantity,
            usItemId: item.usItemId,
            salesUnit: item.salesUnit,
            additionalInfo: {},
            name: item.name,
          })),
          enableLiquorBox: false,
          skipPolicyCheck: false,
          cartLeanMode: false,
          enableCartSplitClarity: false,
          features: ['lmpdel'],
        },
      },
    }),
  });
  const payload = await response.json().catch(() => null);
  done({ ok: true, status: response.status, payload });
})().catch(error => done({ ok: false, reason: String(error && error.message || error) }));
`;
