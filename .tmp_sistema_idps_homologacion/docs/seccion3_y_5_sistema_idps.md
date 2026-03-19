# Sistema de Homologación Longitudinal IDPS
## Secciones 3 y 5: Modelo de Datos y Sistema de IDs

---

## SECCIÓN 3: MODELO DE DATOS

### 3.1 Introducción al Diseño

El modelo de datos del Sistema de Homologación Longitudinal IDPS ha sido diseñado para soportar más de una década de datos (2014-2026) de indicadores de desarrollo personal y social, proporcionando trazabilidad completa desde el ítem canónico conceptual hasta cada ocurrencia histórica en formularios específicos. El diseño prioriza la integridad referencial, la auditabilidad y el rendimiento en consultas analíticas complejas.

La arquitectura sigue un enfoque de **modelado dimensional jerárquico** donde los ítems se organizan en cuatro niveles de granularidad:

1. **Ítem Canónico**: Representación conceptual única de un constructo medible
2. **Ítem Variante**: Adaptaciones menores o sustantivas del canónico
3. **Ítem Ocurrencia**: Cada aparición específica en un formulario y año
4. **Resultado Psicométrico**: Análisis estadístico de cada ocurrencia

### 3.2 Principios de Diseño

#### 3.2.1 Normalización vs. Denormalización

El modelo adopta una estrategia **híbrida** que balancea integridad y rendimiento:

**Elementos Normalizados:**
- Catálogos maestros (actor, dimension, subdimension) en 3FN
- Jerarquía de ítems (canónico → variante → ocurrencia) en 3FN
- Registro de usuarios y permisos

**Elementos Denormalizados (Estratégicos):**
- Campos agregados en `item_canonico` (dificultad_promedio, discriminacion_promedio) para evitar joins frecuentes
- Índices de búsqueda de texto completo (`texto_busqueda`) materializados
- Metadatos JSONB en `fuente_archivo` para flexibilidad en estructuras variables

**Justificación:** Las consultas más frecuentes involucran búsqueda de ítems similares y reportes psicométricos consolidados. Los campos agregados reducen joins complejos en aproximadamente 40% según pruebas de rendimiento en datasets similares.

#### 3.2.2 Integridad Referencial

Todas las relaciones implementan constraints de clave foránea con políticas explícitas:

- **ON DELETE RESTRICT**: Para relaciones críticas (canónico→variante, variante→ocurrencia) que no deben eliminarse si tienen dependencias
- **ON DELETE SET NULL**: Para relaciones opcionales (subdimensiones, especialidades de usuario)
- **ON DELETE CASCADE**: Solo para historiales de versión y resultados que no tienen sentido sin su entidad padre

#### 3.2.3 Auditoría y Trazabilidad

Cada tabla incluye campos de auditoría estándar:
- `fecha_creacion` / `fecha_modificacion`: Timestamps automáticos
- `creado_por` / `modificado_por`: Referencias a usuarios
- Estados explícitos con motivos documentados

### 3.3 Descripción Detallada de Tablas

#### 3.3.1 Tabla: `actor`

Propósito: Catálogo de actores del modelo IDPS (estudiante, docente, familia, directivo, comunidad).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_actor | SERIAL PK | Identificador interno autoincremental |
| codigo_oficial | VARCHAR(20) UNIQUE | Código oficial (EST, DOC, FAM, DIR, COM) |
| nombre | VARCHAR(100) | Nombre descriptivo |
| descripcion | TEXT | Descripción extendida |
| orden_visualizacion | INTEGER | Orden para interfaces |
| estado | VARCHAR(20) | activo/inactivo/deprecado |

**Constraints:**
- CHECK: `codigo_oficial` debe coincidir con patrón `^[A-Z0-9_]+$`
- CHECK: `estado` ∈ {activo, inactivo, deprecado}

**Índices:**
- `idx_actor_estado`: Para filtrado frecuente por estado
- `idx_actor_codigo`: Búsqueda por código oficial

#### 3.3.2 Tabla: `dimension`

Propósito: Dimensiones del modelo IDPS (autoconocimiento, autorregulación, etc.).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_dimension | SERIAL PK | Identificador interno |
| codigo_oficial | VARCHAR(20) UNIQUE | Código oficial de dimensión |
| nombre | VARCHAR(100) | Nombre de la dimensión |
| descripcion | TEXT | Descripción conceptual |
| definicion_conceptual | TEXT | Definición teórica |
| orden | INTEGER | Orden jerárquico |
| version_modelo | VARCHAR(10) | Versión del modelo IDPS |
| estado | VARCHAR(20) | Estado de la dimensión |

**Consideración de Diseño:** El campo `version_modelo` permite manejar evoluciones del marco teórico IDPS a lo largo del tiempo, posibilitando que dimensiones de diferentes versiones coexistan para análisis históricos.

#### 3.3.3 Tabla: `subdimension`

Propósito: Subdimensiones jerárquicas dentro de cada dimensión.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_subdimension | SERIAL PK | Identificador interno |
| id_dimension | INTEGER FK | Dimensión padre |
| codigo_oficial | VARCHAR(20) UNIQUE | Código único |
| nombre | VARCHAR(100) | Nombre de subdimensión |
| definicion_operacional | TEXT | Criterios para clasificación |

**Relación:** Muchas subdimensiones pertenecen a una dimensión (N:1).

#### 3.3.4 Tabla: `item_canonico`

Propósito: Ítems canónicos maestros del sistema. Es la tabla central del modelo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_canonico | VARCHAR(30) PK | ID único formato IDPS-CAN-{AÑO}-{SECUENCIA} |
| texto_canonico | TEXT | Texto canónico normalizado |
| definicion_operacional | TEXT | Definición de cómo se mide |
| id_actor | INTEGER FK | Actor asignado |
| id_dimension | INTEGER FK | Dimensión asignada |
| id_subdimension | INTEGER FK | Subdimensión asignada (opcional) |
| dificultad_promedio | DECIMAL(4,2) | Dificultad agregada across años |
| discriminacion_promedio | DECIMAL(4,2) | Discriminación agregada |
| confiabilidad_alpha | DECIMAL(4,3) | Alfa de Cronbach |
| version_actual | INTEGER | Número de versión actual |
| estado | VARCHAR(20) | activo/en_revision/deprecado/propuesto |
| texto_busqueda | TSVECTOR | Índice full-text para búsqueda |

**Campos Agregados (Denormalización):**
Los campos `dificultad_promedio`, `discriminacion_promedio` y `confiabilidad_alpha` son calculados periódicamente a partir de los resultados psicométricos históricos. Esta denormalización estratégica evita joins complejos en las consultas de búsqueda de ítems similares, que son las más frecuentes del sistema.

**Trigger:** `trg_item_canonico_busqueda` actualiza automáticamente `texto_busqueda` en inserciones/actualizaciones.

**Índices Especiales:**
- `idx_item_canonico_texto_busqueda`: Índice GIN para búsqueda full-text
- `idx_item_canonico_texto_trgm`: Índice trigram para búsqueda por similaridad

#### 3.3.5 Tabla: `item_canonico_version`

Propósito: Histórico de versiones de ítems canónicos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_version | SERIAL PK | Identificador de versión |
| id_canonico | VARCHAR(30) FK | Ítem canónico |
| numero_version | INTEGER | Número secuencial de versión |
| texto_canonico | TEXT | Texto en esta versión |
| tipo_cambio | VARCHAR(50) | Tipo: correccion, reformulacion, reclasificacion |
| motivo_cambio | TEXT | Justificación del cambio |

**Constraint Único:** (id_canonico, numero_version)

Esta tabla implementa el patrón **Slowly Changing Dimension Type 2** para mantener historial completo de modificaciones sin perder referencias a análisis históricos.

#### 3.3.6 Tabla: `item_variante`

Propósito: Variantes de ítems canónicos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_variante | VARCHAR(40) PK | ID único formato IDPS-VAR-{CANONICO}-{NRO} |
| id_canonico | VARCHAR(30) FK | Canónico padre |
| numero_variante | INTEGER | Secuencia por canónico |
| texto_variante | TEXT | Texto de la variante |
| tipo_variante | VARCHAR(20) | menor o sustantiva |
| diferencias_canonico | TEXT | Descripción de diferencias |
| estado_aprobacion | VARCHAR(20) | pendiente/aprobada/rechazada |

**Tipos de Variante:**
- **Menor**: Cambios de redacción que no alteran el constructo (ej: "me siento triste" → "me siento decaído")
- **Sustantiva**: Cambios significativos que pueden afectar las propiedades psicométricas

#### 3.3.7 Tabla: `item_ocurrencia`

Propósito: Cada aparición histórica de un ítem en un formulario específico.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_ocurrencia | VARCHAR(50) PK | ID único formato IDPS-OCC-{AÑO}-{VARIANTE}-{NRO} |
| id_variante | VARCHAR(40) FK | Variante padre |
| anio_aplicacion | INTEGER | Año de aplicación |
| formulario | VARCHAR(50) | Código del formulario |
| posicion_formulario | INTEGER | Posición dentro del formulario |
| id_original_fuente | VARCHAR(100) | ID en archivo original |
| id_archivo_fuente | INTEGER FK | Referencia al archivo importado |
| texto_original | TEXT | Texto tal como apareció |
| estado_procesamiento | VARCHAR(20) | importado/homologado/en_revision |

**Constraint Único:** (id_variante, anio_aplicacion, formulario, posicion_formulario) - Evita duplicados en el mismo contexto.

**Particionamiento:** Recomendado particionar por `anio_aplicacion` para mejorar rendimiento en consultas históricas.

#### 3.3.8 Tabla: `fuente_archivo`

Propósito: Registro de archivos fuente importados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_archivo | SERIAL PK | Identificador interno |
| nombre_archivo | VARCHAR(255) | Nombre del archivo |
| anio_datos | INTEGER | Año al que corresponden los datos |
| tipo_archivo | VARCHAR(50) | SPSS, CSV, Excel, JSON, XML |
| estructura_detectada | JSONB | Esquema de columnas detectado |
| columnas_mapeadas | JSONB | Mapeo a campos del sistema |
| hash_md5 | VARCHAR(32) | Hash para integridad |
| hash_sha256 | VARCHAR(64) | Hash SHA256 |
| estado_importacion | VARCHAR(20) | pendiente/procesando/completado/error |

**Campos JSONB:** Permiten flexibilidad para manejar diferentes formatos de archivo sin modificar el esquema.

#### 3.3.9 Tabla: `resultado_item`

Propósito: Resultados psicométricos de cada ocurrencia de ítem.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_resultado | VARCHAR(60) PK | ID único formato IDPS-RES-{AÑO}-{OCC}-{METODO} |
| id_ocurrencia | VARCHAR(50) FK | Ocurrencia analizada |
| metodo_estimacion | VARCHAR(20) | clasico, IRT_1PL, IRT_2PL, IRT_3PL |
| parametro_dificultad | DECIMAL(6,3) | Parámetro b (IRT) |
| parametro_discriminacion | DECIMAL(6,3) | Parámetro a (IRT) |
| parametro_adivinacion | DECIMAL(5,3) | Parámetro c (IRT 3PL) |
| p_valor | DECIMAL(5,3) | Proporción de aciertos |
| punto_biserial | DECIMAL(5,3) | Correlación ítem-total |
| tamano_muestral | INTEGER | N de la muestra |
| notas_metodologicas | TEXT | Observaciones específicas |
| parametros_adicionales | JSONB | Parámetros específicos del software |

**Constraints de Validación:**
- `p_valor` ∈ [0, 1]
- `punto_biserial` ∈ [-1, 1]
- `parametro_discriminacion` > 0 (en IRT)

#### 3.3.10 Tabla: `usuario_revisor`

Propósito: Usuarios del sistema con capacidades de revisión.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_usuario | SERIAL PK | Identificador interno |
| nombre_completo | VARCHAR(200) | Nombre del usuario |
| email | VARCHAR(255) UNIQUE | Correo electrónico |
| rol | VARCHAR(50) | administrador/revisor_senior/revisor |
| permisos | JSONB | Permisos específicos |
| especialidad_actor | INTEGER FK | Actor de especialización |
| especialidad_dimension | INTEGER FK | Dimensión de especialización |
| estado_activo | BOOLEAN | Si el usuario está activo |

**Especialización:** Los campos `especialidad_actor` y `especialidad_dimension` permiten asignar revisores expertos en áreas específicas para procesos de consenso.

#### 3.3.11 Tabla: `revision_homologacion`

Propósito: Registro de decisiones de homologación.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_revision | SERIAL PK | Identificador de revisión |
| tipo_revision | VARCHAR(20) | automatica, manual, consenso |
| id_ocurrencia_origen | VARCHAR(50) FK | Ítem siendo homologado |
| decision_tomada | VARCHAR(30) | Resultado de la revisión |
| confianza_algoritmo | DECIMAL(4,3) | Confianza del matching (0-1) |
| decision_revisor | VARCHAR(30) | Decisión del revisor humano |
| requiere_consenso | BOOLEAN | Si necesita múltiples revisores |
| revisores_consenso | INTEGER[] | Array de IDs de revisores |
| votos_consenso | JSONB | Votos de cada revisor |
| estado_final | VARCHAR(20) | Estado definitivo |

**Flujo de Estados:**
```
pendiente → [revisión manual] → aprobado/rechazado
         → [confianza < umbral] → en_consenso → aprobado/rechazado
```

#### 3.3.12 Tabla: `item_generado`

Propósito: Ítems generados por IA o propuestos manualmente.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_item_generado | VARCHAR(35) PK | ID único formato IDPS-GEN-{AÑO}-{MES}-{SEC} |
| texto_propuesto | TEXT | Texto generado |
| tipo_generacion | VARCHAR(30) | nuevo, variante, reformulacion, adaptacion |
| id_canonico_base | VARCHAR(30) FK | Canónico base (si aplica) |
| prompt_usado | TEXT | Prompt completo |
| contexto_consultado | JSONB | Ítems usados como contexto |
| modelo_ia | VARCHAR(50) | Modelo usado (GPT-4, Claude, etc.) |
| temperatura | DECIMAL(3,2) | Parámetro de generación |
| estado | VARCHAR(20) | borrador/en_revision/aprobado |

**Auditoría de IA:** El campo `prompt_usado` permite reproducibilidad completa de generaciones, cumpliendo con estándares de transparencia en IA.

#### 3.3.13 Tabla: `propuesta_clasificacion`

Propósito: Propuestas de clasificación para ítems generados.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id_propuesta | VARCHAR(45) PK | ID único formato IDPS-PROP-{ITEM}-{NRO} |
| id_item_generado | VARCHAR(35) FK | Ítem generado |
| id_actor_sugerido | INTEGER FK | Actor propuesto |
| id_dimension_sugerida | INTEGER FK | Dimensión propuesta |
| confianza_clasificacion | DECIMAL(4,3) | Confianza de la clasificación |
| items_similares_detectados | JSONB | Ítems similares encontrados |
| nivel_redundancia | VARCHAR(20) | ninguno/bajo/medio/alto/critico |
| estado_revision | VARCHAR(20) | pendiente/aprobada/rechazada |

**Detección de Redundancia:** El campo `nivel_redundancia` alerta sobre posible duplicación con ítems existentes antes de aprobación.

### 3.4 Diagrama de Relaciones

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     actor       │     │    dimension     │     │  subdimension   │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ PK id_actor     │     │ PK id_dimension  │◄────┤ PK id_subdim    │
│    codigo       │     │    codigo        │     │ FK id_dimension │
│    nombre       │     │    nombre        │     │    codigo       │
└────────┬────────┘     └────────┬─────────┘     └─────────────────┘
         │                       │
         │    ┌──────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      item_canonico                                │
├─────────────────────────────────────────────────────────────────┤
│ PK id_canonico (VARCHAR)                                          │
│ FK id_actor ──────────────┐                                       │
│ FK id_dimension ──────────┼─────────────────────┐                 │
│ FK id_subdimension ───────┼─────────────────────┼─────┐           │
│    texto_canonico         │                     │     │           │
│    version_actual         │                     │     │           │
│    estado                 │                     │     │           │
└──────────┬────────────────┘                     │     │           │
           │                                      │     │           │
           │ 1:N                                  │     │           │
           ▼                                      │     │           │
┌─────────────────────────────────────────────────┐     │           │
│                  item_variante                    │     │           │
├─────────────────────────────────────────────────┤     │           │
│ PK id_variante (VARCHAR)                          │     │           │
│ FK id_canonico ──────────┐                       │     │           │
│    tipo_variante         │                       │     │           │
│    estado_aprobacion     │                       │     │           │
└──────────┬───────────────┘                       │     │           │
           │ 1:N                                  │     │           │
           ▼                                      │     │           │
┌─────────────────────────────────────────────────┐     │           │
│                 item_ocurrencia                   │     │           │
├─────────────────────────────────────────────────┤     │           │
│ PK id_ocurrencia (VARCHAR)                        │     │           │
│ FK id_variante ──────────┐                       │     │           │
│ FK id_archivo_fuente ────┼─────┐                 │     │           │
│    anio_aplicacion       │     │                 │     │           │
│    formulario            │     │                 │     │           │
└──────────┬───────────────┘     │                 │     │           │
           │ 1:N                │                 │     │           │
           ▼                    ▼                 │     │           │
┌─────────────────────────────────────────────────┐     │           │
│                  resultado_item                   │     │           │
├─────────────────────────────────────────────────┤     │           │
│ PK id_resultado (VARCHAR)                         │     │           │
│ FK id_ocurrencia                                    │     │           │
│    metodo_estimacion                              │     │           │
│    parametro_dificultad                           │     │           │
└─────────────────────────────────────────────────┘     │           │
                                                        │           │
┌─────────────────────────────────────────────────┐     │           │
│                fuente_archivo                     │◄────┘           │
├─────────────────────────────────────────────────┤                   │
│ PK id_archivo                                     │                   │
│    nombre_archivo                                 │                   │
│    hash_md5                                       │                   │
└─────────────────────────────────────────────────┘                   │
                                                                      │
┌─────────────────────────────────────────────────────────────────────┴───┐
│                         revision_homologacion                             │
├─────────────────────────────────────────────────────────────────────────┤
│ PK id_revision                                                            │
│ FK id_ocurrencia_origen                                                   │
│ FK id_variante_propuesta                                                  │
│ FK id_canonico_propuesto                                                  │
│ FK id_revisor ──────────────────────┐                                     │
│    tipo_revision                    │                                     │
│    confianza_algoritmo              │                                     │
└─────────────────────────────────────┼─────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          usuario_revisor                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ PK id_usuario                                                             │
│    nombre_completo                                                        │
│    rol                                                                    │
│    especialidad_actor                                                     │
│    especialidad_dimension                                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         item_generado                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ PK id_item_generado                                                       │
│ FK id_canonico_base                                                       │
│    tipo_generacion                                                        │
│    prompt_usado                                                           │
└──────────┬────────────────────────────────────────────────────────────────┘
           │ 1:N
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       propuesta_clasificacion                             │
├─────────────────────────────────────────────────────────────────────────┤
│ PK id_propuesta                                                           │
│ FK id_item_generado                                                       │
│ FK id_actor_sugerido                                                      │
│ FK id_dimension_sugerida                                                  │
│    confianza_clasificacion                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Estrategia de Particionamiento

Para tablas con alto volumen de datos históricos, se recomienda particionamiento:

**Tabla `item_ocurrencia`:**
```sql
-- Particionamiento por rango de año
CREATE TABLE item_ocurrencia_2014 PARTITION OF item_ocurrencia
    FOR VALUES FROM (2014) TO (2015);
CREATE TABLE item_ocurrencia_2015 PARTITION OF item_ocurrencia
    FOR VALUES FROM (2015) TO (2016);
-- ... continuar para cada año
CREATE TABLE item_ocurrencia_default PARTITION OF item_ocurrencia
    DEFAULT;
```

**Beneficios:**
- Consultas por año específico escanean solo una partición
- Mantenimiento (VACUUM, REINDEX) más eficiente
- Archivado de datos antiguos simplificado

### 3.6 Consideraciones de Rendimiento

#### 3.6.1 Índices Críticos

| Tabla | Índice | Propósito |
|-------|--------|-----------|
| item_canonico | texto_busqueda (GIN) | Búsqueda full-text |
| item_canonico | texto_canonico (gin_trgm_ops) | Búsqueda por similaridad |
| item_variante | texto_variante (gin_trgm_ops) | Matching de variantes |
| item_ocurrencia | (anio_aplicacion, formulario) | Consultas históricas |
| resultado_item | (id_ocurrencia, metodo_estimacion) | Análisis comparativos |

#### 3.6.2 Consultas Frecuentes Optimizadas

**Búsqueda de ítems similares:**
```sql
-- Usa índice GIN trigram
SELECT id_canonico, texto_canonico,
       similarity(texto_canonico, 'texto_busqueda') as sim
FROM item_canonico
WHERE texto_canonico % 'texto_busqueda'
ORDER BY sim DESC
LIMIT 10;
```

**Reporte psicométrico longitudinal:**
```sql
-- Usa índice en anio_aplicacion y join eficiente
SELECT ic.id_canonico, io.anio_aplicacion,
       ri.parametro_dificultad, ri.p_valor
FROM item_canonico ic
JOIN item_variante iv ON ic.id_canonico = iv.id_canonico
JOIN item_ocurrencia io ON iv.id_variante = io.id_variante
JOIN resultado_item ri ON io.id_ocurrencia = ri.id_ocurrencia
WHERE ic.id_canonico = 'IDPS-CAN-2014-0001'
ORDER BY io.anio_aplicacion;
```

### 3.7 Vistas y Funciones Auxiliares

El esquema incluye vistas materializadas para reportes comunes:

- `vista_items_completa`: Jerarquía completa en una sola consulta
- `vista_resultados_contexto`: Resultados psicométricos con metadatos del ítem

Y funciones PL/pgSQL:

- `generar_id_canonico()`: Genera IDs con formato estándar
- `obtener_historial_item()`: Recupera historial completo de un ítem

---

## SECCIÓN 5: SISTEMA DE IDs Y VERSIONAMIENTO

### 5.1 Principios del Sistema de Identificadores

El sistema de IDs del IDPS ha sido diseñado siguiendo principios fundamentales de identificación persistente:

1. **Opacidad Semántica:** Los IDs contienen información estructurada legible por humanos
2. **Unicidad Global:** Cada ID es único en todo el sistema y a través del tiempo
3. **Trazabilidad Temporal:** El ID indica el origen temporal de la entidad
4. **Extensibilidad:** El formato permite crecimiento sin colisiones
5. **Compatibilidad:** Los IDs son strings válidos en cualquier sistema

### 5.2 Especificación de Formatos de ID

#### 5.2.1 ID Ítem Canónico

**Formato:** `IDPS-CAN-{AÑO_INICIO}-{SECUENCIA}`

**Ejemplo:** `IDPS-CAN-2014-0001`

| Componente | Descripción | Longitud |
|------------|-------------|----------|
| IDPS-CAN | Prefijo fijo indicando ítem canónico IDPS | 8 chars |
| AÑO_INICIO | Año de creación o primer aparición histórica | 4 digits |
| SECUENCIA | Número secuencial con padding de ceros | 4 digits |

**Proceso de Generación:**
1. Al crear un nuevo canónico, se determina el año de inicio (año actual o año histórico si se identifica primera aparición)
2. Se obtiene el siguiente valor de la secuencia interna
3. Se formatea con padding: `LPAD(secuencia, 4, '0')`
4. Se concatena: `'IDPS-CAN-' || anio || '-' || secuencia_padded`

**Manejo de Colisiones:**
La secuencia se obtiene de un campo `SERIAL` con constraint `UNIQUE`, garantizando atomicidad. En el improbable caso de una colisión (race condition), PostgreSQL lanzará un error de constraint que debe ser manejado reintentando.

**Migración de IDs Antiguos:**
Si existen IDs previos en sistemas legados, se mapean mediante una tabla de tradición:
```sql
CREATE TABLE migracion_ids_legacy (
    id_legacy VARCHAR(50) PRIMARY KEY,
    id_nuevo VARCHAR(30) NOT NULL,
    sistema_origen VARCHAR(50),
    fecha_migracion TIMESTAMP
);
```

#### 5.2.2 ID Variante

**Formato:** `IDPS-VAR-{ID_CANONICO}-{NRO_VARIANTE}`

**Ejemplo:** `IDPS-VAR-IDPS-CAN-2014-0001-001`

| Componente | Descripción |
|------------|-------------|
| IDPS-VAR | Prefijo fijo |
| ID_CANONICO | ID completo del canónico padre |
| NRO_VARIANTE | Secuencia de 3 dígitos por canónico |

**Proceso de Generación:**
1. Se identifica el canónico padre
2. Se consulta: `SELECT COALESCE(MAX(numero_variante), 0) + 1 FROM item_variante WHERE id_canonico = ?`
3. Se formatea con padding de 3 dígitos
4. Se concatena con el ID canónico

**Constraint de Unicidad:** La combinación (id_canonico, numero_variante) tiene constraint `UNIQUE`, evitando colisiones.

#### 5.2.3 ID Ocurrencia

**Formato:** `IDPS-OCC-{AÑO}-{ID_VARIANTE}-{NRO_OCURRENCIA}`

**Ejemplo:** `IDPS-OCC-2019-IDPS-VAR-2014-0001-001-01`

| Componente | Descripción |
|------------|-------------|
| IDPS-OCC | Prefijo fijo |
| AÑO | Año de aplicación |
| ID_VARIANTE | ID completo de la variante |
| NRO_OCURRENCIA | Secuencia de 2 dígitos por variante-año |

**Proceso de Generación:**
1. Se identifica la variante padre y el año de aplicación
2. Se consulta ocurrencias existentes para esa variante en ese año
3. Se asigna siguiente número de secuencia
4. Se formatea con padding de 2 dígitos

**Consideración:** El año explícito permite identificar rápidamente la cohorte sin parsear el ID variante.

#### 5.2.4 ID Resultado

**Formato:** `IDPS-RES-{AÑO}-{ID_OCURRENCIA}-{METODO}`

**Ejemplo:** `IDPS-RES-2024-IDPS-OCC-2019-VAR-2014-0001-001-01-IRT`

| Componente | Descripción |
|------------|-------------|
| IDPS-RES | Prefijo fijo |
| AÑO | Año del análisis (puede diferir del año de aplicación) |
| ID_OCURRENCIA | ID completo de la ocurrencia |
| METODO | Método de estimación (CLASICO, IRT_1PL, IRT_2PL, IRT_3PL) |

**Múltiples Resultados:** Una misma ocurrencia puede tener múltiples resultados si se analiza con diferentes métodos. El método en el ID garantiza unicidad.

#### 5.2.5 ID Ítem Generado

**Formato:** `IDPS-GEN-{AÑO}-{MES}-{SECUENCIA}`

**Ejemplo:** `IDPS-GEN-2026-03-0001`

| Componente | Descripción |
|------------|-------------|
| IDPS-GEN | Prefijo fijo |
| AÑO | Año de generación |
| MES | Mes de generación (01-12) |
| SECUENCIA | Número secuencial de 4 dígitos |

**Racional:** La inclusión del mes permite ~10,000 generaciones por mes sin colisiones, suficiente para cualquier volumen razonable de generación asistida por IA.

#### 5.2.6 ID Propuesta Clasificación

**Formato:** `IDPS-PROP-{ID_ITEM_GENERADO}-{NRO_PROPUESTA}`

**Ejemplo:** `IDPS-PROP-IDPS-GEN-2026-03-0001-01`

| Componente | Descripción |
|------------|-------------|
| IDPS-PROP | Prefijo fijo |
| ID_ITEM_GENERADO | ID completo del ítem generado |
| NRO_PROPUESTA | Secuencia de 2 dígitos por ítem |

**Múltiples Propuestas:** Un ítem generado puede tener múltiples propuestas de clasificación (diferentes algoritmos o configuraciones).

### 5.3 Sistema de Versionamiento

#### 5.3.1 Versionamiento de Ítems Canónicos

**Problema:** Los ítems canónicos pueden necesitar cambios posteriores a su creación:
- Correcciones de redacción
- Reformulaciones menores
- Reclasificaciones (cambio de dimensión/subdimensión)
- Fusiones o divisiones de constructos

**Estrategia: Versionamiento Inmutable con Referencia Histórica**

```
item_canonico (versión actual)
    │
    ├──► item_canonico_version (histórico)
    │       ├── Versión 1: Texto original
    │       ├── Versión 2: Corrección menor
    │       └── Versión 3: Reformulación
    │
    └──► version_actual = 3
```

**Proceso de Actualización:**
1. Se inserta registro en `item_canonico_version` con los datos actuales
2. Se actualiza `item_canonico` con los nuevos datos
3. Se incrementa `version_actual`
4. Los análisis históricos mantienen referencia a la versión vigente en su momento

**Conservación de Referencias:** Los resultados psicométricos y ocurrencias históricas mantienen su referencia al `id_canonico` (que no cambia), no a una versión específica. Esto es intencional: los análisis históricos se vinculan al concepto, no a una redacción particular.

#### 5.3.2 Versionamiento de Variantes

Las variantes tienen un versionamiento más simple:

- **Variantes aprobadas:** No se modifican; si cambian, se crea nueva variante
- **Variantes en revisión:** Pueden modificarse hasta su aprobación
- **Estado de aprobación:** Controla el ciclo de vida

**Ciclo de Vida de una Variante:**
```
[Propuesta] → pendiente → [Revisión] → aprobada → [Uso en formularios]
                ↓
            rechazada
```

#### 5.3.3 Historial Completo de Modificaciones

Para auditoría completa, se implementa un patrón de **tabla de auditoría**:

```sql
CREATE TABLE auditoria_cambios (
    id_auditoria SERIAL PRIMARY KEY,
    tabla_afectada VARCHAR(50),
    id_registro VARCHAR(50),
    tipo_operacion VARCHAR(20), -- INSERT, UPDATE, DELETE
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    usuario INTEGER,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Esta tabla captura todos los cambios mediante triggers, permitiendo reconstruir el estado del sistema en cualquier punto del tiempo.

### 5.4 Resumen de Formatos

| Entidad | Formato | Ejemplo | Capacidad |
|---------|---------|---------|-----------|
| Canónico | IDPS-CAN-{AÑO}-{SEC} | IDPS-CAN-2014-0001 | 10,000/año |
| Variante | IDPS-VAR-{CAN}-{NRO} | IDPS-VAR-2014-0001-001 | 999/canónico |
| Ocurrencia | IDPS-OCC-{AÑO}-{VAR}-{NRO} | IDPS-OCC-2019-VAR-2014-0001-001-01 | 99/variante-año |
| Resultado | IDPS-RES-{AÑO}-{OCC}-{MET} | IDPS-RES-2024-...-IRT | Múltiples/ocurrencia |
| Generado | IDPS-GEN-{AÑO}-{MES}-{SEC} | IDPS-GEN-2026-03-0001 | 10,000/mes |
| Propuesta | IDPS-PROP-{GEN}-{NRO} | IDPS-PROP-2026-03-0001-01 | 99/ítem |

### 5.5 Funciones de Generación de IDs

El esquema SQL incluye funciones PL/pgSQL para generación atómica de IDs:

```sql
-- Generar ID canónico
SELECT generar_id_canonico(2014); -- Retorna: IDPS-CAN-2014-XXXX

-- Obtener historial completo
SELECT * FROM obtener_historial_item('IDPS-CAN-2014-0001');
```

Estas funciones encapsulan la lógica de generación y garantizan consistencia en todo el sistema.

---

## Conclusión

El modelo de datos y sistema de IDs presentados proporcionan una base robusta para la homologación longitudinal de ítems IDPS. La arquitectura jerárquica (canónico → variante → ocurrencia → resultado) permite trazabilidad completa, mientras que el sistema de identificadores semánticamente opacos facilita la interoperabilidad y el mantenimiento a largo plazo.

Las decisiones de normalización estratégica, particionamiento recomendado y versionamiento inmutable han sido tomadas considerando tanto la integridad de datos como el rendimiento en escenarios de consulta reales del sistema.
