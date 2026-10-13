#!/usr/bin/env python3
"""Promociones por volumen ("4 x $990", "Combina 4 x $5.990") de las tiendas.

Issue #96: el comparador sumaba precio unitario por cantidad y no tenía dónde
guardar estas promociones, así que el orden de tiendas se invertía frente al
carro real. Este módulo solo interpreta datos que las páginas ya recorridas
publican; no hace requests.

Convención chilena verificada en Lider y Jumbo (2026-10-13): "N x $P" es el
total por N unidades ("2 x $3.000" con precio unitario $1.850). aCuenta usa a
veces el precio por unidad dentro de la promoción ("4 X $990" sobre un unitario
de $1.290). Para no confundirlos, cuando P es menor que el precio unitario se
lee como precio por unidad; si no, como total del bloque. Una promoción que no
baja el precio se descarta.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any

MAX_PROMO_QUANTITY = 1000
MAX_LABEL_LENGTH = 120
MAX_GROUP_LENGTH = 200
# "4x3" (lleva 4, paga 3) no es un precio: debajo de esto el segundo número se
# interpreta como unidades pagadas, nunca como pesos.
MIN_PRICE_AMOUNT = 50


@dataclass(frozen=True)
class VolumePromo:
    """Promoción normalizada: `total_price` pesos por cada bloque de `min_qty`."""

    min_qty: int
    total_price: int
    label: str
    group: str | None = None

    def as_product_fields(self) -> dict[str, Any]:
        return {
            "promo_min_qty": self.min_qty,
            "promo_total_price": self.total_price,
            "promo_label": self.label,
            "promo_group": self.group,
        }


def _fold(value: str) -> str:
    folded = unicodedata.normalize("NFD", value)
    folded = "".join(char for char in folded if unicodedata.category(char) != "Mn")
    return " ".join(folded.casefold().split())


def _as_int(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(round(value)) if value == value else 0  # NaN guard
    digits = re.sub(r"[^\d]", "", str(value or ""))
    return int(digits) if digits else 0


def format_clp(amount: int) -> str:
    return "$" + f"{amount:,}".replace(",", ".")


def promo_label(min_qty: int, total_price: int, combinable: bool = False) -> str:
    prefix = "Combina " if combinable else ""
    return f"{prefix}{min_qty} x {format_clp(total_price)}"[:MAX_LABEL_LENGTH]


def normalize_volume_promo(
    min_qty: Any,
    amount: Any,
    unit_price: Any,
    *,
    label: str | None = None,
    group: str | None = None,
    amount_is_total: bool | None = None,
) -> VolumePromo | None:
    """Convierte (N, P) en un total por bloque y valida que sea un descuento.

    `amount_is_total` fuerza la interpretación cuando la fuente la declara;
    con None se decide comparando P con el precio unitario.
    """
    quantity = _as_int(min_qty)
    price = _as_int(amount)
    unit = _as_int(unit_price)
    if quantity < 2 or quantity > MAX_PROMO_QUANTITY or price <= 0:
        return None

    if amount_is_total is None:
        amount_is_total = not (unit > 0 and price < unit)
    total = price if amount_is_total else price * quantity

    if unit > 0 and total >= unit * quantity:
        return None
    clean_label = " ".join((label or "").split())[:MAX_LABEL_LENGTH] or promo_label(quantity, total)
    clean_group = (group or "").strip()[:MAX_GROUP_LENGTH] or None
    return VolumePromo(quantity, total, clean_label, clean_group)


_UNIT_AFTER = r"(?!\s*(?:k?g|gr|grs|gramos?|kilos?|ml|cc|lts?|litros?|l|un|uds?|unidades?|cm|mm|m)\b)"
_PROMO_TEXT_RE = re.compile(
    r"(?:^|[^\w$.])"
    r"(?P<combina>combina\s+|lleva\s+|llevando\s+)?"
    r"(?P<qty>\d{1,3})\s*(?:x|por)\s*"
    r"(?P<currency>\$\s*)?"
    r"(?P<amount>\d{1,3}(?:\.\d{3})+|\d+)"
    r"(?!\d)(?![.,]\d)"
    + _UNIT_AFTER,
)


def parse_volume_promo_text(
    text: Any,
    unit_price: Any,
    *,
    group: str | None = None,
) -> VolumePromo | None:
    """Lee un badge como "4 x $990", "Combina 4 x 5990", "3x$2.000" o "Lleva 4 por $5.000".

    "4x3" (lleva 4, paga 3) se modela como total = 3 unidades a precio normal.
    Textos sin cantidad ("Rebaja", "-20%", "2do a mitad de precio") devuelven None.
    """
    if not isinstance(text, str) or not text.strip():
        return None
    original = " ".join(text.split())
    folded = _fold(original)
    match = _PROMO_TEXT_RE.search(folded)
    if not match:
        return None
    quantity = _as_int(match.group("qty"))
    raw_amount = match.group("amount")
    amount = _as_int(raw_amount)
    combinable = bool(match.group("combina")) and match.group("combina").startswith("combina")
    unit = _as_int(unit_price)

    if not match.group("currency") and amount < MIN_PRICE_AMOUNT:
        # "4x3": paga `amount` unidades de `quantity`.
        if unit <= 0 or not 0 < amount < quantity:
            return None
        return normalize_volume_promo(
            quantity,
            amount * unit,
            unit,
            label=original,
            group=group if combinable else None,
            amount_is_total=True,
        )

    return normalize_volume_promo(
        quantity,
        amount,
        unit,
        label=original,
        group=group if combinable else None,
    )


def _best(promos: list[VolumePromo]) -> VolumePromo | None:
    """Entre varias promociones válidas, la de menor precio por unidad."""
    valid = [promo for promo in promos if promo is not None]
    if not valid:
        return None
    return min(valid, key=lambda promo: (promo.total_price / promo.min_qty, promo.min_qty))


def lider_volume_promo(item: Any, unit_price: Any) -> VolumePromo | None:
    """Badge de Lider (`badges.flags[].text` o `flag`) en el JSON de búsqueda/browse.

    Forma observada el 2026-10-13 en super.lider.cl/search:
    {"key": "COMBINA", "text": "Combina 4 x $2.390", "bundleId": "80df..."} y
    {"key": "ROLLBACK", "text": "2 x $3.000", "bundleId": null}. `bundleId` agrupa
    los productos que se pueden combinar dentro del mismo bloque.
    """
    if not isinstance(item, dict):
        return None
    candidates: list[VolumePromo] = []
    badges = item.get("badges")
    flags = badges.get("flags") if isinstance(badges, dict) else None
    for flag in flags if isinstance(flags, list) else []:
        if not isinstance(flag, dict):
            continue
        bundle = flag.get("bundleId")
        promo = parse_volume_promo_text(
            flag.get("text"),
            unit_price,
            group=f"lider:{bundle}" if isinstance(bundle, str) and bundle.strip() else None,
        )
        if promo:
            candidates.append(promo)
    if not candidates:
        promo = parse_volume_promo_text(item.get("flag"), unit_price)
        if promo:
            candidates.append(promo)
    return _best(candidates)


def jumbo_volume_promo(item: Any, unit_price: Any) -> VolumePromo | None:
    """`items[].promotions[]` de Jumbo/Cencosud (VTEX).

    Forma observada el 2026-10-13 en jumbo.cl: {"type": "mx", "value": 2390,
    "mQuantity": 4, "nQuantity": 0, "paymentMethods": "ALL", "userProperties":
    "ALL", "allowProductCombination": true, "id": "6b6c..."}. "mxn" es lleva M
    paga N. Se descartan las que exigen un medio de pago o perfil (Prime, tarjeta).
    """
    if not isinstance(item, dict):
        return None
    promotions = item.get("promotions")
    candidates: list[VolumePromo] = []
    for promotion in promotions if isinstance(promotions, list) else []:
        if not isinstance(promotion, dict):
            continue
        if str(promotion.get("paymentMethods") or "ALL").upper() != "ALL":
            continue
        if str(promotion.get("userProperties") or "ALL").upper() != "ALL":
            continue
        kind = str(promotion.get("type") or "").casefold()
        quantity = _as_int(promotion.get("mQuantity"))
        pay_quantity = _as_int(promotion.get("nQuantity"))
        combinable = promotion.get("allowProductCombination") is True
        promotion_id = str(promotion.get("id") or "").strip()
        group = f"jumbo:{promotion_id}" if combinable and promotion_id else None
        unit = _as_int(unit_price)
        promo: VolumePromo | None = None
        if kind == "mx" and pay_quantity == 0:
            total = _as_int(promotion.get("value"))
            promo = normalize_volume_promo(
                quantity,
                total,
                unit,
                label=promo_label(quantity, total, combinable),
                group=group,
                amount_is_total=True,
            )
        elif kind == "mxn" and 0 < pay_quantity < quantity and unit > 0:
            promo = normalize_volume_promo(
                quantity,
                pay_quantity * unit,
                unit,
                label=f"{'Combina ' if combinable else ''}Lleva {quantity} paga {pay_quantity}",
                group=group,
                amount_is_total=True,
            )
        if promo:
            candidates.append(promo)
    return _best(candidates)


def acuenta_volume_promo(
    promotion: Any,
    regular_price: Any,
    resolve: Any = None,
) -> VolumePromo | None:
    """`promotion.conditions[]` de aCuenta con cantidad mínima >= 2.

    Las condiciones con quantity 0/1 ya se usan como precio unitario rebajado en
    `parse_acuenta_category_page`; aquí solo se leen los umbrales por volumen.
    `resolve` traduce referencias "$a5" del stream RSC cuando hace falta.
    """
    def deref(value: Any) -> Any:
        return resolve(value) if callable(resolve) else value

    promotion = deref(promotion)
    if not isinstance(promotion, dict) or promotion.get("isActive") is False:
        return None
    conditions = deref(promotion.get("conditions"))
    candidates: list[VolumePromo] = []
    for reference in conditions if isinstance(conditions, list) else []:
        condition = deref(reference)
        if not isinstance(condition, dict):
            continue
        quantity = _as_int(condition.get("quantity"))
        amount = _as_int(condition.get("price"))
        if quantity < 2:
            continue
        unit = _as_int(regular_price)
        promo = normalize_volume_promo(quantity, amount, unit)
        if promo:
            # Etiqueta como la muestra la tienda: "4 X $990" sobre el monto publicado.
            candidates.append(
                VolumePromo(
                    promo.min_qty,
                    promo.total_price,
                    f"{quantity} x {format_clp(amount)}",
                    None,
                )
            )
    return _best(candidates)
