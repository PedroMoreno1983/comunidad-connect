"""EAN de Jumbo desde el catálogo VTEX público, en lotes.

El listado que pinta jumbo.cl (HTML/RSC y el BFF que captura Playwright) trae
skuId, refId, nombre y precio, pero NO el EAN. La API pública de catálogo VTEX
de la misma tienda sí lo trae en items[].ean y acepta varios `fq=` del mismo
campo en una sola consulta (se combinan con OR), así que se completa el EAN de
50 productos por request, sin abrir cada ficha.

Ojo (17-oct-2026): el `sku` que guarda el crawl de Jumbo es casi siempre el
refId (el número al final de la URL, p.ej. .../te-marley-...-1993595/p), no el
skuId VTEX (135211). `fq=skuId:1993595` devuelve [] sin error, por eso el
primer run con #189 dejó 0 EAN. Se consulta primero por
`fq=alternateIds_RefId:` y, para lo que quede sin EAN, por `fq=skuId:`.

Filas sin sku (17-oct-2026, ~8.700 de 21.500): vienen del respaldo JSON-LD y
su product_url no trae el refId (.../bebida-isotonica-gatorade-500-cc-.../p).
VTEX rechaza `fq=linkText:` con 400 ("Invalid Parameter, linkText"), así que
no hay lote: se consulta `/search/<linkText>/p`, una por producto, con pocos
hilos (JUMBO_SLUG_WORKERS). De ahí sale el EAN y el refId, que se guarda como
sku igual que en las demás filas de Jumbo.

Si la API falla, los productos siguen sin EAN: el crawl no se cae por esto.
"""

from __future__ import annotations

import json
import sys
import re
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from typing import Any
from urllib.parse import quote, urlencode

from scrape_supermarkets import Product

JUMBO_VTEX_SEARCH_URL = (
    "https://jumbocl.vtexcommercestable.com.br/api/catalog_system/pub/products/search"
)
JUMBO_EAN_BATCH_SIZE = 50
JUMBO_EAN_MAX_FAILURES = 3
# Una consulta por producto (no hay lote por linkText): 4 hilos son ~0,2 s por
# producto medidos el 17-oct-2026, unos 7 min para 8.700 filas.
JUMBO_SLUG_WORKERS = 4
_JUMBO_SLUG_RE = re.compile(r"jumbo\.cl/([^/?#]+)/p/?(?:[?#].*)?$", re.I)


JUMBO_EAN_FIELDS = ("alternateIds_RefId", "skuId")


def jumbo_vtex_ean_url(sku_ids: Iterable[str], field: str = "skuId") -> str:
    skus = [sku for sku in sku_ids if sku]
    params = [("fq", f"{field}:{sku}") for sku in skus]
    params += [("_from", "0"), ("_to", str(max(0, len(skus) - 1)))]
    return f"{JUMBO_VTEX_SEARCH_URL}?{urlencode(params)}"


def jumbo_url_slug(url: str | None) -> str | None:
    """linkText de una URL de producto Jumbo (https://www.jumbo.cl/<slug>/p)."""
    match = _JUMBO_SLUG_RE.search(str(url or "").strip())
    return match.group(1) if match else None


def jumbo_vtex_slug_url(slug: str) -> str:
    return f"{JUMBO_VTEX_SEARCH_URL}/{quote(slug, safe='')}/p"


def parse_vtex_slug_match(payload: str, name: str) -> tuple[str, str | None] | None:
    """(ean, refId) del ítem VTEX cuyo nombre coincide con `name`, si hay uno."""
    try:
        root = json.loads(payload) if payload else []
    except json.JSONDecodeError:
        return None
    for raw in root if isinstance(root, list) else []:
        if not isinstance(raw, dict):
            continue
        items = [item for item in raw.get("items") or [] if isinstance(item, dict)]
        product_name = str(raw.get("productName") or "").strip()
        for item in items:
            ean = str(item.get("ean") or "").strip()
            if not ean.isdigit():
                continue
            names = [
                product_name if len(items) == 1 else "",
                str(item.get("name") or "").strip(),
                str(item.get("nameComplete") or "").strip(),
            ]
            if not any(candidate and _same_name(candidate, name) for candidate in names):
                continue
            refs = [
                str(reference.get("Value") or "").strip()
                for reference in item.get("referenceId") or []
                if isinstance(reference, dict)
                and str(reference.get("Key") or "").casefold() == "refid"
            ]
            if len(items) == 1:
                refs.append(str(raw.get("productReference") or "").strip())
            ref = next((value for value in refs if value), None)
            return ean, ref
    return None


def _same_name(left: str, right: str) -> bool:
    return " ".join(left.casefold().split()) == " ".join(right.casefold().split())


def parse_vtex_sku_eans(payload: str) -> dict[str, tuple[str, str]]:
    """skuId -> (ean, nombre) de una respuesta del catálogo VTEX (products[].items[])."""
    return parse_vtex_eans(payload)[1]


def parse_vtex_eans(
    payload: str,
) -> tuple[dict[str, tuple[str, str]], dict[str, tuple[str, str]]]:
    """(refId -> (ean, nombre), skuId -> (ean, nombre)) de una respuesta VTEX."""
    try:
        root = json.loads(payload) if payload else []
    except json.JSONDecodeError:
        return {}, {}
    by_ref: dict[str, tuple[str, str]] = {}
    by_sku: dict[str, tuple[str, str]] = {}
    for raw in root if isinstance(root, list) else []:
        if not isinstance(raw, dict):
            continue
        items = [item for item in raw.get("items") or [] if isinstance(item, dict)]
        for item in items:
            sku = str(item.get("itemId") or "").strip()
            ean = str(item.get("ean") or "").strip()
            name = str(item.get("name") or item.get("nameComplete") or "").strip()
            if not ean.isdigit():
                continue
            if sku:
                by_sku[sku] = (ean, name)
            refs = [
                str(reference.get("Value") or "").strip()
                for reference in item.get("referenceId") or []
                if isinstance(reference, dict)
                and str(reference.get("Key") or "").casefold() == "refid"
            ]
            if len(items) == 1:
                refs.append(str(raw.get("productReference") or "").strip())
            for ref in refs:
                if ref:
                    by_ref.setdefault(ref, (ean, name))
    return by_ref, by_sku


def with_jumbo_eans(
    products: Iterable[Product],
    fetch: Callable[[str], str],
    batch_size: int = JUMBO_EAN_BATCH_SIZE,
    slug_workers: int = JUMBO_SLUG_WORKERS,
) -> Iterator[Product]:
    """Completa el EAN de los productos Jumbo, de a lotes.

    Los que traen sku se buscan primero por refId y luego por skuId; los que no
    (respaldo JSON-LD), por el linkText de su URL, y de ahí también sale el
    refId que queda como sku. Solo se acepta si el nombre VTEX coincide con el
    del listado: un número que es refId de un producto puede ser el skuId de
    otro.
    """
    pending: list[Product] = []
    disabled = False
    failures = 0
    slug_disabled = False
    slug_failures = 0
    stats = {"looked_up": 0, "matched": 0, "slug_looked_up": 0, "slug_matched": 0}

    def lookup_slugs() -> None:
        """Rellena ean y sku de los pendientes sin sku, por linkText."""
        nonlocal slug_disabled, slug_failures
        targets = [
            (index, product, slug)
            for index, product in enumerate(pending)
            if not product.sku and not product.ean
            and (slug := jumbo_url_slug(product.product_url))
        ]
        if not targets or slug_disabled:
            return
        stats["slug_looked_up"] += len(targets)

        def one(target: tuple[int, Product, str]) -> tuple[str | None, Exception | None]:
            try:
                return fetch(jumbo_vtex_slug_url(target[2])), None
            except Exception as error:  # noqa: BLE001 - el EAN es opcional
                return None, error

        workers = max(1, min(slug_workers, len(targets)))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            results = list(executor.map(one, targets))
        errors = [error for _, error in results if error is not None]
        if len(errors) == len(results):
            # Lote caído entero (cada consulta ya trae sus reintentos).
            slug_failures += 1
            if slug_failures >= JUMBO_EAN_MAX_FAILURES:
                slug_disabled = True
                print(f"jumbo slug lookup disabled: {errors[-1]}", file=sys.stderr)
            return
        slug_failures = 0
        for (index, product, _slug), (payload, _error) in zip(targets, results):
            match = parse_vtex_slug_match(payload or "", product.name)
            if not match:
                continue
            ean, ref = match
            pending[index] = replace(product, ean=ean, sku=ref or product.sku)
            stats["slug_matched"] += 1

    def flush() -> Iterator[Product]:
        nonlocal disabled, failures
        lookup_slugs()
        found: dict[int, str] = {}
        for field in JUMBO_EAN_FIELDS:
            missing = [
                (index, product)
                for index, product in enumerate(pending)
                if product.sku and not product.ean and index not in found
            ]
            if not missing or disabled:
                break
            try:
                by_ref, by_sku = parse_vtex_eans(
                    fetch(jumbo_vtex_ean_url([product.sku for _, product in missing], field))
                )
            except Exception as error:  # noqa: BLE001 - el EAN es opcional
                # Un lote caído no apaga el resto; tres seguidos sí.
                failures += 1
                if failures >= JUMBO_EAN_MAX_FAILURES:
                    disabled = True
                    print(f"jumbo ean lookup disabled: {error}", file=sys.stderr)
                break
            failures = 0
            lookup = by_ref if field == "alternateIds_RefId" else by_sku
            for index, product in missing:
                ean, name = lookup.get(product.sku or "", ("", ""))
                if ean and _same_name(name, product.name):
                    found[index] = ean
        stats["looked_up"] += sum(1 for product in pending if product.sku and not product.ean)
        stats["matched"] += len(found)
        for index, product in enumerate(pending):
            yield replace(product, ean=found[index]) if index in found else product
        pending.clear()

    try:
        for product in products:
            pending.append(product)
            if len(pending) >= batch_size:
                yield from flush()
        if pending:
            yield from flush()
    except Exception:
        # p.ej. CatalogCoverageWarning al final del crawl: entregar lo pendiente.
        yield from flush()
        raise
    finally:
        # Deja rastro en el log del job: 0 de N fue lo que pasó sin avisar en #189.
        print(
            f"jumbo ean lookup: {stats['matched']} of {stats['looked_up']} products matched",
            file=sys.stderr,
        )
        print(
            f"jumbo slug lookup: {stats['slug_matched']} of {stats['slug_looked_up']} "
            "products matched",
            file=sys.stderr,
        )


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
