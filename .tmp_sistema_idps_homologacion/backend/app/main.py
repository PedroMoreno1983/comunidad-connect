#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Homologación Longitudinal IDPS
=========================================
Backend FastAPI Completo

Este módulo contiene toda la implementación del backend:
- Configuración
- Conexión a base de datos
- Modelos SQLAlchemy
- Schemas Pydantic
- Routers API
- Servicios de negocio

Autor: Sistema IDPS
Versión: 1.0.0
"""

# =============================================================================
# CONFIGURACIÓN
# =============================================================================

import logging
from pathlib import Path as FilePath
from difflib import SequenceMatcher
from typing import Optional, List, Dict, Any
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuración de la aplicación."""
    
    # App
    APP_NAME: str = "Sistema Homologación IDPS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost/idps_db"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 día
    ALGORITHM: str = "HS256"
    INTERNAL_AUTH_USERNAME: str = "idps"
    INTERNAL_AUTH_PASSWORD: str = "idps-interno"
    
    # API
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # Matching
    MATCHING_EXACT_THRESHOLD: float = 0.95
    MATCHING_FUZZY_THRESHOLD: float = 0.80
    MATCHING_SEMANTIC_THRESHOLD: float = 0.85
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    
    # Agent
    AGENT_BATCH_SIZE: int = 100
    AGENT_MAX_RETRIES: int = 3
    
    # File Upload
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB
    UPLOAD_DIR: str = "./uploads"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Obtiene la configuración cacheada."""
    return Settings()


# =============================================================================
# BASE DE DATOS
# =============================================================================

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool

settings = get_settings()
logger = logging.getLogger(__name__)

# Engine asíncrono
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    max_overflow=settings.DATABASE_MAX_OVERFLOW,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Base declarativa
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency para obtener sesión de base de datos."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Inicializa las tablas de la base de datos."""
    async with engine.begin() as conn:
        # En producción usar Alembic para migraciones
        # await conn.run_sync(Base.metadata.create_all)
        pass


# =============================================================================
# MODELOS SQLALCHEMY
# =============================================================================

import uuid
from datetime import datetime, timedelta
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime, 
    ForeignKey, Enum, JSON, ARRAY, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY as PG_ARRAY, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.types import UserDefinedType

try:
    from pgvector.sqlalchemy import Vector as VectorType
except ImportError:
    class VectorType(UserDefinedType):
        """Fallback que permite mapear columnas VECTOR sin depender de pgvector."""

        cache_ok = True

        def __init__(self, dimensions: Optional[int] = None):
            self.dimensions = dimensions

        def get_col_spec(self, **kw):
            if self.dimensions is not None:
                return f"VECTOR({self.dimensions})"
            return "VECTOR"


# Enums
class ActorType(str, PyEnum):
    MINEDUC = "MINEDUC"
    DEMRE = "DEMRE"
    AGENCIA_EVALUACION = "AGENCIA_EVALUACION"
    UNIVERSIDAD = "UNIVERSIDAD"
    CENTRO_ESTUDIOS = "CENTRO_ESTUDIOS"
    INTERNACIONAL = "INTERNACIONAL"


class EvaluationType(str, PyEnum):
    SIMCE = "SIMCE"
    PAES = "PAES"
    ICFES = "ICFES"
    PISA = "PISA"
    PIRLS = "PIRLS"
    TIMSS = "TIMSS"
    OTRA_NACIONAL = "OTRA_NACIONAL"
    OTRA_INTERNACIONAL = "OTRA_INTERNACIONAL"


class ItemStatus(str, PyEnum):
    BORRADOR = "BORRADOR"
    PENDIENTE_HOMOLOGACION = "PENDIENTE_HOMOLOGACION"
    EN_REVISION = "EN_REVISION"
    HOMOLOGADO = "HOMOLOGADO"
    RECHAZADO = "RECHAZADO"
    OBSOLETO = "OBSOLETO"


class MatchDecision(str, PyEnum):
    MATCH_EXACTO = "MATCH_EXACTO"
    MATCH_FUZZY_ALTO = "MATCH_FUZZY_ALTO"
    MATCH_SEMANTICO_ALTO = "MATCH_SEMANTICO_ALTO"
    REVISION_MANUAL = "REVISION_MANUAL"
    NUEVO_ITEM = "NUEVO_ITEM"
    DESCARTAR = "DESCARTAR"


class RevisionStatus(str, PyEnum):
    PENDIENTE = "PENDIENTE"
    EN_PROGRESO = "EN_PROGRESO"
    COMPLETADA = "COMPLETADA"
    ESCALADA = "ESCALADA"


class ConfidenceLevel(str, PyEnum):
    MUY_ALTA = "MUY_ALTA"
    ALTA = "ALTA"
    MEDIA = "MEDIA"
    BAJA = "BAJA"
    MUY_BAJA = "MUY_BAJA"


class AgentStatus(str, PyEnum):
    INACTIVO = "INACTIVO"
    PROCESANDO = "PROCESANDO"
    ESPERANDO_REVISION = "ESPERANDO_REVISION"
    COMPLETADO = "COMPLETADO"
    ERROR = "ERROR"


# Modelos
class Actor(Base):
    __tablename__ = "actors"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    type = Column(Enum(ActorType), nullable=False)
    description = Column(Text)
    contact_email = Column(String(100))
    contact_phone = Column(String(30))
    website = Column(String(200))
    is_active = Column(Boolean, default=True)
    extra_metadata = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    evaluations = relationship("Evaluation", back_populates="actor")


class Evaluation(Base):
    __tablename__ = "evaluations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("actors.id"), nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(300), nullable=False)
    type = Column(Enum(EvaluationType), nullable=False)
    year_start = Column(Integer, nullable=False)
    year_end = Column(Integer)
    description = Column(Text)
    target_population = Column(String(200))
    is_longitudinal = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    extra_metadata = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relaciones
    actor = relationship("Actor", back_populates="evaluations")
    items = relationship("Item", back_populates="evaluation")


class Dimension(Base):
    __tablename__ = "dimensions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(20), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    weight = Column(Float)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relaciones
    subdimensions = relationship("Subdimension", back_populates="dimension")
    items = relationship("Item", back_populates="dimension")


class Subdimension(Base):
    __tablename__ = "subdimensions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dimension_id = Column(UUID(as_uuid=True), ForeignKey("dimensions.id"), nullable=False)
    code = Column(String(20), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    weight = Column(Float)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relaciones
    dimension = relationship("Dimension", back_populates="subdimensions")
    items = relationship("Item", back_populates="subdimension")
    
    __table_args__ = (UniqueConstraint('dimension_id', 'code'),)


class Item(Base):
    __tablename__ = "items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_id = Column(String(50), unique=True)
    original_id = Column(String(100))
    
    evaluation_id = Column(UUID(as_uuid=True), ForeignKey("evaluations.id"), nullable=False)
    dimension_id = Column(UUID(as_uuid=True), ForeignKey("dimensions.id"))
    subdimension_id = Column(UUID(as_uuid=True), ForeignKey("subdimensions.id"))
    
    statement = Column(Text, nullable=False)
    options = Column(JSONB)
    correct_answer = Column(String(500))
    explanation = Column(Text)
    
    item_type = Column(String(50))
    difficulty = Column(Float)
    discrimination = Column(Float)
    
    status = Column(Enum(ItemStatus), default=ItemStatus.BORRADOR)
    
    homologated_to = Column(UUID(as_uuid=True), ForeignKey("items.id"))
    homologation_confidence = Column(Float)
    homologation_method = Column(String(50))
    homologated_at = Column(DateTime(timezone=True))
    homologated_by = Column(UUID(as_uuid=True))
    
    embedding = Column(VectorType(1536))
    extra_metadata = Column("metadata", JSONB, default=dict)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(UUID(as_uuid=True))
    updated_by = Column(UUID(as_uuid=True))
    
    # Relaciones
    evaluation = relationship("Evaluation", back_populates="items")
    dimension = relationship("Dimension", back_populates="items")
    subdimension = relationship("Subdimension", back_populates="items")


class HomologationAttempt(Base):
    __tablename__ = "homologation_attempts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    candidate_item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"))
    
    exact_match_score = Column(Float)
    fuzzy_match_score = Column(Float)
    semantic_match_score = Column(Float)
    combined_score = Column(Float)
    confidence = Column(Enum(ConfidenceLevel))
    
    decision = Column(Enum(MatchDecision))
    decision_reason = Column(Text)
    
    reviewed_by = Column(UUID(as_uuid=True))
    reviewed_at = Column(DateTime(timezone=True))
    review_notes = Column(Text)
    
    status = Column(Enum(RevisionStatus), default=RevisionStatus.PENDIENTE)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class RevisionTask(Base):
    __tablename__ = "revision_tasks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id = Column(UUID(as_uuid=True), ForeignKey("homologation_attempts.id"))
    revision_type = Column(String(50), nullable=False)
    priority = Column(Integer, default=5)
    
    assigned_to = Column(UUID(as_uuid=True))
    assigned_at = Column(DateTime(timezone=True))
    
    status = Column(Enum(RevisionStatus), default=RevisionStatus.PENDIENTE)
    due_date = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    
    result = Column(JSONB)
    notes = Column(Text)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class AgentExecution(Base):
    __tablename__ = "agent_executions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    execution_type = Column(String(50), nullable=False)
    status = Column(Enum(AgentStatus), default=AgentStatus.INACTIVO)
    
    total_items = Column(Integer, default=0)
    processed_items = Column(Integer, default=0)
    successful_items = Column(Integer, default=0)
    failed_items = Column(Integer, default=0)
    
    configuration = Column(JSONB, default=dict)
    results_summary = Column(JSONB, default=dict)
    error_log = Column(Text)
    
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class ItemResultSummary(Base):
    __tablename__ = "item_result_summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    item_id = Column(UUID(as_uuid=True), ForeignKey("items.id"), nullable=False)
    evaluation_id = Column(UUID(as_uuid=True), ForeignKey("evaluations.id"), nullable=False)
    year = Column(Integer, nullable=False)
    calculation_method = Column(String(20), nullable=False)
    source_file = Column(String(255))
    source_sheet = Column(String(255))
    question_code = Column(String(100))
    actor_label = Column(String(100))
    grade_label = Column(String(50))
    form_label = Column(String(50))
    indicator_code = Column(String(100))
    dimension_label = Column(String(200))
    subdimension_label = Column(String(200))
    prompt_text = Column(Text)
    item_text = Column(Text)
    metrics = Column(JSONB, default=dict)
    notes = Column(Text)
    extra_metadata = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)


class GeneratedItemProposal(Base):
    __tablename__ = "generated_item_proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id = Column(String(50), nullable=False)
    statement = Column(Text, nullable=False)
    instruction = Column(Text)
    actor_suggested = Column(String(100), nullable=False)
    dimension_suggested = Column(String(200), nullable=False)
    subdimension_suggested = Column(String(200))
    indicator_suggested = Column(String(200))
    response_options = Column(JSONB, default=list)
    proposal_type = Column(String(30), nullable=False)
    redundancy_level = Column(String(20), nullable=False)
    confidence_score = Column(Float, nullable=False)
    classification_justification = Column(Text)
    redundancy_analysis = Column(JSONB, default=dict)
    similar_items = Column(JSONB, default=list)
    validation_result = Column(JSONB, default=dict)
    status = Column(String(30), default="BORRADOR")
    requested_by = Column(String(200))
    reviewed_by = Column(String(200))
    review_notes = Column(Text)
    extra_metadata = Column("metadata", JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


# =============================================================================
# SCHEMAS PYDANTIC
# =============================================================================

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional


# Actor Schemas
class ActorBase(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    type: ActorType
    description: Optional[str] = None
    contact_email: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=30)
    website: Optional[str] = Field(None, max_length=200)
    is_active: bool = True


class ActorCreate(ActorBase):
    pass


class ActorUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    contact_email: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=30)
    website: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None


class ActorResponse(ActorBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    
    id: uuid.UUID
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="extra_metadata",
        serialization_alias="metadata"
    )
    created_at: datetime
    updated_at: datetime


# Evaluation Schemas
class EvaluationBase(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=300)
    type: EvaluationType
    year_start: int
    year_end: Optional[int] = None
    description: Optional[str] = None
    target_population: Optional[str] = Field(None, max_length=200)
    is_longitudinal: bool = False
    is_active: bool = True


class EvaluationCreate(EvaluationBase):
    actor_id: uuid.UUID


class EvaluationUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=300)
    description: Optional[str] = None
    target_population: Optional[str] = Field(None, max_length=200)
    is_active: Optional[bool] = None


class EvaluationResponse(EvaluationBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    
    id: uuid.UUID
    actor_id: uuid.UUID
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="extra_metadata",
        serialization_alias="metadata"
    )
    created_at: datetime
    updated_at: datetime


# Dimension Schemas
class DimensionBase(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    weight: Optional[float] = None
    display_order: int = 0
    is_active: bool = True


class DimensionCreate(DimensionBase):
    pass


class DimensionResponse(DimensionBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    created_at: datetime


# Subdimension Schemas
class SubdimensionBase(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=200)
    description: Optional[str] = None
    weight: Optional[float] = None
    display_order: int = 0
    is_active: bool = True


class SubdimensionCreate(SubdimensionBase):
    dimension_id: uuid.UUID


class SubdimensionResponse(SubdimensionBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    dimension_id: uuid.UUID
    created_at: datetime


# Item Schemas
class ItemBase(BaseModel):
    original_id: Optional[str] = Field(None, max_length=100)
    statement: str
    options: Optional[Dict[str, Any]] = None
    correct_answer: Optional[str] = Field(None, max_length=500)
    explanation: Optional[str] = None
    item_type: Optional[str] = Field(None, max_length=50)
    difficulty: Optional[float] = None
    discrimination: Optional[float] = None


class ItemCreate(ItemBase):
    evaluation_id: uuid.UUID
    dimension_id: Optional[uuid.UUID] = None
    subdimension_id: Optional[uuid.UUID] = None


class ItemUpdate(BaseModel):
    statement: Optional[str] = None
    options: Optional[Dict[str, Any]] = None
    correct_answer: Optional[str] = Field(None, max_length=500)
    explanation: Optional[str] = None
    dimension_id: Optional[uuid.UUID] = None
    subdimension_id: Optional[uuid.UUID] = None
    status: Optional[ItemStatus] = None


class ItemResponse(ItemBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    
    id: uuid.UUID
    canonical_id: Optional[str]
    evaluation_id: uuid.UUID
    dimension_id: Optional[uuid.UUID]
    subdimension_id: Optional[uuid.UUID]
    status: ItemStatus
    homologated_to: Optional[uuid.UUID]
    homologation_confidence: Optional[float]
    homologation_method: Optional[str]
    homologated_at: Optional[datetime]
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="extra_metadata",
        serialization_alias="metadata"
    )
    created_at: datetime
    updated_at: datetime


# Homologation Schemas
class HomologationAttemptBase(BaseModel):
    exact_match_score: Optional[float] = None
    fuzzy_match_score: Optional[float] = None
    semantic_match_score: Optional[float] = None
    combined_score: Optional[float] = None
    decision: Optional[MatchDecision] = None
    decision_reason: Optional[str] = None


class HomologationAttemptCreate(BaseModel):
    source_item_id: uuid.UUID
    candidate_item_id: Optional[uuid.UUID] = None


class HomologationAttemptResponse(HomologationAttemptBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    source_item_id: uuid.UUID
    candidate_item_id: Optional[uuid.UUID]
    confidence: Optional[ConfidenceLevel]
    status: RevisionStatus
    reviewed_by: Optional[uuid.UUID]
    reviewed_at: Optional[datetime]
    review_notes: Optional[str]
    created_at: datetime


# Revision Task Schemas
class RevisionTaskBase(BaseModel):
    revision_type: str = Field(..., max_length=50)
    priority: int = Field(default=5, ge=1, le=10)
    due_date: Optional[datetime] = None
    notes: Optional[str] = None


class RevisionTaskCreate(RevisionTaskBase):
    attempt_id: Optional[uuid.UUID] = None


class RevisionTaskUpdate(BaseModel):
    assigned_to: Optional[uuid.UUID] = None
    status: Optional[RevisionStatus] = None
    result: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class RevisionTaskResponse(RevisionTaskBase):
    model_config = ConfigDict(from_attributes=True)
    
    id: uuid.UUID
    attempt_id: Optional[uuid.UUID]
    assigned_to: Optional[uuid.UUID]
    assigned_at: Optional[datetime]
    status: RevisionStatus
    completed_at: Optional[datetime]
    result: Optional[Dict[str, Any]]
    created_at: datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    expires_in: int


class ItemResultSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    item_id: uuid.UUID
    evaluation_id: uuid.UUID
    year: int
    calculation_method: str
    source_file: Optional[str] = None
    source_sheet: Optional[str] = None
    question_code: Optional[str] = None
    actor_label: Optional[str] = None
    grade_label: Optional[str] = None
    form_label: Optional[str] = None
    indicator_code: Optional[str] = None
    dimension_label: Optional[str] = None
    subdimension_label: Optional[str] = None
    prompt_text: Optional[str] = None
    item_text: Optional[str] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="extra_metadata",
        serialization_alias="metadata"
    )
    created_at: datetime


class GeneratedItemProposalBase(BaseModel):
    statement: str
    instruction: Optional[str] = None
    actor_suggested: str
    dimension_suggested: str
    subdimension_suggested: Optional[str] = None
    indicator_suggested: Optional[str] = None
    response_options: List[Dict[str, Any]] = Field(default_factory=list)
    proposal_type: str
    redundancy_level: str
    confidence_score: float = Field(..., ge=0, le=1)
    classification_justification: Optional[str] = None
    redundancy_analysis: Dict[str, Any] = Field(default_factory=dict)
    similar_items: List[Dict[str, Any]] = Field(default_factory=list)
    validation_result: Dict[str, Any] = Field(default_factory=dict)
    status: str = "BORRADOR"
    requested_by: Optional[str] = None
    reviewed_by: Optional[str] = None
    review_notes: Optional[str] = None


class GenerateItemProposalRequest(BaseModel):
    actor: str
    dimension: str
    subdimension: Optional[str] = None
    purpose: str
    education_level: str
    indicator: Optional[str] = None
    constraints: Optional[str] = None
    requested_by: Optional[str] = None
    num_proposals: int = Field(default=3, ge=1, le=5)


class GeneratedItemProposalReviewRequest(BaseModel):
    status: str = Field(..., pattern="^(BORRADOR|EN_REVISION|APROBADO|RECHAZADO)$")
    review_notes: Optional[str] = None


class GeneratedItemProposalResponse(GeneratedItemProposalBase):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    request_id: str
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="extra_metadata",
        serialization_alias="metadata"
    )
    created_at: datetime
    updated_at: datetime


# Pagination Schema
class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int
    pages: int


# Error Schema
class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


# =============================================================================
# SERVICIOS DE NEGOCIO
# =============================================================================

from sqlalchemy import select, func, and_, or_, desc, text
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from jose import JWTError, jwt


class ActorService:
    """Servicio para gestión de actores."""
    
    @staticmethod
    async def get_all(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[Actor]:
        """Obtiene todos los actores."""
        result = await db.execute(select(Actor).offset(skip).limit(limit))
        return result.scalars().all()
    
    @staticmethod
    async def get_by_id(db: AsyncSession, actor_id: uuid.UUID) -> Optional[Actor]:
        """Obtiene un actor por ID."""
        result = await db.execute(select(Actor).where(Actor.id == actor_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_by_code(db: AsyncSession, code: str) -> Optional[Actor]:
        """Obtiene un actor por código."""
        result = await db.execute(select(Actor).where(Actor.code == code))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create(db: AsyncSession, actor_data: ActorCreate) -> Actor:
        """Crea un nuevo actor."""
        db_actor = Actor(**actor_data.model_dump())
        db.add(db_actor)
        try:
            await db.commit()
            await db.refresh(db_actor)
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Actor with code '{actor_data.code}' already exists"
            )
        return db_actor
    
    @staticmethod
    async def update(db: AsyncSession, actor: Actor, actor_data: ActorUpdate) -> Actor:
        """Actualiza un actor."""
        update_data = actor_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(actor, field, value)
        await db.commit()
        await db.refresh(actor)
        return actor
    
    @staticmethod
    async def delete(db: AsyncSession, actor: Actor) -> None:
        """Elimina un actor."""
        await db.delete(actor)
        await db.commit()


class EvaluationService:
    """Servicio para gestión de evaluaciones."""
    
    @staticmethod
    async def get_all(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        actor_id: Optional[uuid.UUID] = None,
        evaluation_type: Optional[EvaluationType] = None
    ) -> List[Evaluation]:
        """Obtiene todas las evaluaciones con filtros opcionales."""
        query = select(Evaluation)
        
        if actor_id:
            query = query.where(Evaluation.actor_id == actor_id)
        if evaluation_type:
            query = query.where(Evaluation.type == evaluation_type)
        
        result = await db.execute(query.offset(skip).limit(limit))
        return result.scalars().all()
    
    @staticmethod
    async def get_by_id(db: AsyncSession, evaluation_id: uuid.UUID) -> Optional[Evaluation]:
        """Obtiene una evaluación por ID."""
        result = await db.execute(
            select(Evaluation).where(Evaluation.id == evaluation_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create(db: AsyncSession, evaluation_data: EvaluationCreate) -> Evaluation:
        """Crea una nueva evaluación."""
        db_evaluation = Evaluation(**evaluation_data.model_dump())
        db.add(db_evaluation)
        try:
            await db.commit()
            await db.refresh(db_evaluation)
        except IntegrityError:
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Evaluation with code '{evaluation_data.code}' already exists"
            )
        return db_evaluation


class ItemService:
    """Servicio para gestión de ítems."""
    
    @staticmethod
    async def get_all(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        evaluation_id: Optional[uuid.UUID] = None,
        dimension_id: Optional[uuid.UUID] = None,
        status: Optional[ItemStatus] = None
    ) -> List[Item]:
        """Obtiene todos los ítems con filtros opcionales."""
        query = select(Item)
        
        if evaluation_id:
            query = query.where(Item.evaluation_id == evaluation_id)
        if dimension_id:
            query = query.where(Item.dimension_id == dimension_id)
        if status:
            query = query.where(Item.status == status)
        
        result = await db.execute(query.offset(skip).limit(limit))
        return result.scalars().all()
    
    @staticmethod
    async def get_by_id(db: AsyncSession, item_id: uuid.UUID) -> Optional[Item]:
        """Obtiene un ítem por ID."""
        result = await db.execute(select(Item).where(Item.id == item_id))
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_by_canonical_id(db: AsyncSession, canonical_id: str) -> Optional[Item]:
        """Obtiene un ítem por ID canónico."""
        result = await db.execute(
            select(Item).where(Item.canonical_id == canonical_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create(db: AsyncSession, item_data: ItemCreate) -> Item:
        """Crea un nuevo ítem."""
        db_item = Item(**item_data.model_dump())
        db.add(db_item)
        await db.commit()
        await db.refresh(db_item)
        return db_item
    
    @staticmethod
    async def update(db: AsyncSession, item: Item, item_data: ItemUpdate) -> Item:
        """Actualiza un ítem."""
        update_data = item_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(item, field, value)
        await db.commit()
        await db.refresh(item)
        return item
    
    @staticmethod
    async def search(
        db: AsyncSession,
        query_text: str,
        limit: int = 10
    ) -> List[Item]:
        """Busca ítems por texto (búsqueda simple)."""
        search_pattern = f"%{query_text}%"
        result = await db.execute(
            select(Item)
            .where(Item.statement.ilike(search_pattern))
            .limit(limit)
        )
        return result.scalars().all()


class HomologationService:
    """Servicio para gestión de homologaciones."""
    
    @staticmethod
    async def get_pending_reviews(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100
    ) -> List[HomologationAttempt]:
        """Obtiene intentos de homologación pendientes de revisión."""
        result = await db.execute(
            select(HomologationAttempt)
            .where(HomologationAttempt.status == RevisionStatus.PENDIENTE)
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()
    
    @staticmethod
    async def create_attempt(
        db: AsyncSession,
        attempt_data: HomologationAttemptCreate
    ) -> HomologationAttempt:
        """Crea un nuevo intento de homologación."""
        db_attempt = HomologationAttempt(**attempt_data.model_dump())
        db.add(db_attempt)
        await db.commit()
        await db.refresh(db_attempt)
        return db_attempt
    
    @staticmethod
    async def update_scores(
        db: AsyncSession,
        attempt: HomologationAttempt,
        scores: Dict[str, float],
        decision: MatchDecision,
        reason: str
    ) -> HomologationAttempt:
        """Actualiza los scores de un intento."""
        attempt.exact_match_score = scores.get('exact')
        attempt.fuzzy_match_score = scores.get('fuzzy')
        attempt.semantic_match_score = scores.get('semantic')
        attempt.combined_score = scores.get('combined')
        attempt.decision = decision
        attempt.decision_reason = reason
        await db.commit()
        await db.refresh(attempt)
        return attempt


class RevisionTaskService:
    """Servicio para gestión de tareas de revisión."""
    
    @staticmethod
    async def get_all(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        status: Optional[RevisionStatus] = None,
        assigned_to: Optional[uuid.UUID] = None
    ) -> List[RevisionTask]:
        """Obtiene todas las tareas de revisión."""
        query = select(RevisionTask)
        
        if status:
            query = query.where(RevisionTask.status == status)
        if assigned_to:
            query = query.where(RevisionTask.assigned_to == assigned_to)
        
        result = await db.execute(query.offset(skip).limit(limit))
        return result.scalars().all()
    
    @staticmethod
    async def create(db: AsyncSession, task_data: RevisionTaskCreate) -> RevisionTask:
        """Crea una nueva tarea de revisión."""
        db_task = RevisionTask(**task_data.model_dump())
        db.add(db_task)
        await db.commit()
        await db.refresh(db_task)
        return db_task
    
    @staticmethod
    async def assign(
        db: AsyncSession,
        task: RevisionTask,
        user_id: uuid.UUID
    ) -> RevisionTask:
        """Asigna una tarea a un usuario."""
        task.assigned_to = user_id
        task.assigned_at = datetime.utcnow()
        task.status = RevisionStatus.EN_PROGRESO
        await db.commit()
        await db.refresh(task)
        return task
    
    @staticmethod
    async def complete(
        db: AsyncSession,
        task: RevisionTask,
        result: Dict[str, Any],
        notes: Optional[str] = None
    ) -> RevisionTask:
        """Completa una tarea de revisión."""
        task.status = RevisionStatus.COMPLETADA
        task.completed_at = datetime.utcnow()
        task.result = result
        if notes:
            task.notes = notes
        await db.commit()
        await db.refresh(task)
        return task


def create_access_token(username: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


class ItemResultSummaryService:
    """Servicio para resultados resumidos por item."""

    @staticmethod
    async def get_all(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        item_id: Optional[uuid.UUID] = None,
        evaluation_id: Optional[uuid.UUID] = None,
        year: Optional[int] = None,
        calculation_method: Optional[str] = None
    ) -> List[ItemResultSummary]:
        query = select(ItemResultSummary).order_by(
            desc(ItemResultSummary.year),
            ItemResultSummary.question_code
        )

        if item_id:
            query = query.where(ItemResultSummary.item_id == item_id)
        if evaluation_id:
            query = query.where(ItemResultSummary.evaluation_id == evaluation_id)
        if year:
            query = query.where(ItemResultSummary.year == year)
        if calculation_method:
            query = query.where(
                ItemResultSummary.calculation_method == calculation_method.upper()
            )

        result = await db.execute(query.offset(skip).limit(limit))
        return result.scalars().all()


class GeneratedItemProposalService:
    """Servicio para propuestas generadas y su revision."""

    @staticmethod
    def _default_response_options() -> List[Dict[str, Any]]:
        return [
            {"value": 1, "label": "Nunca"},
            {"value": 2, "label": "A veces"},
            {"value": 3, "label": "Frecuentemente"},
            {"value": 4, "label": "Siempre"},
        ]

    @staticmethod
    def _normalize_text(value: str) -> str:
        return " ".join(value.strip().split())

    @staticmethod
    def _similarity_score(a: str, b: str) -> float:
        return SequenceMatcher(None, a.lower(), b.lower()).ratio()

    @staticmethod
    async def _find_similar_items(
        db: AsyncSession,
        request: GenerateItemProposalRequest
    ) -> List[Dict[str, Any]]:
        similares: List[Dict[str, Any]] = []

        try:
            bank_rows = (
                await db.execute(
                    text(
                        """
                        SELECT id_canonico, texto_canonico, actor_name, dimension_name, subdimension_name
                        FROM vw_bank_items_search
                        ORDER BY total_results DESC, total_occurrences DESC, id_canonico
                        """
                    )
                )
            ).mappings().all()
            for row in bank_rows:
                if request.dimension and request.dimension.lower() not in (row.get("dimension_name") or "").lower():
                    continue
                score = GeneratedItemProposalService._similarity_score(
                    request.purpose,
                    row["texto_canonico"],
                )
                similares.append(
                    {
                        "item_id": row["id_canonico"],
                        "original_id": row["id_canonico"],
                        "canonical_id": row["id_canonico"],
                        "statement": row["texto_canonico"],
                        "evaluation_code": "BANCO_CANONICO",
                        "actor": row.get("actor_name"),
                        "dimension": row.get("dimension_name"),
                        "subdimension": row.get("subdimension_name"),
                        "score": round(score, 3),
                    }
                )
        except Exception:
            query = select(Item, Evaluation.code).join(
                Evaluation, Item.evaluation_id == Evaluation.id
            )

            if request.dimension:
                query = query.join(
                    Dimension, Item.dimension_id == Dimension.id, isouter=True
                ).where(
                    or_(
                        Dimension.name.ilike(f"%{request.dimension}%"),
                        Dimension.code.ilike(f"%{request.dimension}%")
                    )
                )

            result = await db.execute(query.limit(20))
            for item, evaluation_code in result.all():
                score = GeneratedItemProposalService._similarity_score(
                    request.purpose,
                    item.statement
                )
                similares.append(
                    {
                        "item_id": str(item.id),
                        "original_id": item.original_id,
                        "canonical_id": item.canonical_id,
                        "statement": item.statement,
                        "evaluation_code": evaluation_code,
                        "score": round(score, 3),
                    }
                )

        similares.sort(key=lambda item: item["score"], reverse=True)
        return similares[:5]

    @staticmethod
    def _proposal_type(max_similarity: float) -> str:
        if max_similarity >= 0.88:
            return "REDUNDANTE"
        if max_similarity >= 0.72:
            return "REFORMULACION"
        if max_similarity >= 0.58:
            return "VARIANTE"
        return "NUEVO"

    @staticmethod
    def _redundancy_level(max_similarity: float) -> str:
        if max_similarity >= 0.85:
            return "ALTO"
        if max_similarity >= 0.60:
            return "MEDIO"
        return "BAJO"

    @staticmethod
    def _draft_statement(request: GenerateItemProposalRequest, variant_index: int) -> str:
        actor_context = {
            "estudiante": "En mi curso",
            "docente": "En mis clases",
            "apoderado": "En el hogar",
            "padre": "En el hogar",
        }.get(request.actor.lower(), f"En el contexto de {request.actor.lower()}")

        focus = request.subdimension or request.dimension
        base = GeneratedItemProposalService._normalize_text(request.purpose.lower())
        templates = [
            f"{actor_context}, demuestro {focus.lower()} cuando {base} en situaciones habituales del trabajo escolar.",
            f"{actor_context}, mantengo conductas vinculadas a {focus.lower()} incluso cuando {base} se vuelve desafiante.",
            f"{actor_context}, reconozco y aplico {focus.lower()} antes, durante y despues de {base} con otras personas.",
            f"{actor_context}, evalúo mis decisiones relacionadas con {focus.lower()} cada vez que {base} dentro del establecimiento.",
            f"{actor_context}, sostengo acciones coherentes con {focus.lower()} cuando {base} y debo coordinarme con otras personas.",
        ]
        return templates[(variant_index - 1) % len(templates)]

    @staticmethod
    def _validation_payload(statement: str) -> Dict[str, Any]:
        word_count = len(statement.split())
        warnings: List[str] = []
        if word_count < 15:
            warnings.append("statement_too_short")
        if word_count > 60:
            warnings.append("statement_too_long")
        return {
            "is_valid": not warnings,
            "word_count": word_count,
            "warnings": warnings,
        }

    @staticmethod
    async def get_all(
        db: AsyncSession,
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None
    ) -> List[GeneratedItemProposal]:
        query = select(GeneratedItemProposal).order_by(desc(GeneratedItemProposal.created_at))
        if status:
            query = query.where(GeneratedItemProposal.status == status.upper())
        result = await db.execute(query.offset(skip).limit(limit))
        return result.scalars().all()

    @staticmethod
    async def generate(
        db: AsyncSession,
        request: GenerateItemProposalRequest,
        current_username: str
    ) -> List[GeneratedItemProposal]:
        request_id = f"REQ-{uuid.uuid4().hex[:12].upper()}"
        similares = await GeneratedItemProposalService._find_similar_items(db, request)
        max_similarity = max([item["score"] for item in similares], default=0.0)
        proposal_type = GeneratedItemProposalService._proposal_type(max_similarity)
        redundancy_level = GeneratedItemProposalService._redundancy_level(max_similarity)

        proposals: List[GeneratedItemProposal] = []
        for idx in range(1, request.num_proposals + 1):
            statement = GeneratedItemProposalService._draft_statement(request, idx)
            validation_result = GeneratedItemProposalService._validation_payload(statement)
            confidence_score = round(
                min(0.95, 0.55 + (0.1 * idx) + ((1 - max_similarity) * 0.2)),
                3
            )

            proposal = GeneratedItemProposal(
                request_id=request_id,
                statement=statement,
                instruction="Indica con que frecuencia te ocurre.",
                actor_suggested=request.actor,
                dimension_suggested=request.dimension,
                subdimension_suggested=request.subdimension,
                indicator_suggested=request.indicator,
                response_options=GeneratedItemProposalService._default_response_options(),
                proposal_type=proposal_type,
                redundancy_level=redundancy_level,
                confidence_score=confidence_score,
                classification_justification=(
                    f"Clasificacion provisional en {request.dimension}"
                    + (f" / {request.subdimension}" if request.subdimension else "")
                    + " basada en el proposito declarado y similitud con historicos."
                ),
                redundancy_analysis={
                    "max_similarity": max_similarity,
                    "decision": proposal_type,
                    "constraints": request.constraints,
                },
                similar_items=similares,
                validation_result=validation_result,
                status="BORRADOR",
                requested_by=request.requested_by or current_username,
                extra_metadata={
                    "education_level": request.education_level,
                    "purpose": request.purpose,
                },
            )
            db.add(proposal)
            proposals.append(proposal)

        await db.commit()
        for proposal in proposals:
            await db.refresh(proposal)
            db.add(
                RevisionTask(
                    revision_type="ITEM_GENERADO",
                    priority=6,
                    status=RevisionStatus.PENDIENTE,
                    notes=f"Revisar propuesta generada {proposal.id}",
                    result={"proposal_id": str(proposal.id)},
                )
            )

        await db.commit()
        return proposals

    @staticmethod
    async def review(
        db: AsyncSession,
        proposal_id: uuid.UUID,
        review_data: GeneratedItemProposalReviewRequest,
        reviewer: str
    ) -> GeneratedItemProposal:
        proposal = await db.get(GeneratedItemProposal, proposal_id)
        if not proposal:
            raise HTTPException(status_code=404, detail="Generated proposal not found")

        proposal.status = review_data.status.upper()
        proposal.review_notes = review_data.review_notes
        proposal.reviewed_by = reviewer
        await db.commit()
        await db.refresh(proposal)
        return proposal


# =============================================================================
# ROUTERS API
# =============================================================================

from fastapi import APIRouter, Depends, Query, Path as ApiPath, Body, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.bank_routes import create_bank_router

auth_scheme = HTTPBearer(auto_error=False)


async def get_current_username(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(auth_scheme)
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return username


bank_router = create_bank_router(get_db, get_current_username)


# Router de autenticacion
auth_router = APIRouter(prefix="/auth", tags=["Auth"])


@auth_router.post("/login", response_model=TokenResponse)
async def login(login_data: LoginRequest):
    if (
        login_data.username != settings.INTERNAL_AUTH_USERNAME
        or login_data.password != settings.INTERNAL_AUTH_PASSWORD
    ):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(login_data.username)
    return TokenResponse(
        access_token=token,
        username=login_data.username,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@auth_router.get("/me")
async def me(current_username: str = Depends(get_current_username)):
    return {"username": current_username}


# Router de Actores
actor_router = APIRouter(prefix="/actors", tags=["Actors"])

@actor_router.get("", response_model=PaginatedResponse)
async def list_actors(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los actores."""
    actors = await ActorService.get_all(db, skip, limit)
    total = (await db.execute(select(func.count()).select_from(Actor))).scalar_one()
    return PaginatedResponse(
        items=[ActorResponse.model_validate(a) for a in actors],
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        pages=(total + limit - 1) // limit
    )

@actor_router.get("/{actor_id}", response_model=ActorResponse)
async def get_actor(
    actor_id: uuid.UUID = ApiPath(...),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene un actor por ID."""
    actor = await ActorService.get_by_id(db, actor_id)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")
    return ActorResponse.model_validate(actor)

@actor_router.post("", response_model=ActorResponse, status_code=201)
async def create_actor(
    actor_data: ActorCreate,
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo actor."""
    actor = await ActorService.create(db, actor_data)
    return ActorResponse.model_validate(actor)

@actor_router.patch("/{actor_id}", response_model=ActorResponse)
async def update_actor(
    actor_data: ActorUpdate,
    actor_id: uuid.UUID = ApiPath(...),
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un actor."""
    actor = await ActorService.get_by_id(db, actor_id)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")
    updated = await ActorService.update(db, actor, actor_data)
    return ActorResponse.model_validate(updated)

@actor_router.delete("/{actor_id}", status_code=204)
async def delete_actor(
    actor_id: uuid.UUID = ApiPath(...),
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Elimina un actor."""
    actor = await ActorService.get_by_id(db, actor_id)
    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")
    await ActorService.delete(db, actor)
    return None


# Router de Evaluaciones
evaluation_router = APIRouter(prefix="/evaluations", tags=["Evaluations"])

@evaluation_router.get("", response_model=PaginatedResponse)
async def list_evaluations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    actor_id: Optional[uuid.UUID] = Query(None),
    evaluation_type: Optional[EvaluationType] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Lista todas las evaluaciones."""
    evaluations = await EvaluationService.get_all(db, skip, limit, actor_id, evaluation_type)
    total_query = select(func.count()).select_from(Evaluation)
    if actor_id:
        total_query = total_query.where(Evaluation.actor_id == actor_id)
    if evaluation_type:
        total_query = total_query.where(Evaluation.type == evaluation_type)
    total = (await db.execute(total_query)).scalar_one()

    return PaginatedResponse(
        items=[EvaluationResponse.model_validate(e) for e in evaluations],
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        pages=(total + limit - 1) // limit
    )

@evaluation_router.get("/{evaluation_id}", response_model=EvaluationResponse)
async def get_evaluation(
    evaluation_id: uuid.UUID = ApiPath(...),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene una evaluación por ID."""
    evaluation = await EvaluationService.get_by_id(db, evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return EvaluationResponse.model_validate(evaluation)

@evaluation_router.post("", response_model=EvaluationResponse, status_code=201)
async def create_evaluation(
    evaluation_data: EvaluationCreate,
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Crea una nueva evaluación."""
    evaluation = await EvaluationService.create(db, evaluation_data)
    return EvaluationResponse.model_validate(evaluation)


# Router de Ítems
item_router = APIRouter(prefix="/items", tags=["Items"])

@item_router.get("", response_model=PaginatedResponse)
async def list_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    evaluation_id: Optional[uuid.UUID] = Query(None),
    dimension_id: Optional[uuid.UUID] = Query(None),
    status: Optional[ItemStatus] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Lista todos los ítems."""
    items = await ItemService.get_all(db, skip, limit, evaluation_id, dimension_id, status)
    total_query = select(func.count()).select_from(Item)
    if evaluation_id:
        total_query = total_query.where(Item.evaluation_id == evaluation_id)
    if dimension_id:
        total_query = total_query.where(Item.dimension_id == dimension_id)
    if status:
        total_query = total_query.where(Item.status == status)
    total = (await db.execute(total_query)).scalar_one()

    return PaginatedResponse(
        items=[ItemResponse.model_validate(i) for i in items],
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        pages=(total + limit - 1) // limit
    )

@item_router.get("/search", response_model=List[ItemResponse])
async def search_items(
    q: str = Query(..., min_length=3),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Busca ítems por texto."""
    items = await ItemService.search(db, q, limit)
    return [ItemResponse.model_validate(i) for i in items]

@item_router.get("/{item_id}", response_model=ItemResponse)
async def get_item(
    item_id: uuid.UUID = ApiPath(...),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene un ítem por ID."""
    item = await ItemService.get_by_id(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemResponse.model_validate(item)

@item_router.post("", response_model=ItemResponse, status_code=201)
async def create_item(
    item_data: ItemCreate,
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo ítem."""
    item = await ItemService.create(db, item_data)
    return ItemResponse.model_validate(item)

@item_router.patch("/{item_id}", response_model=ItemResponse)
async def update_item(
    item_data: ItemUpdate,
    item_id: uuid.UUID = ApiPath(...),
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza un ítem."""
    item = await ItemService.get_by_id(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    updated = await ItemService.update(db, item, item_data)
    return ItemResponse.model_validate(updated)


# Router de Homologación
homologation_router = APIRouter(prefix="/homologation", tags=["Homologation"])

@homologation_router.get("/pending", response_model=List[HomologationAttemptResponse])
async def get_pending_homologations(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """Obtiene homologaciones pendientes de revisión."""
    attempts = await HomologationService.get_pending_reviews(db, skip, limit)
    return [HomologationAttemptResponse.model_validate(a) for a in attempts]

@homologation_router.post("/attempt", response_model=HomologationAttemptResponse, status_code=201)
async def create_homologation_attempt(
    attempt_data: HomologationAttemptCreate,
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Crea un nuevo intento de homologación."""
    attempt = await HomologationService.create_attempt(db, attempt_data)
    return HomologationAttemptResponse.model_validate(attempt)


# Router de Tareas de Revisión
revision_router = APIRouter(prefix="/revisions", tags=["Revisions"])

@revision_router.get("", response_model=PaginatedResponse)
async def list_revision_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[RevisionStatus] = Query(None),
    assigned_to: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Lista todas las tareas de revisión."""
    tasks = await RevisionTaskService.get_all(db, skip, limit, status, assigned_to)
    total_query = select(func.count()).select_from(RevisionTask)
    if status:
        total_query = total_query.where(RevisionTask.status == status)
    if assigned_to:
        total_query = total_query.where(RevisionTask.assigned_to == assigned_to)
    total = (await db.execute(total_query)).scalar_one()

    return PaginatedResponse(
        items=[RevisionTaskResponse.model_validate(t) for t in tasks],
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        pages=(total + limit - 1) // limit
    )

@revision_router.post("", response_model=RevisionTaskResponse, status_code=201)
async def create_revision_task(
    task_data: RevisionTaskCreate,
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Crea una nueva tarea de revisión."""
    task = await RevisionTaskService.create(db, task_data)
    return RevisionTaskResponse.model_validate(task)

@revision_router.post("/{task_id}/assign", response_model=RevisionTaskResponse)
async def assign_revision_task(
    user_id: uuid.UUID = Body(..., embed=True),
    task_id: uuid.UUID = ApiPath(...),
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Asigna una tarea a un usuario."""
    task = await db.get(RevisionTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    assigned = await RevisionTaskService.assign(db, task, user_id)
    return RevisionTaskResponse.model_validate(assigned)

@revision_router.post("/{task_id}/complete", response_model=RevisionTaskResponse)
async def complete_revision_task(
    result: Dict[str, Any] = Body(...),
    notes: Optional[str] = Body(None),
    task_id: uuid.UUID = ApiPath(...),
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Completa una tarea de revisión."""
    task = await db.get(RevisionTask, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    completed = await RevisionTaskService.complete(db, task, result, notes)
    return RevisionTaskResponse.model_validate(completed)


# Router de Resultados
results_router = APIRouter(prefix="/results", tags=["Results"])


@results_router.get("", response_model=PaginatedResponse)
async def list_item_result_summaries(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    item_id: Optional[uuid.UUID] = Query(None),
    evaluation_id: Optional[uuid.UUID] = Query(None),
    year: Optional[int] = Query(None),
    calculation_method: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Lista resultados historicos por item."""
    rows = await ItemResultSummaryService.get_all(
        db,
        skip=skip,
        limit=limit,
        item_id=item_id,
        evaluation_id=evaluation_id,
        year=year,
        calculation_method=calculation_method,
    )
    total_query = select(func.count()).select_from(ItemResultSummary)
    if item_id:
        total_query = total_query.where(ItemResultSummary.item_id == item_id)
    if evaluation_id:
        total_query = total_query.where(ItemResultSummary.evaluation_id == evaluation_id)
    if year:
        total_query = total_query.where(ItemResultSummary.year == year)
    if calculation_method:
        total_query = total_query.where(
            ItemResultSummary.calculation_method == calculation_method.upper()
        )
    total = (await db.execute(total_query)).scalar_one()

    return PaginatedResponse(
        items=[ItemResultSummaryResponse.model_validate(row) for row in rows],
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        pages=(total + limit - 1) // limit,
    )


# Router de propuestas generadas
generated_items_router = APIRouter(prefix="/generated-items", tags=["Generated Items"])


@generated_items_router.get("", response_model=PaginatedResponse)
async def list_generated_items(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Lista propuestas de items generados."""
    proposals = await GeneratedItemProposalService.get_all(
        db,
        skip=skip,
        limit=limit,
        status=status,
    )
    total_query = select(func.count()).select_from(GeneratedItemProposal)
    if status:
        total_query = total_query.where(GeneratedItemProposal.status == status.upper())
    total = (await db.execute(total_query)).scalar_one()

    return PaginatedResponse(
        items=[GeneratedItemProposalResponse.model_validate(p) for p in proposals],
        total=total,
        page=skip // limit + 1,
        page_size=limit,
        pages=(total + limit - 1) // limit,
    )


@generated_items_router.post(
    "/generate",
    response_model=List[GeneratedItemProposalResponse],
    status_code=201,
)
async def generate_item_proposals(
    request_data: GenerateItemProposalRequest,
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Genera propuestas de items en estado borrador."""
    proposals = await GeneratedItemProposalService.generate(
        db,
        request_data,
        current_username,
    )
    return [GeneratedItemProposalResponse.model_validate(p) for p in proposals]


@generated_items_router.post(
    "/{proposal_id}/review",
    response_model=GeneratedItemProposalResponse,
)
async def review_generated_item(
    review_data: GeneratedItemProposalReviewRequest,
    proposal_id: uuid.UUID = ApiPath(...),
    current_username: str = Depends(get_current_username),
    db: AsyncSession = Depends(get_db)
):
    """Actualiza el estado de revision de una propuesta generada."""
    proposal = await GeneratedItemProposalService.review(
        db,
        proposal_id,
        review_data,
        current_username,
    )
    return GeneratedItemProposalResponse.model_validate(proposal)


@auth_router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_username: str = Depends(get_current_username),
):
    """Guarda un archivo para importacion posterior."""
    upload_dir = FilePath(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    original_name = file.filename or "archivo_sin_nombre.bin"
    stored_name = f"{uuid.uuid4().hex[:8]}_{original_name}"
    destination = upload_dir / stored_name
    content = await file.read()
    destination.write_bytes(content)

    return {
        "filename": original_name,
        "stored_filename": stored_name,
        "path": str(destination),
        "uploaded_by": current_username,
        "size_bytes": len(content),
    }


# =============================================================================
# MAIN APPLICATION
# =============================================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


def create_application() -> FastAPI:
    """Factory para crear la aplicación FastAPI."""
    
    settings = get_settings()
    
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Sistema de Homologación Longitudinal IDPS - API",
        docs_url="/docs",
        redoc_url="/redoc"
    )
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Eventos de lifecycle
    @app.on_event("startup")
    async def startup_event():
        """Evento de inicio."""
        logger.info("Starting up IDPS Homologation System...")
        FilePath(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        # await init_db()
    
    @app.on_event("shutdown")
    async def shutdown_event():
        """Evento de cierre."""
        logger.info("Shutting down IDPS Homologation System...")
        await engine.dispose()
    
    # Health check
    @app.get("/health")
    async def health_check():
        """Endpoint de health check."""
        return {"status": "healthy", "version": settings.APP_VERSION}
    
    # Incluir routers
    app.include_router(
        auth_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        actor_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        evaluation_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        item_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        homologation_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        revision_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        results_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        generated_items_router,
        prefix=settings.API_V1_PREFIX
    )
    app.include_router(
        bank_router,
        prefix=settings.API_V1_PREFIX
    )
    
    return app


# Crear instancia de la aplicación
app = create_application()


# Punto de entrada para ejecución directa
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
