#!/usr/bin/env python3
"""Full, paginated supermarket catalog crawlers for scheduled ingestion."""

from __future__ import annotations

import html
import json
import math
import re
import time
from collections.abc import Callable, Iterable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

from scrape_supermarkets import Product, utc_now


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


def fetch_text(url: str, timeout: int = 35) -> str:
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            request = Request(url, headers=HTTP_HEADERS)
            with urlopen(request, timeout=timeout) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                return response.read().decode(charset, errors="replace")
        except (OSError, TimeoutError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(2**attempt)
    raise RuntimeError(f"Public catalog request failed after 3 attempts: {url}") from last_error


def fetch_many(urls: Iterable[str], workers: int = 4) -> Iterator[str]:
    with ThreadPoolExecutor(max_workers=workers) as executor:
        yield from executor.map(fetch_text, urls)


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
            for payload in fetch_many(urls):
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
    sync_playwright = _require_playwright()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT, locale="es-CL")
        try:
            for category in JUMBO_CATEGORIES:
                page_number = 1
                total = 1
                per_page = 40
                while page_number <= math.ceil(total / max(per_page, 1)):
                    if max_pages is not None and page_number > max_pages:
                        break
                    with page.expect_response(
                        lambda response: (
                            response.url == "https://bff.jumbo.cl/catalog/plp"
                            and response.request.method == "POST"
                        ),
                        timeout=45_000,
                    ) as response_info:
                        page.goto(
                            f"https://www.jumbo.cl/{category}?page={page_number}",
                            wait_until="domcontentloaded",
                            timeout=45_000,
                        )
                    payload = response_info.value.json()
                    products, total = parse_jumbo_payload(payload, category)
                    per_page = len(payload.get("products") or []) or per_page
                    if not products:
                        break
                    yield from products
                    page_number += 1
        finally:
            browser.close()


def crawl_lider(max_pages: int | None = None) -> Iterator[Product]:
    del max_pages
    raise RuntimeError(
        "Lider is presenting an interactive human-verification challenge. "
        "A complete crawl requires an authorized product feed or retailer API."
    )


CRAWLERS: dict[str, Callable[[int | None], Iterator[Product]]] = {
    "tottus": crawl_tottus,
    "santaisabel": crawl_santa,
    "unimarc": crawl_unimarc,
    "jumbo": crawl_jumbo,
    "lider": crawl_lider,
}


def serialize_product(product: Product) -> dict[str, Any]:
    return asdict(product)


def collect_catalog(store: str, max_pages: int | None = None) -> list[Product]:
    crawler = CRAWLERS[store]
    return list(unique_products(crawler(max_pages)))
