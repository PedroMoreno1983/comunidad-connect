/**
 * Lectura del total que la tienda muestra en su propio carro.
 *
 * Vive aparte de automation.mjs a proposito: ahi todo arrastra
 * selenium-webdriver, y esto es parseo de texto que conviene poder probar sin
 * levantar un navegador.
 *
 * Para Jumbo, Santa Isabel y Unimarc el total se consulta por la simulacion de
 * VTEX antes de comprar. Lider y aCuenta no exponen nada equivalente, asi que
 * este es el unico numero real que llegamos a ver de esas dos: la sesion ya
 * termina parada en el carro, solo faltaba leerlo.
 */

export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Frases con las que cada tienda rotula el total, de la mas especifica a la mas
 * generica. El orden importa y no es cosmetico: en el carro de Lider conviven
 * "Total estimado $9.175" y "agrega $20.825 para obtener despacho gratis", asi
 * que quedarse con el monto mas grande devolveria el numero equivocado. En
 * aCuenta pasa lo mismo con "Te faltan $16.895 para el pedido minimo".
 *
 * 'subtotal' va antes que 'total' porque lo contiene: si 'total' ganara, en
 * aCuenta se capturaria la cola de su propio subtotal.
 */
const TOTAL_ANCHORS = [
  'total estimado',
  'monto total',
  'total a pagar',
  'subtotal',
  'total',
];

/** Los montos chilenos usan el punto como separador de miles y no llevan decimales. */
function parseChileanAmount(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  const amount = Number(digits);
  return Number.isFinite(amount) ? amount : 0;
}

export function parseCartTotal(bodyText) {
  const text = normalize(bodyText);
  for (const anchor of TOTAL_ANCHORS) {
    // Hasta 24 caracteres entre el rotulo y el monto cubren ":", saltos de
    // linea y adornos como "(6 productos)", sin alcanzar la frase siguiente.
    const match = text.match(new RegExp(`${anchor}[^$]{0,24}\\$\\s?([\\d.,]+)`));
    const amount = match ? parseChileanAmount(match[1]) : 0;
    if (amount > 0) return amount;
  }
  return 0;
}
