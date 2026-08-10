#!/usr/bin/env python3

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ingest_full_supermarket_catalog as ingest
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


if __name__ == "__main__":
    unittest.main()
