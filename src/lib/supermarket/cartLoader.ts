/**
 * Versión del cargador de carro que Convive publica y espera encontrar
 * instalado.
 *
 * Es la única fuente de verdad: la web la muestra en la guía de activación y
 * `scripts/supermarket-cart-loader-integrity-qa.js` comprueba que coincida con
 * `extensions/convive-cart-loader/manifest.json`. Antes el número vivía
 * copiado a mano en la página, en el manifiesto y en dos scripts de QA, y al
 * subir la extensión a 1.0.0 la página siguió ofreciendo "0.3.11" durante
 * varios días.
 */
export const CART_LOADER_VERSION = '1.2.1';
