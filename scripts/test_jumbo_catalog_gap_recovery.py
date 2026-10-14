#!/usr/bin/env python3
"""crawl_jumbo: una pagina intermedia vacia o repetida se recupera con backoff.

Las corridas programadas del 29-sep, 30-sep, 9-oct y 13-oct de 2026 fallaron en
"Reject incomplete catalog coverage" por UNA pagina suelta de Jumbo que llego
vacia (despensa 78, limpieza 37, bebe-y-jugueteria 28, belleza 83-85) aunque la
pagina siguiente si traia productos. Aqui se simula Playwright con un navegador
falso para fijar el comportamiento: reintentar el hueco, no saltarlo; y no
gastar reintentos en la cola real del catalogo.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import full_catalog
from full_catalog import CatalogCoverageWarning, crawl_jumbo

PAGE_SIZE = 4
CATEGORY = "despensa"


def page_products(page_number: int) -> list[dict]:
    return [
        {
            "@type": "ListItem",
            "item": {
                "name": f"Producto {page_number}-{index}",
                "url": f"https://www.jumbo.cl/producto-{page_number}-{index}-10{page_number:03d}{index:02d}/p",
                "offers": {"price": 1000 + page_number * 10 + index, "availability": "https://schema.org/InStock"},
            },
        }
        for index in range(PAGE_SIZE)
    ]


def render(items: list[dict], total: int, last_page: int) -> str:
    links = "".join(f'<a href="/{CATEGORY}?page={n}">{n}</a>' for n in range(2, last_page + 1))
    document = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": items}
    return (
        f'<html><body><span>{total}</span> productos'
        f'<script type="application/ld+json">{json.dumps(document)}</script>{links}</body></html>'
    )


class FakeSite:
    """Por URL, una lista de 'renders' que se consumen en cada carga.

    Cada render es un numero de pagina cuyos productos se muestran, o None para
    una pagina vacia. El ultimo render se repite para siempre.
    """

    def __init__(self, last_page: int, total: int, script: dict[int, list[int | None]] | None = None):
        self.last_page = last_page
        self.total = total
        self.script = {k: list(v) for k, v in (script or {}).items()}
        self.loads: dict[int, int] = {}

    def html_for(self, page_number: int) -> str:
        self.loads[page_number] = self.loads.get(page_number, 0) + 1
        renders = self.script.get(page_number)
        shown: int | None = page_number
        if renders:
            shown = renders.pop(0) if len(renders) > 1 else renders[0]
        items = page_products(shown) if shown is not None else []
        return render(items, self.total, self.last_page)


class FakeLocator:
    def __init__(self, page: "FakePage") -> None:
        self.page = page

    def evaluate_all(self, _script: str) -> list[str]:
        if self.page.current_page is None:
            return []
        return [f"/{CATEGORY}?page={n}" for n in range(2, self.page.site.last_page + 1)]


class FakePage:
    def __init__(self, site: FakeSite) -> None:
        self.site = site
        self.current_page: int | None = None
        self.html = ""
        self.waits: list[int] = []

    def on(self, _event: str, _handler) -> None:
        return None

    def goto(self, url: str, **_kwargs) -> None:
        if url == "about:blank":
            self.current_page, self.html = None, ""
            return
        page_number = int(url.split("page=")[1]) if "page=" in url else 1
        self.current_page = page_number
        self.html = self.site.html_for(page_number)

    def wait_for_timeout(self, ms: int) -> None:
        self.waits.append(ms)

    def content(self) -> str:
        return self.html

    def locator(self, _selector: str) -> FakeLocator:
        return FakeLocator(self)


class FakeBrowser:
    def __init__(self, page: FakePage) -> None:
        self.page = page

    def new_page(self, **_kwargs) -> FakePage:
        return self.page

    def close(self) -> None:
        return None


class FakePlaywright:
    def __init__(self, page: FakePage) -> None:
        self.chromium = self
        self.page = page

    def launch(self, **_kwargs) -> FakeBrowser:
        return FakeBrowser(self.page)

    def __enter__(self) -> "FakePlaywright":
        return self

    def __exit__(self, *_exc) -> None:
        return None


def run(site: FakeSite) -> tuple[list, FakePage, Exception | None]:
    page = FakePage(site)
    products: list = []
    error: Exception | None = None
    with patch.object(full_catalog, "JUMBO_CATEGORIES", (CATEGORY,)), patch.object(
        full_catalog, "_require_playwright", return_value=lambda: FakePlaywright(page)
    ):
        try:
            for product in crawl_jumbo():
                products.append(product)
        except Exception as exc:  # noqa: BLE001 - el test inspecciona el error.
            error = exc
    return products, page, error


def product_pages(products: list) -> set[int]:
    return {int(p.name.split(" ")[1].split("-")[0]) for p in products}


class JumboGapRecoveryTests(unittest.TestCase):
    def test_transient_empty_middle_page_is_recovered_without_coverage_warning(self) -> None:
        # Pagina 3 llega vacia en las 3 cargas normales y en el primer reintento
        # profundo; en el segundo reintento profundo ya carga.
        site = FakeSite(last_page=5, total=20, script={3: [None, None, None, None, 3]})

        products, page, error = run(site)

        self.assertIsNone(error)
        self.assertEqual(product_pages(products), {1, 2, 3, 4, 5})
        self.assertEqual(len(products), 20)
        self.assertIn(full_catalog.JUMBO_GAP_RETRY_DELAYS_MS[0], page.waits)

    def test_permanently_empty_middle_page_still_raises_coverage_warning(self) -> None:
        site = FakeSite(last_page=5, total=20, script={3: [None]})

        products, _, error = run(site)

        self.assertIsInstance(error, CatalogCoverageWarning)
        self.assertIn("despensa: empty page 3 before page 4 returned products", str(error))
        # Las paginas que si cargaron se entregan igual (se persisten).
        self.assertEqual(product_pages(products), {1, 2, 4, 5})

    def test_gap_still_empty_after_immediate_retries_is_recovered_at_the_end(self) -> None:
        # Corrida real del 13-oct: el hueco siguio vacio tras los reintentos
        # inmediatos (3 cargas normales + 3 reintentos x 3 cargas) y Jumbo lo
        # entrego minutos despues. Debe recuperarse en la pasada final.
        site = FakeSite(last_page=5, total=20, script={3: [None] * 12 + [3]})

        products, page, error = run(site)

        self.assertIsNone(error)
        self.assertEqual(product_pages(products), {1, 2, 3, 4, 5})
        self.assertEqual(len(products), 20)
        self.assertIn(full_catalog.JUMBO_DEFERRED_GAP_DELAYS_MS[0], page.waits)

    def test_empty_tail_after_stock_filter_does_not_spend_deep_retries(self) -> None:
        # El pager publica 5 paginas pero el stock real termina en la 4.
        site = FakeSite(last_page=5, total=20, script={5: [None]})

        products, page, error = run(site)

        self.assertIsNone(error)
        self.assertEqual(product_pages(products), {1, 2, 3, 4})
        for delay in full_catalog.JUMBO_GAP_RETRY_DELAYS_MS:
            self.assertNotIn(delay, page.waits)

    def test_stale_repeated_page_is_retried_before_failing(self) -> None:
        # Pagina 4 muestra el render pegado de la 3 durante las cargas normales.
        site = FakeSite(last_page=5, total=20, script={4: [3, 3, 3, 4]})

        products, _, error = run(site)

        self.assertIsNone(error)
        self.assertEqual(product_pages(products), {1, 2, 3, 4, 5})
        self.assertEqual(len(products), 20)

    def test_repeated_page_that_never_recovers_keeps_the_warning(self) -> None:
        site = FakeSite(last_page=5, total=20, script={4: [3]})

        _, _, error = run(site)

        self.assertIsInstance(error, CatalogCoverageWarning)
        self.assertIn("repeated page 4 before published page 5", str(error))


if __name__ == "__main__":
    unittest.main()
