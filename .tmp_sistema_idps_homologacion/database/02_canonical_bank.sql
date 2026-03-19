-- ============================================================================
-- Sistema IDPS - Banco Canonico Longitudinal
-- Complementa el esquema operativo definido en 01_database_schema.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- Secuencias y funciones de identificacion
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS canonical_item_seq START 1;
CREATE SEQUENCE IF NOT EXISTS generated_item_seq START 1;

CREATE OR REPLACE FUNCTION generate_canonical_bank_id(
    p_prefix TEXT,
    p_year INTEGER,
    p_sequence BIGINT
)
RETURNS TEXT AS $$
BEGIN
    RETURN 'IDPS-' || p_prefix || '-' || p_year::TEXT || '-' || LPAD(p_sequence::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION update_canonical_item_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector(
        'spanish',
        COALESCE(NEW.texto_canonico, '') || ' ' || COALESCE(NEW.definicion_operacional, '')
    );
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_canonical_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Modelo canonico
-- ============================================================================

CREATE TABLE IF NOT EXISTS fuente_archivo (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year_data INTEGER NOT NULL CHECK (year_data BETWEEN 2014 AND 2030),
    file_type VARCHAR(30) NOT NULL CHECK (file_type IN ('MATRIZ', 'RESULTADOS', 'OTRO')),
    file_name VARCHAR(255) NOT NULL,
    relative_path TEXT NOT NULL,
    workbook_label VARCHAR(255),
    sheet_count INTEGER,
    file_hash VARCHAR(64),
    size_bytes BIGINT,
    structure_detected JSONB NOT NULL DEFAULT '{}'::jsonb,
    column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    import_status VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (import_status IN ('PENDIENTE', 'EN_PROCESO', 'IMPORTADO', 'ERROR', 'PARCIAL')),
    import_errors TEXT,
    imported_by VARCHAR(200),
    imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (relative_path)
);

CREATE TABLE IF NOT EXISTS usuario_revisor (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) NOT NULL UNIQUE,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'REVISOR'
        CHECK (role IN ('ADMIN', 'REVISOR_SENIOR', 'REVISOR', 'CONSULTA', 'SISTEMA')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_canonico (
    id_canonico VARCHAR(30) PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
    dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE RESTRICT,
    subdimension_id UUID REFERENCES subdimensions(id) ON DELETE SET NULL,
    texto_canonico TEXT NOT NULL,
    texto_normalizado TEXT NOT NULL,
    definicion_operacional TEXT,
    notas_metodologicas TEXT,
    taxonomia_version VARCHAR(30) NOT NULL DEFAULT 'IDPS-2014-2026',
    first_year INTEGER CHECK (first_year BETWEEN 2014 AND 2030),
    last_year INTEGER CHECK (last_year BETWEEN 2014 AND 2030),
    version_actual INTEGER NOT NULL DEFAULT 1,
    estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO'
        CHECK (estado IN ('ACTIVO', 'EN_REVISION', 'DEPRECADO', 'BORRADOR')),
    origen_creacion VARCHAR(30) NOT NULL DEFAULT 'PIPELINE'
        CHECK (origen_creacion IN ('PIPELINE', 'BOOTSTRAP', 'REVISION_MANUAL', 'GENERACION_IA')),
    search_vector TSVECTOR,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(200),
    updated_by VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_canonico_version (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_item_id VARCHAR(30) NOT NULL REFERENCES item_canonico(id_canonico) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    change_type VARCHAR(30) NOT NULL DEFAULT 'CREACION'
        CHECK (change_type IN ('CREACION', 'CORRECCION', 'RECLASIFICACION', 'FUSION', 'DIVISION', 'ACTUALIZACION')),
    change_reason TEXT,
    changed_by VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (canonical_item_id, version_number)
);

CREATE TABLE IF NOT EXISTS item_variante (
    id_variante VARCHAR(40) PRIMARY KEY,
    canonical_item_id VARCHAR(30) NOT NULL REFERENCES item_canonico(id_canonico) ON DELETE CASCADE,
    variant_number INTEGER NOT NULL,
    texto_variante TEXT NOT NULL,
    texto_normalizado TEXT NOT NULL,
    variant_type VARCHAR(30) NOT NULL
        CHECK (variant_type IN ('CANONICA', 'MENOR', 'SUSTANTIVA')),
    change_summary TEXT,
    approval_status VARCHAR(30) NOT NULL DEFAULT 'APROBADA'
        CHECK (approval_status IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'EN_REVISION')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (canonical_item_id, variant_number)
);

CREATE TABLE IF NOT EXISTS item_ocurrencia (
    id_ocurrencia VARCHAR(50) PRIMARY KEY,
    variante_id VARCHAR(40) NOT NULL REFERENCES item_variante(id_variante) ON DELETE CASCADE,
    legacy_item_id UUID REFERENCES items(id) ON DELETE SET NULL,
    source_file_id UUID REFERENCES fuente_archivo(id) ON DELETE SET NULL,
    evaluation_id UUID REFERENCES evaluations(id) ON DELETE SET NULL,
    year_applied INTEGER NOT NULL CHECK (year_applied BETWEEN 2014 AND 2030),
    actor_label VARCHAR(100),
    grade_label VARCHAR(50),
    form_label VARCHAR(100),
    sheet_name VARCHAR(255),
    source_row_number INTEGER,
    question_code VARCHAR(100),
    item_code VARCHAR(100),
    prompt_text TEXT,
    texto_original TEXT NOT NULL,
    texto_normalizado TEXT NOT NULL,
    position_in_form INTEGER,
    decision_taxonomy VARCHAR(40) NOT NULL DEFAULT 'AMBIGUO'
        CHECK (decision_taxonomy IN ('EXACTO', 'EQUIVALENTE_CANONICO', 'VARIANTE_MENOR', 'VARIANTE_SUSTANTIVA', 'DIFERENTE', 'AMBIGUO')),
    processing_status VARCHAR(30) NOT NULL DEFAULT 'IMPORTADO'
        CHECK (processing_status IN ('IMPORTADO', 'HOMOLOGADO', 'EN_REVISION', 'DESCARTADO')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE NULLS NOT DISTINCT (source_file_id, sheet_name, source_row_number)
);

CREATE TABLE IF NOT EXISTS resultado_item (
    id_resultado VARCHAR(60) PRIMARY KEY,
    ocurrencia_id VARCHAR(50) NOT NULL REFERENCES item_ocurrencia(id_ocurrencia) ON DELETE CASCADE,
    legacy_result_id UUID REFERENCES item_result_summaries(id) ON DELETE SET NULL,
    source_file_id UUID REFERENCES fuente_archivo(id) ON DELETE SET NULL,
    year_analysis INTEGER NOT NULL CHECK (year_analysis BETWEEN 2014 AND 2030),
    estimation_method VARCHAR(20) NOT NULL CHECK (estimation_method IN ('CLASICA', 'IRT')),
    methodological_context VARCHAR(200),
    sample_size INTEGER,
    mean_value NUMERIC(10,4),
    std_dev NUMERIC(10,4),
    skewness NUMERIC(10,4),
    kurtosis NUMERIC(10,4),
    cit NUMERIC(10,4),
    missing_pct NUMERIC(10,4),
    irt_a NUMERIC(10,4),
    irt_b NUMERIC(10,4),
    irt_c NUMERIC(10,4),
    irt_information NUMERIC(10,4),
    response_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    methodological_notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS revision_homologacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ocurrencia_origen_id VARCHAR(50) NOT NULL REFERENCES item_ocurrencia(id_ocurrencia) ON DELETE CASCADE,
    canonical_item_proposed_id VARCHAR(30) REFERENCES item_canonico(id_canonico) ON DELETE SET NULL,
    variante_proposed_id VARCHAR(40) REFERENCES item_variante(id_variante) ON DELETE SET NULL,
    automatic_decision VARCHAR(40) NOT NULL
        CHECK (automatic_decision IN ('EXACTO', 'EQUIVALENTE_CANONICO', 'VARIANTE_MENOR', 'VARIANTE_SUSTANTIVA', 'DIFERENTE', 'AMBIGUO')),
    exact_score NUMERIC(6,4),
    fuzzy_score NUMERIC(6,4),
    semantic_score NUMERIC(6,4),
    combined_score NUMERIC(6,4),
    confidence_score NUMERIC(6,4),
    rule_trace JSONB NOT NULL DEFAULT '{}'::jsonb,
    comparison_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
    human_status VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (human_status IN ('PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'ESCALADA')),
    human_decision VARCHAR(40),
    reviewer_id UUID REFERENCES usuario_revisor(id) ON DELETE SET NULL,
    review_notes TEXT,
    consensus_votes JSONB NOT NULL DEFAULT '[]'::jsonb,
    algorithm_version VARCHAR(50),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS item_generado (
    id_item_generado VARCHAR(35) PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL,
    canonical_item_base_id VARCHAR(30) REFERENCES item_canonico(id_canonico) ON DELETE SET NULL,
    requested_actor VARCHAR(100),
    requested_dimension VARCHAR(200),
    requested_subdimension VARCHAR(200),
    purpose TEXT NOT NULL,
    constraints TEXT,
    generated_statement TEXT NOT NULL,
    instruction TEXT,
    prompt_used TEXT,
    context_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_by VARCHAR(200),
    generation_model VARCHAR(100) NOT NULL DEFAULT 'REGLAS_LOCAL',
    status VARCHAR(30) NOT NULL DEFAULT 'BORRADOR'
        CHECK (status IN ('BORRADOR', 'EN_REVISION', 'APROBADO', 'RECHAZADO', 'IMPLEMENTADO')),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS propuesta_clasificacion (
    id_propuesta VARCHAR(45) PRIMARY KEY,
    generated_item_id VARCHAR(35) NOT NULL REFERENCES item_generado(id_item_generado) ON DELETE CASCADE,
    proposal_number INTEGER NOT NULL,
    actor_id UUID REFERENCES actors(id) ON DELETE SET NULL,
    dimension_id UUID REFERENCES dimensions(id) ON DELETE SET NULL,
    subdimension_id UUID REFERENCES subdimensions(id) ON DELETE SET NULL,
    proposal_type VARCHAR(30) NOT NULL
        CHECK (proposal_type IN ('NUEVO', 'VARIANTE', 'REFORMULACION', 'REDUNDANTE')),
    decision_taxonomy VARCHAR(40) NOT NULL
        CHECK (decision_taxonomy IN ('EXACTO', 'EQUIVALENTE_CANONICO', 'VARIANTE_MENOR', 'VARIANTE_SUSTANTIVA', 'DIFERENTE', 'AMBIGUO')),
    confidence_classification NUMERIC(6,4) NOT NULL CHECK (confidence_classification BETWEEN 0 AND 1),
    classification_justification TEXT NOT NULL,
    items_similares_detectados JSONB NOT NULL DEFAULT '[]'::jsonb,
    comparative_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    redundancy_level VARCHAR(20) NOT NULL
        CHECK (redundancy_level IN ('BAJO', 'MEDIO', 'ALTO', 'CRITICO')),
    review_status VARCHAR(30) NOT NULL DEFAULT 'BORRADOR'
        CHECK (review_status IN ('BORRADOR', 'PENDIENTE', 'APROBADA', 'RECHAZADA', 'MODIFICADA')),
    reviewer_id UUID REFERENCES usuario_revisor(id) ON DELETE SET NULL,
    review_notes TEXT,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (generated_item_id, proposal_number)
);

-- ============================================================================
-- Indices
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fuente_archivo_year ON fuente_archivo(year_data);
CREATE INDEX IF NOT EXISTS idx_fuente_archivo_type ON fuente_archivo(file_type);
CREATE INDEX IF NOT EXISTS idx_fuente_archivo_status ON fuente_archivo(import_status);

CREATE INDEX IF NOT EXISTS idx_usuario_revisor_role ON usuario_revisor(role);
CREATE INDEX IF NOT EXISTS idx_usuario_revisor_active ON usuario_revisor(is_active);

CREATE INDEX IF NOT EXISTS idx_item_canonico_actor ON item_canonico(actor_id);
CREATE INDEX IF NOT EXISTS idx_item_canonico_dimension ON item_canonico(dimension_id);
CREATE INDEX IF NOT EXISTS idx_item_canonico_subdimension ON item_canonico(subdimension_id);
CREATE INDEX IF NOT EXISTS idx_item_canonico_estado ON item_canonico(estado);
CREATE INDEX IF NOT EXISTS idx_item_canonico_search_vector ON item_canonico USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_item_canonico_texto_trgm ON item_canonico USING GIN (texto_canonico gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_item_variante_canonical ON item_variante(canonical_item_id);
CREATE INDEX IF NOT EXISTS idx_item_variante_type ON item_variante(variant_type);
CREATE INDEX IF NOT EXISTS idx_item_variante_texto_trgm ON item_variante USING GIN (texto_variante gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_item_ocurrencia_variante ON item_ocurrencia(variante_id);
CREATE INDEX IF NOT EXISTS idx_item_ocurrencia_year ON item_ocurrencia(year_applied);
CREATE INDEX IF NOT EXISTS idx_item_ocurrencia_evaluation ON item_ocurrencia(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_item_ocurrencia_taxonomy ON item_ocurrencia(decision_taxonomy);

CREATE INDEX IF NOT EXISTS idx_resultado_item_ocurrencia ON resultado_item(ocurrencia_id);
CREATE INDEX IF NOT EXISTS idx_resultado_item_year ON resultado_item(year_analysis);
CREATE INDEX IF NOT EXISTS idx_resultado_item_method ON resultado_item(estimation_method);

CREATE INDEX IF NOT EXISTS idx_revision_homologacion_status ON revision_homologacion(human_status);
CREATE INDEX IF NOT EXISTS idx_revision_homologacion_decision ON revision_homologacion(automatic_decision);
CREATE INDEX IF NOT EXISTS idx_revision_homologacion_reviewer ON revision_homologacion(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_item_generado_status ON item_generado(status);
CREATE INDEX IF NOT EXISTS idx_item_generado_request ON item_generado(request_id);

CREATE INDEX IF NOT EXISTS idx_propuesta_clasificacion_status ON propuesta_clasificacion(review_status);
CREATE INDEX IF NOT EXISTS idx_propuesta_clasificacion_redundancy ON propuesta_clasificacion(redundancy_level);
CREATE INDEX IF NOT EXISTS idx_propuesta_clasificacion_confidence ON propuesta_clasificacion(confidence_classification);

-- ============================================================================
-- Triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trg_item_canonico_search_vector ON item_canonico;
CREATE TRIGGER trg_item_canonico_search_vector
    BEFORE INSERT OR UPDATE ON item_canonico
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_item_search_vector();

DROP TRIGGER IF EXISTS trg_usuario_revisor_updated_at ON usuario_revisor;
CREATE TRIGGER trg_usuario_revisor_updated_at
    BEFORE UPDATE ON usuario_revisor
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_timestamp();

DROP TRIGGER IF EXISTS trg_item_variante_updated_at ON item_variante;
CREATE TRIGGER trg_item_variante_updated_at
    BEFORE UPDATE ON item_variante
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_timestamp();

DROP TRIGGER IF EXISTS trg_item_generado_updated_at ON item_generado;
CREATE TRIGGER trg_item_generado_updated_at
    BEFORE UPDATE ON item_generado
    FOR EACH ROW
    EXECUTE FUNCTION update_canonical_timestamp();

-- ============================================================================
-- Vistas operativas del banco
-- ============================================================================

CREATE OR REPLACE VIEW vw_bank_items_search AS
SELECT
    ic.id_canonico,
    ic.texto_canonico,
    ic.estado,
    a.id AS actor_id,
    a.code AS actor_code,
    a.name AS actor_name,
    d.id AS dimension_id,
    d.code AS dimension_code,
    d.name AS dimension_name,
    sd.id AS subdimension_id,
    sd.code AS subdimension_code,
    sd.name AS subdimension_name,
    ic.first_year,
    ic.last_year,
    COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT io.year_applied), NULL), ARRAY[]::INTEGER[]) AS years,
    COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT ri.estimation_method), NULL), ARRAY[]::VARCHAR[]) AS methods,
    COUNT(DISTINCT iv.id_variante) AS total_variants,
    COUNT(DISTINCT io.id_ocurrencia) AS total_occurrences,
    COUNT(DISTINCT ri.id_resultado) AS total_results,
    ic.version_actual,
    ic.metadata
FROM item_canonico ic
JOIN actors a ON a.id = ic.actor_id
JOIN dimensions d ON d.id = ic.dimension_id
LEFT JOIN subdimensions sd ON sd.id = ic.subdimension_id
LEFT JOIN item_variante iv ON iv.canonical_item_id = ic.id_canonico
LEFT JOIN item_ocurrencia io ON io.variante_id = iv.id_variante
LEFT JOIN resultado_item ri ON ri.ocurrencia_id = io.id_ocurrencia
GROUP BY
    ic.id_canonico,
    ic.texto_canonico,
    ic.estado,
    a.id,
    a.code,
    a.name,
    d.id,
    d.code,
    d.name,
    sd.id,
    sd.code,
    sd.name,
    ic.first_year,
    ic.last_year,
    ic.version_actual,
    ic.metadata;

CREATE OR REPLACE VIEW vw_bank_revision_queue AS
SELECT
    rh.id,
    rh.ocurrencia_origen_id,
    rh.automatic_decision,
    rh.human_status,
    rh.confidence_score,
    rh.combined_score,
    rh.requires_human_review,
    rh.created_at,
    rh.reviewed_at,
    rh.review_notes,
    io.year_applied,
    io.question_code,
    io.texto_original,
    ic.id_canonico AS canonical_item_id,
    ic.texto_canonico,
    ur.username AS reviewer_username
FROM revision_homologacion rh
JOIN item_ocurrencia io ON io.id_ocurrencia = rh.ocurrencia_origen_id
LEFT JOIN item_canonico ic ON ic.id_canonico = rh.canonical_item_proposed_id
LEFT JOIN usuario_revisor ur ON ur.id = rh.reviewer_id;

-- ============================================================================
-- Bootstrap desde el modelo operativo actual
-- ============================================================================

INSERT INTO usuario_revisor (username, full_name, email, role, permissions, metadata)
VALUES
    ('idps', 'Usuario Interno IDPS', 'idps@interno.local', 'ADMIN', '["bank:read","bank:write","bank:review"]'::jsonb, '{"seed": true}'::jsonb),
    ('sistema', 'Proceso Automatico IDPS', 'sistema@interno.local', 'SISTEMA', '["bank:bootstrap"]'::jsonb, '{"seed": true}'::jsonb)
ON CONFLICT (username) DO NOTHING;

INSERT INTO item_canonico (
    id_canonico,
    actor_id,
    dimension_id,
    subdimension_id,
    texto_canonico,
    texto_normalizado,
    first_year,
    last_year,
    estado,
    origen_creacion,
    metadata,
    created_by,
    updated_by
)
SELECT
    'IDPS-CAN-' || COALESCE(e.year_start::TEXT, TO_CHAR(CURRENT_DATE, 'YYYY')) || '-' ||
        LPAD(COALESCE(NULLIF(SPLIT_PART(i.canonical_id, '-', 3), ''), RIGHT(REPLACE(i.id::TEXT, '-', ''), 6)), 6, '0'),
    e.actor_id,
    i.dimension_id,
    i.subdimension_id,
    i.statement,
    LOWER(TRIM(REGEXP_REPLACE(TRANSLATE(i.statement, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), '[^A-Za-z0-9 ]', ' ', 'g'))),
    e.year_start,
    COALESCE(e.year_end, e.year_start),
    CASE
        WHEN i.status = 'OBSOLETO' THEN 'DEPRECADO'
        WHEN i.status = 'EN_REVISION' THEN 'EN_REVISION'
        ELSE 'ACTIVO'
    END,
    'BOOTSTRAP',
    jsonb_build_object('legacy_item_id', i.id, 'legacy_canonical_id', i.canonical_id, 'bootstrap', true),
    'sistema',
    'sistema'
FROM items i
JOIN evaluations e ON e.id = i.evaluation_id
WHERE NOT EXISTS (
    SELECT 1
    FROM item_canonico ic
    WHERE ic.metadata ->> 'legacy_item_id' = i.id::TEXT
);

INSERT INTO item_canonico_version (
    canonical_item_id,
    version_number,
    snapshot,
    change_type,
    change_reason,
    changed_by
)
SELECT
    ic.id_canonico,
    1,
    jsonb_build_object(
        'texto_canonico', ic.texto_canonico,
        'actor_id', ic.actor_id,
        'dimension_id', ic.dimension_id,
        'subdimension_id', ic.subdimension_id,
        'estado', ic.estado
    ),
    'CREACION',
    'Bootstrap desde items operativos',
    'sistema'
FROM item_canonico ic
WHERE NOT EXISTS (
    SELECT 1
    FROM item_canonico_version icv
    WHERE icv.canonical_item_id = ic.id_canonico
      AND icv.version_number = 1
);

INSERT INTO item_variante (
    id_variante,
    canonical_item_id,
    variant_number,
    texto_variante,
    texto_normalizado,
    variant_type,
    change_summary,
    approval_status,
    metadata,
    created_by
)
SELECT
    REPLACE(ic.id_canonico, 'CAN', 'VAR') || '-001',
    ic.id_canonico,
    1,
    ic.texto_canonico,
    ic.texto_normalizado,
    'CANONICA',
    'Variante base creada desde bootstrap operativo',
    'APROBADA',
    jsonb_build_object('bootstrap', true, 'legacy_item_id', ic.metadata ->> 'legacy_item_id'),
    'sistema'
FROM item_canonico ic
WHERE NOT EXISTS (
    SELECT 1 FROM item_variante iv WHERE iv.canonical_item_id = ic.id_canonico AND iv.variant_number = 1
);

WITH legacy_occurrences AS (
    SELECT
        i.id AS legacy_item_id,
        i.original_id,
        i.statement,
        i.created_at,
        e.id AS evaluation_id,
        e.year_start AS year_applied,
        e.code AS evaluation_code,
        COALESCE(i.extra_metadata ->> 'actor', a.name) AS actor_label,
        ic.id_canonico,
        iv.id_variante,
        ROW_NUMBER() OVER (
            PARTITION BY iv.id_variante, e.year_start
            ORDER BY i.created_at, i.id
        ) AS occurrence_number
    FROM items i
    JOIN evaluations e ON e.id = i.evaluation_id
    JOIN actors a ON a.id = e.actor_id
    JOIN item_canonico ic ON ic.metadata ->> 'legacy_item_id' = i.id::TEXT
    JOIN item_variante iv ON iv.canonical_item_id = ic.id_canonico AND iv.variant_number = 1
)
INSERT INTO item_ocurrencia (
    id_ocurrencia,
    variante_id,
    legacy_item_id,
    evaluation_id,
    year_applied,
    actor_label,
    grade_label,
    form_label,
    question_code,
    item_code,
    texto_original,
    texto_normalizado,
    decision_taxonomy,
    processing_status,
    metadata
)
SELECT
    REPLACE(lo.id_variante, 'VAR', 'OCC') || '-' || lo.year_applied::TEXT || '-' || LPAD(lo.occurrence_number::TEXT, 3, '0'),
    lo.id_variante,
    lo.legacy_item_id,
    lo.evaluation_id,
    lo.year_applied,
    lo.actor_label,
    NULL,
    lo.evaluation_code,
    lo.original_id,
    lo.original_id,
    lo.statement,
    LOWER(TRIM(REGEXP_REPLACE(TRANSLATE(lo.statement, 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn'), '[^A-Za-z0-9 ]', ' ', 'g'))),
    'EXACTO',
    'HOMOLOGADO',
    jsonb_build_object('bootstrap', true, 'legacy_item_id', lo.legacy_item_id)
FROM legacy_occurrences lo
WHERE NOT EXISTS (
    SELECT 1 FROM item_ocurrencia io WHERE io.legacy_item_id = lo.legacy_item_id
);

INSERT INTO resultado_item (
    id_resultado,
    ocurrencia_id,
    legacy_result_id,
    year_analysis,
    estimation_method,
    methodological_context,
    mean_value,
    std_dev,
    kurtosis,
    cit,
    missing_pct,
    irt_a,
    irt_b,
    irt_information,
    response_distribution,
    metrics,
    methodological_notes,
    metadata
)
SELECT
    REPLACE(io.id_ocurrencia, 'OCC', 'RES') || '-' || UPPER(irs.calculation_method),
    io.id_ocurrencia,
    irs.id,
    irs.year,
    UPPER(irs.calculation_method),
    CASE
        WHEN UPPER(irs.calculation_method) = 'IRT' THEN 'Resultados longitudinales estimados con enfoque IRT'
        ELSE 'Resultados descriptivos historicos con teoria clasica'
    END,
    NULLIF(irs.metrics ->> 'mean', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'sd', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'kurtosis', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'cit', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'missing_pct', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'irt_a', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'irt_b', '')::NUMERIC,
    NULLIF(irs.metrics ->> 'irt_information', '')::NUMERIC,
    (
        SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
        FROM jsonb_each(irs.metrics) e(key, value)
        WHERE key LIKE 'pctje_%'
    ),
    irs.metrics,
    irs.notes,
    jsonb_build_object('bootstrap', true, 'legacy_result_summary_id', irs.id)
FROM item_result_summaries irs
JOIN item_ocurrencia io ON io.legacy_item_id = irs.item_id
WHERE NOT EXISTS (
    SELECT 1 FROM resultado_item ri WHERE ri.legacy_result_id = irs.id
);

INSERT INTO revision_homologacion (
    ocurrencia_origen_id,
    canonical_item_proposed_id,
    automatic_decision,
    exact_score,
    fuzzy_score,
    semantic_score,
    combined_score,
    confidence_score,
    rule_trace,
    comparison_evidence,
    requires_human_review,
    human_status,
    review_notes,
    algorithm_version,
    metadata
)
SELECT
    io.id_ocurrencia,
    ic.id_canonico,
    CASE
        WHEN ha.decision::TEXT = 'MATCH_EXACTO' THEN 'EXACTO'
        WHEN ha.decision::TEXT = 'MATCH_FUZZY_ALTO' THEN 'VARIANTE_MENOR'
        WHEN ha.decision::TEXT = 'MATCH_SEMANTICO_ALTO' THEN 'EQUIVALENTE_CANONICO'
        WHEN ha.decision::TEXT = 'NUEVO_ITEM' THEN 'DIFERENTE'
        ELSE 'AMBIGUO'
    END,
    ha.exact_match_score,
    ha.fuzzy_match_score,
    ha.semantic_match_score,
    ha.combined_score,
    CASE ha.confidence::TEXT
        WHEN 'MUY_ALTA' THEN 0.98
        WHEN 'ALTA' THEN 0.90
        WHEN 'MEDIA' THEN 0.75
        WHEN 'BAJA' THEN 0.55
        ELSE 0.35
    END,
    jsonb_build_object('legacy_attempt_id', ha.id, 'legacy_decision', ha.decision),
    jsonb_build_array(
        jsonb_build_object(
            'legacy_candidate_item_id', ha.candidate_item_id,
            'decision_reason', ha.decision_reason
        )
    ),
    TRUE,
    CASE
        WHEN rt.status::TEXT = 'COMPLETADA' THEN 'APROBADA'
        WHEN rt.status::TEXT = 'EN_PROGRESO' THEN 'EN_REVISION'
        ELSE 'PENDIENTE'
    END,
    COALESCE(rt.notes, ha.review_notes, ha.decision_reason),
    'legacy-bootstrap-1.0',
    jsonb_build_object('legacy_attempt_id', ha.id, 'legacy_task_id', rt.id, 'bootstrap', true)
FROM homologation_attempts ha
JOIN item_ocurrencia io ON io.legacy_item_id = ha.source_item_id
LEFT JOIN item_ocurrencia io_candidate ON io_candidate.legacy_item_id = ha.candidate_item_id
LEFT JOIN item_variante iv ON iv.id_variante = io_candidate.variante_id
LEFT JOIN item_canonico ic ON ic.id_canonico = iv.canonical_item_id
LEFT JOIN revision_tasks rt ON rt.attempt_id = ha.id
WHERE NOT EXISTS (
    SELECT 1
    FROM revision_homologacion rh
    WHERE rh.metadata ->> 'legacy_attempt_id' = ha.id::TEXT
);

INSERT INTO item_generado (
    id_item_generado,
    request_id,
    requested_actor,
    requested_dimension,
    requested_subdimension,
    purpose,
    constraints,
    generated_statement,
    instruction,
    context_snapshot,
    generated_by,
    generation_model,
    status,
    metadata
)
SELECT
    'IDPS-GEN-' || TO_CHAR(gip.created_at, 'YYYY') || '-' ||
        LPAD(NEXTVAL('generated_item_seq')::TEXT, 6, '0'),
    gip.request_id,
    gip.actor_suggested,
    gip.dimension_suggested,
    gip.subdimension_suggested,
    COALESCE(gip.extra_metadata ->> 'purpose', gip.classification_justification, gip.statement),
    gip.redundancy_analysis ->> 'constraints',
    gip.statement,
    gip.instruction,
    gip.similar_items,
    gip.requested_by,
    'REGLAS_LOCAL',
    CASE gip.status
        WHEN 'APROBADO' THEN 'APROBADO'
        WHEN 'RECHAZADO' THEN 'RECHAZADO'
        WHEN 'EN_REVISION' THEN 'EN_REVISION'
        ELSE 'BORRADOR'
    END,
    jsonb_build_object('legacy_generated_proposal_id', gip.id, 'bootstrap', true)
FROM generated_item_proposals gip
WHERE NOT EXISTS (
    SELECT 1
    FROM item_generado ig
    WHERE ig.metadata ->> 'legacy_generated_proposal_id' = gip.id::TEXT
);

INSERT INTO propuesta_clasificacion (
    id_propuesta,
    generated_item_id,
    proposal_number,
    actor_id,
    dimension_id,
    subdimension_id,
    proposal_type,
    decision_taxonomy,
    confidence_classification,
    classification_justification,
    items_similares_detectados,
    comparative_evidence,
    redundancy_level,
    review_status,
    review_notes,
    metadata
)
SELECT
    REPLACE(ig.id_item_generado, 'GEN', 'PCL') || '-001',
    ig.id_item_generado,
    1,
    a.id,
    d.id,
    sd.id,
    gip.proposal_type,
    CASE
        WHEN gip.proposal_type = 'REDUNDANTE' THEN 'EXACTO'
        WHEN gip.proposal_type = 'REFORMULACION' THEN 'VARIANTE_SUSTANTIVA'
        WHEN gip.proposal_type = 'VARIANTE' THEN 'VARIANTE_MENOR'
        ELSE 'DIFERENTE'
    END,
    COALESCE(gip.confidence_score, 0.5),
    COALESCE(gip.classification_justification, 'Clasificacion provisional heredada del modulo operativo'),
    COALESCE(gip.similar_items, '[]'::jsonb),
    COALESCE(gip.redundancy_analysis, '{}'::jsonb),
    COALESCE(gip.redundancy_level, 'MEDIO'),
    CASE gip.status
        WHEN 'APROBADO' THEN 'APROBADA'
        WHEN 'RECHAZADO' THEN 'RECHAZADA'
        WHEN 'EN_REVISION' THEN 'PENDIENTE'
        ELSE 'BORRADOR'
    END,
    gip.review_notes,
    jsonb_build_object('legacy_generated_proposal_id', gip.id, 'bootstrap', true)
FROM generated_item_proposals gip
JOIN item_generado ig ON ig.metadata ->> 'legacy_generated_proposal_id' = gip.id::TEXT
LEFT JOIN actors a ON LOWER(a.name) = LOWER(gip.actor_suggested) OR LOWER(a.code) = LOWER(gip.actor_suggested)
LEFT JOIN dimensions d ON LOWER(d.name) = LOWER(gip.dimension_suggested) OR LOWER(d.code) = LOWER(gip.dimension_suggested)
LEFT JOIN subdimensions sd ON d.id = sd.dimension_id AND (
    LOWER(sd.name) = LOWER(COALESCE(gip.subdimension_suggested, ''))
    OR LOWER(sd.code) = LOWER(COALESCE(gip.subdimension_suggested, ''))
)
WHERE NOT EXISTS (
    SELECT 1
    FROM propuesta_clasificacion pc
    WHERE pc.metadata ->> 'legacy_generated_proposal_id' = gip.id::TEXT
);
