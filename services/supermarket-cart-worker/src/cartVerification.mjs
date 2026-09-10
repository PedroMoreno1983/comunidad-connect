function productKey(value) {
  try {
    const url = new URL(value);
    const id = url.pathname.split('/').filter(Boolean).at(-1);
    return /^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, '') : id;
  } catch { return ''; }
}

export function verifyDirectCart(url, mode, payload) {
  if (!Array.isArray(payload?.items)) return false;
  const target = new URL(url);
  const expected = new Map();
  const actual = new Map();
  let allAvailable = true;
  const add = (map, key, quantity) => map.set(key, (map.get(key) || 0) + Number(quantity));
  if (mode === 'vtex') {
    const ids = target.searchParams.getAll('sku');
    const quantities = target.searchParams.getAll('qty');
    const sellers = target.searchParams.getAll('seller');
    ids.forEach((id, i) => add(expected, `${id}:${sellers[i] || '1'}`, quantities[i]));
    payload.items.forEach(item => {
      add(actual, `${item.id}:${item.seller}`, item.quantity);
      if (item.availability && item.availability !== 'available') allAvailable = false;
    });
  } else if (mode === 'shopify') {
    target.pathname.split('/cart/')[1]?.split(',').forEach(line => {
      const [id, quantity] = line.split(':');
      add(expected, id, quantity);
    });
    payload.items.forEach(item => add(actual, String(item.variant_id), item.quantity));
  }
  return allAvailable
    && expected.size > 0
    && actual.size === expected.size
    && [...expected].every(([id, quantity]) => Number.isInteger(quantity) && quantity > 0 && actual.get(id) === quantity);
}

/** Compare actual cart quantities; a changing header is not evidence of an item. */
export function verifyLiderCart(expected, links) {
  const actual = new Map();
  for (const link of links) {
    const match = String(link.label || '').match(/,\s*(\d+)\s+en el carro\s*$/i);
    const key = productKey(link.href);
    // The cart renders image and title links for each line. Do not count twice.
    if (match && key) actual.set(key, Number(match[1]));
  }
  const wanted = new Map();
  for (const item of expected) {
    const key = productKey(item.productUrl);
    wanted.set(key, (wanted.get(key) || 0) + item.quantity);
  }
  const missingItems = expected.filter(item => {
    const key = productKey(item.productUrl);
    return !key || actual.get(key) !== wanted.get(key);
  }).map(item => item.name);
  const unexpectedProducts = [...actual.keys()].filter(key => !wanted.has(key));
  return {
    complete: expected.length > 0 && missingItems.length === 0 && unexpectedProducts.length === 0,
    verified: expected.length - missingItems.length,
    missingItems: [...new Set(missingItems)],
    unexpectedProducts,
  };
}
