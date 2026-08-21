import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLiderOfferRefs } from '@/lib/supermarketLive';

/**
 * Contrato del cargador de carros.
 *
 * Existe por una regresión concreta: el cargador llamaba a `/api/cart/items` y
 * a una mutación GraphQL inventadas, daba por buena la respuesta con `res.ok`,
 * y si "acertaba" en la mitad de los productos marcaba TODOS como agregados.
 * Como estas tiendas son apps Next.js que responden 200 con HTML en rutas
 * inexistentes, el resultado era un carro vacío informado como listo.
 *
 * El contrato real de Lider está en
 * extensions/convive-cart-loader/ADAPTADORES.md, verificado contra la tienda.
 */

const EXTENSION_DIR = path.resolve(__dirname, '../../extensions/convive-cart-loader');

function extensionFile(name: string): string {
    return readFileSync(path.join(EXTENSION_DIR, name), 'utf8');
}

interface StoreConfig {
    hosts: string[];
    cartUrl?: string;
    addSelectors: string[];
    cartApi?: { load?: unknown };
    cartApiHosts?: string[];
}

function loadStoreConfigs(): Record<string, StoreConfig> {
    const scope: { CONVIVE_STORE_CONFIGS?: Record<string, StoreConfig> } = {};
    new Function('globalThis', extensionFile('store-config.js'))(scope);
    if (!scope.CONVIVE_STORE_CONFIGS) throw new Error('store-config.js no publicó CONVIVE_STORE_CONFIGS');
    return scope.CONVIVE_STORE_CONFIGS;
}

describe('store-config', () => {
    const configs = loadStoreConfigs();

    it('un adaptador de API sólo vale si devuelve el carro leído', () => {
        // La lectura es la única prueba de que el producto entró. Un adaptador
        // que sólo sabe agregar no puede distinguir éxito de fracaso.
        for (const [store, config] of Object.entries(configs)) {
            if (!config.cartApi) continue;
            expect(typeof config.cartApi.load, `${store}.cartApi.load debe ser función`).toBe('function');
            expect(config.cartUrl, `${store} con cartApi debe declarar cartUrl`).toBeTruthy();
        }
    });

    it('sólo Lider declara adaptador, y acotado a su dominio de carro', () => {
        // aCuenta y Tottus NO deben declararlo por parecido de plataforma:
        // sin captura propia sería una suposición.
        const conApi = Object.entries(configs).filter(([, config]) => config.cartApi).map(([store]) => store);
        expect(conApi).toEqual(['Lider']);
        expect(configs.Lider.cartApiHosts).toEqual(['super.lider.cl']);
    });

    it('toda tienda con carro declara a dónde llevar la pestaña al terminar', () => {
        // Sin cartUrl el cierre mandaba al usuario a google.com en vez de su carro.
        for (const [store, config] of Object.entries(configs)) {
            if (store === 'Irurzun') continue;
            expect(config.cartUrl, `${store} sin cartUrl`).toBeTruthy();
        }
    });
});

describe('retailer-loader', () => {
    const source = extensionFile('retailer-loader.js');

    it('no llama a endpoints de carro inventados', () => {
        expect(source).not.toContain('/api/cart/items');
        expect(source).not.toContain('AddItemToCart');
    });

    it('no declara una carga completa a partir de un umbral de aciertos', () => {
        expect(source).not.toContain('COMPLETE_BATCH_CART');
        expect(source).not.toMatch(/length\s*\*\s*0\.5/);
    });

    it('sigue verificando cada alta contra un cambio real del carro', () => {
        expect(source).toContain('additionWasVerified');
        expect(source).toContain('parseCartCount');
    });

    it('la carga por API sólo informa lo que la tienda devolvió', () => {
        expect(source).toContain('tryCartApi');
        expect(source).toContain('REPORT_CART_API_RESULTS');
        // Un Map vacío o ausente debe caer al recorrido por interfaz.
        expect(source).toContain('landed instanceof Map');
    });
});

describe('background', () => {
    const source = extensionFile('background.js');

    it('conserva el sku y el offerId que manda la web', () => {
        expect(source).toMatch(/sku:\s*safeText\(item\?\.sku/);
        expect(source).toMatch(/offerId:\s*safeText\(item\?\.offerId/);
    });

    it('no tiene un camino que marque todos los productos como agregados', () => {
        expect(source).not.toContain('COMPLETE_BATCH_CART');
    });

    it('cierra la carga por API con lo que la tienda confirmó', () => {
        expect(source).toContain('resultsFromConfirmation');
        expect(source).toContain('no confirmo este producto en el carro');
    });
});

/**
 * Fixture con la estructura real de super.lider.cl (2026-08-16): HTML
 * minificado y atributos del <script> SIN comillas.
 */
const NEXT_DATA = {
    props: {
        pageProps: {
            product: {
                usItemId: '00780433000693',
                offerId: '821920',
                salesUnit: 'EACH',
                name: 'Vino Tinto Merlot Reserva 13° Botella, 750 cc',
            },
            relacionados: [
                { usItemId: '00780433000692', offerId: '821916', salesUnit: 'EACH', name: 'Carmenere Reserva' },
                { usItemId: '00780433012111', offerId: '4523', salesUnit: 'EACH', name: 'Cabernet Reserva' },
            ],
        },
    },
};

function pageWith(data: unknown): string {
    return `<html><body><script id=__NEXT_DATA__ type=application/json>${JSON.stringify(data)}</script></body></html>`;
}

describe('parseLiderOfferRefs', () => {
    it('extrae los pares usItemId/offerId aunque el script no lleve comillas', () => {
        const refs = parseLiderOfferRefs(pageWith(NEXT_DATA));
        expect(refs).toHaveLength(3);
        expect(refs.find(ref => ref.usItemId === '00780433000693')?.offerId).toBe('821920');
    });

    it('conserva los ceros a la izquierda del usItemId', () => {
        // Es el mismo string que guardamos como sku; pasarlo por Number lo rompe.
        const refs = parseLiderOfferRefs(pageWith(NEXT_DATA));
        expect(refs.some(ref => ref.usItemId.startsWith('00'))).toBe(true);
    });

    it('aprovecha el carrusel: una ficha aporta varios pares, no sólo el suyo', () => {
        const refs = parseLiderOfferRefs(pageWith(NEXT_DATA));
        expect(refs.map(ref => ref.offerId)).toContain('821916');
        expect(refs.map(ref => ref.offerId)).toContain('4523');
    });

    it('ignora objetos que traen sólo uno de los dos identificadores', () => {
        // Guardar un producto a medias haría fallar la carga en silencio.
        const parcial = { props: { a: { usItemId: '111111' }, b: { offerId: '222' } } };
        expect(parseLiderOfferRefs(pageWith(parcial))).toEqual([]);
    });

    it('devuelve vacío sin __NEXT_DATA__ o con JSON inválido, sin lanzar', () => {
        expect(parseLiderOfferRefs('<html><body>nada</body></html>')).toEqual([]);
        expect(parseLiderOfferRefs('<script id=__NEXT_DATA__>{roto</script>')).toEqual([]);
    });
});
