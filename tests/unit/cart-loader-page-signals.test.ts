import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * El cargador se congelaba en el producto 1 en TODAS las tiendas porque:
 *  1. El widget permanente de despacho del header ("Despacho a domicilio ·
 *     Retiro en tienda") se leía como un modal de ubicación.
 *  2. Una ficha agotada ("¡Qué mal! Justo se agotó") no se omitía, así que
 *     la lista entera moría esperando un botón de agregar.
 *
 * Estas funciones viven en page-signals.js precisamente para poder pinchar
 * esos dos casos sin montar Chrome.
 */

function loadSignals() {
  const source = readFileSync(
    path.resolve(__dirname, '../../extensions/convive-cart-loader/page-signals.js'),
    'utf8',
  );
  const scope: {
    CONVIVE_PAGE_SIGNALS?: {
      overlayIsBlocking: (rect: object, viewport: object) => boolean;
      overlayLooksLikeDelivery: (text: string, locationText: string[]) => boolean;
      overlayLooksLikeTerms: (text: string) => boolean;
      textLooksLikeEmptyCart: (text: string) => boolean;
      textLooksOutOfStock: (text: string) => boolean;
      OUT_OF_STOCK_TEXT: string[];
    };
  } = {};
  vm.createContext(scope);
  new vm.Script(source, { filename: 'page-signals.js' }).runInContext(scope);
  if (!scope.CONVIVE_PAGE_SIGNALS) throw new Error('page-signals.js no publicó CONVIVE_PAGE_SIGNALS');
  return scope.CONVIVE_PAGE_SIGNALS;
}

const LOCATION_TEXT = [
  'ingresa tu ubicacion',
  'como quieres recibir tu compra',
  'despacho a domicilio retiro en tienda',
];

describe('puerta de ubicación', () => {
  const signals = loadSignals();
  const viewport = { width: 1280, height: 800 };

  it('ignora el widget de despacho del header, que no cubre el centro', () => {
    // Barra permanente tipo Tottus/Lider/aCuenta: ancho de página, 72 px de alto.
    expect(signals.overlayIsBlocking(
      { left: 0, top: 0, width: 1280, height: 72 },
      viewport,
    )).toBe(false);
  });

  it('ignora un drawer que cuelga del header y no llega al centro', () => {
    expect(signals.overlayIsBlocking(
      { left: 800, top: 56, width: 360, height: 240 },
      viewport,
    )).toBe(false);
  });

  it('reconoce el modal real de comuna/despacho, que cubre el centro', () => {
    expect(signals.overlayIsBlocking(
      { left: 340, top: 120, width: 600, height: 520 },
      viewport,
    )).toBe(true);
  });

  it('el copy del header sí es de entrega, pero solo pausa si el overlay es bloqueante', () => {
    expect(signals.overlayLooksLikeDelivery(
      'Despacho a domicilio Retiro en tienda',
      LOCATION_TEXT,
    )).toBe(true);
    expect(signals.overlayLooksLikeDelivery(
      'Agregar al carro Avena Tradicional',
      LOCATION_TEXT,
    )).toBe(false);
  });
});

describe('modal de términos Cencosud', () => {
  const signals = loadSignals();

  it('reconoce el overlay de Puntos Cencosud que congelaba Santa Isabel en el item 1', () => {
    expect(signals.overlayLooksLikeTerms(
      'Actualizamos Términos y Condiciones de Puntos Cencosud. No pudimos registrar tu aceptación. Reintentar',
    )).toBe(true);
    expect(signals.overlayLooksLikeTerms('Agregar al carro Yogurt Batido Colun 125 g')).toBe(false);
  });
});

describe('ficha agotada', () => {
  const signals = loadSignals();

  it('reconoce el copy de Tottus que congelaba la carga en el item 1', () => {
    expect(signals.textLooksOutOfStock('¡Qué mal! Justo se agotó')).toBe(true);
    expect(signals.textLooksOutOfStock('Avena Tradicional Tottus 700 gr')).toBe(false);
  });

  it('reconoce otras frases de las cadenas partner', () => {
    expect(signals.textLooksOutOfStock('Producto agotado')).toBe(true);
    expect(signals.textLooksOutOfStock('Sin stock')).toBe(true);
    expect(signals.textLooksOutOfStock('Producto no disponible')).toBe(true);
    expect(signals.textLooksOutOfStock('Out of stock')).toBe(true);
  });

  it('no marca agotado un PDP que todavía se puede agregar', () => {
    expect(signals.textLooksOutOfStock('Agregar al carro · $1.990 · 700 gr')).toBe(false);
  });
});

describe('carro vacío nativo', () => {
  const signals = loadSignals();

  const STORE_EMPTY_COPY: Record<string, string[]> = {
    Jumbo: ['Tu carro está vacío', 'Tu carro está vacío. Inténtalo aquí'],
    'Santa Isabel': ['Tu carro está vacío', 'No tienes productos en tu carro'],
    Unimarc: ['Tu carrito está vacío', 'Sin productos en tu carrito'],
    Lider: ['Tu carrito está vacío', 'No hay artículos en tu carrito'],
    aCuenta: ['Tu carrito está vacío', 'No hay artículos en el carrito'],
    Tottus: ['Tu carro está vacío', 'Tu bolsa de compras está vacía'],
    Irurzun: ['Your cart is empty', 'Tu carrito está vacío'],
  };

  it('reconoce el copy de vacío de las 7 tiendas y arranca sin esperar un API de conteo', () => {
    expect(Object.keys(STORE_EMPTY_COPY).sort()).toEqual(
      ['Irurzun', 'Jumbo', 'Lider', 'Santa Isabel', 'Tottus', 'Unimarc', 'aCuenta'],
    );
    for (const [store, phrases] of Object.entries(STORE_EMPTY_COPY)) {
      for (const phrase of phrases) {
        expect(signals.textLooksLikeEmptyCart(phrase), `${store}: ${phrase}`).toBe(true);
      }
    }
  });

  it('no trata un PDP ni Términos Cencosud como carro vacío', () => {
    expect(signals.textLooksLikeEmptyCart('Pack 12 un. Yogurt Colun Sin Azúcar 120 g')).toBe(false);
    expect(signals.textLooksLikeEmptyCart('Agregar al carro · $1.990')).toBe(false);
    expect(signals.overlayLooksLikeTerms('Tu carro está vacío. Inténtalo aquí')).toBe(false);
    expect(signals.overlayLooksLikeTerms('Tu carrito está vacío')).toBe(false);
  });
});
