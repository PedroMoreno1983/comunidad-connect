import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrape_supermarkets import scrape_lider


class LiderCurrentPricesTest(unittest.TestCase):
    def test_search_price_wins_over_old_listing_price(self):
        sku = "00780292077754"
        current = {
            "usItemId": sku,
            "offerId": "5101",
            "name": "Leche Entera Natural Caja 1 l, 1 L",
            "brand": {"name": "Colun"},
            "canonicalUrl": f"/ip/leche/{sku}",
            "price": 1290,
            "canAddToCart": True,
        }
        old_listing = {"@type": "Product", "name": current["name"], "offers": {"price": 790}}
        page = (
            f'<script type="application/ld+json">{json.dumps(old_listing)}</script>'
            f'<script id="__NEXT_DATA__">{json.dumps({"products": [current]})}</script>'
        )
        with patch("scrape_supermarkets.fetch", return_value=page) as fetch:
            products, status = scrape_lider("leche entera colun", 5)
        self.assertIn("/search?q=leche+entera+colun", fetch.call_args.args[0])
        self.assertEqual(status.status, "ok")
        self.assertEqual([(product.sku, product.price) for product in products], [(sku, 1290)])


if __name__ == "__main__":
    unittest.main()
