import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from full_catalog import parse_jumbo_payload, parse_tottus_page  # noqa: E402
import io  # noqa: E402
from contextlib import redirect_stderr  # noqa: E402

from jumbo_vtex_ean import (  # noqa: E402
    jumbo_url_slug,
    jumbo_vtex_ean_url,
    jumbo_vtex_slug_url,
    parse_vtex_sku_eans,
    with_jumbo_eans,
)
from scrape_supermarkets import Product  # noqa: E402
from supermarket_gtin import gtin_check_digit, normalize_gtin  # noqa: E402


def product(store: str, name: str, sku: str | None = None, ean: str | None = None,
            url: str | None = None) -> Product:
    return Product(store=store, query="catalogo", name=name, price=1000, list_price=None,
                   in_stock=True, sku=sku, ean=ean, product_url=url)


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
        # Primero por refId; lo que queda sin EAN se reintenta por skuId.
        self.assertEqual(len(calls), 2)
        self.assertIn("alternateIds_RefId%3A6752", calls[0])
        self.assertIn("skuId%3A6752", calls[1])
        self.assertEqual(enriched[0].gtin, "7613030049883")
        self.assertIsNone(enriched[1].ean)
        self.assertIsNone(enriched[2].ean)

    # Respuesta real de jumbocl.vtexcommercestable.com.br (17-oct-2026) a
    # fq=alternateIds_RefId:1993595: el sku que guarda el crawl es el refId.
    refid_payload = json.dumps([
        {"productId": "134917", "productReference": "1993595",
         "productName": "Té Negro Orgánico Marley Coffee Sweet Vainilla 12 un.",
         "items": [{"itemId": "135211", "ean": "737186390211",
                    "name": "Té Negro Orgánico Marley Coffee Sweet Vainilla 12 un.",
                    "referenceId": [{"Key": "RefId", "Value": "1993595"}]}]},
    ])

    def test_crawl_sku_is_resolved_as_refid(self) -> None:
        calls: list[str] = []

        def fetch(url: str) -> str:
            calls.append(url)
            # fq=skuId:1993595 devuelve [] en producción: esa fue la causa del 0 EAN.
            return self.refid_payload if "alternateIds_RefId" in url else "[]"

        enriched = list(with_jumbo_eans([
            product("Jumbo", "Té Negro Orgánico Marley Coffee Sweet Vainilla 12 un.", sku="1993595"),
        ], fetch))
        self.assertEqual(len(calls), 1)  # resuelto por refId: no hace falta la 2ª consulta
        self.assertEqual(enriched[0].ean, "737186390211")
        self.assertEqual(enriched[0].gtin, "0737186390211")

    def test_refid_match_still_requires_same_name(self) -> None:
        enriched = list(with_jumbo_eans(
            [product("Jumbo", "Garam Masala La Sazonería 52 g", sku="1993595")],
            lambda url: self.refid_payload if "alternateIds_RefId" in url else "[]",
        ))
        self.assertIsNone(enriched[0].ean)

    def test_single_failed_batch_does_not_disable_lookup(self) -> None:
        state = {"calls": 0}

        def flaky(url: str) -> str:
            state["calls"] += 1
            if state["calls"] == 1:
                raise RuntimeError("timeout")
            return self.refid_payload if "alternateIds_RefId" in url else "[]"

        name = "Té Negro Orgánico Marley Coffee Sweet Vainilla 12 un."
        enriched = list(with_jumbo_eans(
            [product("Jumbo", name, sku="1993595"), product("Jumbo", name, sku="1993595")],
            flaky,
            batch_size=1,
        ))
        self.assertIsNone(enriched[0].ean)
        self.assertEqual(enriched[1].ean, "737186390211")

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


class JumboSlugLookupTests(unittest.TestCase):
    """Filas del respaldo JSON-LD: sin sku y con URL sin refId (17-oct-2026)."""

    url = "https://www.jumbo.cl/shampoo-simond-s-2-en-1-para-reci-n-nacido-500-ml/p"
    name = "Shampoo y Jabón Simond's 2 En 1 Recién Nacido 500 ml"
    # Respuesta real de /api/catalog_system/pub/products/search/<linkText>/p.
    payload = json.dumps([{
        "productId": "55600", "productReference": "1730533",
        "linkText": "shampoo-simond-s-2-en-1-para-reci-n-nacido-500-ml",
        "productName": "Shampoo y Jabón Simond's 2 En 1 Recién Nacido 500 ml",
        "items": [{"itemId": "55633", "ean": "7804945011694",
                   "name": "Shampoo y Jabón Simond's 2 En 1 Recién Nacido 500 ml",
                   "referenceId": [{"Key": "RefId", "Value": "1730533"}]}],
    }])

    def test_slug_comes_from_url_without_refid(self) -> None:
        self.assertEqual(jumbo_url_slug(self.url), "shampoo-simond-s-2-en-1-para-reci-n-nacido-500-ml")
        self.assertEqual(jumbo_url_slug("https://www.jumbo.cl/te-marley-1993595/p?x=1"), "te-marley-1993595")
        self.assertIsNone(jumbo_url_slug("https://www.santaisabel.cl/algo/p"))
        self.assertIsNone(jumbo_url_slug(None))
        self.assertTrue(jumbo_vtex_slug_url("a-b/p").endswith("/products/search/a-b%2Fp/p"))

    def test_slug_lookup_fills_ean_and_refid_as_sku(self) -> None:
        calls: list[str] = []

        def fetch(url: str) -> str:
            calls.append(url)
            return self.payload if url.endswith("/search/shampoo-simond-s-2-en-1-para-reci-n-nacido-500-ml/p") else "[]"

        err = io.StringIO()
        with redirect_stderr(err):
            enriched = list(with_jumbo_eans([product("Jumbo", self.name, url=self.url)], fetch))
        self.assertEqual(len(calls), 1)  # resuelto por linkText: sin consulta por refId
        self.assertEqual(enriched[0].ean, "7804945011694")
        self.assertEqual(enriched[0].gtin, "7804945011694")
        self.assertEqual(enriched[0].sku, "1730533")
        self.assertIn("jumbo slug lookup: 1 of 1 products matched", err.getvalue())

    def test_slug_lookup_requires_same_name(self) -> None:
        with redirect_stderr(io.StringIO()):
            enriched = list(with_jumbo_eans(
                [product("Jumbo", "Otro producto 1 kg", url=self.url)], lambda _url: self.payload,
            ))
        self.assertIsNone(enriched[0].ean)
        self.assertIsNone(enriched[0].sku)

    def test_rows_with_sku_never_use_slug_lookup(self) -> None:
        calls: list[str] = []

        def fetch(url: str) -> str:
            calls.append(url)
            return "[]"

        with redirect_stderr(io.StringIO()):
            list(with_jumbo_eans([product("Jumbo", self.name, sku="1730533", url=self.url)], fetch))
        self.assertTrue(calls)
        self.assertTrue(all("fq=" in url for url in calls))

    def test_three_failed_slug_batches_disable_slug_lookup(self) -> None:
        calls: list[str] = []

        def broken(url: str) -> str:
            calls.append(url)
            raise RuntimeError("down")

        rows = [product("Jumbo", self.name, url=self.url) for _ in range(5)]
        err = io.StringIO()
        with redirect_stderr(err):
            enriched = list(with_jumbo_eans(rows, broken, batch_size=1, slug_workers=1))
        self.assertEqual(len(enriched), 5)
        self.assertEqual(len(calls), 3)
        self.assertIn("jumbo slug lookup disabled", err.getvalue())

    def test_partial_slug_failures_do_not_count_as_a_failed_batch(self) -> None:
        state = {"calls": 0}

        def flaky(url: str) -> str:
            state["calls"] += 1
            if state["calls"] % 2:
                raise RuntimeError("timeout")
            return self.payload

        rows = [product("Jumbo", self.name, url=self.url) for _ in range(8)]
        with redirect_stderr(io.StringIO()):
            enriched = list(with_jumbo_eans(rows, flaky, batch_size=2, slug_workers=1))
        self.assertEqual(state["calls"], 8)
        self.assertEqual(sum(1 for item in enriched if item.ean), 4)


if __name__ == "__main__":
    unittest.main()
