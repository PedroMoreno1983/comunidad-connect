#!/usr/bin/env python3
"""
Pipeline longitudinal del banco canonico IDPS.

Lee matrices y resultados historicos, normaliza estructuras heterogeneas,
homologa items longitudinalmente y genera salidas auditables.
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import re
import unicodedata
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable, Optional

import pandas as pd

try:
    from rapidfuzz import fuzz
except ImportError:  # pragma: no cover
    fuzz = None


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("pipeline_banco_canonico")


STRUCTURAL_RESULT_COLUMNS = {
    "base",
    "grado",
    "actor",
    "forma",
    "indicador",
    "dimension",
    "subdimension",
    "np",
    "enunciado_pregunta",
    "enunciado_item",
    "escalas",
    "etiqueta_valores",
    "ng",
    "pregunta",
}


DECISION_ORDER = {
    "EXACTO": 6,
    "EQUIVALENTE_CANONICO": 5,
    "VARIANTE_MENOR": 4,
    "VARIANTE_SUSTANTIVA": 3,
    "AMBIGUO": 2,
    "DIFERENTE": 1,
}


@dataclass
class SourceFileRecord:
    source_file_id: str
    year_data: int
    file_type: str
    file_name: str
    relative_path: str
    workbook_label: str
    sheet_count: int
    size_bytes: int
    import_status: str
    import_errors: list[str] = field(default_factory=list)
    structure_detected: dict[str, Any] = field(default_factory=dict)
    column_mapping: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class MatrixRecord:
    source_file_id: str
    year: int
    sheet_name: str
    source_row_number: int
    actor: str
    grade: Optional[str]
    form: Optional[str]
    indicator: Optional[str]
    dimension: Optional[str]
    subdimension: Optional[str]
    np_code: Optional[str]
    question_text: Optional[str]
    item_text: str
    scales: Optional[str]
    option_labels: Optional[str]
    source_payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class ResultRecord:
    source_file_id: str
    year: int
    sheet_name: str
    source_row_number: int
    actor: Optional[str]
    grade: Optional[str]
    form: Optional[str]
    indicator: Optional[str]
    dimension: Optional[str]
    subdimension: Optional[str]
    np_code: Optional[str]
    question_text: Optional[str]
    item_text: str
    estimation_method: str
    metrics: dict[str, Any] = field(default_factory=dict)


@dataclass
class VariantState:
    canonical_id: str
    variant_id: str
    variant_number: int
    text: str
    normalized_text: str
    variant_type: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CanonicalState:
    canonical_id: str
    actor: str
    dimension: str
    subdimension: Optional[str]
    text: str
    normalized_text: str
    first_year: int
    last_year: int
    variants: list[VariantState] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class DecisionAudit:
    occurrence_id: str
    source_file_id: str
    year: int
    actor: str
    dimension: Optional[str]
    subdimension: Optional[str]
    item_text: str
    canonical_item_id: Optional[str]
    variant_id: Optional[str]
    automatic_decision: str
    exact_score: float
    fuzzy_score: float
    semantic_score: float
    combined_score: float
    confidence_score: float
    requires_human_review: bool
    evidence: dict[str, Any] = field(default_factory=dict)


def slugify(value: Optional[str], fallback: str = "na") -> str:
    if not value:
        return fallback
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^A-Za-z0-9]+", "_", text.strip().lower())
    return text.strip("_") or fallback


def normalize_text(value: Optional[str]) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def tokenize_normalized(value: Optional[str]) -> list[str]:
    return [token for token in normalize_text(value).split() if token]


def contains_token_sequence(haystack: list[str], needle: list[str]) -> bool:
    if not haystack or not needle or len(needle) > len(haystack):
        return False
    limit = len(haystack) - len(needle) + 1
    return any(haystack[index : index + len(needle)] == needle for index in range(limit))


def clean_cell(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if not text or text.lower().startswith("unnamed:"):
        return None
    return text


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def combine_text(question_text: Optional[str], item_text: Optional[str]) -> str:
    item_text = clean_cell(item_text)
    question_text = clean_cell(question_text)
    if item_text:
        return item_text
    if question_text:
        return question_text
    return ""


def canonicalize_actor(value: Optional[str]) -> Optional[str]:
    text = normalize_text(value)
    if not text:
        return None
    aliases = {
        "doce": {"doce", "docente", "docentes"},
        "estu": {"estu", "estudiante", "estudiantes"},
        "padr": {"padr", "padre", "padres", "apoderado", "apoderados", "familia", "familias"},
        "dire": {"dire", "director", "directora", "directivo", "directivos", "equipo directivo"},
    }
    for canonical, candidates in aliases.items():
        if text in candidates:
            return canonical
    return text


def canonicalize_grade(value: Optional[str]) -> Optional[str]:
    raw = clean_cell(value)
    if raw and re.fullmatch(r"\d+\.0+", raw):
        raw = raw.split(".", maxsplit=1)[0]
    text = normalize_text(raw)
    if not text:
        return None

    collapsed = text.replace(" ", "")
    roman_medium_patterns = (
        r"^ii$",
        r"^ii[a-z]?$",
        r"^ii[o°º]$",
        r"^segundomedio$",
        r"^2medio$",
        r"^2m$",
        r"^10$",
    )
    if any(re.fullmatch(pattern, collapsed) for pattern in roman_medium_patterns):
        return "2m"

    collapsed = (
        collapsed.replace("basico", "b")
        .replace("medio", "m")
        .replace("1ro", "1")
        .replace("2do", "2")
        .replace("3ro", "3")
        .replace("4to", "4")
    )

    direct_map = {
        "4": "4b",
        "04": "4b",
        "4b": "4b",
        "6": "6b",
        "06": "6b",
        "6b": "6b",
        "8": "8b",
        "08": "8b",
        "8b": "8b",
        "2": "2b",
        "02": "2b",
        "2b": "2b",
        "10": "2m",
        "2m": "2m",
        "2medio": "2m",
        "2mdo": "2m",
        "2mto": "2m",
        "2mm": "2m",
        "iim": "2m",
    }
    if collapsed in direct_map:
        return direct_map[collapsed]

    match = re.search(r"(\d+)([bm])", collapsed)
    if match:
        return f"{match.group(1)}{match.group(2)}"

    if collapsed == "9":
        return "9"

    return collapsed


def canonicalize_question_code(value: Optional[str]) -> Optional[str]:
    raw = clean_cell(value)
    if raw is None:
        return None

    text = unicodedata.normalize("NFKD", str(raw))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower().strip()
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[^a-z0-9_]", "", text)
    if not text:
        return None

    match = re.fullmatch(r"p(\d+)(?:_(\d+))?(r)?", text)
    if match:
        first = str(int(match.group(1)))
        second = match.group(2)
        suffix = match.group(3) or ""
        if second is not None:
            return f"p{first}_{int(second)}{suffix}"
        return f"p{first}{suffix}"

    return text


def canonicalize_form(value: Optional[str]) -> Optional[str]:
    text = normalize_text(value)
    if not text:
        return None

    collapsed = text.replace(" ", "")
    if collapsed.startswith(("matriz", "hoja", "estudiantes", "docentes", "padres", "apoderados")):
        return None

    aliases = {
        "leng": {"l", "len", "leng", "lenguaje", "lenguayliteratura"},
        "mate": {"m", "mat", "mate", "matematica", "matematicas"},
        "hist": {"h", "hist", "historia"},
        "cnat": {"cnat", "cienciasnaturales", "naturales"},
        "a": {"a"},
        "b": {"b"},
    }
    for canonical, candidates in aliases.items():
        if collapsed in candidates:
            return canonical
    return None


def infer_context_from_code(value: Optional[str]) -> dict[str, Optional[str]]:
    text = clean_cell(value)
    if not text:
        return {"grade": None, "actor": None, "form": None}

    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", text) if token]
    if not tokens:
        return {"grade": None, "actor": None, "form": None}

    start_index = 1 if re.fullmatch(r"[sS]?\d{2,4}", tokens[0]) else 0
    grade = tokens[start_index] if len(tokens) > start_index else None
    actor = tokens[start_index + 1] if len(tokens) > start_index + 1 else None
    form = tokens[start_index + 2] if len(tokens) > start_index + 2 else None
    canonical_form = canonicalize_form(form)
    return {
        "grade": canonicalize_grade(grade),
        "actor": canonicalize_actor(actor),
        "form": canonical_form,
    }


def looks_like_item_code(value: Optional[str]) -> bool:
    text = normalize_text(value).replace(" ", "")
    return bool(text and re.fullmatch(r"p\d+(?:_\d+)?r?", text))


def fuzzy_ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if fuzz is not None:
        return fuzz.token_set_ratio(a, b) / 100.0
    return SequenceMatcher(None, a, b).ratio()


def jaccard_similarity(a: str, b: str) -> float:
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


def semantic_similarity(a: str, b: str) -> float:
    lexical = fuzzy_ratio(a, b)
    token_overlap = jaccard_similarity(a, b)
    return round((lexical * 0.55) + (token_overlap * 0.45), 4)


class WorkbookReader:
    MATRIX_COLUMN_ALIASES = {
        "actor": ["actor"],
        "grade": ["grado"],
        "form": ["forma"],
        "indicator": ["indicador", "indicador oic", "indicados oic"],
        "dimension": ["dimension", "dimension oic", "dimension oic 2014", "dimensión", "dimensión oic"],
        "subdimension": [
            "subdimension",
            "subdimension_nombre",
            "subdimensión",
            "subdimension_original",
            "subdimensión oic",
            "subdim",
        ],
        "np_code": ["np", "np 2016"],
        "question_text": ["pregunta 2015", "preguntas 2015", "pregunta", "preguntas", "enunciado pregunta"],
        "item_text": ["item 2015", "ítems 2014", "items", "ítems", "enunciado item", "item"],
        "scales": ["escala", "escalas", "alternativas", "alternativa"],
        "option_labels": ["valores", "etiqueta valores"],
    }

    RESULT_COLUMN_ALIASES = {
        "actor": ["actor", "ta"],
        "grade": ["grado"],
        "form": ["forma"],
        "indicator": ["indicador"],
        "dimension": ["dimension"],
        "subdimension": ["subdimension"],
        "np_code": ["np", "pregunta", "preg"],
        "question_text": ["enunciado_pregunta", "enunciado pregunta", "enunciado_preg"],
        "item_text": ["enunciado_item", "enunciado item"],
        "base_code": ["base", "agap", "agadp"],
    }

    def __init__(self, base_path: Path):
        self.base_path = base_path

    def discover_workbooks(self) -> list[Path]:
        files = [*self.base_path.rglob("*.xlsx"), *self.base_path.rglob("*.xls")]
        return sorted(files)

    @staticmethod
    def classify_file_type(path: Path) -> str:
        name = path.stem.lower()
        if "resultado" in name:
            return "RESULTADOS"
        if "matriz" in name:
            return "MATRIZ"
        return "OTRO"

    @staticmethod
    def infer_year(path: Path) -> int:
        for part in path.parts[::-1]:
            if re.fullmatch(r"\d{4}", part):
                return int(part)
        raise ValueError(f"No se pudo inferir el año desde {path}")

    def open_excel(self, path: Path) -> pd.ExcelFile:
        suffix = path.suffix.lower()
        if suffix == ".xls":
            try:
                import xlrd  # noqa: F401
            except ImportError as exc:
                raise RuntimeError(
                    f"No se puede abrir {path.name}: falta xlrd para archivos .xls"
                ) from exc
        return pd.ExcelFile(path)

    @staticmethod
    def normalize_headers(columns: Iterable[Any]) -> dict[str, str]:
        mapping: dict[str, str] = {}
        for column in columns:
            label = clean_cell(column)
            if label is None:
                continue
            mapping[normalize_text(label)] = label
        return mapping

    @classmethod
    def resolve_column(cls, normalized_headers: dict[str, str], aliases: list[str]) -> Optional[str]:
        for alias in aliases:
            exact = normalized_headers.get(normalize_text(alias))
            if exact:
                return exact

        for alias in aliases:
            alias_tokens = tokenize_normalized(alias)
            if not alias_tokens:
                continue
            for normalized, original in normalized_headers.items():
                header_tokens = tokenize_normalized(normalized)
                if contains_token_sequence(header_tokens, alias_tokens) or contains_token_sequence(alias_tokens, header_tokens):
                    return original
        return None

    @classmethod
    def detect_mapping(cls, columns: Iterable[Any], aliases: dict[str, list[str]]) -> dict[str, str]:
        normalized_headers = cls.normalize_headers(columns)
        detected: dict[str, str] = {}
        for target, candidates in aliases.items():
            column = cls.resolve_column(normalized_headers, candidates)
            if column:
                detected[target] = column
        return detected

    @staticmethod
    def is_result_sheet(sheet_name: str) -> bool:
        return normalize_text(sheet_name) not in {"obs", "glosa", "hoja1", "hoja 1", "metadata"}

    @staticmethod
    def is_matrix_sheet(sheet_name: str) -> bool:
        return normalize_text(sheet_name) not in {"grado_actor_forma", "hoja1", "obs", "glosa"}

    def build_source_record(self, path: Path) -> SourceFileRecord:
        year = self.infer_year(path)
        file_type = self.classify_file_type(path)
        source_file_id = f"SRC-{year}-{slugify(path.stem)}"
        record = SourceFileRecord(
            source_file_id=source_file_id,
            year_data=year,
            file_type=file_type,
            file_name=path.name,
            relative_path=str(path.relative_to(self.base_path)).replace("\\", "/"),
            workbook_label=path.stem,
            sheet_count=0,
            size_bytes=path.stat().st_size,
            import_status="PENDIENTE",
            metadata={"generated_at": now_iso()},
        )
        try:
            workbook = self.open_excel(path)
            record.sheet_count = len(workbook.sheet_names)
            record.structure_detected["sheet_names"] = workbook.sheet_names
            record.import_status = "IMPORTADO"
        except Exception as exc:  # pragma: no cover
            record.import_status = "PARCIAL"
            record.import_errors.append(str(exc))
        return record

    def extract_matrix_records(self, path: Path, source_file_id: str) -> list[MatrixRecord]:
        workbook = self.open_excel(path)
        year = self.infer_year(path)
        records: list[MatrixRecord] = []

        for sheet_name in workbook.sheet_names:
            if not self.is_matrix_sheet(sheet_name):
                continue

            df = pd.read_excel(path, sheet_name=sheet_name)
            if df.empty:
                continue

            mapping = self.detect_mapping(df.columns, self.MATRIX_COLUMN_ALIASES)
            if "item_text" not in mapping and "question_text" not in mapping:
                continue

            for row_index, row in df.iterrows():
                item_text = combine_text(
                    row.get(mapping.get("question_text", "")),
                    row.get(mapping.get("item_text", "")),
                )
                if len(normalize_text(item_text)) < 5:
                    continue

                records.append(
                    MatrixRecord(
                        source_file_id=source_file_id,
                        year=year,
                        sheet_name=sheet_name,
                        source_row_number=row_index + 2,
                        actor=canonicalize_actor(clean_cell(row.get(mapping.get("actor", ""))) or self._infer_actor(path, sheet_name)) or "estu",
                        grade=canonicalize_grade(clean_cell(row.get(mapping.get("grade", ""))) or self._infer_grade(path, sheet_name)),
                        form=canonicalize_form(clean_cell(row.get(mapping.get("form", ""))) or self._infer_form(path, sheet_name)),
                        indicator=clean_cell(row.get(mapping.get("indicator", ""))),
                        dimension=clean_cell(row.get(mapping.get("dimension", ""))),
                        subdimension=clean_cell(row.get(mapping.get("subdimension", ""))),
                        np_code=canonicalize_question_code(row.get(mapping.get("np_code", ""))),
                        question_text=clean_cell(row.get(mapping.get("question_text", ""))),
                        item_text=item_text,
                        scales=clean_cell(row.get(mapping.get("scales", ""))),
                        option_labels=clean_cell(row.get(mapping.get("option_labels", ""))),
                        source_payload=self._row_payload(row),
                    )
                )

        return records

    def extract_result_records(self, path: Path, source_file_id: str) -> list[ResultRecord]:
        workbook = self.open_excel(path)
        year = self.infer_year(path)
        records: list[ResultRecord] = []

        for sheet_name in workbook.sheet_names:
            if not self.is_result_sheet(sheet_name):
                continue

            df = pd.read_excel(path, sheet_name=sheet_name)
            if df.empty:
                continue

            mapping = self.detect_mapping(df.columns, self.RESULT_COLUMN_ALIASES)
            if "item_text" not in mapping and "question_text" not in mapping:
                continue

            for row_index, row in df.iterrows():
                compound_context = infer_context_from_code(clean_cell(row.get(mapping.get("base_code", ""))))
                item_text = combine_text(
                    row.get(mapping.get("question_text", "")),
                    row.get(mapping.get("item_text", "")),
                )
                if len(normalize_text(item_text)) < 5 or looks_like_item_code(item_text):
                    continue

                actor = canonicalize_actor(clean_cell(row.get(mapping.get("actor", ""))) or compound_context["actor"])
                grade = canonicalize_grade(clean_cell(row.get(mapping.get("grade", ""))) or compound_context["grade"])
                form = canonicalize_form(
                    clean_cell(row.get(mapping.get("form", ""))) or compound_context["form"] or self._infer_form(path, sheet_name)
                )
                np_code = canonicalize_question_code(row.get(mapping.get("np_code", "")))
                question_text = clean_cell(row.get(mapping.get("question_text", "")))
                if actor is None and grade is None and np_code is None:
                    continue

                records.append(
                    ResultRecord(
                        source_file_id=source_file_id,
                        year=year,
                        sheet_name=sheet_name,
                        source_row_number=row_index + 2,
                        actor=actor,
                        grade=grade,
                        form=form,
                        indicator=clean_cell(row.get(mapping.get("indicator", ""))),
                        dimension=clean_cell(row.get(mapping.get("dimension", ""))),
                        subdimension=clean_cell(row.get(mapping.get("subdimension", ""))),
                        np_code=np_code,
                        question_text=question_text,
                        item_text=item_text,
                        estimation_method="IRT" if year >= 2024 else "CLASICA",
                        metrics=self._extract_metrics(row),
                    )
                )

        return records

    @staticmethod
    def _row_payload(row: pd.Series) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        for key, value in row.items():
            cleaned = clean_cell(value)
            if cleaned is not None:
                payload[str(key)] = cleaned
        return payload

    @staticmethod
    def _extract_metrics(row: pd.Series) -> dict[str, Any]:
        metrics: dict[str, Any] = {}
        for column, value in row.items():
            label = clean_cell(column)
            if label is None:
                continue
            normalized = normalize_text(label)
            if normalized in STRUCTURAL_RESULT_COLUMNS:
                continue
            if value is None or (isinstance(value, float) and math.isnan(value)):
                continue
            if isinstance(value, (int, float)):
                metrics[slugify(label)] = float(value)
            else:
                text = str(value).strip()
                if text:
                    metrics[slugify(label)] = text
        return metrics

    @staticmethod
    def _infer_actor(path: Path, sheet_name: str) -> str:
        lowered = f"{path.stem} {sheet_name}".lower()
        if "doc" in lowered:
            return "doce"
        if "padr" in lowered or "fam" in lowered:
            return "padr"
        if "direc" in lowered:
            return "dire"
        return "estu"

    @staticmethod
    def _infer_grade(path: Path, sheet_name: str) -> Optional[str]:
        text = f"{path.stem} {sheet_name}"
        lowered = normalize_text(text).replace(" ", "")
        if (
            "iim" in lowered
            or "iia" in lowered
            or "iib" in lowered
            or "iio" in lowered
            or "2m" in lowered
            or "10" in lowered
            or "padresii" in lowered
            or "docenteii" in lowered
        ):
            return "2m"
        match = re.search(r"(\d+)\s*[b°ºm]", text.lower())
        if match:
            suffix = "m" if "m" in match.group(0) else "b"
            return f"{match.group(1)}{suffix}"
        return None

    @staticmethod
    def _infer_form(path: Path, sheet_name: str) -> Optional[str]:
        for token in tokenize_normalized(f"{path.stem} {sheet_name}"):
            canonical = canonicalize_form(token)
            if canonical is not None:
                return canonical
        return None


class CanonicalWarehouse:
    def __init__(self) -> None:
        self.canonical_items: list[dict[str, Any]] = []
        self.canonical_versions: list[dict[str, Any]] = []
        self.variants: list[dict[str, Any]] = []
        self.occurrences: list[dict[str, Any]] = []
        self.results: list[dict[str, Any]] = []
        self.revisions: list[dict[str, Any]] = []
        self._canonical_states: list[CanonicalState] = []
        self._occurrence_lookup_exact: dict[tuple[Any, ...], list[str]] = defaultdict(list)
        self._occurrence_lookup_no_form: dict[tuple[Any, ...], list[str]] = defaultdict(list)
        self._occurrence_lookup_text: dict[tuple[Any, ...], list[str]] = defaultdict(list)
        self._occurrence_lookup_np_exact: dict[tuple[Any, ...], list[str]] = defaultdict(list)
        self._occurrence_lookup_np_no_form: dict[tuple[Any, ...], list[str]] = defaultdict(list)
        self._occurrence_by_id: dict[str, dict[str, Any]] = {}
        self._aggregate_occurrence_lookup: dict[tuple[Any, ...], str] = {}
        self._canonical_index: dict[tuple[str, str, str], list[CanonicalState]] = {}
        self._variant_exact_index: dict[tuple[str, str, str, str], tuple[CanonicalState, VariantState]] = {}
        self._canonical_counter = 1

    def homologate(self, records: list[MatrixRecord]) -> list[DecisionAudit]:
        audits: list[DecisionAudit] = []
        ordered = sorted(
            records,
            key=lambda record: (
                record.year,
                record.actor,
                record.dimension or "",
                record.subdimension or "",
                record.item_text,
            ),
        )
        for record in ordered:
            canonical_state, variant_state, audit = self._assign_record(record)
            occurrence = self._build_occurrence(record, canonical_state, variant_state, audit)
            self.occurrences.append(occurrence)
            self._occurrence_by_id[occurrence["id_ocurrencia"]] = occurrence
            audits.append(audit)
            self._register_occurrence(record, occurrence["id_ocurrencia"])
        return audits

    def attach_results(self, result_records: list[ResultRecord]) -> list[ResultRecord]:
        unmatched: list[ResultRecord] = []
        for result in result_records:
            occurrence_id = self._find_occurrence_id(result)
            if occurrence_id is None:
                occurrence_id = self._find_or_create_aggregate_occurrence(result)
            if occurrence_id is None:
                unmatched.append(result)
                continue
            self.results.append(self._build_result(result, occurrence_id))
        return unmatched

    def summary(self) -> dict[str, Any]:
        return {
            "canonical_items": len(self.canonical_items),
            "variants": len(self.variants),
            "occurrences": len(self.occurrences),
            "results": len(self.results),
            "revisions": len(self.revisions),
            "generated_at": now_iso(),
        }

    def _assign_record(self, record: MatrixRecord) -> tuple[CanonicalState, VariantState, DecisionAudit]:
        candidate = self._best_candidate(record)

        if candidate is None or candidate["decision"] == "DIFERENTE":
            canonical_state, variant_state = self._create_canonical_family(record)
            decision = "DIFERENTE"
            exact_score = 0.0
            fuzzy_score = 0.0
            semantic_score = 0.0
            combined_score = 0.0
            confidence_score = 0.99
            requires_human_review = False
            evidence = {"reason": "nuevo_item_canonico"}
        else:
            canonical_state = candidate["canonical_state"]
            if candidate["decision"] == "EXACTO":
                variant_state = candidate["variant_state"]
            else:
                variant_state = self._create_variant(
                    canonical_state,
                    record,
                    candidate["decision"],
                    candidate["candidate_text"],
                )
            decision = candidate["decision"]
            exact_score = candidate["exact_score"]
            fuzzy_score = candidate["fuzzy_score"]
            semantic_score = candidate["semantic_score"]
            combined_score = candidate["combined_score"]
            confidence_score = candidate["confidence_score"]
            requires_human_review = candidate["decision"] == "AMBIGUO"
            evidence = {
                "candidate_variant_id": candidate["variant_state"].variant_id,
                "candidate_text": candidate["candidate_text"],
                "normalized_text": normalize_text(record.item_text),
            }

        occurrence_id = self._preview_occurrence_id(record, variant_state)
        audit = DecisionAudit(
            occurrence_id=occurrence_id,
            source_file_id=record.source_file_id,
            year=record.year,
            actor=record.actor,
            dimension=record.dimension,
            subdimension=record.subdimension,
            item_text=record.item_text,
            canonical_item_id=canonical_state.canonical_id,
            variant_id=variant_state.variant_id,
            automatic_decision=decision,
            exact_score=round(exact_score, 4),
            fuzzy_score=round(fuzzy_score, 4),
            semantic_score=round(semantic_score, 4),
            combined_score=round(combined_score, 4),
            confidence_score=round(confidence_score, 4),
            requires_human_review=requires_human_review,
            evidence=evidence,
        )
        if requires_human_review:
            self.revisions.append(
                {
                    "occurrence_id": occurrence_id,
                    "automatic_decision": decision,
                    "human_status": "PENDIENTE",
                    "confidence_score": round(confidence_score, 4),
                    "combined_score": round(combined_score, 4),
                    "evidence": evidence,
                    "created_at": now_iso(),
                }
            )
        return canonical_state, variant_state, audit

    def _create_canonical_family(self, record: MatrixRecord) -> tuple[CanonicalState, VariantState]:
        canonical_id = f"IDPS-CAN-{record.year}-{self._canonical_counter:06d}"
        self._canonical_counter += 1
        canonical_state = CanonicalState(
            canonical_id=canonical_id,
            actor=record.actor,
            dimension=record.dimension or "Sin dimension",
            subdimension=record.subdimension,
            text=record.item_text,
            normalized_text=normalize_text(record.item_text),
            first_year=record.year,
            last_year=record.year,
            metadata={
                "indicator": record.indicator,
                "source_file_id": record.source_file_id,
                "created_from": "pipeline_longitudinal",
            },
        )
        self._canonical_states.append(canonical_state)
        self._canonical_index.setdefault(self._bucket_key(record.actor, record.dimension, record.subdimension), []).append(canonical_state)
        self.canonical_items.append(
            {
                "id_canonico": canonical_state.canonical_id,
                "actor": canonical_state.actor,
                "dimension": canonical_state.dimension,
                "subdimension": canonical_state.subdimension,
                "texto_canonico": canonical_state.text,
                "texto_normalizado": canonical_state.normalized_text,
                "first_year": canonical_state.first_year,
                "last_year": canonical_state.last_year,
                "estado": "ACTIVO",
                "metadata": canonical_state.metadata,
            }
        )
        self.canonical_versions.append(
            {
                "canonical_item_id": canonical_state.canonical_id,
                "version_number": 1,
                "snapshot": {
                    "texto_canonico": canonical_state.text,
                    "actor": canonical_state.actor,
                    "dimension": canonical_state.dimension,
                    "subdimension": canonical_state.subdimension,
                },
                "change_type": "CREACION",
                "change_reason": "Primera aparicion en pipeline longitudinal",
                "created_at": now_iso(),
            }
        )
        variant_state = self._create_variant(canonical_state, record, "CANONICA", "nuevo_item_canonico")
        return canonical_state, variant_state

    def _create_variant(
        self,
        canonical_state: CanonicalState,
        record: MatrixRecord,
        decision: str,
        change_summary: str,
    ) -> VariantState:
        if decision == "EXACTO":
            for variant in canonical_state.variants:
                if variant.normalized_text == normalize_text(record.item_text):
                    return variant

        variant_number = len(canonical_state.variants) + 1
        variant_id = canonical_state.canonical_id.replace("CAN", "VAR") + f"-{variant_number:03d}"
        variant_type = {
            "CANONICA": "CANONICA",
            "VARIANTE_MENOR": "MENOR",
            "VARIANTE_SUSTANTIVA": "SUSTANTIVA",
            "EQUIVALENTE_CANONICO": "MENOR",
            "AMBIGUO": "SUSTANTIVA",
        }.get(decision, "MENOR")
        variant = VariantState(
            canonical_id=canonical_state.canonical_id,
            variant_id=variant_id,
            variant_number=variant_number,
            text=record.item_text,
            normalized_text=normalize_text(record.item_text),
            variant_type=variant_type,
            metadata={
                "source_file_id": record.source_file_id,
                "source_sheet": record.sheet_name,
                "decision_seed": decision,
            },
        )
        canonical_state.variants.append(variant)
        self._variant_exact_index[
            self._variant_lookup_key(canonical_state.actor, canonical_state.dimension, canonical_state.subdimension, variant.normalized_text)
        ] = (canonical_state, variant)
        canonical_state.first_year = min(canonical_state.first_year, record.year)
        canonical_state.last_year = max(canonical_state.last_year, record.year)
        for existing in self.canonical_items:
            if existing["id_canonico"] == canonical_state.canonical_id:
                existing["first_year"] = canonical_state.first_year
                existing["last_year"] = canonical_state.last_year
                break
        self.variants.append(
            {
                "id_variante": variant.variant_id,
                "canonical_item_id": variant.canonical_id,
                "variant_number": variant.variant_number,
                "texto_variante": variant.text,
                "texto_normalizado": variant.normalized_text,
                "variant_type": variant.variant_type,
                "change_summary": change_summary,
                "approval_status": "PENDIENTE" if decision == "AMBIGUO" else "APROBADA",
                "metadata": variant.metadata,
            }
        )
        return variant

    def _best_candidate(self, record: MatrixRecord) -> Optional[dict[str, Any]]:
        record_norm = normalize_text(record.item_text)
        if not record_norm:
            return None

        exact_key = self._variant_lookup_key(record.actor, record.dimension, record.subdimension, record_norm)
        exact_candidate = self._variant_exact_index.get(exact_key)
        if exact_candidate is not None:
            canonical_state, variant = exact_candidate
            return {
                "canonical_state": canonical_state,
                "variant_state": variant,
                "candidate_text": variant.text,
                "exact_score": 1.0,
                "fuzzy_score": 1.0,
                "semantic_score": 1.0,
                "combined_score": 1.0,
                "decision": "EXACTO",
                "confidence_score": 0.99,
            }

        best: Optional[dict[str, Any]] = None
        bucket = self._canonical_index.get(self._bucket_key(record.actor, record.dimension, record.subdimension), [])
        for canonical_state in bucket:
            for variant in canonical_state.variants:
                exact_score = 1.0 if record_norm == variant.normalized_text else 0.0
                fuzzy_score = fuzzy_ratio(record_norm, variant.normalized_text)
                semantic_score = semantic_similarity(record_norm, variant.normalized_text)
                combined_score = round((exact_score * 0.45) + (fuzzy_score * 0.25) + (semantic_score * 0.30), 4)
                decision = self._decision(record_norm, variant.normalized_text, exact_score, fuzzy_score, semantic_score, combined_score)
                payload = {
                    "canonical_state": canonical_state,
                    "variant_state": variant,
                    "candidate_text": variant.text,
                    "exact_score": exact_score,
                    "fuzzy_score": fuzzy_score,
                    "semantic_score": semantic_score,
                    "combined_score": combined_score,
                    "decision": decision,
                    "confidence_score": self._confidence(decision, combined_score),
                }
                if best is None or DECISION_ORDER[decision] > DECISION_ORDER[best["decision"]] or (
                    DECISION_ORDER[decision] == DECISION_ORDER[best["decision"]] and combined_score > best["combined_score"]
                ):
                    best = payload
        return best

    @staticmethod
    def _bucket_key(actor: Optional[str], dimension: Optional[str], subdimension: Optional[str]) -> tuple[str, str, str]:
        return (
            normalize_text(actor),
            normalize_text(dimension),
            normalize_text(subdimension),
        )

    @classmethod
    def _variant_lookup_key(
        cls,
        actor: Optional[str],
        dimension: Optional[str],
        subdimension: Optional[str],
        normalized_text: str,
    ) -> tuple[str, str, str, str]:
        bucket = cls._bucket_key(actor, dimension, subdimension)
        return bucket[0], bucket[1], bucket[2], normalized_text

    @staticmethod
    def _decision(
        source_norm: str,
        candidate_norm: str,
        exact_score: float,
        fuzzy_score: float,
        semantic_score: float,
        combined_score: float,
    ) -> str:
        token_overlap = jaccard_similarity(source_norm, candidate_norm)
        if exact_score == 1.0:
            return "EXACTO"
        if combined_score >= 0.90 and token_overlap >= 0.70:
            return "EQUIVALENTE_CANONICO"
        if combined_score >= 0.82 and token_overlap >= 0.55:
            return "VARIANTE_MENOR"
        if combined_score >= 0.72 and semantic_score >= 0.68:
            return "VARIANTE_SUSTANTIVA"
        if combined_score >= 0.62 and fuzzy_score >= 0.58:
            return "AMBIGUO"
        return "DIFERENTE"

    @staticmethod
    def _confidence(decision: str, combined_score: float) -> float:
        floors = {
            "EXACTO": 0.99,
            "EQUIVALENTE_CANONICO": 0.90,
            "VARIANTE_MENOR": 0.82,
            "VARIANTE_SUSTANTIVA": 0.72,
            "AMBIGUO": 0.55,
            "DIFERENTE": 0.95,
        }
        return round(max(floors[decision], combined_score), 4)

    def _preview_occurrence_id(self, record: MatrixRecord, variant: VariantState) -> str:
        count = sum(
            1
            for occurrence in self.occurrences
            if occurrence["variante_id"] == variant.variant_id and occurrence["year_applied"] == record.year
        ) + 1
        return variant.variant_id.replace("VAR", "OCC") + f"-{record.year}-{count:03d}"

    def _build_occurrence(
        self,
        record: MatrixRecord,
        canonical_state: CanonicalState,
        variant_state: VariantState,
        audit: DecisionAudit,
    ) -> dict[str, Any]:
        return {
            "id_ocurrencia": audit.occurrence_id,
            "variante_id": variant_state.variant_id,
            "source_file_id": record.source_file_id,
            "year_applied": record.year,
            "actor_label": record.actor,
            "grade_label": record.grade,
            "form_label": record.form,
            "sheet_name": record.sheet_name,
            "source_row_number": record.source_row_number,
            "question_code": record.np_code,
            "item_code": record.np_code,
            "prompt_text": record.question_text,
            "texto_original": record.item_text,
            "texto_normalizado": normalize_text(record.item_text),
            "decision_taxonomy": audit.automatic_decision,
            "processing_status": "EN_REVISION" if audit.requires_human_review else "HOMOLOGADO",
            "metadata": {
                "indicator": record.indicator,
                "scales": record.scales,
                "option_labels": record.option_labels,
                "source_payload": record.source_payload,
                "canonical_item_id": canonical_state.canonical_id,
            },
        }

    def _occurrence_key(self, record: MatrixRecord) -> tuple[Any, ...]:
        return (
            record.year,
            normalize_text(record.actor),
            normalize_text(record.grade),
            normalize_text(record.form),
            normalize_text(record.np_code),
            normalize_text(record.item_text),
        )

    def _register_occurrence(self, record: MatrixRecord, occurrence_id: str) -> None:
        year, actor, grade, form, np_code, item_text = self._occurrence_key(record)
        self._register_occurrence_values(year, actor, grade, form, np_code, item_text, occurrence_id)

    def _register_occurrence_values(
        self,
        year: int,
        actor: str,
        grade: str,
        form: str,
        np_code: str,
        item_text: str,
        occurrence_id: str,
    ) -> None:
        self._occurrence_lookup_exact[(year, actor, grade, form, np_code, item_text)].append(occurrence_id)
        self._occurrence_lookup_no_form[(year, actor, grade, np_code, item_text)].append(occurrence_id)
        self._occurrence_lookup_text[(year, actor, grade, item_text)].append(occurrence_id)
        self._occurrence_lookup_np_exact[(year, actor, grade, form, np_code)].append(occurrence_id)
        self._occurrence_lookup_np_no_form[(year, actor, grade, np_code)].append(occurrence_id)

    @staticmethod
    def _select_unique(candidates: list[str]) -> Optional[str]:
        unique = sorted(set(candidates))
        return unique[0] if len(unique) == 1 else None

    def _select_unique_with_context(self, candidates: list[str], item_text: str, question_text: str) -> Optional[str]:
        unique_candidates = sorted(set(candidates))
        if len(unique_candidates) == 1:
            return unique_candidates[0]

        exact_item = [
            occurrence_id
            for occurrence_id in unique_candidates
            if normalize_text(self._occurrence_by_id.get(occurrence_id, {}).get("texto_original")) == item_text
        ]
        exact_prompt = [
            occurrence_id
            for occurrence_id in unique_candidates
            if normalize_text(self._occurrence_by_id.get(occurrence_id, {}).get("prompt_text")) == question_text
        ] if question_text else []
        exact_both = [
            occurrence_id
            for occurrence_id in exact_item
            if normalize_text(self._occurrence_by_id.get(occurrence_id, {}).get("prompt_text")) == question_text
        ] if question_text else []

        for filtered in (exact_both, exact_item, exact_prompt):
            selected = self._select_unique(filtered)
            if selected is not None:
                return selected

        scored_candidates = exact_prompt or unique_candidates
        scored: list[tuple[float, str]] = []
        for occurrence_id in scored_candidates:
            occurrence = self._occurrence_by_id.get(occurrence_id, {})
            candidate_item = normalize_text(occurrence.get("texto_original"))
            item_score = semantic_similarity(candidate_item, item_text) if item_text else 0.0
            if question_text:
                candidate_prompt = normalize_text(occurrence.get("prompt_text"))
                prompt_score = semantic_similarity(candidate_prompt, question_text)
                combined_score = round((item_score * 0.7) + (prompt_score * 0.3), 4)
            else:
                combined_score = item_score
            scored.append((combined_score, occurrence_id))

        scored.sort(reverse=True)
        if not scored:
            return None
        if len(scored) == 1 and scored[0][0] >= 0.88:
            return scored[0][1]
        if len(scored) >= 2 and scored[0][0] >= 0.88 and (scored[0][0] - scored[1][0]) >= 0.08:
            return scored[0][1]
        return None

    def _find_occurrence_id(self, result: ResultRecord) -> Optional[str]:
        actor = normalize_text(result.actor)
        grade = normalize_text(result.grade)
        form = normalize_text(result.form)
        np_code = normalize_text(result.np_code)
        item_text = normalize_text(result.item_text)
        question_text = normalize_text(result.question_text)

        np_lookups = []
        if result.year >= 2023 and form:
            np_lookups.append(self._occurrence_lookup_np_exact.get((result.year, actor, grade, form, np_code), []))
        np_lookups.append(self._occurrence_lookup_np_no_form.get((result.year, actor, grade, np_code), []))
        for candidates in np_lookups:
            selected = self._select_unique(candidates)
            if selected is not None:
                return selected
            selected = self._select_unique_with_context(candidates, item_text, question_text)
            if selected is not None:
                return selected

        lookups = [
            self._occurrence_lookup_no_form.get((result.year, actor, grade, np_code, item_text), []),
            self._occurrence_lookup_text.get((result.year, actor, grade, item_text), []),
        ]
        if not grade:
            lookups.extend(
                [
                    [
                        occurrence["id_ocurrencia"]
                        for occurrence in self.occurrences
                        if occurrence["year_applied"] == result.year
                        and normalize_text(occurrence["actor_label"]) == actor
                        and normalize_text(occurrence["question_code"]) == np_code
                        and normalize_text(occurrence["texto_original"]) == item_text
                    ],
                    [
                        occurrence["id_ocurrencia"]
                        for occurrence in self.occurrences
                        if occurrence["year_applied"] == result.year
                        and normalize_text(occurrence["actor_label"]) == actor
                        and normalize_text(occurrence["texto_original"]) == item_text
                    ],
                ]
            )
        for candidates in lookups:
            selected = self._select_unique(candidates)
            if selected is not None:
                return selected
            selected = self._select_unique_with_context(candidates, item_text, question_text)
            if selected is not None:
                return selected
        return None

    def _find_or_create_aggregate_occurrence(self, result: ResultRecord) -> Optional[str]:
        actor = normalize_text(result.actor)
        grade = normalize_text(result.grade)
        np_code = normalize_text(result.np_code)
        item_text = normalize_text(result.item_text)
        question_text = normalize_text(result.question_text)
        if not actor or not grade or not np_code:
            return None

        candidate_ids = sorted(set(self._occurrence_lookup_np_no_form.get((result.year, actor, grade, np_code), [])))
        if len(candidate_ids) < 2:
            return None

        if question_text:
            prompt_matched = [
                occurrence_id
                for occurrence_id in candidate_ids
                if normalize_text(self._occurrence_by_id.get(occurrence_id, {}).get("prompt_text")) == question_text
            ]
            if len(prompt_matched) >= 2:
                candidate_ids = prompt_matched

        if item_text:
            exact_item_matched = [
                occurrence_id
                for occurrence_id in candidate_ids
                if normalize_text(self._occurrence_by_id.get(occurrence_id, {}).get("texto_original")) == item_text
            ]
            if len(exact_item_matched) >= 2:
                candidate_ids = exact_item_matched

        if len(candidate_ids) < 2:
            return None

        candidates = [self._occurrence_by_id[occurrence_id] for occurrence_id in candidate_ids if occurrence_id in self._occurrence_by_id]
        if len(candidates) != len(candidate_ids):
            return None

        variant_ids = {candidate["variante_id"] for candidate in candidates}
        aggregate_key = (result.year, actor, grade, np_code, question_text, item_text, tuple(sorted(variant_ids)))
        existing = self._aggregate_occurrence_lookup.get(aggregate_key)
        if existing is not None:
            return existing

        template = candidates[0]
        aggregate_variant_id = sorted(variant_ids)[0]
        aggregate_occurrence_id = (
            aggregate_variant_id.replace("VAR", "OCC", 1)
            + f"-{slugify(template.get('actor_label'), 'na')}-{slugify(template.get('grade_label'), 'na')}-{slugify(template.get('question_code'), 'na')}-agg"
        )
        if aggregate_occurrence_id in self._occurrence_by_id:
            return aggregate_occurrence_id

        metadata = dict(template.get("metadata") or {})
        metadata["aggregate_variant_ids"] = sorted(variant_ids)
        metadata["aggregate_forms"] = sorted({candidate.get("form_label") for candidate in candidates if candidate.get("form_label")})
        metadata["aggregate_occurrence_ids"] = candidate_ids
        metadata["aggregate_source"] = "resultados_sin_forma"

        aggregate_occurrence = {
            "id_ocurrencia": aggregate_occurrence_id,
            "variante_id": aggregate_variant_id,
            "source_file_id": template["source_file_id"],
            "year_applied": template["year_applied"],
            "actor_label": template["actor_label"],
            "grade_label": template["grade_label"],
            "form_label": None,
            "sheet_name": "AGREGADO_RESULTADOS_SIN_FORMA",
            "source_row_number": None,
            "question_code": template["question_code"],
            "item_code": template["item_code"],
            "prompt_text": template["prompt_text"],
            "texto_original": template["texto_original"],
            "texto_normalizado": template["texto_normalizado"],
            "decision_taxonomy": template["decision_taxonomy"],
            "processing_status": template["processing_status"],
            "metadata": metadata,
        }

        self.occurrences.append(aggregate_occurrence)
        self._occurrence_by_id[aggregate_occurrence_id] = aggregate_occurrence
        self._aggregate_occurrence_lookup[aggregate_key] = aggregate_occurrence_id
        self._register_occurrence_values(
            aggregate_occurrence["year_applied"],
            normalize_text(aggregate_occurrence["actor_label"]),
            normalize_text(aggregate_occurrence["grade_label"]),
            normalize_text(aggregate_occurrence["form_label"]),
            normalize_text(aggregate_occurrence["question_code"]),
            normalize_text(aggregate_occurrence["texto_original"]),
            aggregate_occurrence_id,
        )
        return aggregate_occurrence_id

    @staticmethod
    def _build_result(result: ResultRecord, occurrence_id: str) -> dict[str, Any]:
        distribution = {key: value for key, value in result.metrics.items() if key.startswith("pctje_")}
        metrics = {key: value for key, value in result.metrics.items() if not key.startswith("pctje_")}
        return {
            "id_resultado": occurrence_id.replace("OCC", "RES") + f"-{result.estimation_method}",
            "occurrence_id": occurrence_id,
            "source_file_id": result.source_file_id,
            "year_analysis": result.year,
            "estimation_method": result.estimation_method,
            "methodological_context": "IRT" if result.estimation_method == "IRT" else "TEORIA_CLASICA",
            "mean_value": metrics.get("media") or metrics.get("mean"),
            "std_dev": metrics.get("sd") or metrics.get("desviacion_estandar"),
            "kurtosis": metrics.get("kurtosis"),
            "cit": metrics.get("cit"),
            "missing_pct": metrics.get("missing_pct"),
            "irt_a": metrics.get("irt_a"),
            "irt_b": metrics.get("irt_b"),
            "irt_c": metrics.get("irt_c"),
            "irt_information": metrics.get("irt_information"),
            "response_distribution": distribution,
            "metrics": metrics,
            "metadata": {
                "sheet_name": result.sheet_name,
                "source_row_number": result.source_row_number,
                "actor": result.actor,
                "grade": result.grade,
                "form": result.form,
                "indicator": result.indicator,
                "dimension": result.dimension,
                "subdimension": result.subdimension,
            },
        }


class PostgresWriter:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    def write(self, sources: list[SourceFileRecord]) -> None:  # pragma: no cover
        try:
            import psycopg2
            from psycopg2.extras import Json
        except ImportError as exc:
            raise RuntimeError("psycopg2 es requerido para escribir en PostgreSQL") from exc

        connection = psycopg2.connect(self.dsn)
        try:
            with connection:
                with connection.cursor() as cursor:
                    for source in sources:
                        cursor.execute(
                            """
                            INSERT INTO fuente_archivo (
                                id, year_data, file_type, file_name, relative_path, workbook_label,
                                sheet_count, size_bytes, structure_detected, column_mapping,
                                import_status, import_errors, imported_by, metadata
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (relative_path) DO UPDATE
                            SET import_status = EXCLUDED.import_status,
                                import_errors = EXCLUDED.import_errors,
                                structure_detected = EXCLUDED.structure_detected,
                                column_mapping = EXCLUDED.column_mapping,
                                metadata = EXCLUDED.metadata
                            """,
                            (
                                source.source_file_id,
                                source.year_data,
                                source.file_type,
                                source.file_name,
                                source.relative_path,
                                source.workbook_label,
                                source.sheet_count,
                                source.size_bytes,
                                Json(source.structure_detected),
                                Json(source.column_mapping),
                                source.import_status,
                                "\n".join(source.import_errors) if source.import_errors else None,
                                "pipeline_cli",
                                Json(source.metadata),
                            ),
                        )
        finally:
            connection.close()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pipeline canonico longitudinal IDPS")
    parser.add_argument("--matrices", required=True, help="Ruta base con carpetas 2014-2026")
    parser.add_argument("--output", required=True, help="Carpeta de salida para auditorias y JSON")
    parser.add_argument("--dsn", help="DSN de PostgreSQL para registrar metadatos fuente")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base_path = Path(args.matrices).resolve()
    output_path = Path(args.output).resolve()
    reader = WorkbookReader(base_path)
    warehouse = CanonicalWarehouse()

    source_records: list[SourceFileRecord] = []
    matrix_records: list[MatrixRecord] = []
    result_records: list[ResultRecord] = []

    for workbook_path in reader.discover_workbooks():
        source = reader.build_source_record(workbook_path)
        source_records.append(source)
        logger.info("Procesando %s [%s]", source.relative_path, source.import_status)

        if source.import_status == "PARCIAL":
            continue

        try:
            if source.file_type == "MATRIZ":
                extracted = reader.extract_matrix_records(workbook_path, source.source_file_id)
                matrix_records.extend(extracted)
                source.metadata["rows_detected"] = len(extracted)
            elif source.file_type == "RESULTADOS":
                extracted = reader.extract_result_records(workbook_path, source.source_file_id)
                result_records.extend(extracted)
                source.metadata["rows_detected"] = len(extracted)
            else:
                source.metadata["rows_detected"] = 0
        except Exception as exc:  # pragma: no cover
            source.import_status = "PARCIAL"
            source.import_errors.append(str(exc))
            logger.warning("Fallo parcial en %s: %s", source.relative_path, exc)

    for source in source_records:
        source.column_mapping = {
            "file_type": source.file_type,
            "notes": "Resolucion de columnas por alias en Python",
        }

    audits = warehouse.homologate(matrix_records)
    unmatched_results = warehouse.attach_results(result_records)
    summary = warehouse.summary()
    summary.update(
        {
            "source_files": len(source_records),
            "matrix_rows": len(matrix_records),
            "result_rows": len(result_records),
            "result_rows_unmatched": len(unmatched_results),
            "ambiguous_reviews": len(warehouse.revisions),
        }
    )

    write_json(output_path / "summary.json", summary)
    write_json(output_path / "source_files.json", [asdict(source) for source in source_records])
    write_json(output_path / "canonical_items.json", warehouse.canonical_items)
    write_json(output_path / "canonical_versions.json", warehouse.canonical_versions)
    write_json(output_path / "variants.json", warehouse.variants)
    write_json(output_path / "occurrences.json", warehouse.occurrences)
    write_json(output_path / "results.json", warehouse.results)
    write_json(output_path / "revisions.json", warehouse.revisions)
    write_json(output_path / "decision_audit.json", [asdict(audit) for audit in audits])
    write_json(output_path / "unmatched_results.json", [asdict(result) for result in unmatched_results])
    write_json(
        output_path / "inventory_by_year.json",
        {
            str(year): {
                "files": len([source for source in source_records if source.year_data == year]),
                "matrix_rows": len([record for record in matrix_records if record.year == year]),
                "result_rows": len([record for record in result_records if record.year == year]),
            }
            for year in sorted({source.year_data for source in source_records})
        },
    )

    if args.dsn:
        PostgresWriter(args.dsn).write(source_records)

    logger.info("Resumen final: %s", json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
