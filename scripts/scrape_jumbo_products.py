#!/usr/bin/env python3
"""Scrape real Jumbo product cards with Python Playwright."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote_plus


@dataclass(frozen=True)
class Product:
    store: str
    query: str
    name: str
    price: int
    list_price: int | None
    in_stock: bool
    brand: str | None
    product_url: str
    scraped_at: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value)
    ascii_text = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def as_int(value: str) -> int:
    digits = re.sub(r"[^0-9]", "", value)
    return int(digits) if digits else 0


def matches_query(name: str, query: str) -> bool:
    normalized_name = normalize(name)
    return all(token in normalized_name for token in normalize(query).split() if len(token) > 1)


def parse_card(query: str, text: str, href: str) -> Product | None:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    product_indexes = [
        index
        for index, line in enumerate(lines)
        if matches_query(line, query) and not normalize(line).startswith("busqueda")
    ]
    if not product_indexes:
        return None

    product_index = product_indexes[-1]
    name = lines[product_index]
    previous = lines[max(0, product_index - 8):product_index]
    price_lines = [
        line
        for line in previous
        if re.match(r"^\$\s*[\d.]+", line) and " x " not in normalize(line)
    ]
    if not price_lines:
        return None

    price = as_int(price_lines[0])
    if price <= 0:
        return None

    list_price = as_int(price_lines[1]) if len(price_lines) > 1 else 0
    brand_candidates = [
        line
        for line in reversed(previous)
        if not line.startswith("$")
        and normalize(line) not in {"oferta", "nuevo"}
        and not normalize(line).startswith("lleva ")
    ]

    return Product(
        store="Jumbo",
        query=query,
        name=name,
        price=price,
        list_price=list_price if list_price > price else None,
        in_stock=True,
        brand=brand_candidates[0] if brand_candidates else None,
        product_url=href,
        scraped_at=utc_now(),
    )


def scrape(query: str, limit: int) -> dict[str, Any]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        return {
            "store": "Jumbo",
            "query": query,
            "status": "missing_dependency",
            "detail": f"Install Python Playwright to use this scraper: {error}",
            "products": [],
        }

    started = time.time()
    url = f"https://www.jumbo.cl/busqueda?ft={quote_plus(query)}"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            locale="es-CL",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/126 Safari/537.36"
            ),
        )
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        page.wait_for_timeout(10_000)
        cards = page.evaluate(
            """
            () => Array.from(document.querySelectorAll('a[href]'))
              .map((link) => {
                const url = new URL(link.href, location.href);
                if (url.hostname !== 'www.jumbo.cl' || !url.pathname.endsWith('/p')) return null;
                let card = link;
                for (let depth = 0; depth < 8 && card.parentElement; depth += 1) {
                  const text = card.innerText || '';
                  if (text.includes('Agregar') && text.includes('$')) break;
                  card = card.parentElement;
                }
                return { href: url.href, text: card.innerText || link.innerText || '' };
              })
              .filter(Boolean)
              .filter((item, index, arr) => item.text && arr.findIndex((other) => other.href === item.href) === index)
            """
        )
        browser.close()

    products: list[Product] = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        href = str(card.get("href") or "")
        product = parse_card(query, str(card.get("text") or ""), href)
        if product:
            products.append(product)

    return {
        "store": "Jumbo",
        "query": query,
        "status": "ok",
        "fetched_at": utc_now(),
        "elapsed_seconds": round(time.time() - started, 2),
        "products": [asdict(product) for product in products[:limit]],
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Scrape Jumbo product cards with Python Playwright.")
    parser.add_argument("query")
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    result = scrape(args.query, max(1, args.limit))
    print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0 if result.get("status") == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
