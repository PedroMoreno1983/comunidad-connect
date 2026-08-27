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
    emptyCartLabels?: string[];
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

describe('handshake de la web', () => {
    it('espera lo suficiente a que el service worker de la extensión despierte', () => {
        // 1.5s marcaba TODAS las tiendas como "sin extensión" y se comía el auto-load.
        const hook = readFileSync(
            path.resolve(__dirname, '../../src/hooks/useSupermarketCartLoader.ts'),
            'utf8',
        );
        const timeout = hook.match(/READY_TIMEOUT_MS = ([0-9_]+)/);
        expect(timeout).not.toBeNull();
        expect(Number(timeout?.[1].replace(/_/g, ''))).toBeGreaterThanOrEqual(4_000);
        expect(readFileSync(
            path.resolve(__dirname, '../../src/components/resident/supermarket/CartLoaderButton.tsx'),
            'utf8',
        )).toContain("availability === 'checking'");
        expect(readFileSync(
            path.resolve(__dirname, '../../src/components/resident/supermarket/CartLoaderButton.tsx'),
            'utf8',
        )).toContain('if (handshakePending) return');
    });
});

describe('store-config', () => {
    const configs = loadStoreConfigs();

    it('un adaptador de API sólo vale si devuelve el carro leído', () => {
        // La lectura es la única prueba de que el producto entró. Un adaptador
        // que sólo sabe agregar no puede distinguir éxito de fracaso.
        for (const [store, config] of Object.entries(configs)) {
            if (!config.cartApi) continue;
            expect(typeof config.cartApi.load, `${store}.cartApi.load debe ser función`).toBe('function');
        }
    });

    it('sólo Lider declara adaptador, y acotado a su dominio de carro', () => {
        // aCuenta y Tottus NO deben declararlo por parecido de plataforma:
        // sin captura propia sería una suposición.
        const conApi = Object.entries(configs).filter(([, config]) => config.cartApi).map(([store]) => store);
        expect(conApi).toEqual(['Lider']);
        expect(configs.Lider.cartApiHosts).toEqual(['super.lider.cl']);
    });

    it('toda tienda declara cómo vaciar el carro anterior', () => {
        // Sin emptyCartLabels la lista nueva se mezcla con la anterior y deja un
        // carro que la persona no pidió.
        for (const [store, config] of Object.entries(configs)) {
            expect(config.emptyCartLabels?.length, `${store} sin emptyCartLabels`).toBeGreaterThan(0);
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

    it('no confunde una lista de resultados con una ficha de producto', () => {
        // Regresion real (Santa Isabel, 2026-08-18): la heuristica era
        // `initialAddControl && document.querySelector('h1')`, y una busqueda
        // tiene ambas cosas. El cargador pulsaba el PRIMER "Agregar" de 40 y
        // reportaba como exito un producto que la persona no pidio.
        // Ni el <h1> (lo tiene una lista de resultados) ni "un solo boton de
        // agregar" (una ficha de Jumbo tiene 32 por los carruseles) sirven.
        // La ruta si es inequivoca en las seis cadenas.
        expect(source).toContain('isProductDetailPage');
        expect(source).not.toMatch(/looksLikeProductPage = Boolean\(initialAddControl/);
        expect(source).not.toContain('visibleAddControlCount(config) === 1');
    });

    it('no agrega nada si no pudo abrir la ficha exacta', () => {
        // Agregar "algo parecido" es peor que no agregar: la persona paga otro
        // producto sin enterarse.
        expect(source).toContain('No se pudo abrir la ficha exacta');
    });

    it('la carga por API sólo informa lo que la tienda devolvió', () => {
        expect(source).toContain('tryCartApi');
        expect(source).toContain('REPORT_CART_API_RESULTS');
        // Un Map vacío o ausente debe caer al recorrido por interfaz.
        expect(source).toContain('landed instanceof Map');
    });

    it('no cierra la carga por API si falta sku u offerId en algún producto', () => {
        // Si el lote se filtra a los que sí tienen identificadores, REPORT_CART_API_RESULTS
        // marca el resto como failed y salta el recorrido por interfaz: falla en
        // todas las tiendas que caen a ese camino.
        expect(source).toMatch(/items\.some\(entry => !entry\.sku \|\| !entry\.offerId\)/);
        expect(source).not.toMatch(/filter\(entry => entry\.sku && entry\.offerId\)/);
    });

    it('no pausa por el widget de despacho del header: solo por un overlay que cubre el centro', () => {
        // Regresión 2026-08-27: escanear todo class*=drawer con "despacho a
        // domicilio retiro en tienda" congelaba Tottus, Lider y aCuenta en el
        // item 1, con el CTA de ubicación y los checkboxes vacíos.
        expect(source).toContain('PAGE_SIGNALS.overlayIsBlocking');
        expect(source).toContain('blockingOverlay()');
        expect(source).not.toMatch(
            /querySelectorAll\(\s*'dialog,\[role="dialog"\],\[aria-modal="true"\],\[class\*="modal"\],\[class\*="Modal"\],\[class\*="drawer"\],\[class\*="Drawer"\]'\s*\)\]\.filter\(isVisible\)/,
        );
    });

    it('omite una ficha agotada y sigue con el resto de la lista', () => {
        expect(source).toContain('productIsOutOfStock');
        expect(source).toContain('está agotado');
        expect(source).toContain('Se omitió y se continúa con el resto');
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

    it('un producto fallido puede cerrarse sin reclamo previo', () => {
        // Regresion real (Unimarc, 2026-08-18): el guard exigia reclamo para
        // CUALQUIER cierre, pero el content script reporta un fallo antes de
        // reclamar (ficha 404 sin boton de agregar). El job quedaba congelado
        // en ese producto para siempre. Un fallo no agrega nada, asi que el
        // reclamo solo debe exigirse para un alta.
        expect(source).toContain('unclaimedFailure');
        expect(source).toMatch(/message\.added !== true && !job\.inFlightItemId/);
    });

    it('cierra la carga por API con lo que la tienda confirmó', () => {
        expect(source).toContain('resultsFromConfirmation');
        expect(source).toContain('no confirmo este producto en el carro');
    });

    it('entrega la canasta completa al content script para la carga por API', () => {
        expect(source).toContain('allItems: job.items');
    });

    it('reescribe www.lider.cl a super.lider.cl antes de abrir la ficha', () => {
        expect(source).toContain('rewriteLiderUrl');
        expect(source).toContain("url.hostname = 'super.lider.cl'");
    });

    it('avisa a Convive cuáles productos sí entraron y cuáles se omitieron', () => {
        expect(source).toContain('addedItemIds');
        expect(source).toContain('failedItemDetails');
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
