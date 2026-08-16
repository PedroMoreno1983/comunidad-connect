#!/usr/bin/env python3
"""Crawl complete retailer catalogs and persist them to Supabase in safe batches."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from full_catalog import CatalogCoverageWarning, CRAWLERS, product_key, serialize_product


DEFAULT_BATCH_SIZE = 350


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_environment(name: str, fallback_name: str | None = None) -> str:
    value = os.environ.get(name, "").strip()
    if not value and fallback_name:
        value = os.environ.get(fallback_name, "").strip()
    if not value:
        names = f"{name} or {fallback_name}" if fallback_name else name
        raise RuntimeError(f"Missing required environment variable: {names}")
    return value


def supabase_credentials() -> tuple[str, str]:
    return (
        require_environment("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/"),
        require_environment("SUPABASE_SERVICE_ROLE_KEY"),
    )


def persist_batch(store: str, products: list[dict[str, Any]], batch_number: int) -> dict[str, Any]:
    supabase_url, service_role_key = supabase_credentials()
    fetched_at = utc_now()
    payload = {
        "p_terms": ["catalogo", store, f"lote-{batch_number}"],
        "p_products": products,
        "p_source_status": [
            {
                "store": store,
                "query": "catalogo",
                "status": "ok",
                "count": len(products),
                "batch": batch_number,
            }
        ],
        "p_fetched_at": fetched_at,
    }
    request = Request(
        f"{supabase_url}/rest/v1/rpc/ingest_supermarket_snapshot",
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
        with urlopen(request, timeout=75) as response:
            body = response.read().decode("utf-8")
            result = json.loads(body) if body else {}
            return result if isinstance(result, dict) else {"result": result}
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:2_000]
        raise RuntimeError(
            f"Supabase rejected {store} batch {batch_number} with HTTP {error.code}: {detail}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Could not reach Supabase for {store}: {error.reason}") from error


def catalog_count(store_name: str) -> int:
    supabase_url, service_role_key = supabase_credentials()
    request = Request(
        (
            f"{supabase_url}/rest/v1/supermarket_products"
            f"?select=id&store=eq.{quote(store_name)}&limit=1"
        ),
        method="GET",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
            "Prefer": "count=exact",
        },
    )
    with urlopen(request, timeout=30) as response:
        content_range = response.headers.get("Content-Range", "")
        total = content_range.rsplit("/", 1)[-1]
        return int(total) if total.isdigit() else 0


def finalize_stock_reconciliation(store_name: str, started_at: str) -> dict[str, Any]:
    supabase_url, service_role_key = supabase_credentials()
    finished_at = utc_now()
    payload = {
        "p_store": store_name,
        "p_started_at": started_at,
        "p_finished_at": finished_at,
    }
    request = Request(
        f"{supabase_url}/rest/v1/rpc/finalize_supermarket_catalog_refresh",
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
        with urlopen(request, timeout=75) as response:
            body = response.read().decode("utf-8")
            result = json.loads(body) if body else {}
            if not isinstance(result, dict):
                raise RuntimeError("Supabase returned an invalid stock reconciliation result")
            return result
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:2_000]
        raise RuntimeError(
            f"Supabase rejected {store_name} stock reconciliation with "
            f"HTTP {error.code}: {detail}"
        ) from error
    except URLError as error:
        raise RuntimeError(
            f"Could not reach Supabase while reconciling {store_name}: {error.reason}"
        ) from error


def crawl_store(
    store: str,
    batch_size: int,
    max_pages: int | None,
    dry_run: bool,
) -> dict[str, Any]:
    started = time.time()
    started_at = utc_now()
    display_store = {
        "santaisabel": "Santa Isabel",
        "tottus": "Tottus",
        "unimarc": "Unimarc",
        "jumbo": "Jumbo",
        "lider": "Lider",
        "acuenta": "aCuenta",
        "irurzun": "Irurzun",
    }[store]
    seen: set[str] = set()
    batch: list[dict[str, Any]] = []
    batch_results: list[dict[str, Any]] = []
    scraped_count = 0
    persisted_count = 0

    def flush() -> None:
        nonlocal batch, persisted_count
        if not batch:
            return
        if not dry_run:
            result = persist_batch(display_store, batch, len(batch_results) + 1)
            persisted_count += int(result.get("product_count") or 0)
            batch_results.append(result)
        batch = []

    try:
        for product in CRAWLERS[store](max_pages):
            key = product_key(product)
            if key in seen:
                continue
            seen.add(key)
            scraped_count += 1
            batch.append(serialize_product(product))
            if len(batch) >= batch_size:
                flush()
        flush()
    except CatalogCoverageWarning as warning:
        flush()
        return {
            "store": display_store,
            "status": "refreshed",
            "warning": str(warning),
            "reconciliation_skipped": True,
            "scraped_count": scraped_count,
            "persisted_count": persisted_count,
            "database_count": None if dry_run else catalog_count(display_store),
            "batch_count": len(batch_results),
            "elapsed_seconds": round(time.time() - started, 2),
            "dry_run": dry_run,
        }
    except Exception as error:  # noqa: BLE001 - source failures are part of the report.
        flush()
        return {
            "store": display_store,
            "status": "partial",
            "error": str(error),
            "scraped_count": scraped_count,
            "persisted_count": persisted_count,
            "batch_count": len(batch_results),
            "elapsed_seconds": round(time.time() - started, 2),
            "dry_run": dry_run,
        }

    stock_reconciliation = None
    if not dry_run and max_pages is None:
        try:
            stock_reconciliation = finalize_stock_reconciliation(display_store, started_at)
        except Exception as error:  # noqa: BLE001 - reconciliation failures must fail the job.
            return {
                "store": display_store,
                "status": "partial",
                "error": f"Stock reconciliation failed: {error}",
                "scraped_count": scraped_count,
                "persisted_count": persisted_count,
                "batch_count": len(batch_results),
                "elapsed_seconds": round(time.time() - started, 2),
                "dry_run": dry_run,
            }

    database_count = None if dry_run else catalog_count(display_store)
    return {
        "store": display_store,
        "status": "completed" if scraped_count > 0 else "empty",
        "scraped_count": scraped_count,
        "persisted_count": persisted_count,
        "database_count": database_count,
        "batch_count": len(batch_results),
        "stock_reconciliation": stock_reconciliation,
        "elapsed_seconds": round(time.time() - started, 2),
        "dry_run": dry_run,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Crawl complete supermarket catalogs and persist them in Supabase."
    )
    parser.add_argument(
        "--store",
        choices=(*CRAWLERS.keys(), "all"),
        default="all",
        help="Retailer to crawl. GitHub Actions should run one store per matrix job.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Products per transactional Supabase RPC call.",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        help="Optional per-category/page cap for smoke tests. Omit for the full catalog.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Crawl without writing to Supabase.")
    parser.add_argument("--pretty", action="store_true")
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    args = parse_args()
    started_at = utc_now()
    stores = list(CRAWLERS) if args.store == "all" else [args.store]
    batch_size = max(50, min(args.batch_size, 500))
    max_pages = max(1, args.max_pages) if args.max_pages else None
    results = [
        crawl_store(store, batch_size, max_pages, args.dry_run)
        for store in stores
    ]
    summary = {
        "started_at": started_at,
        "stores": results,
        "completed": sum(result["status"] == "completed" for result in results),
        "refreshed": sum(result["status"] == "refreshed" for result in results),
        "blocked": sum(result["status"] == "blocked" for result in results),
        "partial": sum(result["status"] == "partial" for result in results),
        "total_scraped": sum(int(result.get("scraped_count") or 0) for result in results),
        "total_persisted": sum(int(result.get("persisted_count") or 0) for result in results),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0 if all(
        result["status"] in {"completed", "refreshed"}
        for result in results
    ) else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
