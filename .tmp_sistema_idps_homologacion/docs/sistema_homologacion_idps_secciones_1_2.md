# SISTEMA DE HOMOLOGACIÓN LONGITUDINAL IDPS
## Documento Técnico-Metodológico

**Agencia de Calidad de la Educación - Chile**
**Versión 1.0 | 2025**

---

# SECCIÓN 1. DEFINICIÓN OPERATIVA DEL PROBLEMA

## 1.1 Resumen Ejecutivo del Problema

El Sistema de Homologación Longitudinal IDPS se enfrenta a un desafío metodológico de alta complejidad: construir una arquitectura de datos unificada que permita rastrear, comparar y analizar ítems de evaluación del Indicador de Desarrollo Personal y Social (IDPS) a lo largo de un período de 12 años (2014-2026), durante el cual no existió un estándar consistente de registro, nomenclatura ni estructura de datos.

Este problema trasciende la mera limpieza de datos; constituye un ejercicio de **ingeniería de conocimiento psicométrico** que requiere establecer equivalencias conceptuales, semánticas y psicométricas entre entidades que fueron registradas de manera heterogénea por diferentes equipos técnicos, en distintos contextos organizacionales y con distintos propósitos evaluativos.

## 1.2 Producto: Qué se debe construir

El sistema debe producir cuatro componentes integrados:

### 1.2.1 Base de Datos Canónica Longitudinal
Un repositorio centralizado donde cada ítem del IDPS tenga un **ID Canónico único y persistente** que trascienda las variaciones temporales de registro. Esta base debe contener:
- La versión canónica del texto del ítem
- Metadatos taxonómicos estandarizados (actor, dimensión, subdimensión)
- Historial completo de ocurrencias por año
- Parámetros psicométricos integrados (Teoría Clásica 2014-2023, IRT 2024-2026)
- Indicadores de confianza de homologación

### 1.2.2 Motor de Homologación Automatizado
Un sistema de matching multi-nivel que proponga vínculos entre ítems nuevos y el corpus histórico, utilizando:
- Matching exacto de texto normalizado
- Similitud semántica mediante embeddings
- Criterios psicométricos de equivalencia
- Scoring de confianza con umbrales definidos

### 1.2.3 Protocolo de Revisión Humana
Un flujo de trabajo estructurado para que psicometras especializados validen, corrijan o rechacen las propuestas de homologación generadas automáticamente, con trazabilidad completa de decisiones.

### 1.2.4 Agente de Clasificación y Ubicación
Un módulo inteligente que, dado un ítem nuevo, proponga:
- Si es homologable con ítems existentes
- Su ubicación taxonómica más probable
- Nivel de confianza de la clasificación
- Recomendación de revisión humana

## 1.3 Datos: Qué se tiene y sus problemas

### 1.3.1 Inventario de Fuentes de Datos

| Período | Formato | Características | Problemas Identificados |
|---------|---------|-----------------|------------------------|
| 2014-2017 | Excel plano | Estructura variable año a año | Nombres de columnas inconsistentes; algunos años sin metadatos taxonómicos |
| 2018-2021 | Excel con múltiples hojas | Intento de estandarización parcial | Duplicidades no resueltas; códigos de ítem no persistentes |
| 2022-2023 | Excel estructurado | Mayor consistencia | Cambios en granularidad de subdimensiones; ítems renumerados |
| 2024-2026 | Sistema IRT | Estructura formalizada con parámetros | Necesidad de integración con datos históricos; cambio de métricas |

### 1.3.2 Tipologías de Problemas en los Datos

**Problemas de identidad:**
- Mismo ítem con diferentes IDs en diferentes años
- IDs reutilizados para ítems distintos
- Ausencia de IDs en períodos tempranos

**Problemas de texto:**
- Variaciones ortográficas y de puntuación
- Cambios de género gramatical ("el estudiante" vs "la estudiante")
- Reformulaciones menores vs cambios sustantivos no documentados
- Ítems truncados o incompletos en algunos registros

**Problemas taxonómicos:**
- Cambios en la nomenclatura de dimensiones/subdimensiones
- Reclasificaciones de ítems sin justificación documentada
- Niveles de agregación variables (algunos años con más subdimensiones)

**Problemas psicométricos:**
- Diferentes métricas de dificultad (porcentaje correcto vs logits IRT)
- Disponibilidad parcial de parámetros de discriminación
- Cambios en el modelo de respuesta (dicotómico vs politómico)

## 1.4 Entidades Principales del Sistema

### 1.4.1 Ítem Canónico
La entidad fundamental del sistema. Representa un constructo evaluativo único que puede manifestarse en múltiples variantes textuales a lo largo del tiempo, pero mantiene su esencia psicométrica y conceptual.

**Atributos:**
- `id_canonico`: UUID persistente (ej: IDPS-CAN-7a3f9e2d)
- `texto_canonico`: Versión normalizada y validada del ítem
- `actor`: Estudiante, Docente, Apoderado, Directivo
- `dimension`: Dimensión IDPS (ej: Autoconocimiento, Autorregulación)
- `subdimension`: Subcategoría taxonómica
- `fecha_creacion_canonica`: Año de primera aparición
- `estado`: Activo, Inactivo, En revisión, Deprecado

### 1.4.2 Variante de Ítem
Cada manifestación textual distinta de un ítem canónico. Una variante representa un cambio en la redacción que no altera el constructo medido.

**Atributos:**
- `id_variante`: UUID único
- `id_canonico`: Referencia al ítem canónico padre
- `texto_variante`: Texto específico de esta versión
- `tipo_variante`: Menor (ortografía, género) | Moderada (reformulación) | Mayor (reestructuración)
- `anio_aparicion`: Año donde se registró esta variante
- `motivo_cambio`: Documentación del porqué del cambio

### 1.4.3 Ocurrencia de Ítem
Cada vez que un ítem (en cualquiera de sus variantes) fue utilizado en una aplicación evaluativa específica.

**Atributos:**
- `id_ocurrencia`: UUID único
- `id_variante`: Referencia a la variante utilizada
- `anio_evaluacion`: Año de aplicación
- `id_original_fuente`: ID como apareció en la fuente original
- `parametros_psicometricos`: Resultados del análisis de ese año
- `muestra`: Características de la población evaluada

### 1.4.4 Actor, Dimensión y Subdimensión
Entidades taxonómicas que clasifican los ítems según el marco conceptual IDPS.

| Entidad | Cardinalidad | Descripción |
|---------|--------------|-------------|
| Actor | 4 valores fijos | Perspectiva desde la cual se evalúa |
| Dimensión | 5-7 valores | Áreas principales del desarrollo personal y social |
| Subdimensión | 15-25 valores | Componentes específicos de cada dimensión |

## 1.5 Procesos Principales

### 1.5.1 Proceso de Importación y Normalización

```
Fuente Excel (Año X) 
    ↓
Extracción de campos según mapeo año-específico
    ↓
Normalización de texto (minúsculas, eliminación de espacios extras)
    ↓
Estandarización de metadatos taxonómicos (tablas de equivalencia)
    ↓
Detección de registros duplicados dentro del mismo año
    ↓
Registro en tabla de ocurrencias brutas pendientes de homologación
```

### 1.5.2 Proceso de Homologación

```
Ocurrencia nueva
    ↓
[Automático] Matching exacto con texto canónico existente
    ↓ SI MATCH
Asignación directa al ítem canónico
    ↓ NO MATCH
[Automático] Matching difuso (similitud > 0.85)
    ↓ SI MATCH ÚNICO
Propuesta de homologación con confianza ALTA
    ↓ SI MÚLTIPLES MATCHES
Propuesta con confianza MEDIA + revisión obligatoria
    ↓ NO MATCH
[Automático] Análisis semántico con embeddings
    ↓ SI SIMILITUD > 0.75
Propuesta con confianza BAJA + revisión obligatoria
    ↓ NO MATCH
Marcar como ítem candidato a NUEVO CANÓNICO
    ↓
[Humano] Revisión de propuestas pendientes
    ↓
Decisión: Aceptar | Rechazar | Modificar | Escalar
```

### 1.5.3 Proceso de Revisión Humana

```
Cola de revisión priorizada por confianza (menor confianza primero)
    ↓
Asignación a revisor según especialidad (actor/dimensión)
    ↓
Revisor evalúa: evidencia textual + contexto psicométrico
    ↓
Decisión del revisor
    ├── Aceptar homologación propuesta
    ├── Rechazar y proponer alternativa
    ├── Modificar umbral de equivalencia
    └── Escalar a comité (caso ambiguo)
    ↓
Registro de decisión con justificación
    ↓
Actualización de base canónica
```

### 1.5.4 Proceso de Generación de Nuevos Ítems

```
Solicitud de nuevo ítem (agente o humano)
    ↓
[Automático] Verificación contra corpus existente
    ↓
Si similitud > 0.70 con ítem existente → ALERTA: posible duplicado
    ↓
[Automático] Propuesta taxonómica basada en embeddings
    ↓
Revisión humana obligatoria antes de ingreso oficial
    ↓
Validación psicométrica en piloto
    ↓
Incorporación al banco oficial con ID canónico nuevo
```

## 1.6 Gobernanza: Quién decide y cómo

### 1.6.1 Estructura de Decisiones

| Nivel | Autoridad | Decisiones | Escalamiento |
|-------|-----------|------------|--------------|
| Nivel 1: Automático | Sistema | Matching exacto, propuestas con confianza > 0.90 | Nunca |
| Nivel 2: Revisor Individual | Psicometra especializado | Homologaciones confianza 0.75-0.90 | Casos ambiguos |
| Nivel 3: Comité Técnico | 3 psicometras senior | Discrepancias entre revisores, cambios de constructo | Decisiones con impacto > 50 ítems |
| Nivel 4: Dirección | Jefatura de Evaluación | Cambios al marco taxonómico, deprecación masiva | Políticas del sistema |

### 1.6.2 Reglas de Escalamiento

- **Empate entre revisores:** Si dos revisores discrepan en una homologación, escala automáticamente a Comité Técnico
- **Impacto masivo:** Decisiones que afecten más de 50 ítems requieren aprobación de Dirección
- **Cambio de constructo:** Cualquier reclasificación taxonómica requiere Comité Técnico
- **Deprecación:** Marcar un ítem canónico como deprecado siempre requiere Comité Técnico

## 1.7 Riesgos Metodológicos y Mitigaciones

### 1.7.1 Riesgos Críticos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Falsos positivos en homologación | Media | Alto | Múltiples niveles de matching; revisión humana obligatoria para confianza < 0.90 |
| Falsos negativos (ítems equivalentes no vinculados) | Media | Alto | Umbral conservador de similitud (0.70); búsqueda semántica amplia |
| Deriva de constructo no detectada | Baja | Crítico | Análisis de invarianza longitudinal; monitoreo de parámetros IRT |
| Pérdida de trazabilidad | Baja | Crítico | UUIDs inmutables; auditoría completa de decisiones |
| Sobrecarga de revisión humana | Alta | Medio | Priorización inteligente; interfaz optimizada; capacitación |
| Inconsistencia entre revisores | Media | Medio | Guías detalladas; ejemplos de entrenamiento; calibración periódica |

### 1.7.2 Riesgos de Datos Históricos

**Problema:** Los datos 2014-2017 tienen calidad variable y metadatos incompletos.

**Mitigación:**
- Fase 1: Homologación de ítems con metadatos completos (2018-2026)
- Fase 2: Reconstrucción taxonómica de ítems 2014-2017 basada en texto y contexto
- Fase 3: Validación cruzada con documentación histórica de la Agencia
- Todos los ítems reconstruidos se marcan con flag de "inferencia histórica" y nivel de confianza asociado

---

# SECCIÓN 2. SUPUESTOS Y DECISIONES CRÍTICAS

## 2.1 Introducción

La homologación longitudinal de ítems IDPS requiere resolver ambigüedades fundamentales sobre equivalencia, cambio y clasificación. Esta sección establece supuestos explícitos que operacionalizan estos conceptos, proporcionando criterios cuantitativos y procedimentales para la toma de decisiones.

Cada supuesto incluye: (a) descripción formal, (b) justificación metodológica, (c) implicancias prácticas, y (d) estrategia de validación.

---

## SUPUESTO 1: CRITERIO DE EQUIVALENCIA LONGITUDINAL

### 2.1.1 Descripción del Supuesto

Dos ítems constituyen el **mismo ítem longitudinal** si y solo si cumplen TODAS las siguientes condiciones:

**C1. Equivalencia semántica:** El coeficiente de similitud semántica (cosine similarity de embeddings) entre los textos normalizados es ≥ 0.85.

**C2. Equivalencia constructual:** Ambos ítems miden el mismo constructo según el marco IDPS (mismo actor, dimensión y subdimensión canónica).

**C3. Equivalencia de formato:** Ambos ítems utilizan la misma escala de respuesta (ej: Likert 4 puntos, dicotómica).

**C4. Equivalencia direccional:** El direccionamiento del ítem es idéntico (positivo/negativo). Un ítem invertido se considera constructo diferente.

**C5. No hay evidencia de cambio sustantivo:** No existe cambio en el contenido semántico que altere el significado del ítem (ver Supuesto 2).

### 2.1.2 Justificación Metodológica

El umbral de 0.85 en similitud semántica se basa en estudios de equivalencia de ítems en contextos educativos (Hambleton et al., 1991; Cook et al., 2009), donde correlaciones ≥ 0.80 indican equivalencia funcional. El uso de embeddings (BERT/multilingüe) captura similitud conceptual más allá de coincidencia léxica.

La equivalencia constructual es fundamental para mantener la validez del constructo longitudinal. El marco IDPS proporciona la teoría subyacente que justifica qué ítems miden el mismo atributo.

### 2.1.3 Implicancias Prácticas

- El sistema calculará automáticamente el score de similitud para cada par candidato
- Los ítems con score 0.85-0.90 requieren revisión humana obligatoria
- Los ítems con score < 0.70 se consideran distintos por defecto
- El rango 0.70-0.85 es zona de ambigüedad que requiere análisis contextual

### 2.1.4 Validación

- **Validación interna:** Muestreo aleatorio de 100 pares propuestos para revisión ciega por 2 expertos independientes
- **Validación externa:** Análisis de invariania métrica en datos IRT 2024-2026 para ítems homologados
- **Monitoreo continuo:** Tasa de acuerdo revisor-sistema objetivo > 85%

---

## SUPUESTO 2: CLASIFICACIÓN DE CAMBIOS MENORES VS SUSTANTIVOS

### 2.2.1 Cambios Menores (Preservan Equivalencia)

Los siguientes cambios NO alteran la identidad del ítem longitudinal:

| Categoría | Ejemplos | Tratamiento |
|-----------|----------|-------------|
| **Puntuación** | Cambio de coma por punto y coma; adición/eliminación de signos de exclamación | Normalizar en preprocesamiento |
| **Género gramatical** | "El estudiante demuestra..." vs "La estudiante demuestra..." | Normalizar usando tokens genéricos |
| **Artículos y determinantes** | "Un buen estudiante" vs "El buen estudiante" | Ignorar en matching |
| **Número** | "Los estudiantes" vs "El estudiante" | Normalizar a singular |
| **Sinónimos menores** | "Muestra" vs "Demuestra" vs "Manifiesta" | Embedding captura equivalencia |
| **Orden de cláusulas** | "Cuando está enojado, respira profundo" vs "Respira profundo cuando está enojado" | Análisis de dependencias sintácticas |
| **Conectores** | "Y" vs "Además" vs "También" | Ignorar en matching semántico |

### 2.2.2 Cambios Sustantivos (Alteran Equivalencia)

Los siguientes cambios CREAN un nuevo ítem canónico:

| Categoría | Ejemplos | Justificación |
|-----------|----------|---------------|
| **Cambio de constructo** | Pasar de "reconoce sus emociones" a "reconoce las emociones de otros" | Cambio de constructo psicológico |
| **Cambio de escala** | Modificar de Likert 4 puntos a 5 puntos | No comparabilidad métrica |
| **Inversión de dirección** | "Me siento feliz" vs "No me siento feliz" | Cambio de valencia afectiva |
| **Cambio de actor** | De "El estudiante dice..." a "El docente dice que el estudiante..." | Cambio de perspectiva evaluativa |
| **Adición/eliminación de negaciones** | "Siempre respeta" vs "Nunca respeta" vs "A veces respeta" | Cambio cualitativo del comportamiento |
| **Cambio de frecuencia** | "Siempre" vs "Frecuentemente" vs "A veces" | Modificación del umbral conductual |
| **Cambio de contexto** | "En el aula" vs "En el hogar" vs "Con sus pares" | Diferente generalizabilidad |
| **Cambio de objeto** | "Respeta a sus compañeros" vs "Respeta a sus profesores" | Diferente objetivo de la conducta |

### 2.2.3 Justificación Metodológica

La distinción se basa en la teoría de la equivalencia de test (Lord & Novick, 1968) y estudios de invarianza de ítems (Meredith, 1993). Los cambios menores afectan la superficie lingüística pero no la función psicométrica del ítem. Los cambios sustantivos alteran la relación ítem-constructo o las propiedades métricas.

### 2.2.4 Implicancias Prácticas

- Preprocesamiento normalizador aplicará reglas de cambios menores antes del matching
- Cualquier cambio sustantivo detectado automáticamente descalifica la homologación
- Interfaz de revisión humana destacará visualmente los cambios sustantivos detectados
- Registro obligatorio del tipo de variante cuando se acepta un cambio menor

### 2.2.5 Validación

- Lista de cambios validada por Comité Técnico antes de implementación
- Casos borde documentados en guía de entrenamiento de revisores
- Auditoría trimestral de decisiones de cambio menor vs sustantivo

---

## SUPUESTO 3: PRIORIDAD DE REGLAS DE MATCHING

### 2.3.1 Jerarquía de Matching

Cuando múltiples reglas pueden aplicarse a un mismo par de ítems, se aplica la siguiente prioridad:

| Prioridad | Regla | Umbral | Acción si se cumple |
|-----------|-------|--------|---------------------|
| 1 | Matching exacto (texto normalizado) | 100% identidad | Homologación automática |
| 2 | Matching exacto de stem + key | Stem idéntico | Homologación automática con revisión de opciones |
| 3 | Similitud semántica alta | ≥ 0.90 | Propuesta automática, revisión opcional |
| 4 | Similitud semántica media + contexto taxonómico | 0.80-0.90 + misma dimensión | Propuesta con revisión obligatoria |
| 5 | Similitud semántica baja + contexto | 0.70-0.80 + misma subdimensión | Propuesta con revisión obligatoria + justificación |
| 6 | Similitud semántica < 0.70 | - | No homologación; candidato a nuevo ítem |

### 2.3.2 Resolución de Conflictos

**Escenario A: Múltiples ítems canónicos con similitud ≥ 0.85**
- Seleccionar el ítem canónico con mayor similitud
- Si empate, seleccionar el más reciente
- Marcar caso para revisión humana (alerta de ambigüedad)

**Escenario B: Ítem nuevo similar a múltiples variantes del mismo canónico**
- Homologar al canónico padre
- Registrar como nueva variante
- No requiere revisión si similitud > 0.90

**Escenario C: Ítem similar a ítems de diferentes dimensiones**
- No homologar automáticamente
- Escalar a Comité Técnico
- Posible indicador de problema en marco taxonómico

### 2.3.3 Justificación Metodológica

La jerarquía prioriza la evidencia más directa (identidad textual) sobre la inferencial (similitud semántica). Esto minimiza falsos positivos mientras mantiene sensibilidad para detectar variantes legítimas.

### 2.3.4 Validación

- Simulación con corpus etiquetado: recuperación esperada > 95%
- Tasa de falsos positivos objetivo: < 5%
- Tiempo de procesamiento promedio por ítem: < 2 segundos

---

## SUPUESTO 4: GOBERNANZA DE REVISIÓN HUMANA

### 2.4.1 Perfiles de Revisores

| Perfil | Requisitos | Alcance de Decisiones |
|--------|------------|----------------------|
| Revisor Nivel 1 | Psicometra con formación IDRT, 2+ años experiencia | Homologaciones confianza 0.75-0.90; variantes menores |
| Revisor Nivel 2 | Psicometra senior, 5+ años, especialista en constructo | Cambios de constructo; reclasificaciones taxonómicas |
| Comité Técnico | 3 revisores Nivel 2 + representante de Dirección | Cambios al marco; casos ambiguos; deprecaciones |

### 2.4.2 Proceso de Revisión

**Asignación:**
- Los ítems se asignan según especialidad (actor/dimensión)
- Carga máxima: 50 ítems por revisor por semana
- Tiempo máximo de resolución: 5 días hábiles desde asignación

**Resolución:**
- Decisión unánime de revisor único para confianza 0.80-0.90
- Doble revisión independiente para confianza 0.70-0.80
- Comité Técnico para discrepancias o casos < 0.70

**Empates:**
- Dos revisores discrepan → tercer revisor arbitrador
- Persiste el empate → Comité Técnico
- Comité no alcanza consenso → Dirección decide

### 2.4.3 Trazabilidad

Cada decisión debe registrar:
- ID del revisor
- Fecha y hora
- Decisión tomada
- Justificación textual (mínimo 50 caracteres)
- Evidencia consultada (textos comparados, parámetros psicométricos)
- Nivel de confianza del revisor (1-5)

### 2.4.4 Justificación Metodológica

La revisión humana actúa como sistema de control de calidad y validador de decisiones automatizadas. Los tiempos y cargas están diseñados para balancear thoroughness con eficiencia operativa.

### 2.4.5 Validación

- Inter-rater reliability objetivo: Cohen's κ > 0.80
- Calibración trimestral con casos de entrenamiento
- Retroalimentación continua sobre decisiones del sistema vs revisores

---

## SUPUESTO 5: UMBRALES PSICOMÉTRICOS DE EQUIVALENCIA

### 2.5.1 Equivalencia en Modelo IRT (2024-2026)

Para ítems con parámetros IRT disponibles, se consideran técnicamente equivalentes si:

| Parámetro | Criterio de Equivalencia | Interpretación |
|-----------|-------------------------|----------------|
| **Dificultad (b)** | Δb ≤ 0.5 logits entre ocurrencias | Diferencia menor al error estándar típico |
| **Discriminación (a)** | Ratio 0.67 ≤ a₁/a₂ ≤ 1.5 | Discriminación comparable |
| **Pseudo-azar (c)** | Δc ≤ 0.10 | Acertijo comparable |
| **Funcionamiento diferencial (DIF)** | No DIF significativo por sexo o SES | Invarianza de medida |

### 2.5.2 Equivalencia en Teoría Clásica (2014-2023)

Para ítems históricos con estadísticos clásicos:

| Estadístico | Criterio | Nota |
|-------------|----------|------|
| **Dificultad (p)** | Δp ≤ 0.15 | Diferencia de proporción correcta |
| **Discriminación (rpbis)** | Δr ≤ 0.10 | Correlación punto-biserial |
| **Coeficiente alfa si se elimina** | Cambio ≤ 0.02 | Impacto en consistencia interna |

### 2.5.3 Integración IRT-Teoría Clásica

Para comparar ítems entre períodos con diferentes métricas:

1. Transformar parámetros IRT a escala de dificultad proporcional (percentiles)
2. Calcular correlación biserial aproximada desde parámetros IRT
3. Usar equivalencia de percentiles como criterio principal
4. Documentar incertidumbre adicional en comparaciones cross-métrica

### 2.5.4 Justificación Metodológica

Los umbrales se basan en criterios estándar de la literatura de IRT (Hambleton & Swaminathan, 1985) y prácticas de equating educativo (Kolen & Brennan, 2014). Un Δb de 0.5 logits representa aproximadamente la mitad de una desviación estándar típica en distribuciones de habilidad estandarizadas.

### 2.5.5 Validación

- Análisis de invarianza de ítems anual para ítems con múltiples ocurrencias
- Estudios de equating entre formas con ítems anclados
- Monitoreo de drift en parámetros de ítems homologados

---

## SUPUESTO 6: CRITERIOS DE CLASIFICACIÓN TAXONÓMICA

### 2.6.1 Determinación de Dimensión/Subdimensión

Un ítem se asigna a una dimensión/subdimensión según:

**Criterio Primario (Obligatorio):**
- Concordancia con definición operacional del constructo en marco IDPS
- Revisión por al menos 2 expertos en el constructo

**Criterios Secundarios (De soporte):**
- Similitud con ítems existentes de la categoría (embedding similarity > 0.75)
- Análisis factorial confirmatorio (cargas factoriales > 0.40)
- Juicio de expertos independientes

### 2.6.2 Niveles de Confianza Taxonómica

| Nivel | Condiciones | Acción |
|-------|-------------|--------|
| **Alta** | Criterio primario + 2 criterios secundarios | Clasificación automática |
| **Media** | Criterio primario + 1 criterio secundario | Revisión humana recomendada |
| **Baja** | Solo criterio primario o inconsistencia entre criterios | Revisión humana obligatoria |
| **Indeterminada** | No cumple criterio primario | Escalar a Comité Técnico |

### 2.6.3 Cambios de Clasificación

La reclasificación de un ítem canónico a otra dimensión/subdimensión:
- Requiere evidencia empírica (análisis factorial, DIF)
- Debe ser aprobado por Comité Técnico
- Genera nuevo ID canónico (el ítem original se depreca)
- Se mantiene trazabilidad: ítem nuevo "sucesor de" ítem original

### 2.6.4 Justificación Metodológica

La taxonomía IDPS es un marco teórico validado que debe prevalecer sobre clasificaciones empíricas puras. Sin embargo, la evidencia empírica puede señalar problemas en el marco que requieren revisión.

### 2.6.5 Validación

- Validación de contenido por expertos en constructo
- Análisis factorial confirmatorio anual
- Estudios de validez convergente y discriminante

---

## 2.7 Resumen de Supuestos Críticos

| Supuesto | Decisión Clave | Umbral Principal | Validación |
|----------|---------------|------------------|------------|
| 1. Equivalencia | ¿Mismo ítem longitudinal? | Similitud ≥ 0.85 | Inter-rater, invarianza |
| 2. Cambios | ¿Menor o sustantivo? | Listas explícitas | Auditoría de decisiones |
| 3. Prioridad | ¿Qué regla aplica? | Jerarquía definida | Simulación de recuperación |
| 4. Revisión | ¿Quién decide? | Perfiles y flujos | Inter-rater reliability |
| 5. Psicométricos | ¿Equivalente técnicamente? | Δb ≤ 0.5, Δp ≤ 0.15 | Equating, invarianza |
| 6. Taxonomía | ¿Qué dimensión? | Concordancia marco + evidencia | AFC, validez |

---

## Referencias

- Cook, D. A., & Beckman, T. J. (2009). Current concepts in validity and reliability for psychometric instruments: theory and application. *American Journal of Medicine*, 119(2), 166.e7-166.e16.
- Hambleton, R. K., & Swaminathan, H. (1985). *Item Response Theory: Principles and Applications*. Springer.
- Hambleton, R. K., Swaminathan, H., & Rogers, H. J. (1991). *Fundamentals of Item Response Theory*. Sage.
- Kolen, M. J., & Brennan, R. L. (2014). *Test Equating, Scaling, and Linking* (3rd ed.). Springer.
- Lord, F. M., & Novick, M. R. (1968). *Statistical Theories of Mental Test Scores*. Addison-Wesley.
- Meredith, W. (1993). Measurement invariance, factor analysis and factorial invariance. *Psychometrika*, 58(4), 525-543.

---

*Documento elaborado para la Agencia de Calidad de la Educación de Chile*
*Sistema de Homologación Longitudinal IDPS - Secciones 1 y 2*
