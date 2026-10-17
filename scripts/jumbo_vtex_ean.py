"""EAN de Jumbo desde el catálogo VTEX público, en lotes.

El listado que pinta jumbo.cl (HTML/RSC y el BFF que captura Playwright) trae
skuId, refId, nombre y precio, pero NO el EAN. Verificado el 17-oct-2026: la
API pública de catálogo VTEX de la misma tienda sí lo trae en items[].ean y
acepta varios `fq=skuId:` en una sola consulta (se combinan con OR), así que se
completa el EAN de 50 SKU por request, sin abrir cada ficha.

Si la API falla, los productos siguen sin EAN: el crawl no se cae por esto.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable, Iterable, Iterator
from dataclasses import replace
from typing import Any
from urllib.parse import urlencode

from scrape_supermarkets import Product

JUMBO_VTEX_SEARCH_URL = (
    "https://jumbocl.vtexcommercestable.com.br/api/catalog_system/pub/products/search"
)
JUMBO_EAN_BATCH_SIZE = 50


def jumbo_vtex_ean_url(sku_ids: Iterable[str]) -> str:
    skus = [sku for sku in sku_ids if sku]
    params = [("fq", f"skuId:{sku}") for sku in skus]
    params += [("_from", "0"), ("_to", str(max(0, len(skus) - 1)))]
    return f"{JUMBO_VTEX_SEARCH_URL}?{urlencode(params)}"


def _same_name(left: str, right: str) -> bool:
    return " ".join(left.casefold().split()) == " ".join(right.casefold().split())


def parse_vtex_sku_eans(payload: str) -> dict[str, tuple[str, str]]:
    """skuId -> (ean, nombre) de una respuesta del catálogo VTEX (products[].items[])."""
    try:
        root = json.loads(payload) if payload else []
    except json.JSONDecodeError:
        return {}
    eans: dict[str, tuple[str, str]] = {}
    for raw in root if isinstance(root, list) else []:
        if not isinstance(raw, dict):
            continue
        for item in raw.get("items") or []:
            if not isinstance(item, dict):
                continue
            sku = str(item.get("itemId") or "").strip()
            ean = str(item.get("ean") or "").strip()
            name = str(item.get("name") or item.get("nameComplete") or "").strip()
            if sku and ean.isdigit():
                eans[sku] = (ean, name)
    return eans


def with_jumbo_eans(
    products: Iterable[Product],
    fetch: Callable[[str], str],
    batch_size: int = JUMBO_EAN_BATCH_SIZE,
) -> Iterator[Product]:
    """Completa el EAN de los productos Jumbo que traen skuId, de a lotes.

    Solo se acepta si el nombre VTEX coincide con el del listado: el sku que
    sale de la URL de una ficha a veces es el refId y no el skuId, y ahí el
    lookup podría devolver otro producto.
    """
    pending: list[Product] = []
    disabled = False

    def flush() -> Iterator[Product]:
        nonlocal disabled
        lookup: dict[str, tuple[str, str]] = {}
        skus = [product.sku for product in pending if product.sku and not product.ean]
        if skus and not disabled:
            try:
                lookup = parse_vtex_sku_eans(fetch(jumbo_vtex_ean_url(skus)))
            except Exception as error:  # noqa: BLE001 - el EAN es opcional
                disabled = True
                print(f"jumbo ean lookup disabled: {error}", file=sys.stderr)
        for product in pending:
            ean, name = lookup.get(product.sku or "", ("", ""))
            if ean and not product.ean and _same_name(name, product.name):
                yield replace(product, ean=ean)
            else:
                yield product
        pending.clear()

    try:
        for product in products:
            pending.append(product)
            if len(pending) >= batch_size:
                yield from flush()
    except Exception:
        # p.ej. CatalogCoverageWarning al final del crawl: entregar lo pendiente.
        yield from flush()
        raise
    if pending:
        yield from flush()


def jumbo_item_ean(item: dict[str, Any]) -> str | None:
    """EAN si el payload del listado alguna vez lo trae (items[].ean / referenceId)."""
    ean = str(item.get("ean") or "").strip()
    if ean.isdigit():
        return ean
    references = item.get("referenceId")
    if isinstance(references, list):
        for reference in references:
            if not isinstance(reference, dict):
                continue
            value = str(reference.get("Value") or "").strip()
            if str(reference.get("Key") or "").casefold() == "ean" and value.isdigit():
                return value
    return None
