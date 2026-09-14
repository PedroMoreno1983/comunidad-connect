/**
 * Fuentes y rutas observadas en `supermarket_products.image_url`.
 *
 * Se comparten entre `next/image` y la validacion del cliente. Las rutas
 * acotadas impiden usar el optimizador con otras tiendas alojadas en los mismos
 * CDNs multi-tenant.
 */
export const SUPERMARKET_IMAGE_SOURCES = [
  { hostname: 'cdn.shopify.com', pathname: '/s/files/1/0818/9332/7105/**', port: '', optimize: true },
  { hostname: 'i5.walmartimages.cl', pathname: '/asr/**', port: '', optimize: true },
  { hostname: 'images.lider.cl', pathname: '/wmtcl', port: '', optimize: false },
  { hostname: 'jumbo.vtexassets.com', pathname: '/arquivos/ids/**', port: '', optimize: true },
  { hostname: 'jumbocl.vteximg.com.br', pathname: '/arquivos/ids/**', port: '', optimize: true },
  { hostname: 'media.tottus.cl', pathname: '/tottusCL/*/public', port: '', search: '', optimize: true },
  { hostname: 'media.tottus.cl', pathname: '/Tottus/defaultImage/public', port: '', search: '', optimize: true },
  { hostname: 's7d2.scene7.com', pathname: '/is/image/Tottus/**', port: '', search: '', optimize: true },
  { hostname: 'santaisabel.vtexassets.com', pathname: '/arquivos/ids/**', port: '', optimize: true },
  { hostname: 'unimarc.vtexassets.com', pathname: '/arquivos/ids/**', port: '', optimize: true },
  { hostname: 'wmtcl.liquifire.com', pathname: '/wmtcl', port: '', optimize: false },
  {
    hostname: 'www.tottus.cl',
    pathname: '/cdn-cgi/imagedelivery/4fYuQyy-r8_rpBpcY7lH_A/tottusCL/*/public',
    port: '',
    search: '',
    optimize: true,
  },
] as const;

/** Patrones que puede consumir el proxy `/_next/image` sin queries transformadoras abiertas. */
export const SUPERMARKET_OPTIMIZED_IMAGE_SOURCES = SUPERMARKET_IMAGE_SOURCES
  .filter(source => source.optimize)
  .map(source => 'search' in source
    ? { hostname: source.hostname, pathname: source.pathname, port: source.port, search: source.search }
    : { hostname: source.hostname, pathname: source.pathname, port: source.port });

/** Hosts cargados directo por el navegador; la URL completa se valida antes de renderizar. */
export const SUPERMARKET_DIRECT_IMAGE_HOSTS = SUPERMARKET_IMAGE_SOURCES
  .filter(source => !source.optimize)
  .map(source => source.hostname);
