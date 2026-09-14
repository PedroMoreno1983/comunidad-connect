import { describe, expect, it } from 'vitest';
import {
  safeSupermarketProductImage,
  shouldOptimizeSupermarketProductImage,
} from '@/lib/supermarketProductImage';

describe('safeSupermarketProductImage', () => {
  it.each([
    'https://i5.walmartimages.cl/asr/leche.webp',
    'https://jumbo.vtexassets.com/arquivos/ids/1003000/mayonesa.jpg?v=1',
    'https://jumbocl.vteximg.com.br/arquivos/ids/196704-250-250/arroz.jpg?v=2',
    'https://unimarc.vtexassets.com/arquivos/ids/161332/papas.png?v=1',
    'https://santaisabel.vtexassets.com/arquivos/ids/155394/agua.jpg?v=1',
    'https://media.tottus.cl/tottusCL/02013868_1/public',
    'https://media.tottus.cl/Tottus/defaultImage/public',
    'https://cdn.shopify.com/s/files/1/0818/9332/7105/files/longanizas.jpg?v=1',
    'https://s7d2.scene7.com/is/image/Tottus/21291520_1',
    'https://www.tottus.cl/cdn-cgi/imagedelivery/4fYuQyy-r8_rpBpcY7lH_A/tottusCL/80001141_2/public',
  ])('accepts a catalog image from a known retailer CDN', imageUrl => {
    expect(safeSupermarketProductImage(imageUrl)).toBe(imageUrl);
  });

  it.each([
    'http://i5.walmartimages.cl/asr/leche.webp',
    'https://i5.walmartimages.cl.evil.example/leche.webp',
    'https://i5.walmartimages.cl/not-asr/leche.webp',
    'https://cdn.shopify.com/s/files/1/9999/other-shop/product.jpg',
    'https://s7d2.scene7.com/is/image/OtherTenant/product',
    'https://media.tottus.cl/tottusCL/02013868_1/public?foreign=1',
    'https://example.com/product.jpg',
    'javascript:alert(1)',
    'not-a-url',
  ])('rejects an unsafe or unknown image source', imageUrl => {
    expect(safeSupermarketProductImage(imageUrl)).toBeNull();
  });

  it('rejects credentials and non-standard ports', () => {
    expect(safeSupermarketProductImage('https://user:secret@i5.walmartimages.cl/item.jpg')).toBeNull();
    expect(safeSupermarketProductImage('https://i5.walmartimages.cl:444/item.jpg')).toBeNull();
  });

  it('loads legacy Lider transforms directly and keeps them out of the Next optimizer', () => {
    const directImage = 'https://images.lider.cl/wmtcl?source=url[file:/productos/689316ac.jpg]&scale=size[180x180]&sink';
    const unscaledImage = 'https://wmtcl.liquifire.com/wmtcl?source=url[file:/productos/1042910ac.jpg]&sink';
    expect(safeSupermarketProductImage(directImage)).toBe(directImage);
    expect(safeSupermarketProductImage(unscaledImage)).toBe(
      'https://wmtcl.liquifire.com/wmtcl?source=url[file:/productos/1042910ac.jpg]&scale=size[180x180]&sink',
    );
    expect(shouldOptimizeSupermarketProductImage(directImage)).toBe(false);
    expect(shouldOptimizeSupermarketProductImage('https://i5.walmartimages.cl/asr/leche.webp')).toBe(true);
  });

  it.each([
    'https://images.lider.cl/wmtcl?source=https://example.com/image.jpg&sink',
    'https://images.lider.cl/wmtcl?source=url[file:/productos/arroz.jpg]&width=9999&sink',
    'https://images.lider.cl/wmtcl?source=url[file:/productos/../secret.jpg]&sink',
  ])('rejects an unknown Lider transform query', imageUrl => {
    expect(safeSupermarketProductImage(imageUrl)).toBeNull();
  });
});
