#!/usr/bin/env python3
"""Regression tests for associating Jumbo card text with its product URL."""

from __future__ import annotations

import unittest

from scrape_jumbo_products import parse_card


class ParseJumboCardTests(unittest.TestCase):
    def test_prefers_name_matching_pavo_url_over_neighboring_vacuno(self) -> None:
        product = parse_card(
            "carne molida",
            """
            Ariztía
            $3.890
            Carne Molida Ariztía Trutro Pavo 400 g
            Agregar
            Cuisine & Co
            $5.890
            Carne Molida de Vacuno Congelada 10% Grasa Cuisine & Co 500 g
            Agregar
            """,
            "https://www.jumbo.cl/carne-molida-trutro-pavo-400-g/p",
        )

        self.assertIsNotNone(product)
        assert product is not None
        self.assertEqual(product.name, "Carne Molida Ariztía Trutro Pavo 400 g")
        self.assertEqual(product.price, 3890)

    def test_prefers_specific_chicken_name_over_brand_line(self) -> None:
        product = parse_card(
            "pollo",
            """
            Patrocinado
            Super Pollo
            $4.290
            Bistec de Pechuga Deshuesada Super Pollo 530 g
            Agregar
            """,
            "https://www.jumbo.cl/bistec-de-pechuga-pollo-super-530-gr-pet/p",
        )

        self.assertIsNotNone(product)
        assert product is not None
        self.assertEqual(product.name, "Bistec de Pechuga Deshuesada Super Pollo 530 g")
        self.assertEqual(product.price, 4290)

    def test_rejects_unrelated_name_when_card_text_is_contaminated(self) -> None:
        product = parse_card(
            "carne molida",
            "$5.890\nCarne Molida de Vacuno Congelada 10% Grasa Cuisine & Co 500 g\nAgregar",
            "https://www.jumbo.cl/carne-molida-trutro-pavo-400-g/p",
        )

        self.assertIsNone(product)


if __name__ == "__main__":
    unittest.main()
