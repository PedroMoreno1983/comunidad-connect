# Sistema de Homologación Longitudinal IDPS
## Documentación Técnica Completa

---

# SECCIÓN 8. IMPLEMENTACIÓN - ARTEFACTOS CONCRETOS

## 8.1 Introducción

Esta sección presenta todos los artefactos de implementación necesarios para el despliegue del Sistema de Homologación Longitudinal IDPS. Cada componente ha sido diseñado siguiendo principios de arquitectura limpia, con código funcional y listo para producción.

El sistema está compuesto por tres capas principales:
- **Capa de Datos**: PostgreSQL con pgvector para embeddings
- **Capa de Backend**: FastAPI con SQLAlchemy async
- **Capa de Frontend**: React + TypeScript con hooks personalizados

---

## 8.A ESQUEMA SQL INICIAL (PostgreSQL)

### 8.A.1 Diseño de Base de Datos

El esquema de base de datos ha sido diseñado para soportar:
- Múltiples actores y evaluaciones heterogéneas
- Versionamiento de ítems
- Homologación con múltiples métodos de matching
- Seguimiento longitudinal de estudiantes
- Auditoría completa de operaciones

### 8.A.2 Estructura de Tablas

```sql
-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Enumeraciones
CREATE TYPE actor_type AS ENUM (
    'MINEDUC', 'DEMRE', 'AGENCIA_EVALUACION', 
    'UNIVERSIDAD', 'CENTRO_ESTUDIOS', 'INTERNACIONAL'
);

CREATE TYPE evaluation_type AS ENUM (
    'SIMCE', 'PAES', 'ICFES', 'PISA', 'PIRLS', 'TIMSS',
    'OTRA_NACIONAL', 'OTRA_INTERNACIONAL'
);

CREATE TYPE item_status AS ENUM (
    'BORRADOR', 'PENDIENTE_HOMOLOGACION', 'EN_REVISION',
    'HOMOLOGADO', 'RECHAZADO', 'OBSOLETO'
);

CREATE TYPE match_decision AS ENUM (
    'MATCH_EXACTO', 'MATCH_FUZZY_ALTO', 'MATCH_SEMANTICO_ALTO',
    'REVISION_MANUAL', 'NUEVO_ITEM', 'DESCARTAR'
);
```

### 8.A.3 Tablas Principales

| Tabla | Propósito | Registros Estimados |
|-------|-----------|---------------------|
| `actors` | Organizaciones evaluadoras | ~20 |
| `evaluations` | Evaluaciones/pruebas | ~100 |
| `dimensions` | Dimensiones IDPS | 4 |
| `subdimensions` | Subdimensiones IDPS | 12 |
| `items` | Ítems/preguntas | ~50,000 |
| `item_versions` | Historial de versiones | ~150,000 |
| `homologation_attempts` | Intentos de homologación | ~200,000 |
| `revision_tasks` | Tareas de revisión humana | ~20,000 |
| `evaluation_results` | Resultados de evaluación | ~10M |
| `item_responses` | Respuestas individuales | ~500M |
| `student_trajectories` | Trayectorias longitudinales | ~2M |
| `agent_executions` | Ejecuciones del agente | ~10,000 |

### 8.A.4 Índices Críticos

```sql
-- Índices para matching
CREATE INDEX idx_items_embedding ON items 
    USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_items_statement_trgm ON items 
    USING gin (statement gin_trgm_ops);

-- Índices para consultas frecuentes
CREATE INDEX idx_items_evaluation ON items(evaluation_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_canonical_id ON items(canonical_id);

-- Índices para resultados longitudinales
CREATE INDEX idx_results_student ON evaluation_results(student_hash);
CREATE INDEX idx_results_evaluation ON evaluation_results(evaluation_id);
```

### 8.A.5 Funciones Auxiliares

```sql
-- Función para búsqueda semántica
CREATE OR REPLACE FUNCTION find_similar_items(
    query_embedding VECTOR(1536),
    match_threshold DECIMAL,
    match_count INTEGER
)
RETURNS TABLE (
    id UUID,
    canonical_id VARCHAR,
    statement TEXT,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.canonical_id,
        i.statement,
        (1 - (i.embedding <=> query_embedding))::DECIMAL(4,3) AS similarity
    FROM items i
    WHERE i.embedding IS NOT NULL
      AND (1 - (i.embedding <=> query_embedding)) > match_threshold
    ORDER BY i.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Función para búsqueda fuzzy
CREATE OR REPLACE FUNCTION find_fuzzy_items(
    search_term TEXT,
    similarity_threshold DECIMAL DEFAULT 0.3,
    max_results INTEGER DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    canonical_id VARCHAR,
    statement TEXT,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.canonical_id,
        i.statement,
        similarity(i.statement, search_term)::DECIMAL(4,3) AS similarity
    FROM items i
    WHERE similarity(i.statement, search_term) > similarity_threshold
    ORDER BY similarity DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;
```

---

## 8.B ESTRUCTURA DE BASE DE DATOS

### 8.B.1 Diagrama Entidad-Relación (Texto)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     ACTORS      │     │   EVALUATIONS    │     │    DIMENSIONS   │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ PK id           │◄────┤ PK id            │     │ PK id           │
│ code            │     │ FK actor_id      │     │ code            │
│ name            │     │ code             │     │ name            │
│ type            │     │ name             │     │ weight          │
│ description     │     │ type             │     └────────┬────────┘
└─────────────────┘     │ year_start       │              │
                        │ year_end         │              │
                        └────────┬─────────┘              │
                                 │                        │
                                 │                        ▼
                        ┌────────▼─────────┐     ┌─────────────────┐
                        │      ITEMS       │     │  SUBDIMENSIONS  │
                        ├──────────────────┤     ├─────────────────┤
                        │ PK id            │     │ PK id           │
                        │ canonical_id     │     │ FK dimension_id │
                        │ FK evaluation_id │     │ code            │
                        │ FK dimension_id  │◄────┤ name            │
                        │ FK subdim_id     │◄────┤ weight          │
                        │ statement        │     └─────────────────┘
                        │ options (JSONB)  │
                        │ embedding        │
                        │ status           │
                        └────────┬─────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
        ┌───────────────┐ ┌──────────┐ ┌──────────────┐
        │ ITEM_VERSIONS │ │ RESULTS  │ │  ATTEMPTS    │
        ├───────────────┤ ├──────────┤ ├──────────────┤
        │ PK id         │ │ PK id    │ │ PK id        │
        │ FK item_id    │ │ student  │ │ FK source_id │
        │ version_num   │ │ FK eval  │ │ FK cand_id   │
        │ statement     │ │ scores   │ │ scores       │
        └───────────────┘ └──────────┘ │ decision     │
                                       └──────────────┘
```

### 8.B.2 Estrategia de Migraciones (Alembic)

```python
# alembic/env.py
from sqlalchemy import engine_from_config, pool
from alembic import context
from app.database import Base
from app.config import settings

config = context.config
target_metadata = Base.metadata

def run_migrations_online():
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
```

Comandos de migración:
```bash
# Crear nueva migración
alembic revision --autogenerate -m "descripcion"

# Aplicar migraciones
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

## 8.C PSEUDOCÓDIGO ETL

### 8.C.1 Flujo Principal del Pipeline ETL

```
┌─────────────────────────────────────────────────────────────────┐
│                    PIPELINE ETL IDPS                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  1. EXTRACT: Leer Excel/CSV         │
        │     - Detectar formato              │
        │     - Identificar columnas          │
        │     - Validar estructura            │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  2. TRANSFORM: Normalizar           │
        │     - Limpiar texto                 │
        │     - Normalizar columnas           │
        │     - Generar embeddings            │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  3. MATCH: Homologación             │
        │     - Matching exacto               │
        │     - Fuzzy matching                │
        │     - Semantic matching             │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  4. DECIDE: Clasificar              │
        │     - Calcular scores               │
        │     - Determinar decisión           │
        │     - Crear tareas revisión         │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  5. LOAD: Guardar en BD             │
        │     - Insertar ítems                │
        │     - Registrar intentos            │
        │     - Actualizar estados            │
        └─────────────────────────────────────┘
```

### 8.C.2 Función: Leer Excel Heterogéneo

```python
def read_excel_heterogeneous(file_path: str) -> pd.DataFrame:
    """
    Lee archivos Excel con formatos variables.
    
    Características:
    - Detecta automáticamente hojas con datos
    - Identifica fila de headers
    - Maneja múltiples formatos de columnas
    - Valida integridad de datos
    """
    # Detectar hojas disponibles
    xl = pd.ExcelFile(file_path)
    
    for sheet in xl.sheet_names:
        # Intentar diferentes filas de header
        for header_row in range(5):
            try:
                df = pd.read_excel(file_path, sheet_name=sheet, 
                                  header=header_row)
                if validate_dataframe(df):
                    return df
            except:
                continue
    
    raise ValueError("No se pudo leer el archivo")
```

### 8.C.3 Función: Normalizar Columnas

```python
def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normaliza nombres de columnas a estándar.
    
    Mapeos soportados:
    - id → ['id', 'ID', 'codigo', 'item_id']
    - statement → ['enunciado', 'pregunta', 'texto', 'item']
    - options → ['opciones', 'alternativas', 'respuestas']
    - correct_answer → ['respuesta_correcta', 'clave', 'answer']
    - evaluation → ['evaluacion', 'prueba', 'test']
    - year → ['año', 'year', 'periodo']
    - dimension → ['dimension', 'eje', 'area']
    """
    column_map = detect_columns(df)
    df = df.rename(columns=column_map)
    return df
```

### 8.C.4 Función: Matching Exacto

```python
def match_exact(source: Item, candidates: List[Item]) -> List[Match]:
    """
    Matching basado en hash MD5 del texto normalizado.
    
    Algoritmo:
    1. Normalizar texto fuente
    2. Generar hash MD5
    3. Comparar con hashes de candidatos
    4. Retornar matches con score 1.0
    
    Complejidad: O(n)
    """
    source_hash = hashlib.md5(
        normalize_text(source.statement).encode()
    ).hexdigest()
    
    matches = []
    for candidate in candidates:
        candidate_hash = hashlib.md5(
            normalize_text(candidate.statement).encode()
        ).hexdigest()
        
        if source_hash == candidate_hash:
            matches.append(Match(candidate, score=1.0))
    
    return matches
```

### 8.C.5 Función: Matching Difuso

```python
def match_fuzzy(source: Item, candidates: List[Item], 
                threshold: float = 0.7) -> List[Match]:
    """
    Matching usando algoritmos de similitud de texto.
    
    Algoritmos usados:
    - Levenshtein distance
    - Jaro-Winkler
    - Token sort ratio
    - Weighted ratio (combinación)
    
    Librería: RapidFuzz (C++ optimizado)
    """
    matches = []
    
    for candidate in candidates:
        score = fuzz.WRatio(
            normalize_text(source.statement),
            normalize_text(candidate.statement)
        ) / 100.0
        
        if score >= threshold:
            matches.append(Match(candidate, score=score))
    
    return sorted(matches, key=lambda m: m.score, reverse=True)
```

### 8.C.6 Función: Matching Semántico

```python
def match_semantic(source: Item, candidates: List[Item],
                   threshold: float = 0.7) -> List[Match]:
    """
    Matching basado en embeddings y similitud coseno.
    
    Modelo: paraphrase-multilingual-MiniLM-L12-v2
    Dimensión: 384 (comprimido) o 1536 (OpenAI)
    
    Proceso:
    1. Generar embedding del ítem fuente
    2. Calcular similitud coseno con candidatos
    3. Filtrar por threshold
    4. Ordenar por similitud
    """
    model = get_embedding_model()
    
    source_embedding = model.encode(source.get_full_text())
    candidate_texts = [c.get_full_text() for c in candidates]
    candidate_embeddings = model.encode(candidate_texts)
    
    similarities = cosine_similarity(
        [source_embedding], 
        candidate_embeddings
    )[0]
    
    matches = []
    for i, score in enumerate(similarities):
        if score >= threshold:
            matches.append(Match(candidates[i], score=float(score)))
    
    return sorted(matches, key=lambda m: m.score, reverse=True)
```

### 8.C.7 Función: Clasificar Decisión

```python
def classify_decision(scores: Scores) -> Decision:
    """
    Clasifica la decisión basada en scores combinados.
    
    Umbrales:
    - EXACTO: exact_score >= 0.95
    - FUZZY_ALTO: fuzzy_score >= 0.85 AND confianza ALTA
    - SEMANTICO_ALTO: semantic_score >= 0.85 AND confianza ALTA
    - REVISION_MANUAL: combined >= 0.60
    - NUEVO_ITEM: combined > 0.30
    - DESCARTAR: combined <= 0.30
    
    Pesos:
    - exact: 0.40
    - fuzzy: 0.30
    - semantic: 0.30
    """
    combined = (scores.exact * 0.4 + 
                scores.fuzzy * 0.3 + 
                scores.semantic * 0.3)
    
    if scores.exact >= 0.95:
        return Decision.MATCH_EXACTO
    elif scores.fuzzy >= 0.85 and combined >= 0.85:
        return Decision.MATCH_FUZZY_ALTO
    elif scores.semantic >= 0.85 and combined >= 0.85:
        return Decision.MATCH_SEMANTICO_ALTO
    elif combined >= 0.60:
        return Decision.REVISION_MANUAL
    elif combined > 0.30:
        return Decision.NUEVO_ITEM
    else:
        return Decision.DESCARTAR
```

---

## 8.D REGLAS DE MATCHING (Código Python)

### 8.D.1 Implementación Completa del Motor de Matching

```python
#!/usr/bin/env python3
"""
Motor de Matching IDPS
======================
Implementación completa de algoritmos de homologación.
"""

import hashlib
import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum

from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


class MatchDecision(Enum):
    MATCH_EXACTO = "MATCH_EXACTO"
    MATCH_FUZZY_ALTO = "MATCH_FUZZY_ALTO"
    MATCH_SEMANTICO_ALTO = "MATCH_SEMANTICO_ALTO"
    REVISION_MANUAL = "REVISION_MANUAL"
    NUEVO_ITEM = "NUEVO_ITEM"
    DESCARTAR = "DESCARTAR"


class ConfidenceLevel(Enum):
    MUY_ALTA = "MUY_ALTA"    # > 0.95
    ALTA = "ALTA"            # 0.85 - 0.95
    MEDIA = "MEDIA"          # 0.70 - 0.85
    BAJA = "BAJA"            # 0.50 - 0.70
    MUY_BAJA = "MUY_BAJA"    # < 0.50


@dataclass
class MatchResult:
    source_item_id: str
    candidate_item_id: Optional[str]
    exact_match_score: float
    fuzzy_match_score: float
    semantic_match_score: float
    combined_score: float
    confidence: ConfidenceLevel
    decision: MatchDecision
    decision_reason: str


class TextNormalizer:
    """Normaliza texto para comparación."""
    
    STOPWORDS = {
        'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'al',
        'y', 'o', 'pero', 'por', 'para', 'con', 'sin', 'en', 'a'
    }
    
    @classmethod
    def normalize(cls, text: str) -> str:
        if not text:
            return ""
        
        # Minúsculas
        text = text.lower()
        
        # Eliminar acentos
        accents = {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n'}
        for a, r in accents.items():
            text = text.replace(a, r)
        
        # Eliminar caracteres especiales y números
        import re
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\d+', ' ', text)
        
        # Eliminar stopwords
        words = [w for w in text.split() 
                if w not in cls.STOPWORDS and len(w) > 2]
        
        return ' '.join(words)
    
    @classmethod
    def generate_hash(cls, text: str) -> str:
        normalized = cls.normalize(text)
        return hashlib.md5(normalized.encode()).hexdigest()


class ExactMatcher:
    """Matcher exacto basado en hash."""
    
    def match(self, source: 'Item', candidates: List['Item']) -> float:
        source_hash = TextNormalizer.generate_hash(source.statement)
        
        for candidate in candidates:
            candidate_hash = TextNormalizer.generate_hash(candidate.statement)
            if source_hash == candidate_hash:
                return 1.0
        
        return 0.0


class FuzzyMatcher:
    """Matcher fuzzy usando RapidFuzz."""
    
    def __init__(self):
        self.scorer = fuzz.WRatio
    
    def match(self, source: 'Item', candidates: List['Item']) -> float:
        if not candidates:
            return 0.0
        
        choices = [(c, TextNormalizer.normalize(c.statement)) 
                   for c in candidates]
        
        matches = process.extract(
            TextNormalizer.normalize(source.statement),
            choices,
            scorer=self.scorer,
            limit=1
        )
        
        if matches:
            return matches[0][1] / 100.0
        return 0.0


class SemanticMatcher:
    """Matcher semántico usando embeddings."""
    
    MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
    
    def __init__(self):
        self._model = None
    
    @property
    def model(self):
        if self._model is None:
            self._model = SentenceTransformer(self.MODEL_NAME)
        return self._model
    
    def encode(self, texts: List[str]) -> np.ndarray:
        return self.model.encode(texts, convert_to_numpy=True)
    
    def match(self, source: 'Item', candidates: List['Item']) -> float:
        if not candidates:
            return 0.0
        
        texts = [source.get_full_text()] + [c.get_full_text() for c in candidates]
        embeddings = self.encode(texts)
        
        similarities = cosine_similarity([embeddings[0]], embeddings[1:])[0]
        
        return float(max(similarities))


class ScoreCombiner:
    """Combina scores de múltiples matchers."""
    
    WEIGHTS = {'exact': 0.4, 'fuzzy': 0.3, 'semantic': 0.3}
    
    @classmethod
    def combine(cls, exact: float, fuzzy: float, semantic: float) -> float:
        return round(
            exact * cls.WEIGHTS['exact'] +
            fuzzy * cls.WEIGHTS['fuzzy'] +
            semantic * cls.WEIGHTS['semantic'],
            3
        )
    
    @classmethod
    def get_confidence(cls, score: float) -> ConfidenceLevel:
        if score > 0.95:
            return ConfidenceLevel.MUY_ALTA
        elif score > 0.85:
            return ConfidenceLevel.ALTA
        elif score > 0.70:
            return ConfidenceLevel.MEDIA
        elif score > 0.50:
            return ConfidenceLevel.BAJA
        return ConfidenceLevel.MUY_BAJA


class DecisionClassifier:
    """Clasifica la decisión final."""
    
    THRESHOLDS = {
        'exact': 0.95,
        'fuzzy_high': 0.85,
        'semantic_high': 0.85,
        'combined_medium': 0.60,
        'combined_low': 0.30
    }
    
    def classify(self, scores: dict, has_candidate: bool) -> Tuple[MatchDecision, str]:
        if not has_candidate:
            return MatchDecision.NUEVO_ITEM, "Sin candidatos"
        
        if scores['exact'] >= self.THRESHOLDS['exact']:
            return MatchDecision.MATCH_EXACTO, f"Exacto: {scores['exact']:.3f}"
        
        if scores['fuzzy'] >= self.THRESHOLDS['fuzzy_high']:
            return MatchDecision.MATCH_FUZZY_ALTO, f"Fuzzy: {scores['fuzzy']:.3f}"
        
        if scores['semantic'] >= self.THRESHOLDS['semantic_high']:
            return MatchDecision.MATCH_SEMANTICO_ALTO, f"Semántico: {scores['semantic']:.3f}"
        
        if scores['combined'] >= self.THRESHOLDS['combined_medium']:
            return MatchDecision.REVISION_MANUAL, f"Revisar: {scores['combined']:.3f}"
        
        if scores['combined'] > self.THRESHOLDS['combined_low']:
            return MatchDecision.NUEVO_ITEM, f"Nuevo: {scores['combined']:.3f}"
        
        return MatchDecision.DESCARTAR, f"Bajo: {scores['combined']:.3f}"
```

---

## 8.E ESTRUCTURA DEL BACKEND (FastAPI)

### 8.E.1 Estructura de Carpetas

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # Punto de entrada
│   ├── config.py               # Configuración
│   ├── database.py             # Conexión a BD
│   ├── models/                 # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── actor.py
│   │   ├── evaluation.py
│   │   ├── item.py
│   │   └── homologation.py
│   ├── schemas/                # Pydantic schemas
│   │   ├── __init__.py
│   │   ├── actor.py
│   │   ├── evaluation.py
│   │   ├── item.py
│   │   └── responses.py
│   ├── routers/                # API endpoints
│   │   ├── __init__.py
│   │   ├── actors.py
│   │   ├── evaluations.py
│   │   ├── items.py
│   │   ├── homologation.py
│   │   └── revisions.py
│   ├── services/               # Lógica de negocio
│   │   ├── __init__.py
│   │   ├── actor_service.py
│   │   ├── item_service.py
│   │   └── matching_service.py
│   └── dependencies.py         # Inyección de dependencias
├── alembic/                    # Migraciones
├── tests/
├── requirements.txt
└── Dockerfile
```

### 8.E.2 Configuración (config.py)

```python
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Sistema Homologación IDPS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost/idps_db"
    DATABASE_POOL_SIZE: int = 20
    
    # Security
    SECRET_KEY: str = "change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    
    # API
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: list = ["http://localhost:3000"]
    
    # Matching
    MATCHING_EXACT_THRESHOLD: float = 0.95
    MATCHING_FUZZY_THRESHOLD: float = 0.80
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

### 8.E.3 Conexión a Base de Datos (database.py)

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DATABASE_POOL_SIZE,
    pool_pre_ping=True,
    echo=settings.DEBUG,
)

AsyncSessionLocal = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
```

### 8.E.4 Modelos SQLAlchemy (models/item.py)

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum, Float
from sqlalchemy.dialects.postgresql import UUID, JSONB, VECTOR
from app.database import Base
import enum


class ItemStatus(str, enum.Enum):
    BORRADOR = "BORRADOR"
    PENDIENTE_HOMOLOGACION = "PENDIENTE_HOMOLOGACION"
    EN_REVISION = "EN_REVISION"
    HOMOLOGADO = "HOMOLOGADO"
    RECHAZADO = "RECHAZADO"
    OBSOLETO = "OBSOLETO"


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
    
    embedding = Column(VECTOR(1536))
    metadata = Column(JSONB, default=dict)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
```

### 8.E.5 Schemas Pydantic (schemas/item.py)

```python
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.item import ItemStatus


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
    model_config = ConfigDict(from_attributes=True)
    
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
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
```

---

## 8.F COMPONENTES FRONTEND (React + TypeScript)

### 8.F.1 Estructura de Carpetas

```
frontend/
├── src/
│   ├── components/           # Componentes reutilizables
│   │   ├── common/
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── ErrorMessage.tsx
│   │   │   ├── Pagination.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── items/
│   │   │   ├── ItemsTable.tsx
│   │   │   ├── ItemCard.tsx
│   │   │   └── ItemForm.tsx
│   │   └── homologation/
│   │       ├── HomologationCard.tsx
│   │       └── MatchingVisualizer.tsx
│   ├── hooks/                # Custom hooks
│   │   ├── useFetch.ts
│   │   ├── usePagination.ts
│   │   ├── useDebounceSearch.ts
│   │   └── useForm.ts
│   ├── services/             # API services
│   │   └── api.ts
│   ├── types/                # TypeScript types
│   │   └── index.ts
│   ├── pages/                # Páginas
│   │   ├── Dashboard.tsx
│   │   ├── ItemsPage.tsx
│   │   ├── HomologationsPage.tsx
│   │   └── RevisionsPage.tsx
│   ├── layouts/
│   │   └── MainLayout.tsx
│   ├── App.tsx
│   └── main.tsx
├── package.json
└── vite.config.ts
```

### 8.F.2 Tipos TypeScript (types/index.ts)

```typescript
export enum ActorType {
  MINEDUC = 'MINEDUC',
  DEMRE = 'DEMRE',
  AGENCIA_EVALUACION = 'AGENCIA_EVALUACION',
  UNIVERSIDAD = 'UNIVERSIDAD',
  CENTRO_ESTUDIOS = 'CENTRO_ESTUDIOS',
  INTERNACIONAL = 'INTERNACIONAL',
}

export enum ItemStatus {
  BORRADOR = 'BORRADOR',
  PENDIENTE_HOMOLOGACION = 'PENDIENTE_HOMOLOGACION',
  EN_REVISION = 'EN_REVISION',
  HOMOLOGADO = 'HOMOLOGADO',
  RECHAZADO = 'RECHAZADO',
  OBSOLETO = 'OBSOLETO',
}

export interface Item {
  id: string;
  canonicalId?: string;
  originalId?: string;
  evaluationId: string;
  dimensionId?: string;
  subdimensionId?: string;
  statement: string;
  options?: Record<string, unknown>;
  correctAnswer?: string;
  explanation?: string;
  itemType?: string;
  difficulty?: number;
  discrimination?: number;
  status: ItemStatus;
  homologatedTo?: string;
  homologationConfidence?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}
```

### 8.F.3 Servicio de API (services/api.ts)

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.detail || error.error);
    }

    return response.json();
  }

  async getItems(skip = 0, limit = 100): Promise<PaginatedResponse<Item>> {
    return this.request(`/items?skip=${skip}&limit=${limit}`);
  }

  async getItem(id: string): Promise<Item> {
    return this.request(`/items/${id}`);
  }

  async createItem(data: Omit<Item, 'id' | 'canonicalId' | 'createdAt' | 'updatedAt'>): Promise<Item> {
    return this.request('/items', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateItem(id: string, data: Partial<Item>): Promise<Item> {
    return this.request(`/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async searchItems(query: string, limit = 10): Promise<Item[]> {
    return this.request(`/items/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
```

### 8.F.4 Hooks Personalizados (hooks/useFetch.ts)

```typescript
import { useState, useEffect } from 'react';

export function useFetch<T>(fetchFn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchFn();
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, deps);

  return { data, loading, error, refetch: () => setData(null) };
}
```

### 8.F.5 App.tsx con Routing

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { DashboardPage } from './pages/Dashboard';
import { ItemsPage } from './pages/ItemsPage';
import { HomologationsPage } from './pages/HomologationsPage';
import { RevisionsPage } from './pages/RevisionsPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/homologations" element={<HomologationsPage />} />
          <Route path="/revisions" element={<RevisionsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
};

export default App;
```

---

## 8.G ENDPOINTS API COMPLETOS

### 8.G.1 Documentación de Endpoints

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | /api/v1/actors | Listar actores | Opcional |
| POST | /api/v1/actors | Crear actor | Requerido |
| GET | /api/v1/actors/{id} | Obtener actor | Opcional |
| PATCH | /api/v1/actors/{id} | Actualizar actor | Requerido |
| DELETE | /api/v1/actors/{id} | Eliminar actor | Requerido |
| GET | /api/v1/evaluations | Listar evaluaciones | Opcional |
| POST | /api/v1/evaluations | Crear evaluación | Requerido |
| GET | /api/v1/evaluations/{id} | Obtener evaluación | Opcional |
| GET | /api/v1/items | Listar ítems | Opcional |
| POST | /api/v1/items | Crear ítem | Requerido |
| GET | /api/v1/items/{id} | Obtener ítem | Opcional |
| PATCH | /api/v1/items/{id} | Actualizar ítem | Requerido |
| GET | /api/v1/items/search | Buscar ítems | Opcional |
| GET | /api/v1/homologation/pending | Homologaciones pendientes | Requerido |
| POST | /api/v1/homologation/attempt | Crear intento | Requerido |
| POST | /api/v1/homologation/{id}/review | Revisar homologación | Requerido |
| GET | /api/v1/revisions | Listar tareas | Requerido |
| POST | /api/v1/revisions | Crear tarea | Requerido |
| POST | /api/v1/revisions/{id}/assign | Asignar tarea | Requerido |
| POST | /api/v1/revisions/{id}/complete | Completar tarea | Requerido |

### 8.G.2 Request/Response Examples

**Crear Ítem:**
```http
POST /api/v1/items
Content-Type: application/json

{
  "evaluation_id": "550e8400-e29b-41d4-a716-446655440000",
  "original_id": "SIMCE-2024-001",
  "statement": "¿Cuál es la importancia de la empatía en las relaciones interpersonales?",
  "options": {
    "A": "Es fundamental para comprender a los demás",
    "B": "No tiene mucha importancia",
    "C": "Solo es importante en el trabajo",
    "D": "Es importante solo con la familia"
  },
  "correct_answer": "A",
  "item_type": "multiple_choice",
  "difficulty": 0.65
}
```

**Response:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "canonical_id": "IDPS-2024-000001",
  "evaluation_id": "550e8400-e29b-41d4-a716-446655440000",
  "original_id": "SIMCE-2024-001",
  "statement": "¿Cuál es la importancia de la empatía en las relaciones interpersonales?",
  "options": {
    "A": "Es fundamental para comprender a los demás",
    "B": "No tiene mucha importancia",
    "C": "Solo es importante en el trabajo",
    "D": "Es importante solo con la familia"
  },
  "correct_answer": "A",
  "item_type": "multiple_choice",
  "difficulty": 0.65,
  "status": "BORRADOR",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

### 8.G.3 Manejo de Errores

```json
{
  "error": "VALIDATION_ERROR",
  "detail": "El campo 'statement' es requerido",
  "code": "ITEM_001",
  "field": "statement"
}
```

Códigos de error:
- `400` - Bad Request: Datos inválidos
- `401` - Unauthorized: No autenticado
- `403` - Forbidden: Sin permisos
- `404` - Not Found: Recurso no existe
- `409` - Conflict: Conflicto de datos
- `422` - Validation Error: Error de validación
- `500` - Internal Server Error: Error interno

---

## 8.H MODELO DE REVISIÓN HUMANA

### 8.H.1 Flujo de Trabajo de Revisión

```
┌─────────────────────────────────────────────────────────────────┐
│                  FLUJO DE REVISIÓN HUMANA                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │  1. DETECCIÓN                       │
        │     - Score combinado 0.60-0.85     │
        │     - Conflicto de dimensiones      │
        │     - Nuevo tipo de ítem            │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  2. CREACIÓN DE TAREA               │
        │     - Asignar prioridad (1-10)      │
        │     - Establecer fecha límite       │
        │     - Notificar revisores           │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  3. ASIGNACIÓN                      │
        │     - Asignar a experto             │
        │     - O auto-asignación             │
        │     - Cambiar estado a EN_PROGRESO  │
        └──────────────┬──────────────────────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  4. REVISIÓN                        │
        │     - Ver ítem fuente               │
        │     - Ver candidato(s)              │
        │     - Comparar scores               │
        │     - Tomar decisión                │
        └──────────────┬──────────────────────┘
                       │
           ┌───────────┼───────────┐
           ▼           ▼           ▼
        ┌─────┐    ┌─────┐    ┌─────┐
        │MATCH│    │NUEVO│    │ESCALA│
        └─────┘    └─────┘    └─────┘
                       │
                       ▼
        ┌─────────────────────────────────────┐
        │  5. COMPLETAR                       │
        │     - Registrar decisión            │
        │     - Agregar notas                 │
        │     - Cambiar estado                │
        └─────────────────────────────────────┘
```

### 8.H.2 Estados Posibles

| Estado | Descripción | Transiciones |
|--------|-------------|--------------|
| PENDIENTE | Tarea creada, sin asignar | → EN_PROGRESO |
| EN_PROGRESO | Asignada a revisor | → COMPLETADA, → ESCALADA |
| COMPLETADA | Revisión finalizada | (final) |
| ESCALADA | Requiere revisión adicional | → EN_PROGRESO (otro revisor) |

### 8.H.3 Interfaz de Usuario de Revisión

La interfaz de revisión debe incluir:

1. **Panel Izquierdo**: Ítem fuente
   - Enunciado completo
   - Opciones de respuesta
   - Metadatos (evaluación, año, dimensión)

2. **Panel Central**: Candidato(s)
   - Lista de candidatos ordenados por score
   - Enunciado de cada candidato
   - Barras de score visual

3. **Panel Derecho**: Acciones
   - Botones de decisión (Match, Nuevo, Escalar)
   - Campo de notas
   - Historial de revisiones

4. **Visualización de Scores**:
   - Barras de progreso para cada tipo de score
   - Indicador de confianza (color)
   - Score combinado destacado

### 8.H.4 Notificaciones

Eventos que generan notificaciones:
- Nueva tarea de revisión asignada
- Tarea próxima a vencer (24h)
- Tarea escalada al usuario
- Decisión requerida urgente

Canales:
- Email
- Notificación in-app
- Dashboard de alertas

---

## 8.I FLUJO DEL AGENTE

### 8.I.1 Diagrama de Estados del Agente

```
                         ┌─────────────┐
                         │   INACTIVO  │
                         └──────┬──────┘
                                │ start()
                                ▼
    ┌───────────────────────────────────────────────────┐
    │                    PROCESANDO                      │
    │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
    │  │  ETL     │→ │ MATCHING │→ │ DECISION │        │
    │  │ Extract  │  │ Exact    │  │ Classify │        │
    │  │ Transform│  │ Fuzzy    │  │ Create   │        │
    │  │ Load     │  │ Semantic │  │ Tasks    │        │
    │  └──────────┘  └──────────┘  └──────────┘        │
    └────────────────────────┬──────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────────┐ ┌────────┐ ┌──────────────┐
    │ESPERANDO_REVISION│ │COMPLETADO│ │    ERROR     │
    │ (hay tareas)    │ │ (éxito)  │ │ (falló)      │
    └─────────────────┘ └────────┘ └──────────────┘
```

### 8.I.2 Estados del Agente

| Estado | Descripción | Próximo Estado |
|--------|-------------|----------------|
| INACTIVO | Agente listo para iniciar | PROCESANDO |
| PROCESANDO | Ejecutando pipeline ETL | ESPERANDO_REVISION, COMPLETADO, ERROR |
| ESPERANDO_REVISION | Hay tareas pendientes de revisión humana | COMPLETADO (cuando se resuelvan) |
| COMPLETADO | Proceso finalizado exitosamente | INACTIVO |
| ERROR | Ocurrió un error durante el procesamiento | INACTIVO (después de reintentos) |

### 8.I.3 Manejo de Errores

```python
class AgentErrorHandler:
    MAX_RETRIES = 3
    
    async def execute_with_retry(self, task_fn, *args):
        for attempt in range(self.MAX_RETRIES):
            try:
                return await task_fn(*args)
            except TransientError as e:
                if attempt < self.MAX_RETRIES - 1:
                    wait_time = 2 ** attempt  # Exponential backoff
                    await asyncio.sleep(wait_time)
                    continue
                raise PermanentError(f"Failed after {self.MAX_RETRIES} attempts: {e}")
            except PermanentError:
                raise
    
    def log_error(self, execution_id: str, error: Exception):
        logger.error(f"Agent error in {execution_id}: {str(error)}")
        # Guardar en tabla de errores
        # Notificar administradores si es crítico
```

Tipos de errores:
- **TransientError**: Puede reintentarse (timeout, rate limit)
- **PermanentError**: No reintentable (datos inválidos, error de lógica)
- **CriticalError**: Requiere intervención manual (BD caída, modelo no disponible)

---

## 8.J EJEMPLOS DE PAYLOADS JSON

### 8.J.1 Ejemplo: Importación de Ítems

```json
{
  "import_id": "imp-2024-001",
  "source": {
    "actor_code": "SIMCE",
    "evaluation_code": "SIMCE-4B-2024",
    "file_name": "simce_4b_competencias_ciudadanas.xlsx",
    "uploaded_at": "2024-01-15T10:30:00Z",
    "uploaded_by": "user-123"
  },
  "items": [
    {
      "original_id": "SIMCE-4B-2024-CC-001",
      "statement": "Cuando un compañero te cuenta un problema personal, ¿qué es más importante hacer?",
      "options": {
        "A": "Darle consejos inmediatamente",
        "B": "Escuchar atentamente sin juzgar",
        "C": "Contarle un problema similar tuyo",
        "D": "Sugerirle que hable con un adulto"
      },
      "correct_answer": "B",
      "dimension_code": "HABILIDADES_RELACIONALES",
      "subdimension_code": "COMUNICACION",
      "difficulty": 0.65,
      "metadata": {
        "page": 1,
        "row": 5,
        "original_sheet": "Competencias"
      }
    }
  ],
  "options": {
    "auto_homologate": true,
    "create_revision_tasks": true,
    "notify_on_complete": true
  }
}
```

### 8.J.2 Ejemplo: Resultado de Homologación

```json
{
  "homologation_id": "hom-2024-001",
  "source_item": {
    "id": "item-001",
    "original_id": "SIMCE-4B-2024-CC-001",
    "statement": "Cuando un compañero te cuenta un problema personal..."
  },
  "candidate_item": {
    "id": "item-089",
    "canonical_id": "IDPS-2023-004512",
    "statement": "Si un amigo te cuenta un problema personal, ¿qué deberías hacer primero?",
    "evaluation": "SIMCE-4B-2023"
  },
  "scores": {
    "exact": 0.0,
    "fuzzy": 0.82,
    "semantic": 0.91,
    "combined": 0.60
  },
  "confidence": "MEDIA",
  "decision": "REVISION_MANUAL",
  "decision_reason": "Score combinado 0.60 requiere revisión humana",
  "revision_task": {
    "id": "task-001",
    "priority": 5,
    "status": "PENDIENTE",
    "due_date": "2024-01-22T10:30:00Z"
  },
  "created_at": "2024-01-15T10:35:00Z"
}
```

### 8.J.3 Ejemplo: Generación de Ítem

```json
{
  "generation_id": "gen-2024-001",
  "request": {
    "dimension_code": "CONSCIENCIA_SOCIAL",
    "subdimension_code": "EMPATIA",
    "target_difficulty": 0.70,
    "item_type": "multiple_choice",
    "context": "situaciones_escolares",
    "language": "es"
  },
  "generated_item": {
    "statement": "En el recreo, ves que un compañero nuevo está solo en un rincón del patio. ¿Cuál sería la mejor manera de acercarte a él?",
    "options": {
      "A": "Ir directamente y preguntarle por qué está solo",
      "B": "Invitarlo a jugar con tu grupo de amigos",
      "C": "Observarlo desde lejos y esperar a que se acerque",
      "D": "Contarle a otros compañeros que parece triste"
    },
    "correct_answer": "B",
    "explanation": "La opción B demuestra empatía al incluir al compañero en una actividad social de manera amigable.",
    "predicted_difficulty": 0.68,
    "predicted_discrimination": 0.45
  },
  "validation": {
    "is_valid": true,
    "issues": [],
    "suggestions": [
      "Considerar agregar una opción distractor más plausible"
    ]
  },
  "status": "PENDIENTE_REVISION",
  "created_at": "2024-01-15T11:00:00Z"
}
```

### 8.J.4 Ejemplo: Revisión Humana

```json
{
  "revision_id": "rev-2024-001",
  "task_id": "task-001",
  "reviewer": {
    "id": "user-456",
    "name": "María González",
    "role": "EXPERTO_CONTENIDO"
  },
  "homologation_attempt": {
    "id": "hom-2024-001",
    "source_item_id": "item-001",
    "candidate_item_id": "item-089"
  },
  "review": {
    "decision": "MATCH_CONFIRMADO",
    "confidence": "ALTA",
    "notes": "Los ítems miden la misma competencia aunque el enunciado difiere. El cambio en la redacción no altera el constructo medido.",
    "dimension_verified": true,
    "subdimension_verified": true,
    "difficulty_adjusted": 0.67,
    "tags": ["empatia", "escucha_activa", "situacion_social"]
  },
  "time_spent_seconds": 180,
  "completed_at": "2024-01-15T14:30:00Z"
}
```

---

# SECCIÓN 9. PLAN DE EJECUCIÓN POR FASES

## 9.1 Visión General

El proyecto se divide en 6 fases, desde la preparación inicial hasta la mejora continua. Cada fase tiene objetivos claros, entregables definidos y criterios de cierre específicos.

```
┌────────────────────────────────────────────────────────────────────┐
│                    CRONOGRAMA GENERAL                               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  FASE 0    FASE 1      FASE 2      FASE 3      FASE 4    FASE 5   │
│  Inventario Homologación Banco      Integración Agente   Mejora   │
│  y Diagnóstico Mínima    Consultable Longitudinal Generador Cont. │
│  │          │           │           │           │         │        │
│  ▼          ▼           ▼           ▼           ▼         ▼        │
│  ██        ██████      ████        ████        █████      ═══      │
│  2-3s      4-6s        3-4s        3-4s        4-5s       Cont.    │
│                                                                    │
│  Semanas: 1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17+      │
│         ──────────────────────────────────────────────────────▶    │
└────────────────────────────────────────────────────────────────────┘
```

---

## FASE 0: INVENTARIO Y DIAGNÓSTICO (2-3 semanas)

### Objetivos
1. Identificar todas las fuentes de datos IDPS existentes
2. Documentar formatos y estructuras heterogéneas
3. Evaluar calidad y completitud de datos históricos
4. Establecer línea base para medición de progreso

### Tareas Detalladas

| Semana | Tarea | Responsable | Horas |
|--------|-------|-------------|-------|
| 1 | Contactar actores para solicitar datos | PM | 20 |
| 1 | Crear inventario de evaluaciones | Analista | 30 |
| 1 | Documentar formatos de archivos | Analista | 25 |
| 2 | Analizar estructura de ítems históricos | Data Engineer | 40 |
| 2 | Evaluar calidad de datos | Data Engineer | 30 |
| 2 | Identificar gaps y duplicados | Analista | 25 |
| 3 | Crear matriz de correspondencia dimensiones | Experto IDPS | 35 |
| 3 | Documentar hallazgos | Analista | 20 |
| 3 | Presentar resultados a stakeholders | PM | 10 |

### Entregables

1. **Inventario de Datos** (Excel/CSV)
   - Listado completo de evaluaciones 2014-2026
   - Formatos de archivo identificados
   - Volumetría por fuente

2. **Documento de Diagnóstico** (PDF, ~30 páginas)
   - Resumen ejecutivo
   - Análisis de calidad de datos
   - Identificación de riesgos
   - Recomendaciones

3. **Matriz de Correspondencia** (Excel)
   - Mapeo de dimensiones entre evaluaciones
   - Equivalencias de subdimensiones
   - Notas de especialista

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Actores no entregan datos | Media | Alto | Acuerdos formales, escalamiento |
| Datos en formatos propietarios | Alta | Medio | Presupuesto para conversión |
| Datos incompletos | Alta | Medio | Documentar gaps, plan de recuperación |

### Criterio de Cierre

✅ **Fase 0 completa cuando:**
- [ ] Se tiene acceso a >80% de las fuentes de datos identificadas
- [ ] Documento de diagnóstico aprobado por stakeholders
- [ ] Matriz de correspondencia validada por experto IDPS
- [ ] Presupuesto ajustado basado en hallazgos

---

## FASE 1: HOMOLOGACIÓN MÍNIMA VIABLE (4-6 semanas)

### Objetivos
1. Implementar pipeline ETL básico
2. Desarrollar algoritmos de matching (exacto + fuzzy)
3. Crear interfaz de revisión humana
4. Homologar conjunto inicial de ítems

### Tareas Detalladas

| Semana | Tarea | Responsable | Horas |
|--------|-------|-------------|-------|
| 1 | Configurar infraestructura base | DevOps | 40 |
| 1-2 | Implementar modelo de datos | Backend | 60 |
| 2-3 | Desarrollar ETL básico | Data Engineer | 70 |
| 3-4 | Implementar matching exacto | ML Engineer | 50 |
| 4 | Implementar fuzzy matching | ML Engineer | 40 |
| 4-5 | Desarrollar API básica | Backend | 60 |
| 5-6 | Crear interfaz de revisión | Frontend | 70 |
| 6 | Pruebas y ajustes | QA | 40 |

### Entregables

1. **Base de datos PostgreSQL** operativa
2. **API REST** con endpoints básicos
3. **Interfaz web** para revisión humana
4. **Pipeline ETL** procesando archivos Excel
5. **Conjunto inicial** de 500 ítems homologados

### Métricas de Éxito

| Métrica | Objetivo | Medición |
|---------|----------|----------|
| Tiempo promedio de homologación | < 5 min/ítem | Dashboard |
| Precisión de matching automático | > 70% | Muestra validada |
| Tasa de revisión manual | < 30% | Reporte semanal |
| Uptime del sistema | > 99% | Monitoreo |

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Matching insuficientemente preciso | Media | Alto | Ajustar umbrales, más training data |
| Rendimiento del sistema | Media | Medio | Optimizar queries, caching |
| Resistencia usuarios a nueva interfaz | Media | Medio | Capacitación, feedback temprano |

### Plan de Rollback

Si el sistema no cumple métricas críticas:
1. Mantener procesos manuales existentes
2. Usar sistema en paralelo (no reemplazo)
3. Escalar a revisión 100% humana si es necesario

### Criterio de Cierre

✅ **Fase 1 completa cuando:**
- [ ] Sistema en producción con usuarios piloto
- [ ] >500 ítems homologados con revisión humana
- [ ] Métricas de éxito alcanzadas por 2 semanas consecutivas
- [ ] Documentación técnica completa

---

## FASE 2: BANCO DE ÍTEMS CONSULTABLE (3-4 semanas)

### Objetivos
1. Implementar búsqueda avanzada de ítems
2. Crear visualizaciones de datos
3. Desarrollar API de consulta pública
4. Documentar metodología

### Tareas Detalladas

| Semana | Tarea | Responsable | Horas |
|--------|-------|-------------|-------|
| 1 | Implementar búsqueda full-text | Backend | 40 |
| 1-2 | Implementar búsqueda semántica | ML Engineer | 50 |
| 2 | Desarrollar filtros avanzados | Frontend | 35 |
| 2-3 | Crear dashboard de estadísticas | Frontend | 50 |
| 3 | Implementar API pública | Backend | 40 |
| 3-4 | Crear documentación de usuario | Technical Writer | 50 |
| 4 | Pruebas de usabilidad | UX/QA | 30 |

### Entregables

1. **Portal de consulta** público
2. **API documentada** con Swagger/OpenAPI
3. **Dashboard** de estadísticas del banco
4. **Manual de usuario** (PDF)

### Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Tiempo de búsqueda | < 2 segundos |
| Precisión de búsqueda semántica | > 80% (top-5) |
| Satisfacción de usuarios | > 4.0/5.0 |
| Documentación completa | 100% endpoints |

### Criterio de Cierre

✅ **Fase 2 completa cuando:**
- [ ] Portal público accesible
- [ ] API con >100 consultas/día
- [ ] Documentación aprobada
- [ ] Usuarios reportan satisfacción >4.0

---

## FASE 3: INTEGRACIÓN DE RESULTADOS LONGITUDINALES (3-4 semanas)

### Objetivos
1. Importar resultados históricos de evaluaciones
2. Generar trayectorias individuales
3. Crear análisis de tendencias
4. Desarrollar reportes longitudinales

### Tareas Detalladas

| Semana | Tarea | Responsable | Horas |
|--------|-------|-------------|-------|
| 1 | Diseñar esquema de resultados | Data Architect | 30 |
| 1-2 | Importar datos históricos | Data Engineer | 60 |
| 2 | Implementar anonimización | Security | 40 |
| 2-3 | Generar trayectorias | Data Scientist | 50 |
| 3 | Crear análisis de tendencias | Data Scientist | 40 |
| 3-4 | Desarrollar reportes | Frontend | 50 |
| 4 | Validar con expertos | Experto IDPS | 30 |

### Entregables

1. **Base de resultados** con datos anonimizados
2. **Motor de trayectorias** funcional
3. **Reportes longitudinales** automatizados
4. **Validación** de metodología

### Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Cobertura de datos históricos | > 90% |
| Precisión de matching estudiantes | > 95% |
| Tiempo de generación de reporte | < 30 seg |
| Validación experta | Aprobado |

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Problemas de privacidad | Baja | Crítico | Revisión legal, anonimización |
| Datos históricos incompletos | Alta | Medio | Documentar limitaciones |

### Criterio de Cierre

✅ **Fase 3 completa cuando:**
- [ ] >90% de datos históricos importados
- [ ] Trayectorias generadas para >100K estudiantes
- [ ] Reportes validados por expertos
- [ ] Aprobación de oficina de protección de datos

---

## FASE 4: AGENTE GENERADOR-CLASIFICADOR (4-5 semanas)

### Objetivos
1. Implementar generación de ítems con LLM
2. Desarrollar clasificación automática de dimensiones
3. Crear sistema de validación de ítems generados
4. Integrar con pipeline de homologación

### Tareas Detalladas

| Semana | Tarea | Responsable | Horas |
|--------|-------|-------------|-------|
| 1 | Evaluar modelos LLM disponibles | ML Engineer | 30 |
| 1-2 | Implementar generación de ítems | ML Engineer | 60 |
| 2-3 | Entrenar clasificador de dimensiones | ML Engineer | 70 |
| 3 | Implementar validación automática | ML Engineer | 40 |
| 3-4 | Integrar con pipeline existente | Backend | 50 |
| 4-5 | Pruebas y ajuste de prompts | ML Engineer | 60 |
| 5 | Documentar capacidades/limitaciones | Technical Writer | 30 |

### Entregables

1. **Agente generador** de ítems funcional
2. **Clasificador** de dimensiones entrenado
3. **Pipeline integrado** ETL + Generación
4. **Guía de uso** del agente

### Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Precisión de clasificación de dimensión | > 85% |
| Calidad de ítems generados (validación experta) | > 70% aprobados |
| Tiempo de generación | < 10 seg/ítem |
| Reducción de esfuerzo manual | > 50% |

### Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Calidad de ítems generados insuficiente | Media | Alto | Fine-tuning, prompts mejorados |
| Costos de API LLM elevados | Media | Medio | Optimización, modelo local |
| Sesgos en generación | Media | Alto | Diversidad en training data |

### Criterio de Cierre

✅ **Fase 4 completa cuando:**
- [ ] Agente genera ítems con >70% aprobación experta
- [ ] Clasificador con >85% precisión
- [ ] Integración completa con pipeline
- [ ] Costos operativos dentro de presupuesto

---

## FASE 5: MEJORA CONTINUA Y GOBERNANZA (Continua)

### Objetivos
1. Establecer proceso de mejora continua
2. Definir gobernanza del sistema
3. Capacitar usuarios y administradores
4. Planificar evolución del sistema

### Tareas Permanentes

| Frecuencia | Tarea | Responsable |
|------------|-------|-------------|
| Mensual | Revisión de métricas | Data Analyst |
| Mensual | Ajuste de umbrales de matching | ML Engineer |
| Trimestral | Actualización de modelos | ML Engineer |
| Trimestral | Revisión de gobernanza | Comité IDPS |
| Semestral | Auditoría de calidad | QA |
| Anual | Planificación de evolución | PM |

### Entregables

1. **Manual de gobernanza** del sistema
2. **Proceso de mejora continua** documentado
3. **Programa de capacitación** establecido
4. **Roadmap** de evolución 2-3 años

### Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Satisfacción de usuarios | > 4.5/5.0 |
| Tiempo de resolución de issues | < 48h críticos |
| Disponibilidad del sistema | > 99.5% |
| Adopción de nuevas funcionalidades | > 70% |

### Criterio de Cierre

✅ **Fase 5 (inicial) completa cuando:**
- [ ] Documento de gobernanza aprobado
- [ ] Comité de gobernanza conformado
- [ ] Capacitación inicial completada
- [ ] Roadmap de evolución aprobado

---

## 9.2 Resumen de Recursos

### Recursos Humanos por Fase

| Fase | Roles | FTE | Duración |
|------|-------|-----|----------|
| 0 | PM, Analista, Data Engineer | 2.5 | 2-3 sem |
| 1 | Full team (8 roles) | 5.0 | 4-6 sem |
| 2 | Backend, Frontend, ML, UX | 3.5 | 3-4 sem |
| 3 | Data Engineer, Data Scientist | 3.0 | 3-4 sem |
| 4 | ML Engineer, Backend | 3.0 | 4-5 sem |
| 5 | Part-time varios roles | 1.5 | Continuo |

### Infraestructura

| Componente | Especificación | Costo Mensual (est.) |
|------------|----------------|---------------------|
| Servidor App | 4 vCPU, 16GB RAM | $150 |
| PostgreSQL | 2 vCPU, 8GB RAM + 500GB | $200 |
| Almacenamiento | 1TB SSD | $100 |
| LLM API | Uso variable | $300-500 |
| Monitoreo | Stack ELK/Prometheus | $50 |

### Dependencias entre Fases

```
FASE 0 ──────────────────────────────────────────────▶
    │                                                  │
    ▼                                                  ▼
FASE 1 ───────┬───────────────────────────────────────▶
    │         │                                        │
    │         ▼                                        ▼
    │    FASE 2 ─────────┬────────────────────────────▶
    │         │          │                             │
    │         │          ▼                             ▼
    │         │     FASE 3 ───────────────────────────▶
    │         │          │                             │
    │         │          ▼                             ▼
    │         │     FASE 4 ───────────────────────────▶
    │         │          │                             │
    └─────────┴──────────┴─────────────────────────────┘
                         │
                         ▼
                    FASE 5 (Continua)
```

---

## 9.3 Conclusión

Este plan de ejecución proporciona una hoja de ruta clara para implementar el Sistema de Homologación Longitudinal IDPS. La aproximación por fases permite:

1. **Entrega de valor temprana** con la homologación mínima viable
2. **Gestión de riesgos** mediante revisiones entre fases
3. **Flexibilidad** para ajustar basado en aprendizajes
4. **Sostenibilidad** con gobernanza y mejora continua

El éxito del proyecto dependerá de:
- Compromiso de stakeholders y actores
- Calidad de los datos históricos
- Adopción por parte de usuarios finales
- Mantenimiento de la infraestructura

---

*Documento generado para el Sistema de Homologación Longitudinal IDPS*
*Versión 1.0.0 - 2024*
