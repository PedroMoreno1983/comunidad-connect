#!/usr/bin/env python3
"""Scrape real supermarket prices and persist one transactional Supabase snapshot."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from scrape_jumbo_products import scrape as scrape_jumbo
from scrape_supermarkets import scrape_acuenta, scrape_irurzun, scrape_lider, scrape_santa_isabel, scrape_unimarc


DEFAULT_TERMS = (
    "arroz",
    "leche",
    "huevos",
    "aceite",
    "pan molde",
    "pollo",
    "carne molida",
    "papas",
    "tomates",
    "detergente",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_terms(cli_terms: list[str]) -> list[str]:
    raw_terms = cli_terms
    if not raw_terms:
        configured = os.environ.get("SUPERMARKET_SEARCH_TERMS", "")
        raw_terms = configured.split(",") if configured.strip() else list(DEFAULT_TERMS)

    terms: list[str] = []
    for raw_term in raw_terms:
        term = " ".join(raw_term.strip().lower().split())
        if 2 <= len(term) <= 80 and term not in terms:
            terms.append(term)
    return terms[:20]


def collect_snapshot(terms: list[str], limit: int) -> dict[str, Any]:
    started = time.time()
    products: list[dict[str, Any]] = []
    source_status: list[dict[str, Any]] = []

    for query in terms:
        jumbo_payload = scrape_jumbo(query, limit)
        jumbo_products = jumbo_payload.get("products")
        normalized_jumbo = jumbo_products if isinstance(jumbo_products, list) else []
        products.extend(normalized_jumbo)
        source_status.append({
            "store": "Jumbo",
            "query": query,
            "status": jumbo_payload.get("status", "error"),
            "detail": jumbo_payload.get("detail"),
            "count": len(normalized_jumbo),
        })

        for scraper in (scrape_santa_isabel, scrape_lider, scrape_unimarc, scrape_acuenta, scrape_irurzun):
            scraped_products, status = scraper(query, limit)
            products.extend(asdict(product) for product in scraped_products)
            source_status.append(asdict(status))

    return {
        "fetched_at": utc_now(),
        "elapsed_seconds": round(time.time() - started, 2),
        "terms": terms,
        "products": products,
        "source_status": source_status,
    }


def require_environment(name: str, fallback_name: str | None = None) -> str:
    value = os.environ.get(name, "").strip()
    if not value and fallback_name:
        value = os.environ.get(fallback_name, "").strip()
    if not value:
        names = f"{name} or {fallback_name}" if fallback_name else name
        raise RuntimeError(f"Missing required environment variable: {names}")
    return value


def persist_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    supabase_url = require_environment("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    service_role_key = require_environment("SUPABASE_SERVICE_ROLE_KEY")
    rpc_url = f"{supabase_url}/rest/v1/rpc/ingest_supermarket_snapshot"
    payload = {
        "p_terms": snapshot["terms"],
        "p_products": snapshot["products"],
        "p_source_status": snapshot["source_status"],
        "p_fetched_at": snapshot["fetched_at"],
    }
    request = Request(
        rpc_url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=45) as response:
            body = response.read().decode("utf-8")
            parsed = json.loads(body) if body else {}
            return parsed if isinstance(parsed, dict) else {"result": parsed}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:1500]
        raise RuntimeError(f"Supabase ingestion failed with HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach Supabase: {error.reason}") from error


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Scrape and persist supermarket price snapshots.")
    parser.add_argument("terms", nargs="*", help="Search terms. Quote terms containing spaces.")
    parser.add_argument("--limit", type=int, default=5, help="Maximum products per store and term.")
    parser.add_argument("--dry-run", action="store_true", help="Scrape without writing to Supabase.")
    parser.add_argument("--pretty", action="store_true")
    args = parser.parse_args()

    terms = parse_terms(args.terms)
    snapshot = collect_snapshot(terms, max(1, min(args.limit, 20)))
    ok_sources = sum(1 for source in snapshot["source_status"] if source.get("status") == "ok")
    summary: dict[str, Any] = {
        "fetched_at": snapshot["fetched_at"],
        "elapsed_seconds": snapshot["elapsed_seconds"],
        "terms": terms,
        "product_count": len(snapshot["products"]),
        "ok_sources": ok_sources,
        "source_count": len(snapshot["source_status"]),
        "dry_run": args.dry_run,
    }

    if not snapshot["products"]:
        summary["error"] = "No products were scraped; snapshot was not persisted."
        print(json.dumps(summary, ensure_ascii=False, indent=2 if args.pretty else None))
        return 2

    if not args.dry_run:
        summary["ingestion"] = persist_snapshot(snapshot)

    print(json.dumps(summary, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
