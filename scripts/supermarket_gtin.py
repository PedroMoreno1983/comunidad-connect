"""GTIN canónico para cruzar el mismo producto entre supermercados.

Misma regla que src/lib/supermarketGtin.ts y que la función SQL
supermarket_normalize_gtin (migración 20261017120000). Lider guarda 14 dígitos
con ceros a la izquierda y sin dígito verificador; las demás cadenas traen el
EAN-13/UPC-A completo.
"""

from __future__ import annotations

import re
from typing import Any


def gtin_check_digit(body: str) -> int:
    total = 0
    for offset, char in enumerate(reversed(body)):
        total += int(char) * (3 if offset % 2 == 0 else 1)
    return (10 - total % 10) % 10


def _restricted_circulation(padded: str) -> bool:
    return len(padded) == 13 and padded.startswith(("2", "02", "04", "000000", "000002"))


def normalize_gtin(code: Any, store: str | None = None) -> str | None:
    """GTIN-13/14 canónico, o None si el código no sirve para cruzar tiendas."""
    if code is None:
        return None
    raw = re.sub(r"[\s-]", "", str(code).strip())
    if not raw.isdigit() or not raw.isascii():
        return None
    digits = raw.lstrip("0")
    if not digits:
        return None
    if store == "Lider" and 7 <= len(digits) <= 12:
        digits = f"{digits}{gtin_check_digit(digits)}"
    if len(digits) < 8 or len(digits) > 14:
        return None
    if gtin_check_digit(digits[:-1]) != int(digits[-1]):
        return None
    padded = digits.rjust(13, "0")
    return None if _restricted_circulation(padded) else padded
