-- =============================================================================
-- SISTEMA DE HOMOLOGACIÓN LONGITUDINAL IDPS
-- Esquema SQL Inicial - PostgreSQL 15+
-- =============================================================================
-- Autor: Sistema IDPS
-- Versión: 1.0.0
-- Fecha: 2024
-- =============================================================================

-- =============================================================================
-- 1. EXTENSIONES REQUERIDAS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Para búsquedas fuzzy
CREATE EXTENSION IF NOT EXISTS "vector";   -- Para embeddings (pgvector)

-- =============================================================================
-- 2. ENUMERACIONES
-- =============================================================================

CREATE TYPE actor_type AS ENUM (
    'MINEDUC',
    'DEMRE',
    'AGENCIA_EVALUACION',
    'UNIVERSIDAD',
    'CENTRO_ESTUDIOS',
    'INTERNACIONAL'
);

CREATE TYPE evaluation_type AS ENUM (
    'SIMCE',
    'PAES',
    'ICFES',
    'PISA',
    'PIRLS',
    'TIMSS',
    'OTRA_NACIONAL',
    'OTRA_INTERNACIONAL'
);

CREATE TYPE item_status AS ENUM (
    'BORRADOR',
    'PENDIENTE_HOMOLOGACION',
    'EN_REVISION',
    'HOMOLOGADO',
    'RECHAZADO',
    'OBSOLETO'
);

CREATE TYPE match_decision AS ENUM (
    'MATCH_EXACTO',
    'MATCH_FUZZY_ALTO',
    'MATCH_SEMANTICO_ALTO',
    'REVISION_MANUAL',
    'NUEVO_ITEM',
    'DESCARTAR'
);

CREATE TYPE revision_status AS ENUM (
    'PENDIENTE',
    'EN_PROGRESO',
    'COMPLETADA',
    'ESCALADA'
);

CREATE TYPE confidence_level AS ENUM (
    'MUY_ALTA',    -- > 0.95
    'ALTA',        -- 0.85 - 0.95
    'MEDIA',       -- 0.70 - 0.85
    'BAJA',        -- 0.50 - 0.70
    'MUY_BAJA'     -- < 0.50
);

CREATE TYPE agent_status AS ENUM (
    'INACTIVO',
    'PROCESANDO',
    'ESPERANDO_REVISION',
    'COMPLETADO',
    'ERROR'
);

-- =============================================================================
-- 3. TABLAS PRINCIPALES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 ACTORES (Organizaciones que generan evaluaciones)
-- -----------------------------------------------------------------------------
CREATE TABLE actors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    type actor_type NOT NULL,
    description TEXT,
    contact_email VARCHAR(100),
    contact_phone VARCHAR(30),
    website VARCHAR(200),
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.2 EVALUACIONES (Pruebas/Evaluaciones específicas)
-- -----------------------------------------------------------------------------
CREATE TABLE evaluations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(300) NOT NULL,
    type evaluation_type NOT NULL,
    year_start INTEGER NOT NULL CHECK (year_start >= 1990 AND year_start <= 2100),
    year_end INTEGER CHECK (year_end IS NULL OR (year_end >= year_start AND year_end <= 2100)),
    description TEXT,
    target_population VARCHAR(200),
    is_longitudinal BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.3 DIMENSIONES IDPS
-- -----------------------------------------------------------------------------
CREATE TABLE dimensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    weight DECIMAL(3,2) CHECK (weight >= 0 AND weight <= 1),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.4 SUBDIMENSIONES IDPS
-- -----------------------------------------------------------------------------
CREATE TABLE subdimensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE RESTRICT,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    weight DECIMAL(3,2) CHECK (weight >= 0 AND weight <= 1),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(dimension_id, code)
);

-- -----------------------------------------------------------------------------
-- 3.5 ÍTEMS (Preguntas/Ítems de evaluación)
-- -----------------------------------------------------------------------------
CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificación
    canonical_id VARCHAR(50) UNIQUE,  -- ID canónico generado por el sistema
    original_id VARCHAR(100),          -- ID original del actor
    
    -- Relaciones
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    dimension_id UUID REFERENCES dimensions(id) ON DELETE SET NULL,
    subdimension_id UUID REFERENCES subdimensions(id) ON DELETE SET NULL,
    
    -- Contenido
    statement TEXT NOT NULL,           -- Enunciado del ítem
    options JSONB,                     -- Opciones de respuesta
    correct_answer VARCHAR(500),       -- Respuesta correcta
    explanation TEXT,                  -- Explicación/justificación
    
    -- Metadatos del ítem
    item_type VARCHAR(50),             -- Tipo: selección múltiple, verdadero/falso, etc.
    difficulty DECIMAL(3,2),           -- Dificultad estimada (0-1)
    discrimination DECIMAL(3,2),       -- Discriminación
    
    -- Estado
    status item_status DEFAULT 'BORRADOR',
    
    -- Homologación
    homologated_to UUID REFERENCES items(id) ON DELETE SET NULL,
    homologation_confidence DECIMAL(4,3),
    homologation_method VARCHAR(50),
    homologated_at TIMESTAMP WITH TIME ZONE,
    homologated_by UUID,
    
    -- Embeddings para matching semántico
    embedding VECTOR(1536),            -- Dimensión compatible con OpenAI
    
    -- Metadatos adicionales
    metadata JSONB DEFAULT '{}',
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    updated_by UUID
);

-- -----------------------------------------------------------------------------
-- 3.6 HISTORIAL DE VERSIONES DE ÍTEMS
-- -----------------------------------------------------------------------------
CREATE TABLE item_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    statement TEXT NOT NULL,
    options JSONB,
    correct_answer VARCHAR(500),
    explanation TEXT,
    dimension_id UUID REFERENCES dimensions(id),
    subdimension_id UUID REFERENCES subdimensions(id),
    change_description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    UNIQUE(item_id, version_number)
);

-- -----------------------------------------------------------------------------
-- 3.7 INTENTOS DE HOMOLOGACIÓN
-- -----------------------------------------------------------------------------
CREATE TABLE homologation_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Ítem fuente (el que se intenta homologar)
    source_item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    
    -- Ítem candidato (el potencial match)
    candidate_item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    
    -- Scores de matching
    exact_match_score DECIMAL(4,3),
    fuzzy_match_score DECIMAL(4,3),
    semantic_match_score DECIMAL(4,3),
    combined_score DECIMAL(4,3),
    confidence confidence_level,
    
    -- Decisión
    decision match_decision,
    decision_reason TEXT,
    
    -- Revisión humana
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    
    -- Estado
    status revision_status DEFAULT 'PENDIENTE',
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.8 TAREAS DE REVISIÓN HUMANA
-- -----------------------------------------------------------------------------
CREATE TABLE revision_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Referencia al intento de homologación
    attempt_id UUID REFERENCES homologation_attempts(id) ON DELETE CASCADE,
    
    -- Tipo de revisión
    revision_type VARCHAR(50) NOT NULL,  -- 'HOMOLOGACION', 'CLASIFICACION', 'GENERACION'
    
    -- Prioridad
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    
    -- Asignación
    assigned_to UUID,
    assigned_at TIMESTAMP WITH TIME ZONE,
    
    -- Estado
    status revision_status DEFAULT 'PENDIENTE',
    
    -- Fechas
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Resultado
    result JSONB,
    
    -- Notas
    notes TEXT,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.9 RESULTADOS DE EVALUACIÓN (Datos longitudinales)
-- -----------------------------------------------------------------------------
CREATE TABLE evaluation_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificación del estudiante (anónimo)
    student_hash VARCHAR(64) NOT NULL,  -- Hash del identificador original
    
    -- Evaluación
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    
    -- Aplicación específica
    application_date DATE NOT NULL,
    application_code VARCHAR(50),
    
    -- Resultados por dimensión
    dimension_scores JSONB,  -- {dimension_id: score}
    
    -- Resultado global
    total_score DECIMAL(5,2),
    percentile INTEGER CHECK (percentile >= 0 AND percentile <= 100),
    
    -- Metadatos
    metadata JSONB DEFAULT '{}',
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.10 RESPUESTAS A ÍTEMS INDIVIDUALES
-- -----------------------------------------------------------------------------
CREATE TABLE item_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Referencias
    result_id UUID NOT NULL REFERENCES evaluation_results(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    
    -- Respuesta
    response_value VARCHAR(500),
    is_correct BOOLEAN,
    score DECIMAL(5,2),
    response_time_seconds INTEGER,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.11 TRAYECTORIAS LONGITUDINALES
-- -----------------------------------------------------------------------------
CREATE TABLE student_trajectories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identificación del estudiante
    student_hash VARCHAR(64) UNIQUE NOT NULL,
    
    -- Período de seguimiento
    first_evaluation_id UUID REFERENCES evaluations(id),
    last_evaluation_id UUID REFERENCES evaluations(id),
    years_followed INTEGER,
    
    -- Evolución por dimensión
    dimension_progression JSONB,  -- {dimension_id: [{year, score, trend}]}
    
    -- Clasificación de trayectoria
    trajectory_type VARCHAR(50),  -- 'ASCENDENTE', 'ESTABLE', 'DESCENDENTE', 'IRREGULAR'
    
    -- Metadatos
    metadata JSONB DEFAULT '{}',
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.12 RESULTADOS RESUMIDOS POR ITEM (Descriptivos e IRT)
-- -----------------------------------------------------------------------------
CREATE TABLE item_result_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK (year BETWEEN 2014 AND 2030),
    calculation_method VARCHAR(20) NOT NULL
        CHECK (calculation_method IN ('CLASICA', 'IRT', 'MIXTO', 'DESCRIPTIVO')),
    source_file VARCHAR(255),
    source_sheet VARCHAR(255),
    question_code VARCHAR(100),
    actor_label VARCHAR(100),
    grade_label VARCHAR(50),
    form_label VARCHAR(50),
    indicator_code VARCHAR(100),
    dimension_label VARCHAR(200),
    subdimension_label VARCHAR(200),
    prompt_text TEXT,
    item_text TEXT,
    metrics JSONB DEFAULT '{}',
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.13 PROPUESTAS DE ITEMS GENERADOS
-- -----------------------------------------------------------------------------
CREATE TABLE generated_item_proposals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(50) NOT NULL,
    statement TEXT NOT NULL,
    instruction TEXT,
    actor_suggested VARCHAR(100) NOT NULL,
    dimension_suggested VARCHAR(200) NOT NULL,
    subdimension_suggested VARCHAR(200),
    indicator_suggested VARCHAR(200),
    response_options JSONB DEFAULT '[]',
    proposal_type VARCHAR(30) NOT NULL
        CHECK (proposal_type IN ('NUEVO', 'VARIANTE', 'REFORMULACION', 'REDUNDANTE')),
    redundancy_level VARCHAR(20) NOT NULL
        CHECK (redundancy_level IN ('BAJO', 'MEDIO', 'ALTO')),
    confidence_score DECIMAL(4,3) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
    classification_justification TEXT,
    redundancy_analysis JSONB DEFAULT '{}',
    similar_items JSONB DEFAULT '[]',
    validation_result JSONB DEFAULT '{}',
    status VARCHAR(30) NOT NULL DEFAULT 'BORRADOR'
        CHECK (status IN ('BORRADOR', 'EN_REVISION', 'APROBADO', 'RECHAZADO')),
    requested_by VARCHAR(200),
    reviewed_by VARCHAR(200),
    review_notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.12 EJECUCIONES DEL AGENTE
-- -----------------------------------------------------------------------------
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Tipo de ejecución
    execution_type VARCHAR(50) NOT NULL,  -- 'HOMOLOGACION', 'CLASIFICACION', 'GENERACION'
    
    -- Estado
    status agent_status DEFAULT 'INACTIVO',
    
    -- Progreso
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    
    -- Configuración
    configuration JSONB DEFAULT '{}',
    
    -- Resultados
    results_summary JSONB DEFAULT '{}',
    
    -- Errores
    error_log TEXT,
    
    -- Tiempos
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Auditoría
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.13 LOG DE ACTIVIDAD
-- -----------------------------------------------------------------------------
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Usuario/Entidad que realiza la acción
    actor_id UUID,
    actor_type VARCHAR(50) DEFAULT 'USER',
    
    -- Acción
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    
    -- Detalles
    description TEXT,
    old_values JSONB,
    new_values JSONB,
    
    -- IP y user agent (para auditoría de seguridad)
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3.14 CONFIGURACIÓN DEL SISTEMA
-- -----------------------------------------------------------------------------
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_editable BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================================================
-- 4. ÍNDICES PARA OPTIMIZACIÓN
-- =============================================================================

-- Índices para búsquedas frecuentes
CREATE INDEX idx_items_evaluation ON items(evaluation_id);
CREATE INDEX idx_items_dimension ON items(dimension_id);
CREATE INDEX idx_items_subdimension ON items(subdimension_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_canonical_id ON items(canonical_id);
CREATE INDEX idx_items_original_id ON items(original_id);

-- Índices para matching
CREATE INDEX idx_items_embedding ON items USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_items_statement_trgm ON items USING gin (statement gin_trgm_ops);

-- Índices para homologación
CREATE INDEX idx_homologation_source ON homologation_attempts(source_item_id);
CREATE INDEX idx_homologation_candidate ON homologation_attempts(candidate_item_id);
CREATE INDEX idx_homologation_status ON homologation_attempts(status);
CREATE INDEX idx_homologation_decision ON homologation_attempts(decision);

-- Índices para resultados longitudinales
CREATE INDEX idx_results_student ON evaluation_results(student_hash);
CREATE INDEX idx_results_evaluation ON evaluation_results(evaluation_id);
CREATE INDEX idx_results_application ON evaluation_results(application_date);
CREATE INDEX idx_item_result_summaries_item ON item_result_summaries(item_id);
CREATE INDEX idx_item_result_summaries_eval ON item_result_summaries(evaluation_id);
CREATE INDEX idx_item_result_summaries_year ON item_result_summaries(year);
CREATE INDEX idx_item_result_summaries_method ON item_result_summaries(calculation_method);
CREATE INDEX idx_trajectories_student ON student_trajectories(student_hash);

-- Índices para revisiones
CREATE INDEX idx_revision_tasks_status ON revision_tasks(status);
CREATE INDEX idx_revision_tasks_assigned ON revision_tasks(assigned_to);
CREATE INDEX idx_revision_tasks_priority ON revision_tasks(priority);
CREATE INDEX idx_generated_item_proposals_status ON generated_item_proposals(status);
CREATE INDEX idx_generated_item_proposals_actor ON generated_item_proposals(actor_suggested);
CREATE INDEX idx_generated_item_proposals_dimension ON generated_item_proposals(dimension_suggested);
CREATE INDEX idx_generated_item_proposals_type ON generated_item_proposals(proposal_type);

-- Índices para logs
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);

-- =============================================================================
-- 5. FUNCIONES AUXILIARES
-- =============================================================================

-- Función para actualizar timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_actors_updated_at BEFORE UPDATE ON actors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_evaluations_updated_at BEFORE UPDATE ON evaluations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_homologation_attempts_updated_at BEFORE UPDATE ON homologation_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_revision_tasks_updated_at BEFORE UPDATE ON revision_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_student_trajectories_updated_at BEFORE UPDATE ON student_trajectories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_generated_item_proposals_updated_at BEFORE UPDATE ON generated_item_proposals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para generar canonical_id
CREATE OR REPLACE FUNCTION generate_canonical_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.canonical_id IS NULL THEN
        NEW.canonical_id := 'IDPS-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                           LPAD(NEXTVAL('items_canonical_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Secuencia para canonical_id
CREATE SEQUENCE IF NOT EXISTS items_canonical_seq START 1;

-- Trigger para generar canonical_id
CREATE TRIGGER generate_item_canonical_id BEFORE INSERT ON items
    FOR EACH ROW EXECUTE FUNCTION generate_canonical_id();

-- Función para calcular nivel de confianza
CREATE OR REPLACE FUNCTION calculate_confidence_level(score DECIMAL)
RETURNS confidence_level AS $$
BEGIN
    IF score > 0.95 THEN
        RETURN 'MUY_ALTA';
    ELSIF score > 0.85 THEN
        RETURN 'ALTA';
    ELSIF score > 0.70 THEN
        RETURN 'MEDIA';
    ELSIF score > 0.50 THEN
        RETURN 'BAJA';
    ELSE
        RETURN 'MUY_BAJA';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Función para búsqueda semántica de ítems similares
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

-- Función para búsqueda fuzzy de ítems
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

-- =============================================================================
-- 6. DATOS INICIALES
-- =============================================================================

-- Actores principales del sistema educativo chileno
INSERT INTO actors (code, name, type, description, contact_email, website, is_active) VALUES
('MINEDUC', 'Ministerio de Educación de Chile', 'MINEDUC', 
 'Entidad rectora de la educación en Chile. Responsable de las políticas educativas nacionales.', 
 'contacto@mineduc.cl', 'https://www.mineduc.cl', TRUE),

('DEMRE', 'Departamento de Evaluación, Medición y Registro Educacional', 'DEMRE',
 'Unidad del Ministerio de Educación encargada de la evaluación educacional y admisión universitaria.',
 'demre@demre.cl', 'https://www.demre.cl', TRUE),

('AGENCIA_EDU', 'Agencia de Calidad de la Educación', 'AGENCIA_EVALUACION',
 'Entidad encargada de la evaluación y fiscalización de la calidad educativa.',
 'contacto@agenciaeducacion.cl', 'https://www.agenciaeducacion.cl', TRUE),

('SIMCE', 'Sistema de Medición de la Calidad de la Educación', 'AGENCIA_EVALUACION',
 'Sistema nacional de evaluación del aprendizaje de estudiantes chilenos.',
 'simce@simce.cl', 'https://www.simce.cl', TRUE),

('OECD', 'Organización para la Cooperación y el Desarrollo Económicos', 'INTERNACIONAL',
 'Organización internacional que coordina evaluaciones PISA.',
 'contact@oecd.org', 'https://www.oecd.org', TRUE),

('IEA', 'Asociación Internacional para la Evaluación del Logro Educativo', 'INTERNACIONAL',
 'Organización internacional que coordina evaluaciones PIRLS y TIMSS.',
 'info@iea.nl', 'https://www.iea.nl', TRUE),

('ICFES', 'Instituto Colombiano para la Evaluación de la Educación', 'INTERNACIONAL',
 'Entidad colombiana responsable de evaluaciones educativas nacionales.',
 'contacto@icfes.gov.co', 'https://www.icfes.gov.co', TRUE);

-- Evaluaciones principales
INSERT INTO evaluations (actor_id, code, name, type, year_start, year_end, description, target_population, is_longitudinal, is_active) 
SELECT 
    a.id,
    e.code,
    e.name,
    e.type::evaluation_type,
    e.year_start,
    e.year_end,
    e.description,
    e.target_population,
    e.is_longitudinal,
    e.is_active
FROM (
    VALUES
    ('DEMRE', 'PAES-2024', 'Prueba de Acceso a la Educación Superior 2024', 'PAES', 2024, NULL, 'Nueva prueba de acceso universitario que reemplaza a la PSU', 'Estudiantes de 4to medio', FALSE, TRUE),
    ('SIMCE', 'SIMCE-4B-2024', 'SIMCE 4to Básico 2024', 'SIMCE', 2024, NULL, 'Evaluación de estudiantes de 4to básico en competencias ciudadanas', 'Estudiantes de 4to básico', TRUE, TRUE),
    ('SIMCE', 'SIMCE-2M-2024', 'SIMCE 2do Medio 2024', 'SIMCE', 2024, NULL, 'Evaluación de estudiantes de 2do medio en competencias ciudadanas', 'Estudiantes de 2do medio', TRUE, TRUE),
    ('OECD', 'PISA-2022', 'Programme for International Student Assessment 2022', 'PISA', 2022, NULL, 'Evaluación internacional de estudiantes de 15 años', 'Estudiantes de 15 años', TRUE, TRUE),
    ('OECD', 'PISA-2025', 'Programme for International Student Assessment 2025', 'PISA', 2025, NULL, 'Próxima ronda de evaluación PISA', 'Estudiantes de 15 años', TRUE, TRUE),
    ('IEA', 'ICCS-2022', 'International Civic and Citizenship Education Study 2022', 'PIRLS', 2022, NULL, 'Estudio internacional de educación cívica y ciudadana', 'Estudiantes de 8vo grado', TRUE, TRUE),
    ('ICFES', 'SABER-11-2024', 'Pruebas SABER 11 2024', 'ICFES', 2024, NULL, 'Evaluación nacional colombiana para estudiantes de grado 11', 'Estudiantes de grado 11', TRUE, TRUE)
) AS e(actor_code, code, name, type, year_start, year_end, description, target_population, is_longitudinal, is_active)
JOIN actors a ON a.code = e.actor_code;

-- Dimensiones IDPS
INSERT INTO dimensions (code, name, description, weight, display_order, is_active) VALUES
('AUTOCONOCIMIENTO', 'Autoconocimiento', 
 'Capacidad de reconocer y comprender las propias emociones, pensamientos, valores y comportamientos.', 
 0.25, 1, TRUE),

('AUTORREGULACION', 'Autorregulación',
 'Capacidad de gestionar las propias emociones, pensamientos y comportamientos de manera constructiva.',
 0.25, 2, TRUE),

('CONSCIENCIA_SOCIAL', 'Consciencia Social',
 'Capacidad de comprender y respetar las perspectivas de otros, incluyendo aquellas de diversos contextos.',
 0.25, 3, TRUE),

('HABILIDADES_RELACIONALES', 'Habilidades Relacionales',
 'Capacidad de establecer y mantener relaciones saludables y constructivas con diversas personas.',
 0.25, 4, TRUE);

-- Subdimensiones
INSERT INTO subdimensions (dimension_id, code, name, description, weight, display_order, is_active)
SELECT 
    d.id,
    s.code,
    s.name,
    s.description,
    s.weight,
    s.display_order,
    TRUE
FROM dimensions d
CROSS JOIN LATERAL (
    VALUES
    ('IDENTIDAD', 'Identidad', 'Comprensión de la propia identidad personal y social', 0.33, 1),
    ('AUTOEFICACIA', 'Autoeficacia', 'Creencia en las propias capacidades para alcanzar metas', 0.33, 2),
    ('AUTOESTIMA', 'Autoestima', 'Valoración positiva de uno mismo', 0.34, 3)
) AS s(code, name, description, weight, display_order)
WHERE d.code = 'AUTOCONOCIMIENTO'

UNION ALL

SELECT 
    d.id,
    s.code,
    s.name,
    s.description,
    s.weight,
    s.display_order,
    TRUE
FROM dimensions d
CROSS JOIN LATERAL (
    VALUES
    ('GESTION_EMOCIONAL', 'Gestión Emocional', 'Manejo efectivo de las emociones propias', 0.33, 1),
    ('RESILIENCIA', 'Resiliencia', 'Capacidad de recuperarse ante adversidades', 0.33, 2),
    ('METACOGNICION', 'Metacognición', 'Consciencia y regulación de los propios procesos de pensamiento', 0.34, 3)
) AS s(code, name, description, weight, display_order)
WHERE d.code = 'AUTORREGULACION'

UNION ALL

SELECT 
    d.id,
    s.code,
    s.name,
    s.description,
    s.weight,
    s.display_order,
    TRUE
FROM dimensions d
CROSS JOIN LATERAL (
    VALUES
    ('EMPATIA', 'Empatía', 'Capacidad de comprender los sentimientos de otros', 0.33, 1),
    ('PERSPECTIVA', 'Toma de Perspectiva', 'Capacidad de adoptar el punto de vista de otros', 0.33, 2),
    ('DIVERSIDAD', 'Apreciación de la Diversidad', 'Valoración del respeto a las diferencias', 0.34, 3)
) AS s(code, name, description, weight, display_order)
WHERE d.code = 'CONSCIENCIA_SOCIAL'

UNION ALL

SELECT 
    d.id,
    s.code,
    s.name,
    s.description,
    s.weight,
    s.display_order,
    TRUE
FROM dimensions d
CROSS JOIN LATERAL (
    VALUES
    ('COMUNICACION', 'Comunicación', 'Expresión efectiva de ideas y escucha activa', 0.25, 1),
    ('COLABORACION', 'Colaboración', 'Trabajo efectivo en equipo', 0.25, 2),
    ('RESOLUCION_CONFLICTOS', 'Resolución de Conflictos', 'Manejo constructivo de desacuerdos', 0.25, 3),
    ('LIDERAZGO', 'Liderazgo', 'Capacidad de guiar e influir positivamente', 0.25, 4)
) AS s(code, name, description, weight, display_order)
WHERE d.code = 'HABILIDADES_RELACIONALES';

-- Configuración inicial del sistema
INSERT INTO system_config (key, value, description, is_editable) VALUES
('matching.exact_threshold', '{"value": 0.95}', 'Umbral para considerar un match exacto', TRUE),
('matching.fuzzy_threshold', '{"value": 0.80}', 'Umbral para considerar un match fuzzy alto', TRUE),
('matching.semantic_threshold', '{"value": 0.85}', 'Umbral para considerar un match semántico alto', TRUE),
('matching.weights', '{"exact": 0.4, "fuzzy": 0.3, "semantic": 0.3}', 'Pesos para combinación de scores', TRUE),
('revision.auto_assign', '{"enabled": true}', 'Habilitar asignación automática de revisiones', TRUE),
('revision.default_priority', '{"value": 5}', 'Prioridad por defecto para tareas de revisión', TRUE),
('agent.batch_size', '{"value": 100}', 'Tamaño de lote para procesamiento del agente', TRUE),
('agent.max_retries', '{"value": 3}', 'Máximo de reintentos en caso de error', TRUE);

-- Datos de ejemplo para el MVP ejecutable
INSERT INTO items (
    original_id, evaluation_id, dimension_id, subdimension_id,
    statement, options, item_type, difficulty, discrimination, status, metadata
)
SELECT
    'SIMCE-4B-2024-P02_01',
    e.id,
    d.id,
    s.id,
    'Me siento capaz de terminar mis tareas escolares aunque sean desafiantes.',
    '{"1":"Nunca","2":"A veces","3":"Frecuentemente","4":"Siempre"}'::jsonb,
    'LIKERT_4',
    0.42,
    0.78,
    'HOMOLOGADO',
    '{"seed": true, "actor": "estudiante"}'::jsonb
FROM evaluations e
JOIN dimensions d ON d.code = 'AUTOCONOCIMIENTO'
JOIN subdimensions s ON s.dimension_id = d.id AND s.code = 'AUTOEFICACIA'
WHERE e.code = 'SIMCE-4B-2024'
  AND NOT EXISTS (
      SELECT 1 FROM items WHERE original_id = 'SIMCE-4B-2024-P02_01'
  );

INSERT INTO items (
    original_id, evaluation_id, dimension_id, subdimension_id,
    statement, options, item_type, difficulty, discrimination, status, metadata
)
SELECT
    'SIMCE-2M-2024-P08_03',
    e.id,
    d.id,
    s.id,
    'Cuando trabajo con otras personas, escucho sus ideas antes de decidir que hacer.',
    '{"1":"Nunca","2":"A veces","3":"Frecuentemente","4":"Siempre"}'::jsonb,
    'LIKERT_4',
    0.38,
    0.81,
    'PENDIENTE_HOMOLOGACION',
    '{"seed": true, "actor": "estudiante"}'::jsonb
FROM evaluations e
JOIN dimensions d ON d.code = 'HABILIDADES_RELACIONALES'
JOIN subdimensions s ON s.dimension_id = d.id AND s.code = 'COLABORACION'
WHERE e.code = 'SIMCE-2M-2024'
  AND NOT EXISTS (
      SELECT 1 FROM items WHERE original_id = 'SIMCE-2M-2024-P08_03'
  );

INSERT INTO items (
    original_id, evaluation_id, dimension_id, subdimension_id,
    statement, options, item_type, difficulty, discrimination, status, metadata
)
SELECT
    'SIMCE-2M-2024-P08_04',
    e.id,
    d.id,
    s.id,
    'Antes de resolver un problema en equipo, considero distintas opiniones de mis companeros.',
    '{"1":"Nunca","2":"A veces","3":"Frecuentemente","4":"Siempre"}'::jsonb,
    'LIKERT_4',
    0.36,
    0.79,
    'HOMOLOGADO',
    '{"seed": true, "actor": "estudiante"}'::jsonb
FROM evaluations e
JOIN dimensions d ON d.code = 'HABILIDADES_RELACIONALES'
JOIN subdimensions s ON s.dimension_id = d.id AND s.code = 'COLABORACION'
WHERE e.code = 'SIMCE-2M-2024'
  AND NOT EXISTS (
      SELECT 1 FROM items WHERE original_id = 'SIMCE-2M-2024-P08_04'
  );

INSERT INTO homologation_attempts (
    source_item_id, candidate_item_id, exact_match_score, fuzzy_match_score,
    semantic_match_score, combined_score, confidence, decision, decision_reason, status
)
SELECT
    src.id,
    cand.id,
    0.10,
    0.87,
    0.84,
    0.70,
    'MEDIA',
    'REVISION_MANUAL',
    'Los enunciados parecen variantes de colaboracion y requieren validacion humana.',
    'PENDIENTE'
FROM items src
JOIN items cand ON cand.original_id = 'SIMCE-2M-2024-P08_04'
WHERE src.original_id = 'SIMCE-2M-2024-P08_03'
  AND NOT EXISTS (
      SELECT 1
      FROM homologation_attempts ha
      WHERE ha.source_item_id = src.id
        AND ha.candidate_item_id = cand.id
  );

INSERT INTO revision_tasks (
    attempt_id, revision_type, priority, status, notes
)
SELECT
    ha.id,
    'HOMOLOGACION_AMBIGUA',
    8,
    'PENDIENTE',
    'Revisar si corresponde a variante menor o sustantiva.'
FROM homologation_attempts ha
JOIN items src ON src.id = ha.source_item_id
WHERE src.original_id = 'SIMCE-2M-2024-P08_03'
  AND NOT EXISTS (
      SELECT 1 FROM revision_tasks rt WHERE rt.attempt_id = ha.id
  );

INSERT INTO item_result_summaries (
    item_id, evaluation_id, year, calculation_method,
    source_file, source_sheet, question_code, actor_label, grade_label,
    form_label, indicator_code, dimension_label, subdimension_label,
    prompt_text, item_text, metrics, notes, metadata
)
SELECT
    i.id,
    e.id,
    2024,
    'CLASICA',
    'Resultados_4b.xlsx',
    'RESUMEN',
    'p02_01',
    'estu',
    '4b',
    's24_04_estu',
    'am',
    'Autoconocimiento',
    'Autoeficacia',
    'Que tan capaz te sientes de realizar las siguientes acciones?',
    i.statement,
    '{"mean": 3.18, "sd": 0.81, "kurtosis": -0.42, "cit": 0.51, "missing_pct": 1.7}'::jsonb,
    'Resultado historico descriptivo por pregunta.',
    '{"seed": true}'::jsonb
FROM items i
JOIN evaluations e ON e.id = i.evaluation_id
WHERE i.original_id = 'SIMCE-4B-2024-P02_01'
  AND NOT EXISTS (
      SELECT 1 FROM item_result_summaries rs
      WHERE rs.item_id = i.id AND rs.question_code = 'p02_01'
  );

INSERT INTO item_result_summaries (
    item_id, evaluation_id, year, calculation_method,
    source_file, source_sheet, question_code, actor_label, grade_label,
    form_label, indicator_code, dimension_label, subdimension_label,
    prompt_text, item_text, metrics, notes, metadata
)
SELECT
    i.id,
    e.id,
    2024,
    'IRT',
    'Resultados_2m.xlsx',
    'pink_s24_10_estu',
    'p08_03',
    'estu',
    '2m',
    's24_10_estu',
    'hr',
    'Habilidades Relacionales',
    'Colaboracion',
    'Cuando trabajas con otras personas, con que frecuencia realizas las siguientes acciones?',
    i.statement,
    '{"mean": 3.02, "sd": 0.74, "irt_a": 1.24, "irt_b": -0.32, "irt_information": 0.67, "missing_pct": 2.3}'::jsonb,
    'Resultado con contexto metodologico IRT.',
    '{"seed": true}'::jsonb
FROM items i
JOIN evaluations e ON e.id = i.evaluation_id
WHERE i.original_id = 'SIMCE-2M-2024-P08_03'
  AND NOT EXISTS (
      SELECT 1 FROM item_result_summaries rs
      WHERE rs.item_id = i.id AND rs.question_code = 'p08_03'
  );

INSERT INTO generated_item_proposals (
    request_id, statement, instruction, actor_suggested, dimension_suggested,
    subdimension_suggested, indicator_suggested, response_options, proposal_type,
    redundancy_level, confidence_score, classification_justification,
    redundancy_analysis, similar_items, validation_result, status, requested_by, metadata
)
SELECT
    'REQ-SEED-001',
    'En mi curso, comparto ideas para resolver tareas grupales incluso cuando mi opinion es distinta a la de otras personas.',
    'Indica con que frecuencia te ocurre.',
    'estudiante',
    'Habilidades Relacionales',
    'Colaboracion',
    'trabajo_equipo',
    '[{"value":1,"label":"Nunca"},{"value":2,"label":"A veces"},{"value":3,"label":"Frecuentemente"},{"value":4,"label":"Siempre"}]'::jsonb,
    'VARIANTE',
    'MEDIO',
    0.742,
    'La propuesta se ubica provisionalmente en colaboracion porque enfatiza escucha y trabajo conjunto.',
    '{"max_similarity": 0.68, "decision": "VARIANTE"}'::jsonb,
    '[{"original_id":"SIMCE-2M-2024-P08_03","score":0.68}]'::jsonb,
    '{"es_valido": true, "warnings": []}'::jsonb,
    'BORRADOR',
    'seed@idps.local',
    '{"seed": true}'::jsonb
WHERE NOT EXISTS (
    SELECT 1 FROM generated_item_proposals WHERE request_id = 'REQ-SEED-001'
);

-- =============================================================================
-- 7. PERMISOS Y SEGURIDAD
-- =============================================================================

-- Crear roles (ejecutar como superusuario)
-- CREATE ROLE idps_read;
-- CREATE ROLE idps_write;
-- CREATE ROLE idps_admin;

-- Conceder permisos
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO idps_read;
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO idps_write;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO idps_admin;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
