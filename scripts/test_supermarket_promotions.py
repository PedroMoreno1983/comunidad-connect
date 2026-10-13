#!/usr/bin/env python3
"""Promociones por volumen (issue #96). Sin requests reales: solo fixtures."""

from __future__ import annotations

import json
import sys
import unittest
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from full_catalog import (  # noqa: E402
    parse_acuenta_category_page,
    parse_jumbo_payload,
    parse_lider_browse_promotions,
    with_lider_promotion,
)
from scrape_supermarkets import Product, parse_lider_search_products  # noqa: E402
from supermarket_promotions import (  # noqa: E402
    VolumePromo,
    acuenta_volume_promo,
    jumbo_volume_promo,
    lider_volume_promo,
    normalize_volume_promo,
    parse_volume_promo_text,
)


class ParseVolumePromoTextTests(unittest.TestCase):
    def test_total_por_bloque_con_signo_y_punto_de_miles(self) -> None:
        promo = parse_volume_promo_text("2 x $3.000", 1850)
        self.assertEqual((promo.min_qty, promo.total_price), (2, 3000))
        self.assertEqual(promo.label, "2 x $3.000")
        self.assertIsNone(promo.group)

    def test_combina_sin_signo_peso_y_con_grupo(self) -> None:
        promo = parse_volume_promo_text("Combina 4 x 5990", 1890, group="lider:abc")
        self.assertEqual((promo.min_qty, promo.total_price), (4, 5990))
        self.assertEqual(promo.group, "lider:abc")

    def test_grupo_solo_si_la_promocion_es_combinable(self) -> None:
        promo = parse_volume_promo_text("2 x $3.000", 1850, group="lider:abc")
        self.assertIsNone(promo.group)

    def test_mayusculas_sin_espacios_y_acentos(self) -> None:
        for text in ("4X$990", "4 X $990", "4x $ 990", "COMBINA 4 X $990", "Combiná 4x990"):
            with self.subTest(text=text):
                promo = parse_volume_promo_text(text, 1290)
                self.assertIsNotNone(promo)
                self.assertEqual(promo.min_qty, 4)

    def test_precio_menor_al_unitario_se_lee_como_precio_por_unidad(self) -> None:
        # aCuenta "4 X $990" sobre un unitario de $1.290: $990 cada una.
        promo = parse_volume_promo_text("4 X $990", 1290)
        self.assertEqual(promo.total_price, 3960)

    def test_precio_mayor_al_unitario_se_lee_como_total(self) -> None:
        promo = parse_volume_promo_text("Combina 4 x $990", 290)
        self.assertEqual(promo.total_price, 990)

    def test_lleva_n_por(self) -> None:
        promo = parse_volume_promo_text("Lleva 3 por $5.000", 1990)
        self.assertEqual((promo.min_qty, promo.total_price), (3, 5000))

    def test_lleva_4_paga_3(self) -> None:
        promo = parse_volume_promo_text("4x3", 1000)
        self.assertEqual((promo.min_qty, promo.total_price), (4, 3000))

    def test_lleva_4_paga_3_sin_precio_unitario_no_se_inventa(self) -> None:
        self.assertIsNone(parse_volume_promo_text("4x3", 0))

    def test_descarta_promocion_que_no_abarata(self) -> None:
        self.assertIsNone(parse_volume_promo_text("2 x $4.000", 1850))

    def test_textos_sin_bloque_no_son_promocion(self) -> None:
        for text in ("Rebaja", "-20%", "2do a mitad de precio", "", None, "Oferta"):
            with self.subTest(text=text):
                self.assertIsNone(parse_volume_promo_text(text, 1000))

    def test_formatos_de_envase_no_se_confunden_con_promocion(self) -> None:
        for text in ("Pack 6 x 350 ml", "2 x 500 g", "3 x 1 kg", "12 x 1 L", "4 x 125 gr"):
            with self.subTest(text=text):
                self.assertIsNone(parse_volume_promo_text(text, 1000))

    def test_cantidad_fuera_de_rango(self) -> None:
        self.assertIsNone(parse_volume_promo_text("1 x $990", 1290))
        self.assertIsNone(normalize_volume_promo(2000, 990, 0))

    def test_sin_precio_unitario_asume_total(self) -> None:
        promo = parse_volume_promo_text("3 x $2.990", None)
        self.assertEqual(promo.total_price, 2990)


class StorePromoAdaptersTests(unittest.TestCase):
    def test_lider_badge_combina_con_bundle(self) -> None:
        item = {
            "badges": {
                "flags": [
                    {"key": "COMBINA", "text": "Combina 4 x $2.390", "bundleId": "80df"},
                ]
            }
        }
        promo = lider_volume_promo(item, 690)
        self.assertEqual(promo, VolumePromo(4, 2390, "Combina 4 x $2.390", "lider:80df"))

    def test_lider_rebaja_sin_cantidad_no_es_volumen(self) -> None:
        item = {"badges": {"flags": [{"key": "ROLLBACK", "text": "Rebaja"}]}, "flag": "Rebaja"}
        self.assertIsNone(lider_volume_promo(item, 510))

    def test_lider_usa_flag_si_no_hay_badges(self) -> None:
        promo = lider_volume_promo({"flag": "2 x $3.000"}, 1850)
        self.assertEqual(promo.total_price, 3000)

    def test_jumbo_mx_y_mxn_y_descarta_medios_de_pago(self) -> None:
        item = {
            "promotions": [
                {"id": "p1", "type": "mx", "value": 2390, "mQuantity": 4, "nQuantity": 0,
                 "paymentMethods": "ALL", "userProperties": "ALL", "allowProductCombination": True},
                {"id": "p2", "type": "mx", "value": 1000, "mQuantity": 4, "nQuantity": 0,
                 "paymentMethods": "TARJETA_CENCOSUD", "userProperties": "ALL"},
                {"id": "p3", "type": "mxn", "mQuantity": 4, "nQuantity": 3,
                 "paymentMethods": "ALL", "userProperties": "PRIME"},
            ]
        }
        promo = jumbo_volume_promo(item, 690)
        self.assertEqual((promo.min_qty, promo.total_price, promo.group), (4, 2390, "jumbo:p1"))
        self.assertEqual(promo.label, "Combina 4 x $2.390")

    def test_jumbo_mxn_lleva_4_paga_3(self) -> None:
        item = {"promotions": [{"id": "p", "type": "mxn", "mQuantity": 4, "nQuantity": 3,
                                "paymentMethods": "ALL", "userProperties": "ALL"}]}
        promo = jumbo_volume_promo(item, 1000)
        self.assertEqual((promo.min_qty, promo.total_price, promo.group), (4, 3000, None))

    def test_jumbo_nominal_no_es_volumen(self) -> None:
        item = {"promotions": [{"type": "nominal", "value": 500, "mQuantity": 1, "nQuantity": 0}]}
        self.assertIsNone(jumbo_volume_promo(item, 1000))

    def test_acuenta_condicion_con_cantidad_minima(self) -> None:
        promotion = {"type": "specialPrice", "isActive": True,
                     "conditions": [{"quantity": 4, "price": 990}]}
        promo = acuenta_volume_promo(promotion, 1290)
        self.assertEqual((promo.min_qty, promo.total_price, promo.label), (4, 3960, "4 x $990"))

    def test_acuenta_inactiva_o_sin_umbral(self) -> None:
        self.assertIsNone(acuenta_volume_promo({"isActive": False, "conditions": [{"quantity": 4, "price": 990}]}, 1290))
        self.assertIsNone(acuenta_volume_promo({"isActive": True, "conditions": [{"quantity": 0, "price": 990}]}, 1290))
        self.assertIsNone(acuenta_volume_promo(None, 1290))


class ParserIntegrationTests(unittest.TestCase):
    def test_lider_search_guarda_promo_y_marca_revisado(self) -> None:
        root = {"props": {"pageProps": {"initialData": {"searchResult": {"itemStacks": [{"items": [
            {"usItemId": "00770236729335", "canonicalUrl": "/ip/conservas/00770236729335",
             "name": "Atun agua 142 g", "price": 1850, "priceInfo": {},
             "badges": {"flags": [{"key": "ROLLBACK", "text": "2 x $3.000", "bundleId": None}]}},
            {"usItemId": "00780000000001", "canonicalUrl": "/ip/x/00780000000001",
             "name": "Arroz 1 kg", "price": 1290, "priceInfo": {},
             "badges": {"flags": [{"key": "ROLLBACK", "text": "Rebaja"}]}},
        ]}]}}}}}
        page = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(root)}</script>'
        products = {product.sku: product for product in parse_lider_search_products(page, "atun")}
        atun = products["00770236729335"]
        self.assertEqual((atun.promo_min_qty, atun.promo_total_price), (2, 3000))
        self.assertTrue(atun.promo_checked)
        arroz = products["00780000000001"]
        self.assertIsNone(arroz.promo_min_qty)
        self.assertTrue(arroz.promo_checked)
        serialized = asdict(atun)
        self.assertEqual(serialized["promo_label"], "2 x $3.000")

    def test_lider_browse_promotions_y_aplicacion_al_catalogo(self) -> None:
        root = {"props": {"pageProps": {"initialData": {"searchResult": {"itemStacks": [{"items": [
            {"usItemId": "111", "price": 690,
             "badges": {"flags": [{"key": "COMBINA", "text": "Combina 4 x $2.390", "bundleId": "b1"}]}},
            {"usItemId": "222", "price": 510, "badges": {"flags": [{"text": "Rebaja"}]}},
        ]}]}}}}}
        page = f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(root)}</script>'
        promotions = parse_lider_browse_promotions(page)
        self.assertEqual(promotions["111"].group, "lider:b1")
        self.assertIsNone(promotions["222"])

        base = Product(store="Lider", query="catalogo", name="Yoghurt", price=690,
                       list_price=None, in_stock=True, sku="111")
        promoted = with_lider_promotion(base, promotions)
        self.assertEqual((promoted.promo_min_qty, promoted.promo_total_price), (4, 2390))
        self.assertTrue(promoted.promo_checked)

        unseen = with_lider_promotion(Product(store="Lider", query="c", name="X", price=1,
                                              list_price=None, in_stock=True, sku="999"), promotions)
        self.assertFalse(unseen.promo_checked)

        # Si el precio de Verbolia ya es menor que el bloque, la promo no abarata.
        cheap = with_lider_promotion(Product(store="Lider", query="c", name="Y", price=500,
                                             list_price=None, in_stock=True, sku="111"), promotions)
        self.assertIsNone(cheap.promo_min_qty)
        self.assertTrue(cheap.promo_checked)

    def test_jumbo_payload_guarda_promo(self) -> None:
        payload = {"results": 1, "products": [{"slug": "yoghurt", "brand": "Soprole", "items": [{
            "skuId": "81002", "name": "Yogurt Soprole Proteina Frutilla 155 g", "price": 690,
            "listPrice": 690, "stock": True,
            "promotions": [{"id": "6b6c", "type": "mx", "value": 2390, "mQuantity": 4,
                            "nQuantity": 0, "paymentMethods": "ALL", "userProperties": "ALL",
                            "allowProductCombination": True}],
        }]}]}
        products, _ = parse_jumbo_payload(payload, "catalogo")
        self.assertEqual((products[0].promo_min_qty, products[0].promo_total_price), (4, 2390))
        self.assertEqual(products[0].promo_group, "jumbo:6b6c")
        self.assertTrue(products[0].promo_checked)

    def test_jumbo_payload_sin_lista_de_promociones_no_se_marca_revisado(self) -> None:
        payload = {"products": [{"slug": "x", "items": [{"skuId": "1", "name": "Arroz", "price": 990}]}]}
        products, _ = parse_jumbo_payload(payload, "catalogo")
        self.assertFalse(products[0].promo_checked)

    def test_acuenta_categoria_guarda_umbral_por_volumen(self) -> None:
        product = (
            'a1:{"name":"Atun Lomitos 160 g","price":1290,'
            '"photosUrl":"$a2","sku":"555","ean":"$a3",'
            '"slug":"atun-555","brand":"Acuenta","stock":8,'
            '"promotion":"$a4","__typename":"CatalogProductModel","index":0}\n'
            'a2:["https://img/atun.jpg"]\n'
            'a3:["7800000000555"]\n'
            'a4:{"type":"specialPrice","isActive":true,"conditions":"$a5"}\n'
            'a5:["$a6"]\n'
            'a6:{"quantity":4,"price":990}\n'
        )
        pagination = '"pagination":{"page":1,"pages":1,"total":{"value":1,"relation":"eq"}}'
        encoded = json.dumps(product + pagination, ensure_ascii=False)
        page_html = f"<script>self.__next_f.push([1,{encoded}])</script>"
        products, _, _ = parse_acuenta_category_page(page_html, "Despensa")
        self.assertEqual(products[0].price, 1290)
        self.assertEqual((products[0].promo_min_qty, products[0].promo_total_price), (4, 3960))
        self.assertEqual(products[0].promo_label, "4 x $990")
        self.assertTrue(products[0].promo_checked)


if __name__ == "__main__":
    unittest.main()
