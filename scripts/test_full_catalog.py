#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from full_catalog import (
    extract_santa_render_data,
    parse_jumbo_payload,
    parse_santa_render_data,
    parse_tottus_categories,
    parse_tottus_page,
    parse_unimarc_next_data,
    santa_categories,
    unique_products,
)


class FullCatalogParserTests(unittest.TestCase):
    def test_tottus_categories_split_catalog_below_page_cap(self) -> None:
        payload = json.dumps(
            {
                "data": {
                    "facets": [
                        {
                            "name": "Categoría",
                            "values": [
                                {"id": "CATG27055", "title": "Despensa", "count": 2635},
                                {
                                    "id": "CATG27084",
                                    "title": "Cuidado Personal",
                                    "count": 2277,
                                },
                            ],
                        }
                    ]
                }
            }
        )
        self.assertEqual(
            parse_tottus_categories(payload),
            [("CATG27055", "Despensa", 2635), ("CATG27084", "Cuidado Personal", 2277)],
        )

    def test_tottus_page_parses_total_and_offer(self) -> None:
        payload = json.dumps(
            {
                "data": {
                    "pagination": {"count": 17887, "perPage": 48},
                    "results": [
                        {
                            "displayName": "Arroz Grado 2 1 kg",
                            "brand": "Tottus",
                            "skuId": "123",
                            "url": "https://www.tottus.cl/tottus-cl/articulo/123",
                            "mediaUrls": ["https://img/123.jpg"],
                            "prices": [
                                {"type": "internetPrice", "price": ["1.090"], "crossed": False},
                                {"type": "normalPrice", "price": ["1.390"], "crossed": True},
                            ],
                        }
                    ],
                }
            }
        )
        products, total, per_page = parse_tottus_page(payload)
        self.assertEqual((total, per_page), (17887, 48))
        self.assertEqual(products[0].price, 1090)
        self.assertEqual(products[0].list_price, 1390)
        self.assertEqual(products[0].sku, "123")

    def test_unimarc_next_data_parses_products_and_resource_total(self) -> None:
        payload = json.dumps(
            {
                "props": {
                    "pageProps": {
                        "dehydratedState": {
                            "queries": [
                                {
                                    "state": {
                                        "data": {
                                            "resource": "1614",
                                            "availableProducts": [
                                                {
                                                    "name": "Arroz Tucapel 1 kg",
                                                    "brand": "Tucapel",
                                                    "itemId": "sku-1",
                                                    "slug": "arroz-tucapel-1-kg",
                                                    "images": ["https://img/arroz.jpg"],
                                                    "sellers": [
                                                        {
                                                            "price": 1290,
                                                            "listPrice": 1490,
                                                            "availableQuantity": 8,
                                                        }
                                                    ],
                                                }
                                            ],
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            }
        )
        products, total = parse_unimarc_next_data(payload, "despensa")
        self.assertEqual(total, 1614)
        self.assertEqual(products[0].store, "Unimarc")
        self.assertEqual(products[0].price, 1290)

    def test_jumbo_payload_parses_current_category_response(self) -> None:
        products, total = parse_jumbo_payload(
            {
                "results": 3742,
                "products": [
                    {
                        "reference": "888644",
                        "slug": "mermelada-light",
                        "brand": "Watt's",
                        "items": [
                            {
                                "skuId": "4333",
                                "price": 1190,
                                "listPrice": 1730,
                                "name": "Mermelada Light 200 g",
                                "stock": True,
                                "images": ["https://img/jumbo.jpg"],
                            }
                        ],
                    }
                ],
            },
            "despensa",
        )
        self.assertEqual(total, 3742)
        self.assertEqual(products[0].product_url, "https://www.jumbo.cl/mermelada-light/p")
        self.assertEqual(products[0].list_price, 1730)

    def test_santa_render_data_and_menu_categories(self) -> None:
        render_data = {
            "menu": {
                "acf": {
                    "items": [
                        {"title": "Despensa", "url": "/despensa", "active": True},
                        {
                            "title": "Marcas",
                            "url": "/marcas-exclusivas",
                            "active": True,
                        },
                        {
                            "title": "Subcategoría",
                            "url": "/despensa/arroz",
                            "active": True,
                        },
                    ]
                }
            },
            "plp": {
                "plp_products": {
                    "products": [
                        {
                            "productName": "Leche Entera 1 L",
                            "brand": "Colun",
                            "linkText": "leche-entera",
                            "items": [
                                {
                                    "itemId": "si-1",
                                    "ean": "7800000000001",
                                    "images": [{"imageUrl": "https://img/santa.jpg"}],
                                    "sellers": [
                                        {
                                            "commertialOffer": {
                                                "Price": 990,
                                                "ListPrice": 1090,
                                                "AvailableQuantity": 4,
                                            }
                                        }
                                    ],
                                }
                            ],
                        }
                    ]
                }
            },
        }
        encoded = json.dumps(json.dumps(render_data, ensure_ascii=False))
        extracted = extract_santa_render_data(f"<script>window.__renderData = {encoded}</script>")
        self.assertEqual(santa_categories(extracted), ["despensa"])
        products = parse_santa_render_data(extracted, "despensa")
        self.assertEqual(products[0].price, 990)
        self.assertEqual(products[0].ean, "7800000000001")

    def test_unique_products_prefers_sku_identity(self) -> None:
        render_data = {
            "plp": {
                "plp_products": {
                    "products": [
                        {
                            "productName": "Leche 1 L",
                            "brand": "Colun",
                            "linkText": "leche",
                            "items": [
                                {
                                    "itemId": "same",
                                    "sellers": [
                                        {
                                            "commertialOffer": {
                                                "Price": 1000,
                                                "ListPrice": 1000,
                                                "AvailableQuantity": 5,
                                            }
                                        }
                                    ],
                                }
                            ],
                        }
                    ]
                }
            }
        }
        product = parse_santa_render_data(render_data, "lacteos")[0]
        self.assertEqual(len(list(unique_products([product, product]))), 1)


if __name__ == "__main__":
    unittest.main()
