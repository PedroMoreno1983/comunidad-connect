from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class BankItemSummary(BaseModel):
    canonical_id: str
    canonical_text: str
    status: str
    actor_id: Optional[str] = None
    actor_code: Optional[str] = None
    actor_name: Optional[str] = None
    dimension_id: Optional[str] = None
    dimension_code: Optional[str] = None
    dimension_name: Optional[str] = None
    subdimension_id: Optional[str] = None
    subdimension_code: Optional[str] = None
    subdimension_name: Optional[str] = None
    first_year: Optional[int] = None
    last_year: Optional[int] = None
    years: list[int] = Field(default_factory=list)
    methods: list[str] = Field(default_factory=list)
    total_variants: int = 0
    total_occurrences: int = 0
    total_results: int = 0
    version_actual: int = 1
    metadata: dict[str, Any] = Field(default_factory=dict)


class BankVariant(BaseModel):
    variant_id: str
    variant_number: int
    text: str
    variant_type: str
    approval_status: str
    change_summary: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class BankOccurrence(BaseModel):
    occurrence_id: str
    year_applied: int
    actor_label: Optional[str] = None
    grade_label: Optional[str] = None
    form_label: Optional[str] = None
    sheet_name: Optional[str] = None
    question_code: Optional[str] = None
    prompt_text: Optional[str] = None
    original_text: str
    decision_taxonomy: str
    processing_status: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class BankResult(BaseModel):
    result_id: str
    occurrence_id: str
    year_analysis: int
    estimation_method: str
    methodological_context: Optional[str] = None
    mean_value: Optional[float] = None
    std_dev: Optional[float] = None
    kurtosis: Optional[float] = None
    cit: Optional[float] = None
    missing_pct: Optional[float] = None
    irt_a: Optional[float] = None
    irt_b: Optional[float] = None
    irt_c: Optional[float] = None
    irt_information: Optional[float] = None
    response_distribution: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class BankRevision(BaseModel):
    id: str
    occurrence_origin_id: str
    automatic_decision: str
    human_status: str
    confidence_score: Optional[float] = None
    combined_score: Optional[float] = None
    requires_human_review: bool
    review_notes: Optional[str] = None
    created_at: Optional[str] = None
    reviewed_at: Optional[str] = None
    original_text: Optional[str] = None
    canonical_item_id: Optional[str] = None
    canonical_text: Optional[str] = None
    reviewer_username: Optional[str] = None


class BankItemDetail(BaseModel):
    item: BankItemSummary
    variants: list[BankVariant] = Field(default_factory=list)
    occurrences: list[BankOccurrence] = Field(default_factory=list)
    results: list[BankResult] = Field(default_factory=list)
    revisions: list[BankRevision] = Field(default_factory=list)


class BankOverview(BaseModel):
    canonical_items: int
    variants: int
    occurrences: int
    results: int
    pending_reviews: int
    generated_items: int


class BankPaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    pages: int


def _to_iso(value: Any) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _map_summary(row: dict[str, Any]) -> BankItemSummary:
    return BankItemSummary(
        canonical_id=row["id_canonico"],
        canonical_text=row["texto_canonico"],
        status=row["estado"],
        actor_id=str(row["actor_id"]) if row.get("actor_id") else None,
        actor_code=row.get("actor_code"),
        actor_name=row.get("actor_name"),
        dimension_id=str(row["dimension_id"]) if row.get("dimension_id") else None,
        dimension_code=row.get("dimension_code"),
        dimension_name=row.get("dimension_name"),
        subdimension_id=str(row["subdimension_id"]) if row.get("subdimension_id") else None,
        subdimension_code=row.get("subdimension_code"),
        subdimension_name=row.get("subdimension_name"),
        first_year=row.get("first_year"),
        last_year=row.get("last_year"),
        years=list(row.get("years") or []),
        methods=list(row.get("methods") or []),
        total_variants=row.get("total_variants") or 0,
        total_occurrences=row.get("total_occurrences") or 0,
        total_results=row.get("total_results") or 0,
        version_actual=row.get("version_actual") or 1,
        metadata=row.get("metadata") or {},
    )


def _contains(value: Optional[str], expected: Optional[str]) -> bool:
    if not expected:
        return True
    if not value:
        return False
    return expected.lower() in value.lower()


def _matches_filters(
    item: BankItemSummary,
    q: Optional[str],
    year: Optional[int],
    actor: Optional[str],
    dimension: Optional[str],
    subdimension: Optional[str],
    method: Optional[str],
    status: Optional[str],
) -> bool:
    if q and not any(
        _contains(candidate, q)
        for candidate in [item.canonical_id, item.canonical_text]
    ):
        return False
    if actor and not any(_contains(candidate, actor) for candidate in [item.actor_name, item.actor_code]):
        return False
    if dimension and not any(_contains(candidate, dimension) for candidate in [item.dimension_name, item.dimension_code]):
        return False
    if subdimension and not any(
        _contains(candidate, subdimension) for candidate in [item.subdimension_name, item.subdimension_code]
    ):
        return False
    if status and not _contains(item.status, status):
        return False
    if year is not None and year not in item.years:
        return False
    if method and method.upper() not in {candidate.upper() for candidate in item.methods}:
        return False
    return True


def create_bank_router(
    get_db: Callable[..., AsyncSession],
    get_current_username: Callable[..., str],
) -> APIRouter:
    router = APIRouter(prefix="/bank", tags=["Canonical Bank"])

    @router.get("/overview", response_model=BankOverview)
    async def get_bank_overview(db: AsyncSession = Depends(get_db)):
        counts = {
            "canonical_items": "SELECT COUNT(*) AS total FROM item_canonico",
            "variants": "SELECT COUNT(*) AS total FROM item_variante",
            "occurrences": "SELECT COUNT(*) AS total FROM item_ocurrencia",
            "results": "SELECT COUNT(*) AS total FROM resultado_item",
            "pending_reviews": "SELECT COUNT(*) AS total FROM revision_homologacion WHERE human_status = 'PENDIENTE'",
            "generated_items": "SELECT COUNT(*) AS total FROM item_generado",
        }
        payload: dict[str, int] = {}
        for key, statement in counts.items():
            payload[key] = (await db.execute(text(statement))).scalar_one()
        return BankOverview(**payload)

    @router.get("/items", response_model=BankPaginatedResponse)
    async def list_bank_items(
        q: Optional[str] = Query(None),
        year: Optional[int] = Query(None),
        actor: Optional[str] = Query(None),
        dimension: Optional[str] = Query(None),
        subdimension: Optional[str] = Query(None),
        method: Optional[str] = Query(None),
        status: Optional[str] = Query(None),
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        db: AsyncSession = Depends(get_db),
    ):
        rows = (await db.execute(text("SELECT * FROM vw_bank_items_search ORDER BY first_year NULLS LAST, id_canonico"))).mappings().all()
        items = [_map_summary(dict(row)) for row in rows]
        filtered = [
            item for item in items
            if _matches_filters(item, q, year, actor, dimension, subdimension, method, status)
        ]
        page_items = filtered[skip:skip + limit]
        total = len(filtered)
        return BankPaginatedResponse(
            items=page_items,
            total=total,
            page=(skip // limit) + 1,
            page_size=limit,
            pages=max(1, (total + limit - 1) // limit),
        )

    @router.get("/items/{canonical_id}", response_model=BankItemDetail)
    async def get_bank_item_detail(canonical_id: str, db: AsyncSession = Depends(get_db)):
        summary_row = (
            await db.execute(
                text("SELECT * FROM vw_bank_items_search WHERE id_canonico = :canonical_id"),
                {"canonical_id": canonical_id},
            )
        ).mappings().first()
        if not summary_row:
            raise HTTPException(status_code=404, detail="Canonical item not found")

        variants_rows = (
            await db.execute(
                text(
                    """
                    SELECT id_variante, variant_number, texto_variante, variant_type, approval_status, change_summary, metadata
                    FROM item_variante
                    WHERE canonical_item_id = :canonical_id
                    ORDER BY variant_number
                    """
                ),
                {"canonical_id": canonical_id},
            )
        ).mappings().all()
        occurrences_rows = (
            await db.execute(
                text(
                    """
                    SELECT io.id_ocurrencia, io.year_applied, io.actor_label, io.grade_label, io.form_label,
                           io.sheet_name, io.question_code, io.prompt_text, io.texto_original,
                           io.decision_taxonomy, io.processing_status, io.metadata
                    FROM item_ocurrencia io
                    JOIN item_variante iv ON iv.id_variante = io.variante_id
                    WHERE iv.canonical_item_id = :canonical_id
                    ORDER BY io.year_applied, io.form_label, io.question_code
                    """
                ),
                {"canonical_id": canonical_id},
            )
        ).mappings().all()
        results_rows = (
            await db.execute(
                text(
                    """
                    SELECT ri.id_resultado, ri.ocurrencia_id, ri.year_analysis, ri.estimation_method,
                           ri.methodological_context, ri.mean_value, ri.std_dev, ri.kurtosis, ri.cit,
                           ri.missing_pct, ri.irt_a, ri.irt_b, ri.irt_c, ri.irt_information,
                           ri.response_distribution, ri.metrics, ri.metadata
                    FROM resultado_item ri
                    JOIN item_ocurrencia io ON io.id_ocurrencia = ri.ocurrencia_id
                    JOIN item_variante iv ON iv.id_variante = io.variante_id
                    WHERE iv.canonical_item_id = :canonical_id
                    ORDER BY ri.year_analysis DESC, ri.estimation_method
                    """
                ),
                {"canonical_id": canonical_id},
            )
        ).mappings().all()
        revisions_rows = (
            await db.execute(
                text(
                    """
                    SELECT *
                    FROM vw_bank_revision_queue
                    WHERE canonical_item_id = :canonical_id
                    ORDER BY created_at DESC
                    """
                ),
                {"canonical_id": canonical_id},
            )
        ).mappings().all()

        return BankItemDetail(
            item=_map_summary(dict(summary_row)),
            variants=[
                BankVariant(
                    variant_id=row["id_variante"],
                    variant_number=row["variant_number"],
                    text=row["texto_variante"],
                    variant_type=row["variant_type"],
                    approval_status=row["approval_status"],
                    change_summary=row.get("change_summary"),
                    metadata=row.get("metadata") or {},
                )
                for row in variants_rows
            ],
            occurrences=[
                BankOccurrence(
                    occurrence_id=row["id_ocurrencia"],
                    year_applied=row["year_applied"],
                    actor_label=row.get("actor_label"),
                    grade_label=row.get("grade_label"),
                    form_label=row.get("form_label"),
                    sheet_name=row.get("sheet_name"),
                    question_code=row.get("question_code"),
                    prompt_text=row.get("prompt_text"),
                    original_text=row["texto_original"],
                    decision_taxonomy=row["decision_taxonomy"],
                    processing_status=row["processing_status"],
                    metadata=row.get("metadata") or {},
                )
                for row in occurrences_rows
            ],
            results=[
                BankResult(
                    result_id=row["id_resultado"],
                    occurrence_id=row["ocurrencia_id"],
                    year_analysis=row["year_analysis"],
                    estimation_method=row["estimation_method"],
                    methodological_context=row.get("methodological_context"),
                    mean_value=row.get("mean_value"),
                    std_dev=row.get("std_dev"),
                    kurtosis=row.get("kurtosis"),
                    cit=row.get("cit"),
                    missing_pct=row.get("missing_pct"),
                    irt_a=row.get("irt_a"),
                    irt_b=row.get("irt_b"),
                    irt_c=row.get("irt_c"),
                    irt_information=row.get("irt_information"),
                    response_distribution=row.get("response_distribution") or {},
                    metrics=row.get("metrics") or {},
                    metadata=row.get("metadata") or {},
                )
                for row in results_rows
            ],
            revisions=[
                BankRevision(
                    id=str(row["id"]),
                    occurrence_origin_id=row["ocurrencia_origen_id"],
                    automatic_decision=row["automatic_decision"],
                    human_status=row["human_status"],
                    confidence_score=row.get("confidence_score"),
                    combined_score=row.get("combined_score"),
                    requires_human_review=bool(row.get("requires_human_review")),
                    review_notes=row.get("review_notes"),
                    created_at=_to_iso(row.get("created_at")),
                    reviewed_at=_to_iso(row.get("reviewed_at")),
                    original_text=row.get("texto_original"),
                    canonical_item_id=row.get("canonical_item_id"),
                    canonical_text=row.get("texto_canonico"),
                    reviewer_username=row.get("reviewer_username"),
                )
                for row in revisions_rows
            ],
        )

    @router.get("/revisions", response_model=BankPaginatedResponse)
    async def list_bank_revisions(
        status: Optional[str] = Query(None),
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        db: AsyncSession = Depends(get_db),
    ):
        rows = (
            await db.execute(
                text("SELECT * FROM vw_bank_revision_queue ORDER BY created_at DESC")
            )
        ).mappings().all()
        revisions = [
            BankRevision(
                id=str(row["id"]),
                occurrence_origin_id=row["ocurrencia_origen_id"],
                automatic_decision=row["automatic_decision"],
                human_status=row["human_status"],
                confidence_score=row.get("confidence_score"),
                combined_score=row.get("combined_score"),
                requires_human_review=bool(row.get("requires_human_review")),
                review_notes=row.get("review_notes"),
                created_at=_to_iso(row.get("created_at")),
                reviewed_at=_to_iso(row.get("reviewed_at")),
                original_text=row.get("texto_original"),
                canonical_item_id=row.get("canonical_item_id"),
                canonical_text=row.get("texto_canonico"),
                reviewer_username=row.get("reviewer_username"),
            )
            for row in rows
            if not status or status.upper() == (row.get("human_status") or "").upper()
        ]
        total = len(revisions)
        return BankPaginatedResponse(
            items=revisions[skip:skip + limit],
            total=total,
            page=(skip // limit) + 1,
            page_size=limit,
            pages=max(1, (total + limit - 1) // limit),
        )

    @router.get("/secure/ping")
    async def ping_secure_bank(current_username: str = Depends(get_current_username)):
        return {"ok": True, "username": current_username}

    return router
