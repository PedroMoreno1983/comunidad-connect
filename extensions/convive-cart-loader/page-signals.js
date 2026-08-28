(() => {
  /**
   * Señales de la ficha que el cargador tiene que leer igual en las 7 tiendas.
   *
   * Van aparte del DOM para poder probarlas sin montar Chrome: un widget de
   * despacho en el header no es un modal, y "¡Qué mal! Justo se agotó" no es
   * "no hay botón". Mezclar esas dos cosas dejaba TODA carga congelada en el
   * producto 1, con el overlay pidiendo ubicación aunque el carro sí se podía
   * llenar (reproducido 2026-08-27 en Tottus, Lider y aCuenta).
   */
  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  const TERMS_TEXT = [
    'actualizamos terminos y condiciones',
    'terminos y condiciones de puntos cencosud',
    'puntos cencosud',
    'no pudimos registrar tu aceptacion',
    'registrar tu aceptacion',
  ];

  const EMPTY_CART_TEXT = [
    'tu carro esta vacio',
    'tu carrito esta vacio',
    'carro esta vacio',
    'carrito esta vacio',
    'carro vacio',
    'carrito vacio',
    'no tienes productos en tu carro',
    'no tienes productos en tu carrito',
    'sin productos en tu carro',
    'sin productos en tu carrito',
    'no hay productos en tu carro',
    'no hay productos en tu carrito',
  ];

  const OUT_OF_STOCK_TEXT = [
    'justo se agoto',
    'que mal justo se agoto',
    'producto agotado',
    'agotado temporalmente',
    'sin stock',
    'no hay stock',
    'producto no disponible',
    'este producto no esta disponible',
    'este producto no se encuentra disponible',
    'out of stock',
    'currently unavailable',
  ];

  /**
   * Un overlay tapa la ficha si cubre el centro de la pantalla.
   *
   * Los selectores `class*=drawer` / `class*=modal` matchean el widget permanente
   * de "Despacho a domicilio · Retiro en tienda" del header. Ese bloque mide
   * ancho de página y poco alto, y NUNCA cubre el centro: no es una puerta de
   * ubicación. Un modal real de comuna/despacho sí cubre el centro.
   */
  function overlayIsBlocking(rect, viewport) {
    const width = Number(rect?.width) || 0;
    const height = Number(rect?.height) || 0;
    const left = Number(rect?.left) || 0;
    const top = Number(rect?.top) || 0;
    const vw = Number(viewport?.width) || 0;
    const vh = Number(viewport?.height) || 0;
    if (width < 240 || height < 160 || vw <= 0 || vh <= 0) return false;
    const cx = vw / 2;
    const cy = vh / 2;
    return left <= cx && left + width >= cx && top <= cy && top + height >= cy;
  }

  function overlayLooksLikeTerms(text) {
    const haystack = normalize(text);
    if (!haystack) return false;
    return TERMS_TEXT.some(fragment => haystack.includes(normalize(fragment)));
  }

  function overlayLooksLikeDelivery(text, locationText) {
    const haystack = normalize(text);
    if (!haystack) return false;
    return (locationText || []).some(fragment => haystack.includes(normalize(fragment)));
  }

  function textLooksOutOfStock(text) {
    const haystack = normalize(text);
    if (!haystack) return false;
    return OUT_OF_STOCK_TEXT.some(fragment => haystack.includes(normalize(fragment)));
  }

  /**
   * Copy nativo de carro vacío. Jumbo (2026-08-28) muestra "Tu carro está vacío"
   * con un panel de marketing ("Inténtalo aquí") mientras el contador del header
   * no parsea: eso no es un API que confirme 0, pero sí es el carro vacío.
   */
  function textLooksLikeEmptyCart(text) {
    const haystack = normalize(text);
    if (!haystack) return false;
    if (EMPTY_CART_TEXT.some(fragment => haystack.includes(normalize(fragment)))) return true;
    return /(?:^|\b)(?:tu )?(?:carro|carrito)(?: de compras)?(?: esta)? vacio\b/.test(haystack)
      || /(?:^|\b)(?:no tienes|sin|no hay) productos (?:en|dentro de) (?:tu )?(?:carro|carrito)\b/.test(haystack);
  }

  globalThis.CONVIVE_PAGE_SIGNALS = {
    normalize,
    EMPTY_CART_TEXT,
    OUT_OF_STOCK_TEXT,
    TERMS_TEXT,
    overlayIsBlocking,
    overlayLooksLikeDelivery,
    overlayLooksLikeTerms,
    textLooksLikeEmptyCart,
    textLooksOutOfStock,
  };
})();
