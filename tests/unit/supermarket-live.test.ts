import { describe, expect, it } from 'vitest';
import {
  extractSupermarketTerms,
  parseJumboProducts,
  parseLiderProducts,
  parseSantaIsabelProducts,
} from '@/lib/supermarketLive';

describe('supermarket live catalog parsers', () => {
  it('extracts a bounded shopping list from natural language', () => {
    expect(extractSupermarketTerms('Necesito comprar: arroz, leche y huevos')).toEqual([
      'arroz',
      'leche',
      'huevos',
    ]);
  });

  it('extracts fifteen independent products instead of truncating the list', () => {
    const products = [
      'arroz', 'leche', 'huevos', 'aceite', 'pan',
      'tomates', 'cebolla', 'papas', 'detergente', 'papel higienico',
      'cafe', 'azucar', 'sal', 'yogurt', 'avena',
    ];

    const result = extractSupermarketTerms(products.join(', '));

    expect(result).toHaveLength(15);
    expect(result[0]).toBe('arroz');
    expect(result[14]).toBe('avena');
  });

  it('reads Jumbo prices and offers from the public page state', () => {
    const state = {
      dehydratedState: {
        queries: [{
          state: {
            data: {
              products: [{
                brand: 'Banquete',
                items: [{ name: 'Arroz Banquete 1 kg', price: 1790, listPrice: 2530, stock: true }],
              }],
            },
          },
        }],
      },
    };
    const html = `<script type="application/json" id="__REACT_QUERY_STATE__">${JSON.stringify(state)}</script>`;

    expect(parseJumboProducts(html)).toEqual([{
      name: 'Arroz Banquete 1 kg',
      brand: 'Banquete',
      quantity: 1,
      price: 1790,
      store: 'Jumbo',
      isOffer: true,
      originalPrice: 2530,
    }]);
  });

  it('reads Santa Isabel prices from render data', () => {
    const renderData = {
      plp: {
        plp_products: {
          products: [{
            productName: 'Leche Entera 1 L',
            brand: 'Soprole',
            items: [{
              sellers: [{
                commertialOffer: { Price: 990, ListPrice: 1190, AvailableQuantity: 12 },
              }],
            }],
          }],
        },
      },
    };
    const serialized = JSON.stringify(JSON.stringify(renderData));
    const html = `<script>window.__renderData = ${serialized}</script>`;

    expect(parseSantaIsabelProducts(html)[0]).toMatchObject({
      name: 'Leche Entera 1 L',
      brand: 'Soprole',
      price: 990,
      originalPrice: 1190,
      store: 'Santa Isabel',
      isOffer: true,
    });
  });

  it('reads Lider products and prices from JSON-LD', () => {
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      itemListElement: [{
        '@type': 'ListItem',
        item: {
          '@type': 'Product',
          name: 'Huevos blancos 12 un Lider',
          offers: { '@type': 'Offer', price: '2990', priceCurrency: 'CLP' },
        },
      }],
    };
    const html = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

    expect(parseLiderProducts(html)[0]).toMatchObject({
      name: 'Huevos blancos 12 un Lider',
      price: 2990,
      store: 'Lider',
    });
  });
});
