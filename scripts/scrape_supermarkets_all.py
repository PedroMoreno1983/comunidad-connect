#!/usr/bin/env python3
"""Batch scrape supermarket prices into one normalized JSON payload."""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any

from scrape_jumbo_products import scrape as scrape_jumbo
from scrape_supermarkets import parse_terms, scrape_lider, scrape_santa_isabel, scrape_unimarc


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_jumbo_payload(payload: dict[str, Any], query: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    products = payload.get("products") if isinstance(payload.get("products"), list) else []
    return products, {
        "store": "Jumbo",
        "query": query,
        "status": payload.get("status", "error"),
        "detail": payload.get("detail"),
        "count": len(products),
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Scrape supermarket prices from public retailer pages.")
    parser.add_argument("terms", nargs="+", help="Product terms, e.g. arroz leche huevos")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    started = time.time()
    terms = parse_terms(args.terms)
    all_products: list[dict[str, Any]] = []
    source_status: list[dict[str, Any]] = []

    for query in terms:
        jumbo_products, jumbo_status = normalize_jumbo_payload(scrape_jumbo(query, args.limit), query)
        all_products.extend(jumbo_products)
        source_status.append(jumbo_status)

        for scraper in (scrape_santa_isabel, scrape_lider, scrape_unimarc):
            products, status = scraper(query, args.limit)
            all_products.extend(asdict(product) for product in products)
            source_status.append(asdict(status))

    payload = {
        "fetched_at": utc_now(),
        "elapsed_seconds": round(time.time() - started, 2),
        "terms": terms,
        "products": all_products,
        "source_status": source_status,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
