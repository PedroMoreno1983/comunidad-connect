# Catálogo completo de supermercados

El catálogo masivo es un proceso batch separado de la búsqueda en vivo. Recorre
las páginas públicas de cada retailer, normaliza los productos y persiste lotes
de hasta 350 filas mediante `ingest_supermarket_snapshot`.

CoCo consulta después `supermarket_products` para comparar canastas completas
por tienda. Si un término no existe en el catálogo fresco, conserva el fallback
de búsqueda en vivo.

## Cobertura

| Tienda | Estrategia | Estado |
| --- | --- | --- |
| Tottus | API pública de listing raíz, paginada hasta `pagination.count` | Completa |
| Santa Isabel | Categorías principales descubiertas desde el menú público; páginas hasta vacío/repetición | Completa |
| Unimarc | 15 categorías principales; `__NEXT_DATA__` SSR y total `resource` | Completa |
| Jumbo | 8 categorías principales; respuesta JSON de `bff.jumbo.cl/catalog/plp` capturada por Playwright | Completa |
| Lider | Desafío interactivo de verificación humana | Bloqueada hasta contar con feed/API autorizado |

“Completa” significa que el proceso recorre toda la paginación publicada por la
tienda y deduplica por SKU, EAN, URL o nombre. No significa que un producto
agotado o no publicado por el retailer pueda inventarse.

## Ejecución local

Prueba sin escribir:

```bash
python scripts/ingest_full_supermarket_catalog.py \
  --store tottus \
  --max-pages 2 \
  --dry-run \
  --pretty
```

Carga completa:

```bash
python scripts/ingest_full_supermarket_catalog.py \
  --store tottus \
  --pretty
```

Para Jumbo y Unimarc se requiere Playwright:

```bash
python -m pip install playwright==1.58.0
python -m playwright install chromium
```

La escritura requiere `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Al terminar,
el script consulta el conteo real de `supermarket_products` por tienda y lo
incluye como `database_count`.

## Automatización

`full-supermarket-catalog.yml` ejecuta una matriz independiente por tienda tres
