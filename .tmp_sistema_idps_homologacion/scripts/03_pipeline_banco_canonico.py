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
        "actor": ["actor"],
        "grade": ["grado"],
        "form": ["forma"],
        "indicator": ["indicador"],
        "dimension": ["dimension"],
        "subdimension": ["subdimension"],
        "np_code": ["np", "pregunta"],
        "question_text": ["enunciado_pregunta", "enunciado pregunta"],
        "item_text": ["enunciado_item", "enunciado item"],
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
            alias_norm = normalize_text(alias)
            for normalized, original in normalized_headers.items():
                if alias_norm in normalized or normalized in alias_norm:
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
                        actor=clean_cell(row.get(mapping.get("actor", ""))) or self._infer_actor(path, sheet_name),
                        grade=clean_cell(row.get(mapping.get("grade", ""))) or self._infer_grade(path, sheet_name),
                        form=clean_cell(row.get(mapping.get("form", ""))) or sheet_name,
                        indicator=clean_cell(row.get(mapping.get("indicator", ""))),
                        dimension=clean_cell(row.get(mapping.get("dimension", ""))),
                        subdimension=clean_cell(row.get(mapping.get("subdimension", ""))),
                        np_code=clean_cell(row.get(mapping.get("np_code", ""))),
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
                item_text = combine_text(
                    row.get(mapping.get("question_text", "")),
                    row.get(mapping.get("item_text", "")),
                )
                if len(normalize_text(item_text)) < 5:
                    continue

                records.append(
                    ResultRecord(
                        source_file_id=source_file_id,
                        year=year,
                        sheet_name=sheet_name,
                        source_row_number=row_index + 2,
                        actor=clean_cell(row.get(mapping.get("actor", ""))),
                        grade=clean_cell(row.get(mapping.get("grade", ""))),
                        form=clean_cell(row.get(mapping.get("form", ""))),
                        indicator=clean_cell(row.get(mapping.get("indicator", ""))),
                        dimension=clean_cell(row.get(mapping.get("dimension", ""))),
                        subdimension=clean_cell(row.get(mapping.get("subdimension", ""))),
                        np_code=clean_cell(row.get(mapping.get("np_code", ""))),
                        question_text=clean_cell(row.get(mapping.get("question_text", ""))),
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
            return "Docente"
        if "padr" in lowered or "fam" in lowered:
            return "Apoderado"
        if "direc" in lowered:
            return "Directivo"
        return "Estudiante"

    @staticmethod
    def _infer_grade(path: Path, sheet_name: str) -> Optional[str]:
        text = f"{path.stem} {sheet_name}"
        match = re.search(r"(\d+\s*[mbb°º])", text.lower())
        if match:
            return match.group(1).replace(" ", "")
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
        self._occurrence_lookup: dict[tuple[Any, ...], str] = {}
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
            audits.append(audit)
            self._occurrence_lookup[self._occurrence_key(record)] = occurrence["id_ocurrencia"]
        return audits

    def attach_results(self, result_records: list[ResultRecord]) -> list[ResultRecord]:
        unmatched: list[ResultRecord] = []
        for result in result_records:
            occurrence_id = self._find_occurrence_id(result)
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
            normalize_text(record.form),
            normalize_text(record.np_code),
            normalize_text(record.item_text),
        )

    def _find_occurrence_id(self, result: ResultRecord) -> Optional[str]:
        keys = [
            (
                result.year,
                normalize_text(result.actor),
                normalize_text(result.form),
                normalize_text(result.np_code),
                normalize_text(result.item_text),
            ),
            (
                result.year,
                normalize_text(result.actor),
                normalize_text(result.form),
                "",
                normalize_text(result.item_text),
            ),
            (
                result.year,
                normalize_text(result.actor),
                "",
                normalize_text(result.np_code),
                normalize_text(result.item_text),
            ),
        ]
        for key in keys:
            if key in self._occurrence_lookup:
                return self._occurrence_lookup[key]
        return None

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
