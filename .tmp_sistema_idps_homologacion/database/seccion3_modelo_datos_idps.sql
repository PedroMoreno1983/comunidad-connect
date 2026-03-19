-- ============================================================================
-- SISTEMA DE HOMOLOGACIÓN LONGITUDINAL IDPS
-- SECCIÓN 3: MODELO DE DATOS COMPLETO
-- PostgreSQL 14+
-- ============================================================================
-- Autor: Arquitecto de Datos Senior
-- Fecha: 2025
-- Descripción: Esquema completo para homologación de ítems IDPS 2014-2026
-- ============================================================================

-- Habilitar extensión para generación de UUIDs si se necesita
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Habilitar extensión para búsqueda de texto completo
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- 1. TABLA: actor
-- ============================================================================
-- Propósito: Catálogo de actores del desarrollo personal y social
-- Ejemplos: Estudiante, Docente, Familia, Directivo, Comunidad
-- ============================================================================

CREATE TABLE actor (
    id_actor            SERIAL PRIMARY KEY,
    codigo_oficial      VARCHAR(20) NOT NULL UNIQUE,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    orden_visualizacion INTEGER DEFAULT 0,
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo',
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    creado_por          INTEGER,
    modificado_por      INTEGER,
    
    -- Constraints
    CONSTRAINT chk_actor_estado CHECK (estado IN ('activo', 'inactivo', 'deprecado')),
    CONSTRAINT chk_actor_codigo CHECK (codigo_oficial ~ '^[A-Z0-9_]+$')
);

-- Comentarios
COMMENT ON TABLE actor IS 'Catálogo de actores del modelo IDPS (estudiante, docente, familia, etc.)';
COMMENT ON COLUMN actor.id_actor IS 'Identificador interno autoincremental';
COMMENT ON COLUMN actor.codigo_oficial IS 'Código oficial del actor (ej: EST, DOC, FAM)';
COMMENT ON COLUMN actor.nombre IS 'Nombre descriptivo del actor';
COMMENT ON COLUMN actor.estado IS 'Estado del actor: activo, inactivo o deprecado';

-- Índices
CREATE INDEX idx_actor_estado ON actor(estado);
CREATE INDEX idx_actor_codigo ON actor(codigo_oficial);

-- ============================================================================
-- 2. TABLA: dimension
-- ============================================================================
-- Propósito: Dimensiones del modelo IDPS
-- Ejemplos: Autoconocimiento, Autorregulación, etc.
-- ============================================================================

CREATE TABLE dimension (
    id_dimension        SERIAL PRIMARY KEY,
    codigo_oficial      VARCHAR(20) NOT NULL UNIQUE,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    definicion_conceptual TEXT,
    orden               INTEGER NOT NULL DEFAULT 0,
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo',
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version_modelo      VARCHAR(10) DEFAULT '2014', -- Versión del modelo IDPS
    
    CONSTRAINT chk_dimension_estado CHECK (estado IN ('activo', 'inactivo', 'deprecado')),
    CONSTRAINT chk_dimension_codigo CHECK (codigo_oficial ~ '^[A-Z0-9_]+$')
);

COMMENT ON TABLE dimension IS 'Dimensiones del modelo IDPS';
COMMENT ON COLUMN dimension.version_modelo IS 'Versión del modelo IDPS a la que pertenece';

CREATE INDEX idx_dimension_estado ON dimension(estado);
CREATE INDEX idx_dimension_orden ON dimension(orden);
CREATE INDEX idx_dimension_version ON dimension(version_modelo);

-- ============================================================================
-- 3. TABLA: subdimension
-- ============================================================================
-- Propósito: Subdimensiones jerárquicas dentro de cada dimensión
-- ============================================================================

CREATE TABLE subdimension (
    id_subdimension     SERIAL PRIMARY KEY,
    id_dimension        INTEGER NOT NULL,
    codigo_oficial      VARCHAR(20) NOT NULL,
    nombre              VARCHAR(100) NOT NULL,
    descripcion         TEXT,
    definicion_operacional TEXT,
    orden               INTEGER NOT NULL DEFAULT 0,
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo',
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_subdimension_dimension 
        FOREIGN KEY (id_dimension) REFERENCES dimension(id_dimension) ON DELETE RESTRICT,
    CONSTRAINT chk_subdimension_estado CHECK (estado IN ('activo', 'inactivo', 'deprecado')),
    CONSTRAINT uq_subdimension_codigo UNIQUE (codigo_oficial),
    CONSTRAINT chk_subdimension_codigo CHECK (codigo_oficial ~ '^[A-Z0-9_]+$')
);

COMMENT ON TABLE subdimension IS 'Subdimensiones jerárquicas de cada dimensión IDPS';
COMMENT ON COLUMN subdimension.definicion_operacional IS 'Definición operacional para clasificación de ítems';

CREATE INDEX idx_subdimension_dimension ON subdimension(id_dimension);
CREATE INDEX idx_subdimension_estado ON subdimension(estado);

-- ============================================================================
-- 4. TABLA: item_canonico
-- ============================================================================
-- Propósito: Ítems canónicos maestros del sistema
-- Cada ítem canónico representa un concepto único medible
-- ============================================================================

CREATE TABLE item_canonico (
    -- Identificación
    id_canonico         VARCHAR(30) PRIMARY KEY,
    secuencia_interna   SERIAL UNIQUE, -- Para generación de IDs
    
    -- Contenido canónico
    texto_canonico      TEXT NOT NULL,
    definicion_operacional TEXT,
    instrucciones_administracion TEXT,
    
    -- Clasificación jerárquica
    id_actor            INTEGER NOT NULL,
    id_dimension        INTEGER NOT NULL,
    id_subdimension     INTEGER,
    
    -- Metadatos psicométricos agregados (across years)
    dificultad_promedio DECIMAL(4,2), -- rango típico -3 a 3
    discriminacion_promedio DECIMAL(4,2), -- rango típico 0 a 3
    confiabilidad_alpha DECIMAL(4,3), -- Alfa de Cronbach
    
    -- Control de versiones
    version_actual      INTEGER NOT NULL DEFAULT 1,
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_ultima_modificacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Estado
    estado              VARCHAR(20) NOT NULL DEFAULT 'activo',
    motivo_estado       TEXT, -- Razón si está deprecado o en revisión
    
    -- Auditoría
    creado_por          INTEGER,
    modificado_por      INTEGER,
    
    -- Búsqueda de texto
    texto_busqueda      TSVECTOR, -- Para búsqueda full-text
    
    -- Constraints
    CONSTRAINT fk_item_canonico_actor 
        FOREIGN KEY (id_actor) REFERENCES actor(id_actor) ON DELETE RESTRICT,
    CONSTRAINT fk_item_canonico_dimension 
        FOREIGN KEY (id_dimension) REFERENCES dimension(id_dimension) ON DELETE RESTRICT,
    CONSTRAINT fk_item_canonico_subdimension 
        FOREIGN KEY (id_subdimension) REFERENCES subdimension(id_subdimension) ON DELETE SET NULL,
    CONSTRAINT chk_item_canonico_estado 
        CHECK (estado IN ('activo', 'en_revision', 'deprecado', 'propuesto')),
    CONSTRAINT chk_item_canonico_dificultad 
        CHECK (dificultad_promedio IS NULL OR (dificultad_promedio BETWEEN -5 AND 5)),
    CONSTRAINT chk_item_canonico_discriminacion 
        CHECK (discriminacion_promedio IS NULL OR (discriminacion_promedio BETWEEN 0 AND 5))
);

COMMENT ON TABLE item_canonico IS 'Ítems canónicos maestros del sistema IDPS';
COMMENT ON COLUMN item_canonico.id_canonico IS 'ID único formato: IDPS-CAN-{AÑO}-{SECUENCIA}';
COMMENT ON COLUMN item_canonico.texto_canonico IS 'Texto canónico normalizado del ítem';
COMMENT ON COLUMN item_canonico.definicion_operacional IS 'Definición de cómo se mide el constructo';
COMMENT ON COLUMN item_canonico.version_actual IS 'Número de versión del ítem canónico';
COMMENT ON COLUMN item_canonico.texto_busqueda IS 'Índice de búsqueda full-text';

-- Índices críticos
CREATE INDEX idx_item_canonico_actor ON item_canonico(id_actor);
CREATE INDEX idx_item_canonico_dimension ON item_canonico(id_dimension);
CREATE INDEX idx_item_canonico_subdimension ON item_canonico(id_subdimension);
CREATE INDEX idx_item_canonico_estado ON item_canonico(estado);
CREATE INDEX idx_item_canonico_texto_busqueda ON item_canonico USING GIN(texto_busqueda);
CREATE INDEX idx_item_canonico_dificultad ON item_canonico(dificultad_promedio);

-- Índice para búsqueda por similaridad de texto
CREATE INDEX idx_item_canonico_texto_trgm ON item_canonico USING GIN(texto_canonico gin_trgm_ops);

-- Trigger para actualizar texto_busqueda
CREATE OR REPLACE FUNCTION update_item_canonico_busqueda()
RETURNS TRIGGER AS $$
BEGIN
    NEW.texto_busqueda := to_tsvector('spanish', COALESCE(NEW.texto_canonico, '') || ' ' || 
                                      COALESCE(NEW.definicion_operacional, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_item_canonico_busqueda
    BEFORE INSERT OR UPDATE ON item_canonico
    FOR EACH ROW
    EXECUTE FUNCTION update_item_canonico_busqueda();

-- ============================================================================
-- 5. TABLA: item_canonico_version (histórico de versiones)
-- ============================================================================

CREATE TABLE item_canonico_version (
    id_version          SERIAL PRIMARY KEY,
    id_canonico         VARCHAR(30) NOT NULL,
    numero_version      INTEGER NOT NULL,
    
    -- Datos versionados
    texto_canonico      TEXT NOT NULL,
    definicion_operacional TEXT,
    id_actor            INTEGER NOT NULL,
    id_dimension        INTEGER NOT NULL,
    id_subdimension     INTEGER,
    
    -- Motivo del cambio
    tipo_cambio         VARCHAR(50) NOT NULL, -- correccion, reformulacion, reclasificacion
    motivo_cambio       TEXT NOT NULL,
    
    -- Auditoría
    fecha_version       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    creado_por          INTEGER,
    
    CONSTRAINT fk_version_canonico 
        FOREIGN KEY (id_canonico) REFERENCES item_canonico(id_canonico) ON DELETE CASCADE,
    CONSTRAINT uq_version_canonico UNIQUE (id_canonico, numero_version)
);

COMMENT ON TABLE item_canonico_version IS 'Histórico de versiones de ítems canónicos';
COMMENT ON COLUMN item_canonico_version.tipo_cambio IS 'Tipo de cambio: correccion, reformulacion, reclasificacion, fusion, division';

CREATE INDEX idx_version_canonico ON item_canonico_version(id_canonico);
CREATE INDEX idx_version_fecha ON item_canonico_version(fecha_version);

-- ============================================================================
-- 6. TABLA: item_variante
-- ============================================================================
-- Propósito: Variantes de ítems canónicos (menores o sustantivas)
-- ============================================================================

CREATE TABLE item_variante (
    id_variante         VARCHAR(40) PRIMARY KEY,
    secuencia_interna   SERIAL UNIQUE,
    
    -- Relación con canónico
    id_canonico         VARCHAR(30) NOT NULL,
    numero_variante     INTEGER NOT NULL, -- 001, 002, etc.
    
    -- Contenido variante
    texto_variante      TEXT NOT NULL,
    tipo_variante       VARCHAR(20) NOT NULL, -- menor, sustantiva
    
    -- Documentación de diferencias
    diferencias_canonico TEXT NOT NULL, -- Qué cambió específicamente
    justificacion_variante TEXT, -- Por qué se creó la variante
    
    -- Metadatos
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    creado_por          INTEGER,
    
    -- Estado de aprobación
    estado_aprobacion   VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    fecha_aprobacion    TIMESTAMP WITH TIME ZONE,
    aprobado_por        INTEGER,
    comentario_aprobacion TEXT,
    
    -- Constraints
    CONSTRAINT fk_variante_canonico 
        FOREIGN KEY (id_canonico) REFERENCES item_canonico(id_canonico) ON DELETE RESTRICT,
    CONSTRAINT chk_tipo_variante 
        CHECK (tipo_variante IN ('menor', 'sustantiva')),
    CONSTRAINT chk_estado_aprobacion 
        CHECK (estado_aprobacion IN ('pendiente', 'aprobada', 'rechazada', 'en_revision')),
    CONSTRAINT uq_variante_numero UNIQUE (id_canonico, numero_variante)
);

COMMENT ON TABLE item_variante IS 'Variantes de ítems canónicos (adaptaciones menores o sustantivas)';
COMMENT ON COLUMN item_variante.tipo_variante IS 'menor: cambios de redacción; sustantiva: cambios significativos';
COMMENT ON COLUMN item_variante.diferencias_canonico IS 'Descripción específica de las diferencias con el canónico';

CREATE INDEX idx_variante_canonico ON item_variante(id_canonico);
CREATE INDEX idx_variante_tipo ON item_variante(tipo_variante);
CREATE INDEX idx_variante_estado ON item_variante(estado_aprobacion);
CREATE INDEX idx_variante_texto_trgm ON item_variante USING GIN(texto_variante gin_trgm_ops);

-- ============================================================================
-- 7. TABLA: item_ocurrencia
-- ============================================================================
-- Propósito: Cada aparición histórica de un ítem en un formulario específico
-- ============================================================================

CREATE TABLE item_ocurrencia (
    id_ocurrencia       VARCHAR(50) PRIMARY KEY,
    secuencia_interna   SERIAL UNIQUE,
    
    -- Relación jerárquica
    id_variante         VARCHAR(40) NOT NULL,
    numero_ocurrencia   INTEGER NOT NULL, -- Secuencia por variante
    
    -- Contexto de aplicación
    anio_aplicacion     INTEGER NOT NULL,
    formulario          VARCHAR(50) NOT NULL, -- Código del formulario
    posicion_formulario INTEGER, -- Número de ítem dentro del formulario
    
    -- Referencia a fuente original
    id_original_fuente  VARCHAR(100), -- ID como aparecía en el archivo
    id_archivo_fuente   INTEGER NOT NULL,
    
    -- Metadatos de la ocurrencia
    texto_original      TEXT, -- Texto tal como apareció en el archivo fuente
    texto_normalizado   TEXT, -- Texto después de limpieza
    
    -- Estado de procesamiento
    estado_procesamiento VARCHAR(20) DEFAULT 'importado',
    notas_procesamiento TEXT,
    
    fecha_registro      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_ocurrencia_variante 
        FOREIGN KEY (id_variante) REFERENCES item_variante(id_variante) ON DELETE RESTRICT,
    CONSTRAINT chk_anio_aplicacion 
        CHECK (anio_aplicacion BETWEEN 2014 AND 2030),
    CONSTRAINT chk_estado_procesamiento 
        CHECK (estado_procesamiento IN ('importado', 'homologado', 'en_revision', 'descartado')),
    CONSTRAINT uq_ocurrencia_contexto UNIQUE (id_variante, anio_aplicacion, formulario, posicion_formulario)
);

COMMENT ON TABLE item_ocurrencia IS 'Cada aparición histórica de un ítem en un formulario específico';
COMMENT ON COLUMN item_ocurrencia.id_original_fuente IS 'Identificador original del ítem en el archivo fuente';
COMMENT ON COLUMN item_ocurrencia.texto_original IS 'Texto tal como apareció en el archivo (para auditoría)';
COMMENT ON COLUMN item_ocurrencia.estado_procesamiento IS 'Estado del proceso de homologación';

CREATE INDEX idx_ocurrencia_variante ON item_ocurrencia(id_variante);
CREATE INDEX idx_ocurrencia_anio ON item_ocurrencia(anio_aplicacion);
CREATE INDEX idx_ocurrencia_formulario ON item_ocurrencia(formulario);
CREATE INDEX idx_ocurrencia_archivo ON item_ocurrencia(id_archivo_fuente);
CREATE INDEX idx_ocurrencia_estado ON item_ocurrencia(estado_procesamiento);

-- Particionamiento por año para mejor rendimiento
-- Nota: En PostgreSQL 14+ se puede usar particionamiento declarativo
-- CREATE TABLE item_ocurrencia_2014 PARTITION OF item_ocurrencia FOR VALUES IN (2014);
-- etc.

-- ============================================================================
-- 8. TABLA: fuente_archivo
-- ============================================================================
-- Propósito: Registro de archivos fuente importados
-- ============================================================================

CREATE TABLE fuente_archivo (
    id_archivo          SERIAL PRIMARY KEY,
    
    -- Identificación del archivo
    nombre_archivo      VARCHAR(255) NOT NULL,
    nombre_original     VARCHAR(255), -- Nombre antes de renombrar
    ruta_almacenamiento TEXT, -- Ruta en sistema de archivos
    
    -- Metadatos
    anio_datos          INTEGER NOT NULL,
    tipo_archivo        VARCHAR(50) NOT NULL, -- SPSS, CSV, Excel, etc.
    descripcion         TEXT,
    
    -- Estructura detectada
    estructura_detectada JSONB, -- Esquema de columnas detectado
    columnas_mapeadas   JSONB, -- Mapeo de columnas a campos del sistema
    
    -- Información de importación
    fecha_importacion   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    usuario_importacion INTEGER NOT NULL,
    
    -- Integridad
    hash_md5            VARCHAR(32), -- Hash del archivo original
    hash_sha256         VARCHAR(64), -- Hash SHA256 para mayor seguridad
    tamano_bytes        BIGINT,
    
    -- Estado
    estado_importacion  VARCHAR(20) DEFAULT 'pendiente',
    errores_importacion TEXT,
    
    -- Constraints
    CONSTRAINT chk_anio_datos CHECK (anio_datos BETWEEN 2014 AND 2030),
    CONSTRAINT chk_tipo_archivo CHECK (tipo_archivo IN ('SPSS', 'CSV', 'Excel', 'JSON', 'XML', 'Otro')),
    CONSTRAINT chk_estado_importacion CHECK (estado_importacion IN ('pendiente', 'procesando', 'completado', 'error'))
);

COMMENT ON TABLE fuente_archivo IS 'Registro de archivos fuente importados al sistema';
COMMENT ON COLUMN fuente_archivo.estructura_detectada IS 'JSON con el esquema de columnas detectado automáticamente';
COMMENT ON COLUMN fuente_archivo.columnas_mapeadas IS 'JSON con el mapeo de columnas a campos del sistema';
COMMENT ON COLUMN fuente_archivo.hash_md5 IS 'Hash MD5 para verificación de integridad';

CREATE INDEX idx_fuente_anio ON fuente_archivo(anio_datos);
CREATE INDEX idx_fuente_tipo ON fuente_archivo(tipo_archivo);
CREATE INDEX idx_fuente_estado ON fuente_archivo(estado_importacion);
CREATE INDEX idx_fuente_fecha ON fuente_archivo(fecha_importacion);

-- ============================================================================
-- 9. TABLA: resultado_item
-- ============================================================================
-- Propósito: Resultados psicométricos de cada ocurrencia de ítem
-- ============================================================================

CREATE TABLE resultado_item (
    id_resultado        VARCHAR(60) PRIMARY KEY,
    secuencia_interna   SERIAL UNIQUE,
    
    -- Relación
    id_ocurrencia       VARCHAR(50) NOT NULL,
    
    -- Contexto del análisis
    anio_analisis       INTEGER NOT NULL,
    metodo_estimacion   VARCHAR(20) NOT NULL, -- clasico, IRT_1PL, IRT_2PL, IRT_3PL
    software_usado      VARCHAR(50), -- R, Mplus, BILOG, etc.
    version_software    VARCHAR(20),
    
    -- Parámetros IRT (cuando aplica)
    parametro_dificultad    DECIMAL(6,3), -- b parameter
    parametro_discriminacion DECIMAL(6,3), -- a parameter
    parametro_adivinacion   DECIMAL(5,3), -- c parameter (3PL)
    parametro_asintota_superior DECIMAL(5,3), -- d parameter (4PL)
    
    -- Estadísticas clásicas
    p_valor             DECIMAL(5,3), -- Proporción de aciertos
    punto_biserial      DECIMAL(5,3), -- Correlación punto-biserial
    varianza            DECIMAL(8,4),
    desviacion_estandar DECIMAL(8,4),
    
    -- Estadísticas adicionales
    coeficiente_alfa_item DECIMAL(5,3), -- Alfa si se elimina el ítem
    chi_cuadrado        DECIMAL(10,4),
    df                  INTEGER,
    p_valor_ajuste      DECIMAL(5,4),
    
    -- Información de muestra
    muestra             VARCHAR(100), -- Descripción de la muestra
    tamano_muestral     INTEGER,
    missing_data_pct    DECIMAL(5,2),
    
    -- Metadatos del cálculo
    fecha_calculo       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    calculado_por       INTEGER,
    
    -- Notas metodológicas específicas
    notas_metodologicas TEXT,
    parametros_adicionales JSONB, -- Parámetros específicos del software
    
    -- Constraints
    CONSTRAINT fk_resultado_ocurrencia 
        FOREIGN KEY (id_ocurrencio) REFERENCES item_ocurrencia(id_ocurrencia) ON DELETE CASCADE,
    CONSTRAINT chk_metodo_estimacion 
        CHECK (metodo_estimacion IN ('clasico', 'IRT_1PL', 'IRT_2PL', 'IRT_3PL', 'IRT_4PL')),
    CONSTRAINT chk_anio_analisis CHECK (anio_analisis BETWEEN 2014 AND 2030),
    CONSTRAINT chk_p_valor CHECK (p_valor IS NULL OR (p_valor BETWEEN 0 AND 1)),
    CONSTRAINT chk_punto_biserial CHECK (punto_biserial IS NULL OR (punto_biserial BETWEEN -1 AND 1))
);

COMMENT ON TABLE resultado_item IS 'Resultados psicométricos de cada ocurrencia de ítem';
COMMENT ON COLUMN resultado_item.parametro_dificultad IS 'Parámetro de dificultad IRT (b)';
COMMENT ON COLUMN resultado_item.parametro_discriminacion IS 'Parámetro de discriminación IRT (a)';
COMMENT ON COLUMN resultado_item.parametro_adivinacion IS 'Parámetro de adivinación IRT (c)';
COMMENT ON COLUMN resultado_item.p_valor IS 'Proporción de respuestas correctas/positivas';
COMMENT ON COLUMN resultado_item.punto_biserial IS 'Correlación punto-biserial ítem-total';

CREATE INDEX idx_resultado_ocurrencia ON resultado_item(id_ocurrencia);
CREATE INDEX idx_resultado_anio ON resultado_item(anio_analisis);
CREATE INDEX idx_resultado_metodo ON resultado_item(metodo_estimacion);
CREATE INDEX idx_resultado_dificultad ON resultado_item(parametro_dificultad);
CREATE INDEX idx_resultado_fecha ON resultado_item(fecha_calculo);

-- ============================================================================
-- 10. TABLA: usuario_revisor
-- ============================================================================

CREATE TABLE usuario_revisor (
    id_usuario          SERIAL PRIMARY KEY,
    
    -- Información básica
    nombre_completo     VARCHAR(200) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    
    -- Credenciales (hashed)
    password_hash       VARCHAR(255),
    salt                VARCHAR(255),
    
    -- Rol y permisos
    rol                 VARCHAR(50) NOT NULL DEFAULT 'revisor',
    permisos            JSONB DEFAULT '[]'::jsonb, -- Lista de permisos específicos
    
    -- Especialización
    especialidad_actor      INTEGER, -- Actor específico que domina
    especialidad_dimension  INTEGER, -- Dimensión específica que domina
    
    -- Estado
    estado_activo       BOOLEAN DEFAULT TRUE,
    ultimo_acceso       TIMESTAMP WITH TIME ZONE,
    
    -- Auditoría
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    creado_por          INTEGER,
    
    -- Constraints
    CONSTRAINT fk_usuario_especialidad_actor 
        FOREIGN KEY (especialidad_actor) REFERENCES actor(id_actor) ON DELETE SET NULL,
    CONSTRAINT fk_usuario_especialidad_dimension 
        FOREIGN KEY (especialidad_dimension) REFERENCES dimension(id_dimension) ON DELETE SET NULL,
    CONSTRAINT chk_rol CHECK (rol IN ('administrador', 'revisor_senior', 'revisor', 'consultor', 'sistema'))
);

COMMENT ON TABLE usuario_revisor IS 'Usuarios del sistema con capacidad de revisión y administración';
COMMENT ON COLUMN usuario_revisor.permisos IS 'JSON array con permisos específicos del usuario';
COMMENT ON COLUMN usuario_revisor.especialidad_actor IS 'Actor IDPS de especialización del revisor';

CREATE INDEX idx_usuario_rol ON usuario_revisor(rol);
CREATE INDEX idx_usuario_estado ON usuario_revisor(estado_activo);
CREATE INDEX idx_usuario_email ON usuario_revisor(email);

-- ============================================================================
-- 11. TABLA: revision_homologacion
-- ============================================================================
-- Propósito: Registro de decisiones de homologación (automáticas o manuales)
-- ============================================================================

CREATE TABLE revision_homologacion (
    id_revision         SERIAL PRIMARY KEY,
    
    -- Tipo de revisión
    tipo_revision       VARCHAR(20) NOT NULL, -- automatica, manual, consenso
    
    -- Ítems involucrados
    id_ocurrencia_origen VARCHAR(50) NOT NULL, -- Ítem que se está homologando
    id_variante_propuesta VARCHAR(40), -- Variante sugerida (puede ser NULL si es nuevo)
    id_canonico_propuesto VARCHAR(30), -- Canónico sugerido
    
    -- Decisión
    decision_tomada     VARCHAR(30) NOT NULL, -- homologar_a_existente, crear_variante, crear_canonico, descartar, pendiente
    confianza_algoritmo DECIMAL(4,3), -- 0.000 a 1.000
    
    -- Revisión manual
    decision_revisor    VARCHAR(30), -- confirmado, rechazado, modificado
    id_revisor          INTEGER,
    comentarios_revisor TEXT,
    fecha_revision      TIMESTAMP WITH TIME ZONE,
    
    -- Consenso (si aplica)
    requiere_consenso   BOOLEAN DEFAULT FALSE,
    revisores_consenso  INTEGER[], -- Array de IDs de revisores
    votos_consenso      JSONB, -- {revisor_id: decision}
    decision_consenso   VARCHAR(30),
    
    -- Estado final
    estado_final        VARCHAR(20) DEFAULT 'pendiente',
    
    -- Metadatos
    fecha_creacion      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    algoritmo_version   VARCHAR(20), -- Versión del algoritmo de matching
    
    -- Constraints
    CONSTRAINT fk_revision_ocurrencia 
        FOREIGN KEY (id_ocurrencia_origen) REFERENCES item_ocurrencia(id_ocurrencia) ON DELETE RESTRICT,
    CONSTRAINT fk_revision_variante 
        FOREIGN KEY (id_variante_propuesta) REFERENCES item_variante(id_variante) ON DELETE SET NULL,
    CONSTRAINT fk_revision_canonico 
        FOREIGN KEY (id_canonico_propuesto) REFERENCES item_canonico(id_canonico) ON DELETE SET NULL,
    CONSTRAINT fk_revision_revisor 
        FOREIGN KEY (id_revisor) REFERENCES usuario_revisor(id_usuario) ON DELETE SET NULL,
    CONSTRAINT chk_tipo_revision CHECK (tipo_revision IN ('automatica', 'manual', 'consenso')),
    CONSTRAINT chk_decision_tomada CHECK (decision_tomada IN ('homologar_a_existente', 'crear_variante', 'crear_canonico', 'descartar', 'pendiente', 'requiere_revision')),
    CONSTRAINT chk_estado_final CHECK (estado_final IN ('pendiente', 'aprobado', 'rechazado', 'en_consenso'))
);

COMMENT ON TABLE revision_homologacion IS 'Registro de decisiones de homologación';
COMMENT ON COLUMN revision_homologacion.confianza_algoritmo IS 'Nivel de confianza del algoritmo de matching (0-1)';
COMMENT ON COLUMN revision_homologacion.requiere_consenso IS 'Indica si la decisión requiere revisión por múltiples expertos';
COMMENT ON COLUMN revision_homologacion.votos_consenso IS 'JSON con los votos de cada revisor en proceso de consenso';

CREATE INDEX idx_revision_ocurrencia ON revision_homologacion(id_ocurrencia_origen);
CREATE INDEX idx_revision_tipo ON revision_homologacion(tipo_revision);
CREATE INDEX idx_revision_estado ON revision_homologacion(estado_final);
CREATE INDEX idx_revision_revisor ON revision_homologacion(id_revisor);
CREATE INDEX idx_revision_fecha ON revision_homologacion(fecha_creacion);

-- ============================================================================
-- 12. TABLA: item_generado
-- ============================================================================
-- Propósito: Ítems generados por IA o propuestos manualmente
-- ============================================================================

CREATE TABLE item_generado (
    id_item_generado    VARCHAR(35) PRIMARY KEY,
    secuencia_interna   SERIAL UNIQUE,
    
    -- Contenido generado
    texto_propuesto     TEXT NOT NULL,
    definicion_operacional TEXT,
    instrucciones       TEXT,
    
    -- Tipo de generación
    tipo_generacion     VARCHAR(30) NOT NULL, -- nuevo, variante, reformulacion, adaptacion
    
    -- Contexto de generación
    id_canonico_base    VARCHAR(30), -- Si es variante/reformulación
    prompt_usado        TEXT, -- Prompt completo usado para generación
    contexto_consultado JSONB, -- Ítems similares consultados como contexto
    modelo_ia           VARCHAR(50), -- Modelo usado (GPT-4, Claude, etc.)
    temperatura         DECIMAL(3,2), -- Parámetro de generación
    
    -- Estado
    estado              VARCHAR(20) NOT NULL DEFAULT 'borrador',
    
    -- Aprobación
    fecha_aprobacion    TIMESTAMP WITH TIME ZONE,
    aprobado_por        INTEGER,
    comentarios_aprobacion TEXT,
    
    -- Auditoría
    fecha_generacion    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    generado_por        INTEGER, -- Usuario que inició la generación
    
    -- Constraints
    CONSTRAINT fk_generado_canonico_base 
        FOREIGN KEY (id_canonico_base) REFERENCES item_canonico(id_canonico) ON DELETE SET NULL,
    CONSTRAINT fk_generado_aprobado_por 
        FOREIGN KEY (aprobado_por) REFERENCES usuario_revisor(id_usuario) ON DELETE SET NULL,
    CONSTRAINT chk_tipo_generacion 
        CHECK (tipo_generacion IN ('nuevo', 'variante', 'reformulacion', 'adaptacion', 'traduccion')),
    CONSTRAINT chk_estado_generado 
        CHECK (estado IN ('borrador', 'en_revision', 'aprobado', 'rechazado', 'implementado'))
);

COMMENT ON TABLE item_generado IS 'Ítems generados por IA o propuestos manualmente';
COMMENT ON COLUMN item_generado.tipo_generacion IS 'Tipo de generación: nuevo, variante, reformulacion, adaptacion';
COMMENT ON COLUMN item_generado.prompt_usado IS 'Prompt completo utilizado para la generación';
COMMENT ON COLUMN item_generado.contexto_consultado IS 'JSON con ítems similares usados como contexto';

CREATE INDEX idx_generado_estado ON item_generado(estado);
CREATE INDEX idx_generado_tipo ON item_generado(tipo_generacion);
CREATE INDEX idx_generado_base ON item_generado(id_canonico_base);
CREATE INDEX idx_generado_fecha ON item_generado(fecha_generacion);
CREATE INDEX idx_generado_texto_trgm ON item_generado USING GIN(texto_propuesto gin_trgm_ops);

-- ============================================================================
-- 13. TABLA: propuesta_clasificacion
-- ============================================================================
-- Propósito: Propuestas de clasificación para ítems generados
-- ============================================================================

CREATE TABLE propuesta_clasificacion (
    id_propuesta        VARCHAR(45) PRIMARY KEY,
    secuencia_interna   SERIAL UNIQUE,
    
    -- Relación
    id_item_generado    VARCHAR(35) NOT NULL,
    numero_propuesta    INTEGER NOT NULL, -- Secuencia por ítem generado
    
    -- Clasificación propuesta
    id_actor_sugerido       INTEGER NOT NULL,
    id_dimension_sugerida   INTEGER NOT NULL,
    id_subdimension_sugerida INTEGER,
    
    -- Confianza y justificación
    confianza_clasificacion DECIMAL(4,3) NOT NULL, -- 0.000 a 1.000
    justificacion_clasificacion TEXT,
    
    -- Detección de similitud
    items_similares_detectados JSONB, -- [{id_item, similitud, justificacion}]
    nivel_redundancia       VARCHAR(20), -- ninguno, bajo, medio, alto, critico
    
    -- Estado de revisión
    estado_revision         VARCHAR(20) DEFAULT 'pendiente',
    comentario_revisor      TEXT,
    id_revisor              INTEGER,
    fecha_revision          TIMESTAMP WITH TIME ZONE,
    
    -- Auditoría
    fecha_propuesta         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_propuesta_item_generado 
        FOREIGN KEY (id_item_generado) REFERENCES item_generado(id_item_generado) ON DELETE CASCADE,
    CONSTRAINT fk_propuesta_actor 
        FOREIGN KEY (id_actor_sugerido) REFERENCES actor(id_actor) ON DELETE RESTRICT,
    CONSTRAINT fk_propuesta_dimension 
        FOREIGN KEY (id_dimension_sugerida) REFERENCES dimension(id_dimension) ON DELETE RESTRICT,
    CONSTRAINT fk_propuesta_subdimension 
        FOREIGN KEY (id_subdimension_sugerida) REFERENCES subdimension(id_subdimension) ON DELETE SET NULL,
    CONSTRAINT fk_propuesta_revisor 
        FOREIGN KEY (id_revisor) REFERENCES usuario_revisor(id_usuario) ON DELETE SET NULL,
    CONSTRAINT chk_confianza_clasificacion 
        CHECK (confianza_clasificacion BETWEEN 0 AND 1),
    CONSTRAINT chk_nivel_redundancia 
        CHECK (nivel_redundancia IN ('ninguno', 'bajo', 'medio', 'alto', 'critico')),
    CONSTRAINT chk_estado_revision 
        CHECK (estado_revision IN ('pendiente', 'aprobada', 'rechazada', 'modificada')),
    CONSTRAINT uq_propuesta_numero UNIQUE (id_item_generado, numero_propuesta)
);

COMMENT ON TABLE propuesta_clasificacion IS 'Propuestas de clasificación para ítems generados';
COMMENT ON COLUMN propuesta_clasificacion.confianza_clasificacion IS 'Nivel de confianza de la clasificación (0-1)';
COMMENT ON COLUMN propuesta_clasificacion.items_similares_detectados IS 'JSON con ítems similares y sus scores';
COMMENT ON COLUMN propuesta_clasificacion.nivel_redundancia IS 'Nivel de redundancia con ítems existentes';

CREATE INDEX idx_propuesta_item ON propuesta_clasificacion(id_item_generado);
CREATE INDEX idx_propuesta_estado ON propuesta_clasificacion(estado_revision);
CREATE INDEX idx_propuesta_confianza ON propuesta_clasificacion(confianza_clasificacion);
CREATE INDEX idx_propuesta_redundancia ON propuesta_clasificacion(nivel_redundancia);

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista completa de ítems con toda su jerarquía
CREATE OR REPLACE VIEW vista_items_completa AS
SELECT 
    ic.id_canonico,
    ic.texto_canonico,
    ic.estado as estado_canonico,
    a.nombre as actor,
    d.nombre as dimension,
    sd.nombre as subdimension,
    iv.id_variante,
    iv.texto_variante,
    iv.tipo_variante,
    iv.estado_aprobacion,
    io.id_ocurrencia,
    io.anio_aplicacion,
    io.formulario,
    io.posicion_formulario,
    io.estado_procesamiento
FROM item_canonico ic
JOIN actor a ON ic.id_actor = a.id_actor
JOIN dimension d ON ic.id_dimension = d.id_dimension
LEFT JOIN subdimension sd ON ic.id_subdimension = sd.id_subdimension
LEFT JOIN item_variante iv ON ic.id_canonico = iv.id_canonico
LEFT JOIN item_ocurrencia io ON iv.id_variante = io.id_variante;

COMMENT ON VIEW vista_items_completa IS 'Vista unificada de toda la jerarquía de ítems';

-- Vista de resultados psicométricos con contexto
CREATE OR REPLACE VIEW vista_resultados_contexto AS
SELECT 
    ri.id_resultado,
    ri.id_ocurrencia,
    io.anio_aplicacion,
    io.formulario,
    ic.id_canonico,
    ic.texto_canonico,
    iv.id_variante,
    ri.metodo_estimacion,
    ri.parametro_dificultad,
    ri.parametro_discriminacion,
    ri.p_valor,
    ri.punto_biserial,
    ri.tamano_muestral,
    ri.fecha_calculo
FROM resultado_item ri
JOIN item_ocurrencia io ON ri.id_ocurrencia = io.id_ocurrencia
JOIN item_variante iv ON io.id_variante = iv.id_variante
JOIN item_canonico ic ON iv.id_canonico = ic.id_canonico;

COMMENT ON VIEW vista_resultados_contexto IS 'Resultados psicométricos con contexto del ítem';

-- ============================================================================
-- FUNCIONES AUXILIARES
-- ============================================================================

-- Función para generar ID canónico
CREATE OR REPLACE FUNCTION generar_id_canonico(p_anio_inicio INTEGER)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_secuencia INTEGER;
    v_id VARCHAR(30);
BEGIN
    -- Obtener siguiente valor de secuencia
    SELECT nextval('item_canonico_secuencia_interna_seq') INTO v_secuencia;
    
    -- Formatear ID
    v_id := 'IDPS-CAN-' || p_anio_inicio || '-' || LPAD(v_secuencia::TEXT, 4, '0');
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generar_id_canonico IS 'Genera un nuevo ID canónico con formato IDPS-CAN-{AÑO}-{SECUENCIA}';

-- Función para obtener historial completo de un ítem
CREATE OR REPLACE FUNCTION obtener_historial_item(p_id_canonico VARCHAR(30))
RETURNS TABLE (
    nivel VARCHAR(20),
    id VARCHAR(50),
    texto TEXT,
    anio INTEGER,
    estado VARCHAR(20),
    fecha TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- Canónico y sus versiones
    RETURN QUERY
    SELECT 
        'canonico'::VARCHAR(20) as nivel,
        ic.id_canonico::VARCHAR(50) as id,
        substring(ic.texto_canonico from 1 for 100) as texto,
        NULL::INTEGER as anio,
        ic.estado::VARCHAR(20),
        ic.fecha_creacion
    FROM item_canonico ic
    WHERE ic.id_canonico = p_id_canonico
    
    UNION ALL
    
    -- Versiones del canónico
    SELECT 
        'version'::VARCHAR(20),
        (icv.id_canonico || '-V' || icv.numero_version)::VARCHAR(50),
        substring(icv.texto_canonico from 1 for 100),
        NULL::INTEGER,
        'historico'::VARCHAR(20),
        icv.fecha_version
    FROM item_canonico_version icv
    WHERE icv.id_canonico = p_id_canonico
    
    UNION ALL
    
    -- Variantes
    SELECT 
        'variante'::VARCHAR(20),
        iv.id_variante::VARCHAR(50),
        substring(iv.texto_variante from 1 for 100),
        NULL::INTEGER,
        iv.estado_aprobacion::VARCHAR(20),
        iv.fecha_creacion
    FROM item_variante iv
    WHERE iv.id_canonico = p_id_canonico
    
    UNION ALL
    
    -- Ocurrencias
    SELECT 
        'ocurrencia'::VARCHAR(20),
        io.id_ocurrencia::VARCHAR(50),
        NULL::TEXT,
        io.anio_aplicacion,
        io.estado_procesamiento::VARCHAR(20),
        io.fecha_registro
    FROM item_ocurrencia io
    JOIN item_variante iv2 ON io.id_variante = iv2.id_variante
    WHERE iv2.id_canonico = p_id_canonico
    
    ORDER BY fecha;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION obtener_historial_item IS 'Obtiene el historial completo de un ítem canónico';

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================
