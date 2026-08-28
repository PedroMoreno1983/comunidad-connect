#!/usr/bin/env python3

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ingest_full_supermarket_catalog as ingest
from full_catalog import CatalogCoverageWarning
from scrape_supermarkets import Product


def sample_product() -> Product:
    return Product(
        store="Tottus",
        query="catalogo",
        name="Arroz 1 kg",
        price=1290,
        list_price=1490,
        in_stock=True,
        sku="sku-1",
        scraped_at="2026-08-10T12:00:00+00:00",
    )


class FullCatalogIngestionTests(unittest.TestCase):
    def test_complete_full_crawl_reconciles_stock(self) -> None:
        reconciliation = {"marked_out_of_stock": 3}
        with (
            patch.dict(ingest.CRAWLERS, {"tottus": lambda _max_pages: iter([sample_product()])}),
            patch.object(
                ingest,
                "persist_batch",
                return_value={"product_count": 1},
            ) as persist,
            patch.object(
                ingest,
                "finalize_stock_reconciliation",
                return_value=reconciliation,
            ) as finalize,
            patch.object(ingest, "catalog_count", return_value=1),
        ):
            result = ingest.crawl_store("tottus", 50, None, False)

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["stock_reconciliation"], reconciliation)
        persist.assert_called_once()
        finalize.assert_called_once()
        self.assertEqual(finalize.call_args.args[0], "Tottus")

    def test_limited_crawl_never_reconciles_stock(self) -> None:
        with (
            patch.dict(ingest.CRAWLERS, {"tottus": lambda _max_pages: iter([sample_product()])}),
            patch.object(ingest, "persist_batch", return_value={"product_count": 1}),
            patch.object(ingest, "finalize_stock_reconciliation") as finalize,
            patch.object(ingest, "catalog_count", return_value=1),
        ):
            result = ingest.crawl_store("tottus", 50, 1, False)

        self.assertEqual(result["status"], "completed")
        self.assertIsNone(result["stock_reconciliation"])
        finalize.assert_not_called()

    def test_partial_crawl_never_reconciles_stock(self) -> None:
        def broken_crawler(_max_pages: int | None):
            yield sample_product()
            raise RuntimeError("retailer stopped responding")

        with (
            patch.dict(ingest.CRAWLERS, {"tottus": broken_crawler}),
            patch.object(ingest, "persist_batch", return_value={"product_count": 1}),
            patch.object(ingest, "finalize_stock_reconciliation") as finalize,
        ):
            result = ingest.crawl_store("tottus", 50, None, False)

        self.assertEqual(result["status"], "partial")
        self.assertIn("retailer stopped responding", result["error"])
        finalize.assert_not_called()

    def test_refreshed_crawl_persists_coverage_without_reconciling_stock(self) -> None:
        def refreshed_crawler(_max_pages: int | None):
            yield sample_product()
            raise CatalogCoverageWarning("terminal page was empty")

        with (
            patch.dict(ingest.CRAWLERS, {"tottus": refreshed_crawler}),
            patch.object(ingest, "persist_batch", return_value={"product_count": 1}),
            patch.object(ingest, "finalize_stock_reconciliation") as finalize,
            patch.object(ingest, "catalog_count", return_value=1),
        ):
            result = ingest.crawl_store("tottus", 50, None, False)

        self.assertEqual(result["status"], "refreshed")
        self.assertTrue(result["reconciliation_skipped"])
        self.assertIn("terminal page was empty", result["warning"])
        finalize.assert_not_called()

    def test_reconciliation_failure_fails_the_job(self) -> None:
        with (
            patch.dict(ingest.CRAWLERS, {"tottus": lambda _max_pages: iter([sample_product()])}),
            patch.object(ingest, "persist_batch", return_value={"product_count": 1}),
            patch.object(
                ingest,
                "finalize_stock_reconciliation",
                side_effect=RuntimeError("coverage below safe threshold"),
            ),
        ):
            result = ingest.crawl_store("tottus", 50, None, False)

        self.assertEqual(result["status"], "partial")
        self.assertIn("coverage below safe threshold", result["error"])

    def test_persist_timeout_reports_partial_instead_of_crashing(self) -> None:
        def crawler(_max_pages: int | None):
            yield sample_product()
            yield Product(
                store="Tottus",
                query="catalogo",
                name="Leche 1 L",
                price=990,
                list_price=None,
                in_stock=True,
                sku="sku-2",
                scraped_at="2026-08-10T12:00:00+00:00",
            )

        with (
            patch.dict(ingest.CRAWLERS, {"tottus": crawler}),
            patch.object(
                ingest,
                "persist_batch",
                side_effect=RuntimeError(
                    'Supabase rejected Tottus batch 1 with HTTP 500: {"code":"57014"}'
                ),
            ),
            patch.object(ingest, "finalize_stock_reconciliation") as finalize,
        ):
            result = ingest.crawl_store("tottus", 50, None, False)

        self.assertEqual(result["status"], "partial")
        self.assertIn("57014", result["error"])
        self.assertEqual(result["scraped_count"], 2)
        finalize.assert_not_called()

    def test_statement_timeout_is_retryable(self) -> None:
        self.assertTrue(
            ingest.persist_error_is_retryable(
                500,
                '{"code":"57014","message":"canceling statement due to statement timeout"}',
            )
        )
        self.assertTrue(ingest.persist_error_is_retryable(503, "backend unavailable"))
        self.assertFalse(ingest.persist_error_is_retryable(400, '{"code":"22P02"}'))

    def test_persist_batch_retries_statement_timeout_then_succeeds(self) -> None:
        attempts = {"n": 0}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'{"product_count": 2}'

        def fake_urlopen(_request, timeout=90):
            attempts["n"] += 1
            if attempts["n"] < 3:
                raise HTTPError(
                    "https://example.supabase.co/rest/v1/rpc/ingest_supermarket_snapshot",
                    500,
                    "Internal Server Error",
                    None,  # type: ignore[arg-type]
                    io.BytesIO(
                        b'{"code":"57014","message":"canceling statement due to statement timeout"}'
                    ),
                )
            return FakeResponse()

        with (
            patch.object(
                ingest,
                "supabase_credentials",
                return_value=("https://example.supabase.co", "service-role"),
            ),
            patch.object(ingest, "urlopen", fake_urlopen),
            patch.object(ingest.time, "sleep"),
        ):
            result = ingest.persist_batch("Tottus", [{"store": "Tottus", "name": "Arroz"}], 21)

        self.assertEqual(result["product_count"], 2)
        self.assertEqual(attempts["n"], 3)


if __name__ == "__main__":
    unittest.main()
