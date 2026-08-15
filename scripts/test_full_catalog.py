#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from full_catalog import (
    ACUENTA_FALLBACK_CATEGORIES,
    acuenta_categories_from_html,
    extract_santa_render_data,
    extract_next_flight_stream,
    jumbo_page_count_from_links,
    jumbo_pagination_target,
    jumbo_payload_candidates,
    parse_acuenta_categories,
    parse_acuenta_category_page,
    parse_irurzun_products,
    parse_jumbo_html,
    parse_jumbo_payload,
    parse_lider_page,
    parse_santa_render_data,
    parse_tottus_categories,
    parse_tottus_page,
    parse_unimarc_next_data,
    santa_categories,
    unique_products,
)


class FullCatalogParserTests(unittest.TestCase):
    def test_acuenta_uses_stable_categories_when_homepage_is_blocked(self) -> None:
        categories = acuenta_categories_from_html("")
        self.assertEqual(categories, list(ACUENTA_FALLBACK_CATEGORIES))
        self.assertIn(("Despensa", "despensa/05"), categories)

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

    def test_jumbo_page_count_reads_rendered_pagination_links(self) -> None:
        hrefs = [
            "/frutas-y-verduras?page=2",
            "https://www.jumbo.cl/frutas-y-verduras?sort=asc&page=16",
            None,
        ]
        self.assertEqual(jumbo_page_count_from_links(hrefs), 16)

    def test_jumbo_pagination_uses_anchor_target_instead_of_click(self) -> None:
        self.assertEqual(
            jumbo_pagination_target(
                "https://www.jumbo.cl/frutas-y-verduras",
                "/frutas-y-verduras?page=2",
            ),
            "https://www.jumbo.cl/frutas-y-verduras?page=2",
        )
        self.assertIsNone(
            jumbo_pagination_target(
                "https://www.jumbo.cl/frutas-y-verduras",
                None,
            )
        )

    def test_jumbo_payload_candidates_find_nested_browser_response(self) -> None:
        payload = {
            "data": {
                "catalog": {
                    "results": 617,
                    "products": [
                        {
                            "reference": "123",
                            "items": [
                                {
                                    "skuId": "sku-1",
                                    "name": "Leche Entera 1 L",
                                    "price": 1190,
                                    "stock": True,
                                }
                            ],
                        }
                    ],
                }
            }
        }
        candidates = list(jumbo_payload_candidates(payload))
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["results"], 617)

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

    def test_jumbo_html_parses_server_rendered_json_ld(self) -> None:
        document = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "item": {
                        "@type": "Product",
                        "name": "Arroz Grado 1 1 kg",
                        "url": "https://www.jumbo.cl/arroz-grado-1-2034586/p",
                        "image": "https://img/jumbo-arroz.jpg",
                        "brand": {"@type": "Brand", "name": "Miraflores"},
                        "offers": {
                            "@type": "Offer",
                            "priceCurrency": "CLP",
                            "price": 2290,
                            "availability": "https://schema.org/InStock",
                        },
                    },
                }
            ],
        }
        page_html = (
            "<html><body><h1>Despensa</h1><p>3.736 productos</p>"
            f'<script type="application/ld+json">{json.dumps(document)}</script>'
            "</body></html>"
        )
        products, total = parse_jumbo_html(page_html, "despensa")
        self.assertEqual(total, 3736)
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0].store, "Jumbo")
        self.assertEqual(products[0].price, 2290)
        self.assertEqual(products[0].brand, "Miraflores")
        self.assertEqual(products[0].sku, "2034586")
        self.assertEqual(
            products[0].product_url,
            "https://www.jumbo.cl/arroz-grado-1-2034586/p",
        )

    def test_jumbo_html_reads_counts_across_nested_markup(self) -> None:
        document = {
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": [
                {
                    "item": {
                        "@type": "Product",
                        "name": "Leche Entera 1 L",
                        "url": "https://www.jumbo.cl/leche-entera-1234567/p",
                        "offers": {
                            "price": 1190,
                            "availability": "https://schema.org/InStock",
                        },
                    }
                }
            ],
        }
        page_html = (
            '<span class="total">617</span><span> productos</span>'
            '<label>Página <strong>1</strong> de <strong>16</strong></label>'
            f'<script type="application/ld+json">{json.dumps(document)}</script>'
        )
        products, total = parse_jumbo_html(page_html, "lacteos")
        self.assertEqual(len(products), 1)
        self.assertEqual(total, 617)

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

    def test_lider_json_ld_parses_product_and_pagination(self) -> None:
        page_html = """
        <h1>Catalogo Lider <span>(10.000)</span></h1>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "ItemList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "item": {
                "@type": "Product",
                "name": "Arroz Grado 2 Bolsa 1 kg Lider",
                "url": "https://super.lider.cl:443/ip/arroz/arroz-grado-2/00780000000001?utm_source=verbolia",
                "image": "https://img.lider/arroz.jpg",
                "offers": {
                  "@type": "Offer",
                  "price": "1.090",
                  "priceCurrency": "CLP",
                  "availability": "https://schema.org/InStock"
                }
              }
            }
          ]
        }
        </script>
        <div class="pagination">
          <span class="pagination__link active">1</span>
          <span class="ve-nflw pagination__link">2</span>
          <span class="ve-nflw pagination__link">208</span>
        </div>
        """
        products, total, page_count = parse_lider_page(page_html)
        self.assertEqual((total, page_count), (10000, 208))
        self.assertEqual(products[0].store, "Lider")
        self.assertEqual(products[0].price, 1090)
        self.assertEqual(products[0].sku, "00780000000001")
        self.assertEqual(products[0].ean, "00780000000001")
        self.assertEqual(
            products[0].product_url,
            "https://super.lider.cl/ip/arroz/arroz-grado-2/00780000000001",
        )

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


    def test_acuenta_next_flight_categories_and_products(self) -> None:
        category_tree = (
            '{"active":true,"boost":1,"hasChildren":true,'
            '"categoryNamesPath":"/Despensa","isAvailableInHome":true,'
            '"level":1,"name":"Despensa","path":"/05","reference":"05",'
            '"slug":"despensa/05"}'
        )
        product = (
            'a1:{"name":"Arroz Caja 10 unidades","price":1590,'
            '"photosUrl":"$a2","sku":"123","ean":"$a3",'
            '"slug":"arroz-123","brand":"Acuenta","stock":8,'
            '"promotion":"$a4","promotionPricePerSubUnit":129,'
            '"__typename":"CatalogProductModel"}\n'
            'a2:["https://img/arroz.jpg"]\n'
            'a3:["7800000000123"]\n'
            'a4:{"type":"specialPrice","isActive":true,"conditions":"$a5"}\n'
            'a5:["$a6"]\n'
            'a6:{"quantity":0,"price":1290}\n'
        )
        pagination = (
            '"pagination":{"page":1,"pages":3,'
            '"total":{"value":120,"relation":"eq"}}'
        )
        stream = category_tree + "\n" + product + pagination
        encoded = json.dumps(stream, ensure_ascii=False)
        page_html = f"<script>self.__next_f.push([1,{encoded}])</script>"
        self.assertIn("CatalogProductModel", extract_next_flight_stream(page_html))
        self.assertEqual(parse_acuenta_categories(page_html), [("Despensa", "despensa/05")])
        products, pages, total = parse_acuenta_category_page(page_html, "Despensa")
        self.assertEqual((pages, total), (3, 120))
        self.assertEqual(products[0].store, "aCuenta")
        self.assertEqual(products[0].price, 1290)
        self.assertEqual(products[0].list_price, 1590)
        self.assertEqual(products[0].pack_units, 10)
        self.assertEqual(products[0].ean, "7800000000123")
        self.assertEqual(products[0].image_url, "https://img/arroz.jpg")

    def test_irurzun_only_accepts_available_positive_prices(self) -> None:
        payload = json.dumps(
            {
                "products": [
                    {
                        "id": 1,
                        "title": "Canasta Mayorista",
                        "handle": "canasta-mayorista",
                        "vendor": "Irurzun",
                        "images": [{"src": "https://img/irurzun.jpg"}],
                        "variants": [
                            {
                                "id": 11,
                                "title": "Default Title",
                                "price": "14990",
                                "sku": "",
                                "barcode": None,
                                "available": True,
                            }
                        ],
                    },
                    {
                        "id": 2,
                        "title": "Producto a cotizar",
                        "handle": "producto-cotizar",
                        "variants": [
                            {
                                "id": 22,
                                "title": "Caja 12",
                                "price": "0",
                                "available": True,
                            }
                        ],
                    },
                ]
            }
        )
        products = parse_irurzun_products(payload)
        self.assertEqual(len(products), 1)
        self.assertEqual(products[0].store, "Irurzun")
        self.assertEqual(products[0].price, 14990)
        self.assertEqual(products[0].sku, "11")

if __name__ == "__main__":
    unittest.main()
