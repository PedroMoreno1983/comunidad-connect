#!/usr/bin/env python3
"""Full, paginated supermarket catalog crawlers for scheduled ingestion."""

from __future__ import annotations

import html
import json
import math
import re
import time
from collections.abc import Callable, Iterable, Iterator, Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from http.client import IncompleteRead
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from scrape_supermarkets import Product, pack_units_from_name, utc_now


USER_AGENT = "Mozilla/5.0 (compatible; ConviveConnect/1.0; +https://conviveconnect.com)"
HTTP_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/json",
    "Accept-Language": "es-CL,es;q=0.9",
    "User-Agent": USER_AGENT,
}
TOTTUS_BASE = (
    "https://www.tottus.cl/s/browse/v1/listing/cl"
    "?store=to_com&subdomain=tottus&categoryId=CATG27054&categoryName=Tottus"
    "&pgid=34&pid=9e635d19-b626-4171-8beb-d92e58c2a417"
)
UNIMARC_CATEGORIES = (
    "carnes",
    "frutas-y-verduras",
    "lacteos-huevos-y-refrigerados",
    "quesos-y-fiambres",
    "panaderia-y-pasteleria",
    "congelados",
    "despensa",
    "desayuno-y-dulces",
    "bebidas-y-licores",
    "limpieza",
    "perfumeria",
    "bebes-y-ninos",
    "mascotas",
    "hogar",
    "veganos-y-vegetarianos",
)
LIDER_CATALOG_URL = "https://super.lider.cl/v/precios-en-oferta-sin-sello"
LIDER_PAGE_SIZE = 48
JUMBO_CATEGORIES = (
    "frutas-y-verduras",
    "lacteos-huevos-y-congelados",
    "despensa",
    "carnes-y-pescados",
    "licores-bebidas-y-aguas",
    "limpieza",
    "cuidado-personal-y-bebe",
    "mascotas",
)
ACUENTA_HOME_URL = "https://www.acuenta.cl/"
ACUENTA_HEADERS = {
    **HTTP_HEADERS,
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": ACUENTA_HOME_URL,
}
ACUENTA_FALLBACK_CATEGORIES = (
    ("Mascotas", "mascotas/88"),
    ("Belleza", "belleza/99"),
    ("Higiene y Cuidado Personal", "higiene-y-cuidado-personal/98"),
    ("Frescos y Lacteos", "frescos-y-lacteos/07"),
    ("Carnes y Pescados", "carnes-y-pescados/03"),
    ("Aseo y limpieza", "aseo-y-limpieza/11"),
    ("La Boti", "la-boti/80"),
    ("Despensa", "despensa/05"),
    ("Congelados", "congelados/04"),
    ("Desayuno y Dulces", "desayuno-y-dulces/44"),
    ("Bebidas, aguas y jugos", "bebidas-aguas-y-jugos/02"),
    ("Papas fritas y picoteo", "papas-fritas-y-picoteo/51"),
    ("Mundo bebe", "mundo-bebe/09"),
    ("Panaderia y Pasteleria", "panaderia-y-pasteleria/10"),
    ("Frutas y Verduras", "frutas-y-verduras/06"),
    ("Hogar, entretencion y tecnologia", "hogar-entretencion-y-tecnologia/47"),
)
IRURZUN_PRODUCTS_URL = "https://irurzun.cl/collections/all/products.json?limit=250"


def fetch_text(
    url: str,
    timeout: int = 35,
    missing_statuses: tuple[int, ...] = (),
    headers: Mapping[str, str] | None = None,
) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request = Request(url, headers=dict(headers or HTTP_HEADERS))
            with urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (OSError, TimeoutError, IncompleteRead) as error:
            if isinstance(error, HTTPError) and error.code in missing_statuses:
                return ""
            last_error = error
            if attempt < 2:
                time.sleep(2**attempt)
    if isinstance(last_error, HTTPError):
        detail = f"HTTP {last_error.code}"
    elif isinstance(last_error, URLError):
        detail = f"URLError: {last_error.reason}"
    elif last_error is not None:
        detail = type(last_error).__name__
    else:
        detail = "unknown error"
    raise RuntimeError(
        f"Public catalog request failed after 3 attempts ({detail}): {url}"
    ) from last_error


def fetch_many(
    urls: Iterable[str],
    workers: int = 4,
    missing_statuses: tuple[int, ...] = (),
    headers: Mapping[str, str] | None = None,
) -> Iterator[str]:
    with ThreadPoolExecutor(max_workers=workers) as executor:
        yield from executor.map(
            lambda url: fetch_text(
                url,
                missing_statuses=missing_statuses,
                headers=headers,
            ),
            urls,
        )


def parse_price(value: Any) -> int:
    if isinstance(value, bool) or value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, list):
        return parse_price(value[0] if value else None)
    if not isinstance(value, str):
        return 0
    normalized = value.strip().replace(".", "").replace(",", ".")
    try:
        return int(float(normalized))
    except ValueError:
        digits = re.sub(r"[^0-9]", "", value)
        return int(digits) if digits else 0


def product_key(product: Product) -> str:
    return (
        product.sku
        or product.ean
        or product.product_url
        or f"{product.store}:{product.name.casefold()}"
    )


def unique_products(products: Iterable[Product]) -> Iterator[Product]:
    seen: set[str] = set()
    for product in products:
        key = product_key(product)
        if key in seen:
            continue
        seen.add(key)
        yield product


def extract_next_flight_stream(page_html: str) -> str:
    chunks: list[str] = []
    for match in re.finditer(
        r'self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)</script>',
        page_html,
    ):
        chunk = json.loads(match.group(1))
        if isinstance(chunk, str):
            chunks.append(chunk)
    return "".join(chunks)


def parse_acuenta_categories(page_html: str) -> list[tuple[str, str]]:
    stream = extract_next_flight_stream(page_html)
    pattern = re.compile(
        r'\{"active":true,"boost":(?:null|\d+),'
        r'"hasChildren":(?:true|false),'
        r'"categoryNamesPath":"[^"]+",'
        r'"isAvailableInHome":true,"level":1,'
        r'"name":"(?P<name>[^"]+)",'
        r'"path":"[^"]+","reference":"[^"]+",'
        r'"slug":"(?P<slug>[^"]+)"'
    )
    categories: list[tuple[str, str]] = []
    seen: set[str] = set()
    for match in pattern.finditer(stream):
        slug = match.group("slug")
        if slug in seen:
            continue
        seen.add(slug)
        categories.append((match.group("name"), slug))
    return categories


def acuenta_categories_from_html(page_html: str) -> list[tuple[str, str]]:
    categories = parse_acuenta_categories(page_html)
    return categories or list(ACUENTA_FALLBACK_CATEGORIES)


def parse_acuenta_category_page(
    page_html: str,
    query: str,
) -> tuple[list[Product], int, int]:
    stream = extract_next_flight_stream(page_html)
    references: dict[str, Any] = {}
    for reference in re.finditer(r'(?m)^([0-9a-z]+):(.+)$', stream):
        try:
            references[reference.group(1)] = json.loads(reference.group(2))
        except json.JSONDecodeError:
            continue

    def resolve(value: Any) -> Any:
        if isinstance(value, str) and value.startswith("$"):
            return references.get(value[1:])
        return value

    products: list[Product] = []
    observed_at = utc_now()
    for match in re.finditer(
        r'(?m)^[0-9a-z]+:(\{.*?"__typename":"CatalogProductModel"\})$',
        stream,
    ):
        raw = json.loads(match.group(1))
        name = str(raw.get("name") or "").strip()
        regular_price = parse_price(raw.get("price"))
        promotion_price = 0
        promotion = resolve(raw.get("promotion"))
        if (
            isinstance(promotion, dict)
            and promotion.get("type") == "specialPrice"
            and promotion.get("isActive") is not False
        ):
            conditions = resolve(promotion.get("conditions"))
            if isinstance(conditions, list):
                for condition_reference in conditions:
                    condition = resolve(condition_reference)
                    if not isinstance(condition, dict):
                        continue
                    quantity = parse_price(condition.get("quantity"))
                    candidate = parse_price(condition.get("price"))
                    if quantity in (0, 1) and 0 < candidate < regular_price:
                        promotion_price = candidate
                        break
        price = promotion_price or regular_price
        stock = parse_price(raw.get("stock"))
        sku = str(raw.get("sku") or "").strip() or None
        slug = str(raw.get("slug") or "").strip()
        if not name or price <= 0 or stock <= 0:
            continue
        photos = resolve(raw.get("photosUrl"))
        eans = resolve(raw.get("ean"))
        photos = photos if isinstance(photos, list) else []
        eans = eans if isinstance(eans, list) else []
        ean = next(
            (
                value
                for value in eans
                if isinstance(value, str) and re.fullmatch(r"\d{8,14}", value)
            ),
            None,
        )
        products.append(
            Product(
                store="aCuenta",
                query=query,
                name=name,
                price=price,
                list_price=regular_price if regular_price > price else None,
                in_stock=True,
                brand=str(raw.get("brand") or "").strip() or None,
                sku=sku,
                ean=ean,
                product_url=f"https://www.acuenta.cl/p/{slug}" if slug else None,
                image_url=photos[0] if photos else None,
                scraped_at=observed_at,
                channel_type="wholesale",
                pack_units=pack_units_from_name(name),
                minimum_packs=1,
            )
        )

    pagination = re.search(
        r'"pagination":\{"page":(?P<page>\d+),"pages":(?P<pages>\d+),'
        r'"total":\{"value":(?P<total>\d+)',
        stream,
    )
    if pagination is None:
        return products, 1, len(products)
    return products, int(pagination.group("pages")), int(pagination.group("total"))


def parse_irurzun_products(payload: str, query: str = "catalogo") -> list[Product]:
    root = json.loads(payload)
    products: list[Product] = []
    observed_at = utc_now()
    for raw in root.get("products") or []:
        title = str(raw.get("title") or "").strip()
        handle = str(raw.get("handle") or "").strip()
        vendor = str(raw.get("vendor") or "").strip() or None
        images = raw.get("images") or []
        image = images[0] if images else {}
        for variant in raw.get("variants") or []:
            price = parse_price(variant.get("price"))
            available = variant.get("available") is True
            if not title or not handle or price <= 0 or not available:
                continue
            variant_title = str(variant.get("title") or "").strip()
            name = title
            if variant_title and variant_title.casefold() != "default title":
                name = f"{title} - {variant_title}"
            public_sku = str(variant.get("sku") or "").strip() or None
            sku = public_sku or str(variant.get("id") or "").strip() or None
            barcode = str(variant.get("barcode") or "").strip() or None
            ean = barcode or (
                public_sku if public_sku and re.fullmatch(r"\d{8,14}", public_sku) else None
            )
            products.append(
                Product(
                    store="Irurzun",
                    query=query,
                    name=name,
                    price=price,
                    list_price=None,
                    in_stock=True,
                    brand=vendor,
                    sku=sku,
                    ean=ean,
                    product_url=f"https://irurzun.cl/products/{handle}",
                    image_url=str(image.get("src") or "").strip() or None,
                    scraped_at=observed_at,
                    channel_type="wholesale",
                    pack_units=pack_units_from_name(name),
                    minimum_packs=1,
                )
            )
    return products

def parse_tottus_categories(payload: str) -> list[tuple[str, str, int]]:
    root = json.loads(payload)
    data = root.get("data", root)
    for facet in data.get("facets") or []:
        if facet.get("name") != "Categoría":
            continue
        categories: list[tuple[str, str, int]] = []
        for raw in facet.get("values") or []:
            category_id = str(raw.get("id") or "").strip()
            title = str(raw.get("title") or "").strip()
            count = parse_price(raw.get("count"))
            if category_id and title and count > 0:
                categories.append((category_id, title, count))
        return categories
    return []


def tottus_listing_url(category_id: str, category_name: str, page: int) -> str:
    return (
        "https://www.tottus.cl/s/browse/v1/listing/cl"
        "?store=to_com&subdomain=tottus"
        f"&categoryId={quote(category_id, safe='')}"
        f"&categoryName={quote(category_name, safe='')}"
        "&pgid=34&pid=9e635d19-b626-4171-8beb-d92e58c2a417"
        f"&page={page}"
    )


def parse_tottus_page(payload: str, query: str = "catalogo") -> tuple[list[Product], int, int]:
    root = json.loads(payload)
    data = root.get("data", root)
    pagination = data.get("pagination") or {}
    products: list[Product] = []
    observed_at = utc_now()

    for raw in data.get("results") or []:
        prices = raw.get("prices") or []
        current = next(
            (
                price
                for price in prices
                if price.get("crossed") is not True and price.get("type") == "internetPrice"
            ),
            None,
        )
        if current is None:
            current = next((price for price in prices if price.get("crossed") is not True), None)
        regular = next(
            (
                price
                for price in prices
                if price.get("crossed") is True or price.get("type") == "normalPrice"
            ),
            None,
        )
        price = parse_price((current or {}).get("price"))
        list_price = parse_price((regular or {}).get("price")) or None
        name = str(raw.get("displayName") or "").strip()
        sku = str(raw.get("skuId") or raw.get("offeringId") or "").strip() or None
        base_url = str(raw.get("url") or "").strip()
        if not name or price <= 0:
            continue
        product_url = base_url
        if base_url and sku and not base_url.rstrip("/").endswith(f"/{sku}"):
            product_url = f"{base_url.rstrip('/')}/{sku}"
        media = raw.get("mediaUrls") or []
        products.append(
            Product(
                store="Tottus",
                query=query,
                name=name,
                price=price,
                list_price=list_price if list_price and list_price >= price else None,
                in_stock=True,
                brand=str(raw.get("brand") or "").strip() or None,
                sku=sku,
                product_url=product_url or None,
                image_url=str(media[0]) if media else None,
                scraped_at=observed_at,
            )
        )

    return products, int(pagination.get("count") or len(products)), int(
        pagination.get("perPage") or len(products) or 48
    )


def parse_unimarc_next_data(payload: str, query: str) -> tuple[list[Product], int]:
    root = json.loads(html.unescape(payload))
    queries = (
        root.get("props", {})
        .get("pageProps", {})
        .get("dehydratedState", {})
        .get("queries", [])
    )
    available: list[dict[str, Any]] = []
    total = 0
    for entry in queries:
        data = entry.get("state", {}).get("data", {})
        candidate = data.get("availableProducts")
        if isinstance(candidate, list) and len(candidate) > len(available):
            available = candidate
        resource = data.get("resource")
        if isinstance(resource, dict):
            resource = resource.get("total") or resource.get("count")
        total = max(total, parse_price(resource))

    products: list[Product] = []
    observed_at = utc_now()
    for raw in available:
        sellers = raw.get("sellers") or []
        seller = sellers[0] if sellers else {}
        price = parse_price(seller.get("price"))
        list_price = parse_price(seller.get("listPrice")) or None
        available_quantity = parse_price(seller.get("availableQuantity"))
        name = str(raw.get("name") or raw.get("nameComplete") or "").strip()
        if not name or price <= 0 or available_quantity <= 0:
            continue
        raw_slug = str(raw.get("slug") or raw.get("detailUrl") or "").strip()
        slug = re.sub(r"^/+|/p/?$", "", raw_slug)
        images = raw.get("images") or []
        products.append(
            Product(
                store="Unimarc",
                query=query,
                name=name,
                price=price,
                list_price=list_price if list_price and list_price >= price else None,
                in_stock=True,
                brand=str(raw.get("brand") or "").strip() or None,
                sku=str(raw.get("itemId") or raw.get("sku") or "").strip() or None,
                ean=str(raw.get("ean") or "").strip() or None,
                product_url=f"https://www.unimarc.cl/product/{slug}" if slug else None,
                image_url=str(images[0]) if images else None,
                scraped_at=observed_at,
            )
        )
    return products, total or len(products)


def parse_jumbo_payload(data: dict[str, Any], query: str) -> tuple[list[Product], int]:
    products: list[Product] = []
    observed_at = utc_now()
    for raw in data.get("products") or []:
        items = raw.get("items") or []
        item = items[0] if items else {}
        price = parse_price(item.get("price"))
        list_price = parse_price(item.get("listPrice")) or None
        name = str(item.get("name") or "").strip()
        if not name or price <= 0 or item.get("stock") is False:
            continue
        slug = str(raw.get("slug") or "").strip()
        images = item.get("images") or []
        products.append(
            Product(
                store="Jumbo",
                query=query,
                name=name,
                price=price,
                list_price=list_price if list_price and list_price >= price else None,
                in_stock=True,
                brand=str(raw.get("brand") or "").strip() or None,
                sku=str(item.get("skuId") or raw.get("reference") or "").strip() or None,
                product_url=f"https://www.jumbo.cl/{slug}/p" if slug else None,
                image_url=str(images[0]) if images else None,
                scraped_at=observed_at,
            )
        )
    return products, parse_price(data.get("results")) or len(products)


def jumbo_payload_candidates(value: Any) -> Iterator[dict[str, Any]]:
    """Find Jumbo product-list payloads nested in browser JSON responses."""
    if isinstance(value, dict):
        products = value.get("products")
        if (
            isinstance(products, list)
            and products
            and any(
                isinstance(product, dict) and isinstance(product.get("items"), list)
                for product in products
            )
        ):
            yield value
        for nested in value.values():
            yield from jumbo_payload_candidates(nested)
    elif isinstance(value, list):
        for nested in value:
            yield from jumbo_payload_candidates(nested)


def jumbo_page_count_from_links(hrefs: Iterable[Any]) -> int:
    page_count = 1
    for href in hrefs:
        match = re.search(r"(?:[?&])page=(\d+)", str(href), flags=re.I)
        if match:
            page_count = max(page_count, int(match.group(1)))
    return page_count



def _json_ld_objects(page_html: str) -> Iterator[dict[str, Any]]:
    for match in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        page_html,
        flags=re.I | re.S,
    ):
        raw = html.unescape(match.group(1)).strip()
        try:
            document = json.loads(raw)
        except json.JSONDecodeError:
            continue
        pending: list[Any] = [document]
        while pending:
            value = pending.pop()
            if isinstance(value, dict):
                yield value
                pending.extend(value.values())
            elif isinstance(value, list):
                pending.extend(value)


def parse_jumbo_html(page_html: str, query: str) -> tuple[list[Product], int]:
    products: list[Product] = []
    observed_at = utc_now()

    for document in _json_ld_objects(page_html):
        if document.get("@type") != "ItemList":
            continue
        for entry in document.get("itemListElement") or []:
            if not isinstance(entry, dict):
                continue
            raw = entry.get("item") or entry
            if not isinstance(raw, dict):
                continue
            offers = raw.get("offers") or {}
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            if not isinstance(offers, dict):
                continue
            name = str(raw.get("name") or entry.get("name") or "").strip()
            product_url = str(raw.get("url") or entry.get("url") or "").strip()
            price = parse_price(offers.get("price"))
            availability = str(offers.get("availability") or "")
            if (
                not name
                or not product_url
                or price <= 0
                or (availability and not availability.endswith("/InStock"))
            ):
                continue
            brand_value = raw.get("brand")
            brand = (
                str(brand_value.get("name") or "").strip()
                if isinstance(brand_value, dict)
                else str(brand_value or "").strip()
            )
            image_value = raw.get("image")
            if isinstance(image_value, list):
                image_value = image_value[0] if image_value else None
            sku_match = re.search(r"-(\d{5,})(?:/p)?/?$", product_url)
            products.append(
                Product(
                    store="Jumbo",
                    query=query,
                    name=name,
                    price=price,
                    list_price=None,
                    in_stock=True,
                    brand=brand or None,
                    sku=sku_match.group(1) if sku_match else None,
                    product_url=product_url,
                    image_url=str(image_value).strip() if image_value else None,
                    scraped_at=observed_at,
                )
            )

    # Jumbo renders the product count through nested markup. Searching the raw
    # HTML misses values such as "<span>617</span> productos" and silently
    # reduces the crawl to the first page. Normalize the visible text first so
    # pagination remains complete even when Jumbo changes wrapper elements.
    page_text = html.unescape(re.sub(r"<[^>]+>", " ", page_html))
    page_text = re.sub(r"\s+", " ", page_text)
    total_match = re.search(r"(\d[\d.]*)\s+productos", page_text, flags=re.I)
    page_count_match = re.search(
        r"p[aá]gina\s+\d+\s+de\s+(\d+)",
        page_text,
        flags=re.I,
    )
    page_count = parse_price(page_count_match.group(1)) if page_count_match else 0
    total = parse_price(total_match.group(1)) if total_match else 0
    if total <= 0 and page_count > 0:
        total = len(products) * page_count
    return list(unique_products(products)), total or len(products)

def extract_santa_render_data(page_html: str) -> dict[str, Any]:
    match = re.search(r'window\.__renderData\s*=\s*("(?:\\.|[^"\\])*")', page_html)
    if not match:
        raise ValueError("Santa Isabel page does not contain window.__renderData")
    serialized = json.loads(match.group(1))
    if not isinstance(serialized, str):
        raise ValueError("Santa Isabel render data is not a JSON string")
    return json.loads(serialized)


def parse_santa_render_data(data: dict[str, Any], query: str) -> list[Product]:
    raw_products = data.get("plp", {}).get("plp_products", {}).get("products") or []
    products: list[Product] = []
    observed_at = utc_now()
    for raw in raw_products:
        items = raw.get("items") or []
        item = items[0] if items else {}
        sellers = item.get("sellers") or []
        seller = sellers[0] if sellers else {}
        offer = seller.get("commertialOffer") or {}
        price = parse_price(offer.get("Price"))
        list_price = parse_price(offer.get("ListPrice")) or None
        name = str(raw.get("productName") or item.get("name") or "").strip()
        if not name or price <= 0 or parse_price(offer.get("AvailableQuantity")) <= 0:
            continue
        link_text = str(raw.get("linkText") or "").strip()
        images = item.get("images") or []
        image = images[0] if images else {}
        products.append(
            Product(
                store="Santa Isabel",
                query=query,
                name=name,
                price=price,
                list_price=list_price if list_price and list_price >= price else None,
                in_stock=True,
                brand=str(raw.get("brand") or "").strip() or None,
                sku=str(item.get("itemId") or "").strip() or None,
                ean=str(item.get("ean") or "").strip() or None,
                product_url=(
                    f"https://www.santaisabel.cl/{link_text.lstrip('/')}/p"
                    if link_text
                    else None
                ),
                image_url=str(image.get("imageUrl") or "").strip() or None,
                scraped_at=observed_at,
            )
        )
    return products


def parse_lider_page(
    page_html: str,
    query: str = "catalogo",
) -> tuple[list[Product], int, int]:
    item_list: dict[str, Any] | None = None
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        try:
            candidate = json.loads(html.unescape(match.group(1)).strip())
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(candidate, dict) and candidate.get("@type") == "ItemList":
            item_list = candidate
            break

    if item_list is None:
        raise ValueError("Lider page does not contain an ItemList JSON-LD catalog")

    total_match = re.search(
        r"<h1[^>]*>.*?<span[^>]*>\s*\(([0-9.]+)\)\s*</span>",
        page_html,
        re.IGNORECASE | re.DOTALL,
    )
    total = parse_price(total_match.group(1)) if total_match else 0
    page_numbers = [
        int(value)
        for value in re.findall(
            r'class="[^"]*\bpagination__link\b[^"]*"[^>]*>\s*([0-9]+)\s*</span>',
            page_html,
            re.IGNORECASE,
        )
    ]
    page_count = max(page_numbers, default=1)

    products: list[Product] = []
    observed_at = utc_now()
    for element in item_list.get("itemListElement") or []:
        raw = element.get("item") if isinstance(element, dict) else None
        if not isinstance(raw, dict) or raw.get("@type") != "Product":
            continue
        offer = raw.get("offers") or {}
        price = parse_price(offer.get("price"))
        name = str(raw.get("name") or "").strip()
        raw_url = html.unescape(str(raw.get("url") or "").strip())
        product_url = raw_url.split("?", 1)[0].replace(
            "https://super.lider.cl:443/",
            "https://super.lider.cl/",
        )
        sku_match = re.search(r"/([0-9]{14})/?$", product_url)
        sku = sku_match.group(1) if sku_match else None
        availability = str(offer.get("availability") or "")
        if not name or price <= 0 or availability.endswith("OutOfStock"):
            continue
        products.append(
            Product(
                store="Lider",
                query=query,
                name=name,
                price=price,
                list_price=None,
                in_stock=True,
                sku=sku,
                ean=sku,
                product_url=product_url or None,
                image_url=str(raw.get("image") or "").strip() or None,
                scraped_at=observed_at,
            )
        )

    return products, total or len(products), page_count


def santa_categories(home_data: dict[str, Any]) -> list[str]:
    items = home_data.get("menu", {}).get("acf", {}).get("items") or []
    excluded = {"marcas-exclusivas", "productos-importados", "libres-de", "mypes"}
    categories: list[str] = []
    for item in items:
        if item.get("active") is not True:
            continue
        slug = str(item.get("url") or "").strip("/")
        if not slug or "/" in slug or slug in excluded:
            continue
        categories.append(slug)
    return categories


def crawl_tottus(max_pages: int | None = None) -> Iterator[Product]:
    root_payload = fetch_text(f"{TOTTUS_BASE}&page=1")
    categories = parse_tottus_categories(root_payload)
    if not categories:
        raise RuntimeError("Tottus root listing did not publish category facets")

    for category_id, category_name, _ in categories:
        first_payload = fetch_text(tottus_listing_url(category_id, category_name, 1))
        first_products, total, per_page = parse_tottus_page(first_payload, category_name)
        yield from first_products
        page_count = math.ceil(total / max(per_page, 1))
        if max_pages is not None:
            page_count = min(page_count, max_pages)
        if page_count > 200:
            raise RuntimeError(
                f"Tottus category {category_name} still exceeds the public 200-page limit"
            )
        urls = (
            tottus_listing_url(category_id, category_name, page_number)
            for page_number in range(2, page_count + 1)
        )
        for payload in fetch_many(urls):
            products, _, _ = parse_tottus_page(payload, category_name)
            if not products:
                break
            yield from products


def crawl_santa(max_pages: int | None = None) -> Iterator[Product]:
    home_data = extract_santa_render_data(fetch_text("https://www.santaisabel.cl/"))
    for category in santa_categories(home_data):
        page_number = 1
        seen_pages: set[tuple[str, ...]] = set()
        while max_pages is None or page_number <= max_pages:
            final_page = page_number + 3
            if max_pages is not None:
                final_page = min(final_page, max_pages)
            page_numbers = list(range(page_number, final_page + 1))
            urls = [
                f"https://www.santaisabel.cl/{quote(category)}?page={number}"
                for number in page_numbers
            ]
            reached_end = False
            for payload in fetch_many(urls, missing_statuses=(404,)):
                if not payload:
                    reached_end = True
                    break
                products = parse_santa_render_data(extract_santa_render_data(payload), category)
                signature = tuple(sorted(product_key(product) for product in products))
                if not products or signature in seen_pages:
                    reached_end = True
                    break
                seen_pages.add(signature)
                yield from products
            if reached_end or len(page_numbers) < 4:
                break
            page_number += len(page_numbers)


def _require_playwright() -> Any:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError(
            "Playwright is required for Jumbo and Unimarc. "
            "Run: python -m pip install playwright && python -m playwright install chromium"
        ) from error
    return sync_playwright


def crawl_unimarc(max_pages: int | None = None) -> Iterator[Product]:
    sync_playwright = _require_playwright()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT, locale="es-CL")
        try:
            for category in UNIMARC_CATEGORIES:
                page_number = 1
                total = 1
                while page_number <= math.ceil(total / 50):
                    if max_pages is not None and page_number > max_pages:
                        break
                    page.goto(
                        f"https://www.unimarc.cl/category/{category}?page={page_number}",
                        wait_until="domcontentloaded",
                        timeout=45_000,
                    )
                    payload = page.locator("script#__NEXT_DATA__").text_content(timeout=20_000)
                    products, total = parse_unimarc_next_data(payload or "", category)
                    if not products:
                        break
                    yield from products
                    page_number += 1
        finally:
            browser.close()


def crawl_jumbo(max_pages: int | None = None) -> Iterator[Product]:
    # Jumbo renders paginated catalog state client-side. Later pages do not
    # consistently publish JSON-LD, so capture the same JSON catalog responses
    # used by the browser and fall back to rendered JSON-LD for page one.
    sync_playwright = _require_playwright()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT, locale="es-CL")
        captured_payloads: list[dict[str, Any]] = []

        def capture_catalog_response(response: Any) -> None:
            content_type = str(response.headers.get("content-type") or "").casefold()
            if "json" not in content_type:
                return
            try:
                body = response.json()
            except Exception:
                return
            captured_payloads.extend(jumbo_payload_candidates(body))

        def current_catalog_page(category: str) -> tuple[list[Product], int]:
            html_products, html_total = parse_jumbo_html(page.content(), category)
            best_products = html_products
            best_total = html_total
            for payload in captured_payloads:
                payload_products, payload_total = parse_jumbo_payload(payload, category)
                if len(payload_products) > len(best_products):
                    best_products = payload_products
                best_total = max(best_total, payload_total)

            page_hrefs = page.locator('a[href*="page="]').evaluate_all(
                "(nodes) => nodes.map((node) => node.getAttribute('href') || '')"
            )
            rendered_page_count = jumbo_page_count_from_links(page_hrefs)
            if best_products and rendered_page_count > 1:
                best_total = max(
                    best_total,
                    len(best_products) * rendered_page_count,
                )
            return best_products, best_total

        def load_catalog_url(url: str, category: str) -> tuple[list[Product], int]:
            captured_payloads.clear()
            page.goto(url, wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_timeout(3_000)
            return current_catalog_page(category)

        def click_catalog_page(
            page_number: int,
            category: str,
        ) -> tuple[list[Product], int]:
            label = re.compile(rf"^p[aá]gina\\s+{page_number}$", flags=re.I)
            candidates = (
                page.get_by_role("link", name=label),
                page.get_by_role("button", name=label),
                page.locator(f'[aria-label="Página {page_number}"]'),
                page.locator(f'[aria-label="pagina {page_number}" i]'),
            )
            control = next(
                (candidate.first for candidate in candidates if candidate.count() > 0),
                None,
            )
            if control is None:
                raise RuntimeError(
                    f"Jumbo category {category} does not expose a control "
                    f"for page {page_number}"
                )
            captured_payloads.clear()
            control.click(timeout=15_000)
            page.wait_for_timeout(3_000)
            return current_catalog_page(category)

        page.on("response", capture_catalog_response)
        try:
            for category in JUMBO_CATEGORIES:
                base_url = f"https://www.jumbo.cl/{category}"
                first_products, total = load_catalog_url(base_url, category)
                if total > 0 and not first_products:
                    raise RuntimeError(
                        f"Jumbo category {category} published no usable products"
                    )
                yield from first_products

                page_size = max(len(first_products), 1)
                published_page_count = math.ceil(total / page_size)
                probes_until_repeat = published_page_count <= 1
                if max_pages is not None:
                    final_page = max_pages
                elif probes_until_repeat:
                    final_page = 200
                else:
                    final_page = published_page_count

                first_signature = tuple(product_key(product) for product in first_products)
                seen_pages = {first_signature}
                repeated_page = False
                for page_number in range(2, final_page + 1):
                    products, _ = click_catalog_page(page_number, category)
                    signature = tuple(product_key(product) for product in products)
                    if not products:
                        raise RuntimeError(
                            f"Jumbo category {category} returned an empty page "
                            "before completion"
                        )
                    if signature in seen_pages:
                        if probes_until_repeat:
                            repeated_page = True
                            break
                        raise RuntimeError(
                            f"Jumbo category {category} repeated page {page_number} "
                            f"before published page {published_page_count}"
                        )
                    seen_pages.add(signature)
                    yield from products

                if (
                    probes_until_repeat
                    and max_pages is None
                    and not repeated_page
                ):
                    raise RuntimeError(
                        f"Jumbo category {category} exceeded the 200-page safety limit"
                    )
        finally:
            browser.close()


def crawl_lider(max_pages: int | None = None) -> Iterator[Product]:
    def listing_url(page_number: int) -> str:
        return (
            f"{LIDER_CATALOG_URL}?sortingorder=ascending"
            f"&itemsperpage={LIDER_PAGE_SIZE}&display=grid&pagenumber={page_number}"
        )

    first_html = fetch_text(listing_url(1))
    first_products, _, page_count = parse_lider_page(first_html, "catalogo")
    if not first_products or page_count <= 1:
        raise RuntimeError("Lider did not publish a paginated JSON-LD product catalog")
    yield from first_products

    final_page = min(page_count, max_pages) if max_pages is not None else page_count
    first_signature = tuple(product_key(product) for product in first_products)
    seen_pages = {first_signature}
    urls = (listing_url(page_number) for page_number in range(2, final_page + 1))
    for page_html in fetch_many(urls, workers=4):
        products, _, _ = parse_lider_page(page_html, "catalogo")
        signature = tuple(product_key(product) for product in products)
        if not products:
            raise RuntimeError("Lider returned an empty catalog page before the final page")
        if signature in seen_pages:
            raise RuntimeError(
                "Lider repeated a catalog page; refusing to report an incomplete crawl"
            )
        seen_pages.add(signature)
        yield from products


def crawl_acuenta(max_pages: int | None = None) -> Iterator[Product]:
    try:
        home_html = fetch_text(ACUENTA_HOME_URL, headers=ACUENTA_HEADERS)
    except RuntimeError:
        home_html = ""
    categories = acuenta_categories_from_html(home_html)

    for category_name, slug in categories:
        base_url = f"https://www.acuenta.cl/ca/{slug}"
        first_html = fetch_text(base_url, headers=ACUENTA_HEADERS)
        first_products, page_count, total = parse_acuenta_category_page(
            first_html,
            category_name,
        )
        if total > 0 and not first_products:
            raise RuntimeError(f"aCuenta category {category_name} published no usable products")
        yield from first_products
        final_page = min(page_count, max_pages) if max_pages is not None else page_count
        urls = (
            f"{base_url}?currentPage={page_number}"
            for page_number in range(2, final_page + 1)
        )
        for page_html in fetch_many(urls, workers=4, headers=ACUENTA_HEADERS):
            products, _, _ = parse_acuenta_category_page(page_html, category_name)
            if not products:
                raise RuntimeError(
                    f"aCuenta category {category_name} returned an empty page before completion"
                )
            yield from products


def crawl_irurzun(max_pages: int | None = None) -> Iterator[Product]:
    page_number = 1
    while max_pages is None or page_number <= max_pages:
        payload = fetch_text(f"{IRURZUN_PRODUCTS_URL}&page={page_number}")
        root = json.loads(payload)
        raw_products = root.get("products") or []
        if not raw_products:
            break
        yield from parse_irurzun_products(payload)
        page_number += 1

CRAWLERS: dict[str, Callable[[int | None], Iterator[Product]]] = {
    "tottus": crawl_tottus,
    "santaisabel": crawl_santa,
    "unimarc": crawl_unimarc,
    "jumbo": crawl_jumbo,
    "lider": crawl_lider,
    "acuenta": crawl_acuenta,
    "irurzun": crawl_irurzun,
}


def serialize_product(product: Product) -> dict[str, Any]:
    return asdict(product)


def collect_catalog(store: str, max_pages: int | None = None) -> list[Product]:
    crawler = CRAWLERS[store]
    return list(unique_products(crawler(max_pages)))
