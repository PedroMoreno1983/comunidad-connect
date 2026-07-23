#!/usr/bin/env python3
"""
Scrape public supermarket product listings and emit normalized JSON.

This is intentionally a batch-ingestion helper, not request-time app logic.
Use it from a scheduled job, inspect the freshness timestamp, and persist the
result before showing prices to residents.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen


REQUEST_TIMEOUT_SECONDS = 18
MAX_TERMS = 12

HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/json",
    "Accept-Language": "es-CL,es;q=0.9",
    "User-Agent": "Mozilla/5.0 (compatible; ConviveConnect/1.0; +https://conviveconnect.com)",
}

STOP_WORDS = {
    "a",
    "al",
    "con",
    "de",
    "del",
    "el",
    "en",
    "la",
    "las",
    "los",
    "para",
    "por",
    "un",
    "una",
    "comprar",
    "compra",
    "necesito",
    "quiero",
    "agrega",
    "agregar",
    "anade",
    "anadir",
    "lista",
}


@dataclass(frozen=True)
class Product:
    store: str
    query: str
    name: str
    price: int
    list_price: int | None
    in_stock: bool
    brand: str | None = None
    sku: str | None = None
    ean: str | None = None
    product_url: str | None = None
    image_url: str | None = None
    scraped_at: str | None = None


@dataclass(frozen=True)
class SourceStatus:
    store: str
    query: str
    status: str
    detail: str | None = None
    count: int = 0


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    ascii_text = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def parse_terms(raw_terms: list[str]) -> list[str]:
    joined = " ".join(raw_terms).strip()
    parts = re.split(r"[,;\n]+|\s+y\s+", joined, flags=re.I)
    terms: list[str] = []

    for part in parts:
        cleaned = re.sub(r"^(hola|necesito|quiero|comprar|agregar)\s+", "", part.strip(), flags=re.I)
        cleaned = re.sub(r"^(un|una|unos|unas)\s+", "", cleaned, flags=re.I)
        term = normalize(cleaned)
        if 2 <= len(term) <= 80 and term not in terms:
            terms.append(term)

    return terms[:MAX_TERMS]


def as_int(value: Any) -> int:
    if isinstance(value, bool) or value is None:
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        digits = re.sub(r"[^0-9]", "", value)
        return int(digits) if digits else 0
    return 0


def first(value: Any) -> Any:
    return value[0] if isinstance(value, list) and value else None


def fetch(url: str) -> str:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def score_name(name: str, query: str) -> int:
    normalized_name = normalize(name)
    tokens = [token for token in normalize(query).split() if token not in STOP_WORDS and len(token) > 1]
    if not tokens:
        return 0
    if any(token not in normalized_name for token in tokens):
        return -1

    score = len(tokens) * 20
    normalized_query = " ".join(tokens)
    if normalized_query in normalized_name:
        score += 100
    if normalized_name.startswith(normalized_query):
        score += 25
    return score


def limit_relevant(products: list[Product], query: str, limit: int) -> list[Product]:
    ranked = [
        (score_name(product.name, query), index, product)
        for index, product in enumerate(products)
    ]
    return [
        product
        for score, _, product in sorted(ranked, key=lambda row: (-row[0], row[1]))
        if score >= 0
    ][:limit]


def scrape_jumbo(query: str, limit: int) -> tuple[list[Product], SourceStatus]:
    url = f"https://www.jumbo.cl/busqueda?ft={quote_plus(query)}"
    try:
        page = fetch(url)
        match = re.search(
            r'<script[^>]+id=["\']__REACT_QUERY_STATE__["\'][^>]*>(.*?)</script>',
            page,
            flags=re.I | re.S,
        )
        if not match:
            return [], SourceStatus("Jumbo", query, "no_state", "No __REACT_QUERY_STATE__ block found")

        state = json.loads(html.unescape(match.group(1)))
        products: list[Product] = []
        for query_state in state.get("dehydratedState", {}).get("queries", []):
            data = query_state.get("state", {}).get("data", {})
            for product in data.get("products", []) or []:
                item = first(product.get("items"))
                if not isinstance(item, dict):
                    continue
                price = as_int(item.get("price"))
                name = str(item.get("name") or product.get("productName") or "")
                if not name or price <= 0:
                    continue
                slug = product.get("slug")
                image_url = first(item.get("images"))
                products.append(Product(
                    store="Jumbo",
                    query=query,
                    name=name,
                    price=price,
                    list_price=as_int(item.get("listPrice")) or None,
                    in_stock=item.get("stock") is not False,
                    brand=str(product.get("brand") or "") or None,
                    sku=str(item.get("skuId") or product.get("reference") or "") or None,
                    product_url=f"https://www.jumbo.cl/{slug}/p" if slug else url,
                    image_url=str(image_url) if image_url else None,
                    scraped_at=utc_now(),
                ))
        relevant = limit_relevant(products, query, limit)
        return relevant, SourceStatus("Jumbo", query, "ok", count=len(relevant))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        return [], SourceStatus("Jumbo", query, "error", str(error))


def scrape_santa_isabel(query: str, limit: int) -> tuple[list[Product], SourceStatus]:
    url = f"https://www.santaisabel.cl/busqueda?ft={quote_plus(query)}"
    try:
        page = fetch(url)
        match = re.search(r"window\.__renderData\s*=\s*(\"(?:\\.|[^\"\\])*\")", page)
        if not match:
            return [], SourceStatus("Santa Isabel", query, "no_state", "No window.__renderData block found")

        render_data = json.loads(json.loads(match.group(1)))
        products: list[Product] = []
        for product in render_data.get("plp", {}).get("plp_products", {}).get("products", []) or []:
            item = first(product.get("items"))
            if not isinstance(item, dict):
                continue
            seller = first(item.get("sellers"))
            offer = seller.get("commertialOffer", {}) if isinstance(seller, dict) else {}
            price = as_int(offer.get("Price"))
            name = str(product.get("productName") or item.get("name") or "")
            if not name or price <= 0:
                continue
            link_text = product.get("linkText")
            image = first(item.get("images"))
            image_url = image.get("imageUrl") if isinstance(image, dict) else None
            products.append(Product(
                store="Santa Isabel",
                query=query,
                name=name,
                price=price,
                list_price=as_int(offer.get("ListPrice")) or None,
                in_stock=as_int(offer.get("AvailableQuantity")) > 0,
                brand=str(product.get("brand") or "") or None,
                sku=str(item.get("itemId") or "") or None,
                ean=str(item.get("ean") or "") or None,
                product_url=f"https://www.santaisabel.cl/{link_text}/p" if link_text else url,
                image_url=str(image_url) if image_url else None,
                scraped_at=utc_now(),
            ))
        relevant = limit_relevant(products, query, limit)
        return relevant, SourceStatus("Santa Isabel", query, "ok", count=len(relevant))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        return [], SourceStatus("Santa Isabel", query, "error", str(error))


def collect_lider_products(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        items: list[dict[str, Any]] = []
        for item in value:
            items.extend(collect_lider_products(item))
        return items
    if not isinstance(value, dict):
        return []
    if value.get("@type") == "ItemList":
        collected = []
        for element in value.get("itemListElement", []) or []:
            item = element.get("item") if isinstance(element, dict) else None
            if isinstance(item, dict) and item.get("@type") == "Product":
                collected.append(item)
        return collected
    collected = []
    for child in value.values():
        collected.extend(collect_lider_products(child))
    return collected


def scrape_lider(query: str, limit: int) -> tuple[list[Product], SourceStatus]:
    slug = normalize(query).replace(" ", "-")
    url = f"https://super.lider.cl/v/{slug}"
    try:
        page = fetch(url)
        products: list[Product] = []
        for match in re.finditer(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            page,
            flags=re.I | re.S,
        ):
            try:
                json_ld = json.loads(html.unescape(match.group(1)))
            except json.JSONDecodeError:
                continue
            for product in collect_lider_products(json_ld):
                offer = product.get("offers", {})
                price = as_int(offer.get("price") if isinstance(offer, dict) else None)
                name = str(product.get("name") or "")
                if not name or price <= 0:
                    continue
                products.append(Product(
                    store="Lider",
                    query=query,
                    name=name,
                    price=price,
                    list_price=None,
                    in_stock="InStock" in str(offer.get("availability") if isinstance(offer, dict) else ""),
                    brand=None,
                    sku=None,
                    product_url=str(product.get("url") or url),
                    image_url=str(product.get("image") or "") or None,
                    scraped_at=utc_now(),
                ))
        relevant = limit_relevant(products, query, limit)
        return relevant, SourceStatus("Lider", query, "ok", count=len(relevant))
    except (HTTPError, URLError, TimeoutError) as error:
        return [], SourceStatus("Lider", query, "error", str(error))


def scrape_unimarc(query: str, limit: int) -> tuple[list[Product], SourceStatus]:
    # The public web app currently renders prices for users, but its BFF rejects
    # server-side requests from this environment. Keep this explicit so we do
    # not mix stale/search-engine prices into production data.
    endpoint = (
        "https://bff-unimarc-ecommerce.unimarc.cl"
        f"/products/intelligence-search/{quote_plus(query)}/?from=0&to={max(limit - 1, 0)}&hideUnavailableItems=1"
    )
    try:
        fetch(endpoint)
        return [], SourceStatus("Unimarc", query, "unsupported", "Unexpectedly reachable; adapter not normalized")
    except (HTTPError, URLError, TimeoutError) as error:
        return [], SourceStatus("Unimarc", query, "blocked", str(error))


SCRAPERS = {
    "jumbo": scrape_jumbo,
    "santaisabel": scrape_santa_isabel,
    "lider": scrape_lider,
    "unimarc": scrape_unimarc,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape supermarket prices from public retailer pages.")
    parser.add_argument("terms", nargs="+", help="Product terms, e.g. arroz leche huevos")
    parser.add_argument("--limit", type=int, default=8, help="Max products per store/query")
    parser.add_argument(
        "--stores",
        default="jumbo,santaisabel,lider,unimarc",
        help="Comma-separated stores: jumbo,santaisabel,lider,unimarc",
    )
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    terms = parse_terms(args.terms)
    stores = [store.strip().lower() for store in args.stores.split(",") if store.strip()]
    unknown = [store for store in stores if store not in SCRAPERS]
    if unknown:
        print(json.dumps({"error": f"Unknown stores: {', '.join(unknown)}"}), file=sys.stderr)
        return 2

    started = time.time()
    all_products: list[Product] = []
    statuses: list[SourceStatus] = []

    for query in terms:
        for store in stores:
            products, status = SCRAPERS[store](query, max(1, args.limit))
            all_products.extend(products)
            statuses.append(status)

    payload = {
        "fetched_at": utc_now(),
        "elapsed_seconds": round(time.time() - started, 2),
        "terms": terms,
        "products": [asdict(product) for product in all_products],
        "source_status": [asdict(status) for status in statuses],
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
