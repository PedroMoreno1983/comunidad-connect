import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from full_catalog import parse_jumbo_payload, parse_tottus_page  # noqa: E402
from jumbo_vtex_ean import jumbo_vtex_ean_url, parse_vtex_sku_eans, with_jumbo_eans  # noqa: E402
from scrape_supermarkets import Product  # noqa: E402
from supermarket_gtin import gtin_check_digit, normalize_gtin  # noqa: E402


def product(store: str, name: str, sku: str | None = None, ean: str | None = None) -> Product:
    return Product(store=store, query="catalogo", name=name, price=1000, list_price=None,
                   in_stock=True, sku=sku, ean=ean)


class GtinNormalizationTests(unittest.TestCase):
    def test_lider_code_without_check_digit_gets_one(self) -> None:
        # Fila real de Lider (17-oct-2026): 14 dígitos con ceros y sin DV.
        self.assertEqual(gtin_check_digit("780462162162"), 9)
        self.assertEqual(normalize_gtin("00780462162162", "Lider"), "7804621621629")

    def test_lider_and_santa_isabel_share_the_same_canonical_code(self) -> None:
        # "Lasaña Tradicional Caja 400 g Carozzi" en Lider, aCuenta, Santa Isabel y Unimarc.
        self.assertEqual(normalize_gtin("00780257500726", "Lider"), "7802575007261")
        self.assertEqual(normalize_gtin("7802575007261", "Santa Isabel"), "7802575007261")
        self.assertEqual(normalize_gtin("7802575007261", "aCuenta"), "7802575007261")

    def test_upc_and_ean8_are_left_padded(self) -> None:
        self.assertEqual(normalize_gtin("078014046", "Unimarc"), "0000078014046")
        self.assertEqual(normalize_gtin("00000007801404", "Lider"), "0000078014046")
        self.assertEqual(normalize_gtin("036000291452"), "0036000291452")

    def test_invalid_internal_and_restricted_codes_are_dropped(self) -> None:
        self.assertIsNone(normalize_gtin("7802575007262"))  # DV inválido
        self.assertIsNone(normalize_gtin("12345"))  # PLU interno
        self.assertIsNone(normalize_gtin(""))
        self.assertIsNone(normalize_gtin(None))
        self.assertIsNone(normalize_gtin("abc7802575007261"))
        self.assertIsNone(normalize_gtin("2000000000008"))  # pesable 2x
        self.assertIsNone(normalize_gtin("400000000003"))  # UPC uso interno 4x

    def test_product_derives_gtin_from_ean(self) -> None:
        self.assertEqual(product("Lider", "Lasaña", ean="00780257500726").gtin, "7802575007261")
        self.assertIsNone(product("Tottus", "Queso").gtin)


class JumboVtexEanTests(unittest.TestCase):
    payload = json.dumps([
        {"productId": "6664", "items": [
            {"itemId": "6752", "ean": "7613030049883",
             "name": "Leche Condensada Nestlé Azucarada Tarro 397 g"},
        ]},
        {"productId": "1", "items": [{"itemId": "1858600", "ean": "7800000000001", "name": "Otra cosa"}]},
    ])

    def test_batch_url_ors_sku_filters(self) -> None:
        url = jumbo_vtex_ean_url(["6752", "96672"])
        self.assertIn("fq=skuId%3A6752&fq=skuId%3A96672", url)
        self.assertIn("_to=1", url)

    def test_parse_and_enrich_by_sku_when_names_agree(self) -> None:
        self.assertEqual(parse_vtex_sku_eans(self.payload)["6752"][0], "7613030049883")
        calls: list[str] = []

        def fetch(url: str) -> str:
            calls.append(url)
            return self.payload

        enriched = list(with_jumbo_eans([
            product("Jumbo", "Leche Condensada Nestlé Azucarada Tarro 397 g", sku="6752"),
            product("Jumbo", "Lasaña Carozzi 400 g", sku="1858600"),  # refId, otro producto
            product("Jumbo", "Sin sku"),
        ], fetch, batch_size=50))
        self.assertEqual(len(calls), 1)
        self.assertEqual(enriched[0].gtin, "7613030049883")
        self.assertIsNone(enriched[1].ean)
        self.assertIsNone(enriched[2].ean)

    def test_lookup_failure_keeps_products_without_ean(self) -> None:
        def broken(_url: str) -> str:
            raise RuntimeError("down")

        enriched = list(with_jumbo_eans([product("Jumbo", "X", sku="1")] * 3, broken, batch_size=2))
        self.assertEqual(len(enriched), 3)
        self.assertTrue(all(item.ean is None for item in enriched))

    def test_pending_products_survive_a_late_crawler_error(self) -> None:
        def crawler():
            yield product("Jumbo", "A", sku="1")
            raise RuntimeError("coverage")

        received: list[Product] = []
        with self.assertRaises(RuntimeError):
            for item in with_jumbo_eans(crawler(), lambda _url: "[]", batch_size=50):
                received.append(item)
        self.assertEqual(len(received), 1)

    def test_listing_payloads_read_ean_when_present(self) -> None:
        products, _ = parse_jumbo_payload({"products": [{"slug": "x", "brand": "B", "items": [
            {"skuId": "6752", "name": "Leche", "price": 2070, "ean": "7613030049883"},
        ]}]}, "despensa")
        self.assertEqual(products[0].gtin, "7613030049883")
        tottus, _, _ = parse_tottus_page(json.dumps({"data": {"results": [{
            "displayName": "Queso Ranco Laminado Flowpack Colun 500 g", "skuId": "110622483",
            "prices": [{"type": "internetPrice", "crossed": False, "price": ["5.690"]}],
            "okayToShopBarcodes": ["7802920777252"],
        }]}}))
        self.assertEqual(tottus[0].gtin, "7802920777252")


if __name__ == "__main__":
    unittest.main()
