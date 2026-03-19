# SECCIÓN 7: AGENTE GENERADOR Y CLASIFICADOR

## 7.1 Visión General del Agente

El Agente Generador y Clasificador constituye el núcleo inteligente del Sistema de Homologación Longitudinal IDPS. Este agente híbrido combina capacidades de generación de lenguaje natural con análisis taxonómico sofisticado, permitiendo no solo crear nuevos ítems de evaluación, sino también clasificarlos automáticamente dentro de la taxonomía oficial y detectar posibles redundancias con el banco histórico de ítems.

### 7.1.1 Arquitectura Conceptual

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENTE GENERADOR Y CLASIFICADOR                      │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │   Input     │───▶│  Análisis   │───▶│  Búsqueda   │───▶│Generación│ │
│  │  Processor  │    │Requerimientos│   │  Semántica  │    │  de Items │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └──────────┘ │
│         │                  │                  │                  │      │
│         ▼                  ▼                  ▼                  ▼      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────┐ │
│  │  Validación │◀───│  Detección  │◀───│ Clasificación│◀───│Scoring de│ │
│  │   Output    │    │ Redundancia │    │ Taxonómica   │    │Confianza │ │
│  └─────────────┘    └─────────────┘    └─────────────┘    └──────────┘ │
│         │                                                               │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              REGISTRO EN TABLA DE PROPUESTAS                     │   │
│  │  Estado: BORRADOR → PENDIENTE_REVISIÓN → (revisión humana)      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.1.2 Principios Fundamentales

1. **No injerencia directa**: Los ítems generados NUNCA ingresan automáticamente al banco oficial
2. **Trazabilidad completa**: Cada propuesta mantiene registro de su origen, similitudes detectadas y justificaciones
3. **Confianza calibrada**: Cada clasificación incluye un score de confianza con intervalo de incertidumbre
4. **Aprendizaje continuo**: El sistema mejora mediante feedback de revisores humanos
5. **Transparencia explicable**: Todas las decisiones del agente son justificables y auditable

---

## 7.2 Flujo del Agente (Proceso Paso a Paso)

### Paso 1: Recepción de Solicitud de Generación

**Entradas requeridas:**
- `actor`: Estudiante, Docente, Director, Apoderado, etc.
- `dimension`: Dimensión IDPS objetivo
- `subdimension` (opcional): Subdimensión específica
- `proposito`: Objetivo de medición del constructo
- `restricciones`: Nivel educativo, formato, longitud, etc.
- `contexto_adicional`: Información relevante del contexto chileno

**Validación inicial:**
- Verificar que actor y dimensión existan en taxonomía oficial
- Validar coherencia entre nivel educativo y complejidad solicitada
- Comprobar que propósito esté alineado con marco IDPS

### Paso 2: Análisis de Requerimientos

El agente descompone la solicitud en componentes analíticos:

```python
class AnalisisRequerimiento:
    constructo_objetivo: str      # Constructo psicológico/educativo a medir
    nivel_cognitivo: str          # Recordar, comprender, aplicar, analizar, evaluar, crear
    competencia_asociada: str     # Competencia del currículum chileno relacionada
    indicador_sugerido: str       # Indicador de evaluación propuesto
    poblacion_objetivo: str       # Características de la población
    contexto_cultural: str        # Adaptaciones para contexto chileno
```

### Paso 3: Consulta al Banco de Ítems Históricos

El agente consulta múltiples fuentes:
- **Banco homologado oficial**: Ítems aprobados y en uso
- **Histórico de propuestas**: Ítems previamente generados (aprobados/rechazados)
- **Literatura científica**: Ítems validados en investigaciones

**Campos recuperados:**
```sql
SELECT 
    i.id_item,
    i.texto_item,
    i.actor,
    i.dimension,
    i.subdimension,
    i.nivel_educativo,
    i.estado,
    i.fecha_creacion,
    e.embedding_vector
FROM items i
LEFT JOIN item_embeddings e ON i.id_item = e.id_item
WHERE i.actor = :actor 
  AND (i.dimension = :dimension OR i.subdimension = :subdimension)
ORDER BY i.fecha_creacion DESC;
```

### Paso 4: Búsqueda de Ítems Similares (Embeddings + Keywords)

**Estrategia híbrida de búsqueda:**

```python
async def busqueda_hibrida_similares(
    texto_consulta: str,
    embedding_consulta: List[float],
    filtros: Dict
) -> List[ItemSimilar]:
    """
    Combina búsqueda semántica (embeddings) con búsqueda léxica (keywords)
    """
    # 1. Búsqueda semántica por similitud de coseno
    resultados_semanticos = await vector_store.similarity_search(
        embedding=embedding_consulta,
        k=20,
        filter=filtros
    )
    
    # 2. Búsqueda léxica por keywords
    resultados_lexicos = await busqueda_texto_completo(
        query=texto_consulta,
        campos=["texto_item", "descripcion_constructo"],
        limit=20
    )
    
    # 3. Fusión de resultados (Reciprocal Rank Fusion)
    resultados_fusionados = reciprocal_rank_fusion(
        [resultados_semanticos, resultados_lexicos],
        k=60  # Constante de RRF
    )
    
    return resultados_fusionados[:15]  # Top 15
```

**Fórmula de Reciprocal Rank Fusion:**
```
RRF_score(d) = Σ(1 / (k + r_i(d)))
```
Donde `r_i(d)` es el ranking del documento `d` en la lista `i`, y `k=60` es una constante de suavizado.

### Paso 5: Análisis de Similitudes y Diferencias

Para cada ítem similar encontrado, el agente analiza:

| Dimensión de Análisis | Descripción | Peso |
|----------------------|-------------|------|
| Similitud semántica | Distancia en espacio vectorial | 0.30 |
| Solapamiento léxico | Palabras compartidas | 0.20 |
| Constructo medido | ¿Mide el mismo constructo? | 0.25 |
| Población objetivo | ¿Misma población? | 0.15 |
| Contexto de aplicación | ¿Mismo contexto? | 0.10 |

**Score de similitud compuesto:**
```python
similitud_total = (
    0.30 * similitud_coseno +
    0.20 * jaccard_similarity +
    0.25 * similitud_constructo +
    0.15 * similitud_poblacion +
    0.10 * similitud_contexto
)
```

### Paso 6: Decisión - ¿Nuevo, Variante o Reformulación?

**Árbol de decisión:**

```
                    ┌─────────────────┐
                    │ Ítem propuesto  │
                    │ vs. existentes  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌─────────┐    ┌─────────┐    ┌─────────┐
        │Similitud│    │Similitud│    │Similitud│
        │  > 0.85 │    │ 0.5-0.85│    │  < 0.5  │
        └────┬────┘    └────┬────┘    └────┬────┘
             │              │              │
             ▼              ▼              ▼
        ┌─────────┐    ┌─────────┐    ┌─────────┐
        │REDUNDANTE│   │VARIANTE/│    │  NUEVO  │
        │  (descartar)│ REFORMULACIÓN   │         │
        └─────────┘    └────┬────┘    └─────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        ┌─────────┐                 ┌─────────┐
        │Cambios  │                 │Cambios  │
        │menores  │                 │mayores  │
        │(palabras)│                │(estructura)│
        └────┬────┘                 └────┬────┘
             │                           │
             ▼                           ▼
        ┌─────────┐                 ┌─────────┐
        │VARIANTE │                 │REFORMULA-│
        │         │                 │  CIÓN   │
        └─────────┘                 └─────────┘
```

**Criterios específicos:**

| Tipo | Similitud | Características | Acción |
|------|-----------|-----------------|--------|
| **Nuevo** | < 0.50 | Constructo distinto o población diferente | Generar propuesta nueva |
| **Variante** | 0.50-0.70 | Mismo constructo, cambios menores de redacción | Registrar como variante |
| **Reformulación** | 0.70-0.85 | Mismo constructo, cambios sustantivos en enfoque | Registrar como reformulación |
| **Redundante** | > 0.85 | Prácticamente idéntico | Descartar, sugerir uso del existente |

### Paso 7: Generación de Propuestas de Ítem

El agente genera 2-3 opciones alternativas, cada una con:
- Texto completo del ítem
- Opciones de respuesta (escala Likert o alternativas)
- Instrucciones de aplicación
- Notas para el aplicador

### Paso 8: Propuesta de Clasificación Taxonómica

Para cada ítem generado, el agente propone:
- `actor`: Clasificación por actor objetivo
- `dimension`: Dimensión IDPS
- `subdimension`: Subdimensión específica
- `indicador`: Indicador de medición
- `nivel_educativo`: Grados aplicables

### Paso 9: Cálculo de Confianza de Clasificación

**Factores que influyen en confianza:**

```python
confianza_clasificacion = base_confianza * producto(ajustes)

# Base según evidencia disponible
base_confianza = {
    "ejemplos_similares_clasificados": 0.85,
    "ejemplos_parcialmente_similares": 0.70,
    "sin_ejemplos_directos": 0.55
}

# Ajustes multiplicativos
ajustes = [
    1.0 + (0.10 if consistencia_interna_alta else -0.10),
    1.0 + (0.05 if alineacion_curricular_confirmada else -0.05),
    1.0 + (0.05 if validacion_expertos_previa else 0.0),
    1.0 + (0.05 if contexto_chileno_ajustado else -0.05)
]
```

**Niveles de confianza:**
- **Alta (0.80-1.00)**: Clasificación muy probablemente correcta
- **Media (0.60-0.79)**: Clasificación probable, revisión recomendada
- **Baja (0.40-0.59)**: Clasificación incierta, revisión obligatoria
- **Muy baja (< 0.40)**: No se puede clasificar con confianza

### Paso 10: Generación de Justificación Completa

Cada propuesta incluye justificación estructurada:

```json
{
  "justificacion_clasificacion": {
    "razonamiento_dimensional": "El ítem evalúa la capacidad de...",
    "evidencia_constructo": "Las opciones de respuesta reflejan...",
    "alineacion_marco_idps": "Este constructo se alinea con el dominio...",
    "ejemplos_sustentadores": ["ID-2023-045", "ID-2022-112"],
    "posibles_ambiguedades": "Podría interpretarse como...",
    "recomendacion_revision": "Se recomienda verificar con experto en..."
  }
}
```

### Paso 11: Registro en Tabla de Propuestas

```sql
INSERT INTO propuestas_items (
    id_propuesta,
    texto_item,
    opciones_respuesta,
    actor_propuesto,
    dimension_propuesta,
    subdimension_propuesta,
    confianza_clasificacion,
    tipo_propuesta,  -- 'nuevo', 'variante', 'reformulacion'
    items_relacionados,
    justificacion,
    estado,
    fecha_generacion,
    id_agente_version
) VALUES (...);
```

### Paso 12: Notificación a Revisores

El sistema notifica a revisores humanos mediante:
- Correo electrónico con resumen de propuestas pendientes
- Dashboard de revisión con priorización por confianza
- Alertas para propuestas de baja confianza que requieren atención urgente

---

## 7.3 Herramientas del Agente

### 7.3.1 Modelo LLM

**Configuración recomendada:**
```python
llm_config = {
    "model": "gpt-4-turbo-preview",  # o equivalente
    "temperature": 0.3,  # Baja creatividad, alta consistencia
    "max_tokens": 2000,
    "top_p": 0.9,
    "frequency_penalty": 0.2,  # Evita repeticiones
    "presence_penalty": 0.1    # Fomenta diversidad
}
```

### 7.3.2 Base de Vectores

**Especificaciones técnicas:**
- **Motor**: PostgreSQL con pgvector o Pinecone
- **Dimensión embeddings**: 1536 (OpenAI) o 768 (sentence-transformers)
- **Métrica de distancia**: Cosine similarity
- **Índice**: IVFFlat para búsqueda aproximada

### 7.3.3 Motor de Búsqueda Semántica

```python
class MotorBusquedaSemantica:
    def __init__(self, vector_store):
        self.vector_store = vector_store
        self.embedding_model = SentenceTransformer('paraphrase-multilingual-mpnet-base-v2')
    
    async def generar_embedding(self, texto: str) -> List[float]:
        """Genera embedding multilingüe para texto en español"""
        return self.embedding_model.encode(texto, normalize_embeddings=True)
    
    async def buscar_similares(
        self, 
        query: str, 
        top_k: int = 10,
        umbral_similitud: float = 0.5
    ) -> List[ResultadoBusqueda]:
        embedding = await self.generar_embedding(query)
        return await self.vector_store.similarity_search_with_score(
            embedding=embedding,
            k=top_k,
            score_threshold=umbral_similitud
        )
```

### 7.3.4 Algoritmo de Detección de Redundancia

```python
class DetectorRedundancia:
    def __init__(self):
        self.umbral_redundancia = 0.85
        self.umbral_variante = 0.60
    
    async def analizar_redundancia(
        self,
        nuevo_item: str,
        items_existentes: List[Dict]
    ) -> AnalisisRedundancia:
        
        embedding_nuevo = await self.generar_embedding(nuevo_item)
        resultados = []
        
        for item_existente in items_existentes:
            embedding_existente = item_existente['embedding']
            
            # Similitud semántica
            sim_cos = cosine_similarity(embedding_nuevo, embedding_existente)
            
            # Similitud léxica
            sim_lex = self.jaccard_similarity(nuevo_item, item_existente['texto'])
            
            # Similitud de constructo (análisis LLM)
            sim_con = await self.analizar_constructo(nuevo_item, item_existente['texto'])
            
            score_compuesto = 0.5 * sim_cos + 0.3 * sim_lex + 0.2 * sim_con
            
            resultados.append({
                'id_item': item_existente['id'],
                'similitud_semantica': sim_cos,
                'similitud_lexica': sim_lex,
                'similitud_constructo': sim_con,
                'score_compuesto': score_compuesto,
                'es_redundante': score_compuesto > self.umbral_redundancia
            })
        
        return AnalisisRedundancia(
            items_similares=resultados,
            max_similitud=max(r['score_compuesto'] for r in resultados),
            decision=self.clasificar_decision(max_similitud)
        )
```

### 7.3.5 Sistema de Scoring de Confianza

```python
class ScoringConfianza:
    """
    Calcula confianza de clasificación usando múltiples señales
    """
    
    def calcular_confianza(
        self,
        item: PropuestaItem,
        ejemplos_similares: List[ItemExistente],
        contexto: ContextoTaxonomico
    ) -> ScoreConfianza:
        
        # Señal 1: Consistencia con ejemplos similares
        consistencia = self.calcular_consistencia(item, ejemplos_similares)
        
        # Señal 2: Claridad del constructo
        claridad = self.evaluar_claridad_constructo(item.texto)
        
        # Señal 3: Alineación taxonómica
        alineacion = self.verificar_alineacion(item, contexto)
        
        # Señal 4: Cobertura de indicadores
        cobertura = self.evaluar_cobertura_indicadores(item)
        
        # Combinación ponderada
        score_final = (
            0.35 * consistencia +
            0.25 * claridad +
            0.25 * alineacion +
            0.15 * cobertura
        )
        
        # Intervalo de confianza (bootstrap)
        ic_inferior, ic_superior = self.calcular_intervalo_confianza(
            [consistencia, claridad, alineacion, cobertura]
        )
        
        return ScoreConfianza(
            score=round(score_final, 3),
            intervalo_confianza=(round(ic_inferior, 3), round(ic_superior, 3)),
            nivel=self.clasificar_nivel(score_final),
            componentes={
                'consistencia': round(consistencia, 3),
                'claridad': round(claridad, 3),
                'alineacion': round(alineacion, 3),
                'cobertura': round(cobertura, 3)
            }
        )
```

---

## 7.4 Memoria y Contexto del Agente

### 7.4.1 Contexto Mantenido Entre Interacciones

```python
@dataclass
class MemoriaAgente:
    """
    Estado persistente del agente entre sesiones
    """
    # Historial de propuestas generadas
    historial_propuestas: List[PropuestaItem]
    
    # Feedback acumulado de revisores
    feedback_revisiones: List[FeedbackRevision]
    
    # Patrones de clasificación aprendidos
    patrones_clasificacion: Dict[str, Pattern]
    
    # Tasas de aprobación por categoría
    tasas_aprobacion: Dict[str, float]
    
    # Errores comunes detectados
    errores_comunes: List[ErrorDetectado]
    
    # Preferencias de revisores
    preferencias_revisores: Dict[str, Preferencia]
```

### 7.4.2 Acumulación de Conocimiento

El agente mantiene y actualiza:

1. **Matriz de confusión taxonómica**: Qué clasificaciones tienden a confundirse
2. **Tasas de aprobación**: Por dimensión, actor, y nivel educativo
3. **Patrones de reformulación**: Cambios que suelen mejorar aprobación
4. **Términos problemáticos**: Palabras que generan rechazo frecuente

### 7.4.3 Aprendizaje de Decisiones Humanas

```python
async def procesar_feedback_revision(
    self,
    id_propuesta: str,
    decision: DecisionRevision,  # aprobado, rechazado, modificado
    comentarios: str,
    cambios_realizados: List[Cambio]
):
    """
    Actualiza el conocimiento del agente basado en feedback humano
    """
    # 1. Actualizar tasa de aprobación por categoría
    self.actualizar_tasas(decision, id_propuesta)
    
    # 2. Aprender de errores de clasificación
    if decision.tipo == 'clasificacion_incorrecta':
        self.registrar_error_clasificacion(id_propuesta, decision.correcta)
    
    # 3. Identificar patrones de mejora
    if cambios_realizados:
        self.aprender_patrones_mejora(cambios_realizados)
    
    # 4. Ajustar pesos de scoring si hay desviación sistemática
    self.ajustar_pesos_scoring()
    
    # 5. Guardar caso para fine-tuning futuro
    await self.guardar_caso_entrenamiento(id_propuesta, decision)
```

---

## 7.5 Prompt Interno del Agente

```
================================================================================
ROLE: Eres un experto psicometra especializado en ítems IDPS (Indicadores de 
Desarrollo Personal y Social) para el sistema educativo chileno. Tienes 15 años 
de experiencia diseñando instrumentos de evaluación validados para el contexto 
latinoamericano.

CONTEXTO DEL SISTEMA EDUCATIVO CHILENO:
--------------------------------------------------------------------------------
El Sistema de Desarrollo Personal y Social (IDPS) evalúa competencias no 
cognitivas en estudiantes chilenos, organizadas en dimensiones que abarcan:
- Autoconocimiento y autoeficacia
- Regulación emocional
- Habilidades sociales y convivencia
- Compromiso cívico y ciudadanía
- Aprendizaje y desarrollo personal

TAXONOMÍA OFICIAL IDPS:
--------------------------------------------------------------------------------
[SE INYECTA DINÁMICAMENTE DESDE BASE DE DATOS]

EJEMPLOS DE ÍTEMS POR CATEGORÍA:
--------------------------------------------------------------------------------
[EJEMPLOS DE ÍTEMS EXISTENTES - SE INYECTAN DINÁMICAMENTE]

TAREA:
--------------------------------------------------------------------------------
Generar ítems que midan el constructo especificado para el actor indicado, 
considerando el propósito de medición y las restricciones proporcionadas.

RESTRICCIONES DE CALIDAD:
--------------------------------------------------------------------------------
1. Longitud: Mínimo 15 palabras, máximo 60 palabras por ítem
2. Formato: Oraciones afirmativas en primera o tercera persona
3. Opciones de respuesta: Escala Likert 1-4 (Nunca/Siempre) o alternativas
4. Nivel de lectura: Apropiado al grado escolar objetivo
5. Neutralidad de género: Evitar sesgos de género
6. Contexto cultural: Adaptado a realidad chilena
7. Redacción: Claro, específico, sin dobles negaciones
8. Constructo: Un solo constructo por ítem (unidimensionalidad)

ÍTEMS SIMILARES ENCONTRADOS EN BANCO:
--------------------------------------------------------------------------------
{items_similares}

INSTRUCCIONES DETALLADAS:
--------------------------------------------------------------------------------
1. ANÁLISIS DE SIMILITUDES:
   - Examina cada ítem similar encontrado
   - Identifica solapamientos en constructo medido
   - Evalúa diferencias en enfoque, población o contexto
   - Determina si el ítem propuesto agrega valor nuevo

2. DETERMINACIÓN DE TIPO:
   Clasifica tu propuesta según similitud con existentes:
   
   a) ÍTEM COMPLETAMENTE NUEVO:
      - Similitud < 0.50 con todos los ítems existentes
      - Mide constructo no cubierto o población diferente
      - Agrega valor significativo al banco
   
   b) VARIANTE MENOR:
      - Similitud 0.50 - 0.70
      - Mismo constructo, cambios menores de redacción
      - Adaptación a contexto ligeramente diferente
   
   c) REFORMULACIÓN SUSTANTIVA:
      - Similitud 0.70 - 0.85
      - Mismo constructo, enfoque o perspectiva diferente
      - Cambios sustantivos en cómo se aborda el constructo
   
   d) REDUNDANTE:
      - Similitud > 0.85 con algún ítem existente
      - No agrega valor significativo
      - Recomendar uso del ítem existente

3. GENERACIÓN DE OPCIONES:
   - Genera 2-3 opciones alternativas del ítem
   - Cada opción debe tener enfoque ligeramente diferente
   - Varía el contexto, la redacción o las opciones de respuesta

4. CLASIFICACIÓN TAXONÓMICA:
   Para cada opción, propón:
   - Actor objetivo (estudiante, docente, etc.)
   - Dimensión IDPS
   - Subdimensión específica
   - Indicador de medición
   - Niveles educativos aplicables

5. EVALUACIÓN DE CONFIANZA:
   Califica tu confianza en la clasificación (0.0 - 1.0):
   - 0.80-1.00: Alta confianza, evidencia sólida
   - 0.60-0.79: Media confianza, revisión recomendada
   - 0.40-0.59: Baja confianza, revisión obligatoria
   - < 0.40: Muy baja, no se puede clasificar

6. JUSTIFICACIÓN:
   Proporciona justificación detallada incluyendo:
   - Razonamiento para la clasificación propuesta
   - Evidencia del constructo medido
   - Alineación con marco IDPS
   - Referencias a ítems similares
   - Posibles ambigüedades
   - Recomendaciones para revisores

FORMATO DE SALIDA REQUERIDO (JSON):
--------------------------------------------------------------------------------
{
  "analisis_similitudes": [
    {
      "id_item_similar": "ID-2023-045",
      "texto_similar": "...",
      "similitud_score": 0.72,
      "constructo_similar": "...",
      "analisis": "..."
    }
  ],
  "decision_tipo": "nuevo|variante|reformulacion|redundante",
  "justificacion_tipo": "...",
  "propuestas": [
    {
      "id_opcion": "A",
      "texto_item": "...",
      "instruccion": "...",
      "opciones_respuesta": [
        {"valor": 1, "etiqueta": "Nunca"},
        {"valor": 2, "etiqueta": "A veces"},
        {"valor": 3, "etiqueta": "Frecuentemente"},
        {"valor": 4, "etiqueta": "Siempre"}
      ],
      "actor_sugerido": "...",
      "dimension_sugerida": "...",
      "subdimension_sugerida": "...",
      "indicador_sugerido": "...",
      "niveles_educativos": ["7mo", "8vo"],
      "confianza_clasificacion": 0.85,
      "intervalo_confianza": [0.78, 0.91],
      "justificacion_clasificacion": "...",
      "items_similares_relacionados": ["ID-2023-045"],
      "nivel_redundancia": "bajo|medio|alto",
      "recomendacion_final": "...",
      "notas_revision": "..."
    }
  ],
  "resumen_agente": "..."
}

NOTAS IMPORTANTES:
--------------------------------------------------------------------------------
- Los ítems generados NO ingresan automáticamente al banco oficial
- Todas las propuestas requieren revisión humana antes de aprobación
- Sé conservador en la clasificación: mejor sub-clasificar que sobre-clasificar
- Prioriza la validez de constructo sobre la innovación
- Considera el contexto socioeconómico diverso de Chile
================================================================================
```

---

## 7.6 Validaciones Automáticas

### 7.6.1 Validaciones de Formato

```python
class ValidadorFormato:
    """Validaciones técnicas del ítem"""
    
    REGLAS_FORMATO = {
        'longitud_minima': 15,      # palabras
        'longitud_maxima': 60,      # palabras
        'opciones_minimas': 2,
        'opciones_maximas': 5,
        'longitud_opcion_max': 25   # caracteres
    }
    
    async def validar(self, item: PropuestaItem) -> ResultadoValidacion:
        errores = []
        advertencias = []
        
        # Validar longitud del ítem
        palabras = len(item.texto.split())
        if palabras < self.REGLAS_FORMATO['longitud_minima']:
            errores.append(f"Ítem demasiado corto ({palabras} palabras)")
        elif palabras > self.REGLAS_FORMATO['longitud_maxima']:
            errores.append(f"Ítem demasiado largo ({palabras} palabras)")
        
        # Validar opciones de respuesta
        num_opciones = len(item.opciones_respuesta)
        if num_opciones < self.REGLAS_FORMATO['opciones_minimas']:
            errores.append(f"Muy pocas opciones ({num_opciones})")
        elif num_opciones > self.REGLAS_FORMATO['opciones_maximas']:
            errores.append(f"Demasiadas opciones ({num_opciones})")
        
        # Validar longitud de cada opción
        for opcion in item.opciones_respuesta:
            if len(opcion.etiqueta) > self.REGLAS_FORMATO['longitud_opcion_max']:
                advertencias.append(f"Opción larga: '{opcion.etiqueta[:20]}...'")
        
        return ResultadoValidacion(
            es_valido=len(errores) == 0,
            errores=errores,
            advertencias=advertencias
        )
```

### 7.6.2 Validaciones de Legibilidad

```python
class ValidadorLegibilidad:
    """Validaciones de legibilidad y comprensión"""
    
    async def validar(self, texto: str, nivel_educativo: str) -> ResultadoValidacion:
        errores = []
        advertencias = []
        
        # Índice de legibilidad Fernández Huerta (español)
        huerta = self.indice_fernandez_huerta(texto)
        
        # Índice de legibilidad INFLESZ
        inflesz = self.indice_inflesz(texto)
        
        # Umbrales por nivel educativo
        umbrales = {
            '1ro-4to_basico': {'huerta_min': 80, 'inflesz_min': 55},
            '5to-8vo_basico': {'huerta_min': 70, 'inflesz_min': 50},
            '1ro-4to_medio': {'huerta_min': 60, 'inflesz_min': 45},
        }
        
        umbral = umbrales.get(nivel_educativo, {'huerta_min': 60, 'inflesz_min': 45})
        
        if huerta < umbral['huerta_min']:
            advertencias.append(
                f"Legibilidad baja (Huerta: {huerta:.1f}, "
                f"se recomienda > {umbral['huerta_min']})"
            )
        
        if inflesz < umbral['inflesz_min']:
            advertencias.append(
                f"Complejidad alta (INFLESZ: {inflesz:.1f}, "
                f"se recomienda > {umbral['inflesz_min']})"
            )
        
        return ResultadoValidacion(
            es_valido=len(errores) == 0,
            errores=errores,
            advertencias=advertencias,
            metricas={'huerta': huerta, 'inflesz': inflesz}
        )
    
    def indice_fernandez_huerta(self, texto: str) -> float:
        """Calcula índice de legibilidad Fernández Huerta"""
        oraciones = len(re.split(r'[.!?]+', texto))
        palabras = len(texto.split())
        silabas = self.contar_silabas(texto)
        
        if oraciones == 0 or palabras == 0:
            return 0
        
        return 206.84 - 0.60 * (palabras / oraciones) - 1.02 * (silabas / palabras)
```

### 7.6.3 Validaciones de Sesgo

```python
class ValidadorSesgo:
    """Validaciones de sesgo de género y cultural"""
    
    TERMINOS_PROBLEMATICOS = {
        'genero': {
            'altamente_masculinizados': ['el líder', 'el jefe', 'el experto'],
            'altamente_femenizados': ['la cuidadora', 'la secretaria'],
            'exclusivos': ['los chicos', 'los alumnos', 'los estudiantes']
        },
        'cultural': {
            'occidental_centrico': ['Navidad', 'Thanksgiving'],
            'urbano_centrico': ['metro', 'mall', 'cine']
        }
    }
    
    async def validar(self, texto: str) -> ResultadoValidacion:
        advertencias = []
        
        # Detectar términos problemáticos de género
        for categoria, terminos in self.TERMINOS_PROBLEMATICOS['genero'].items():
            for termino in terminos:
                if termino.lower() in texto.lower():
                    advertencias.append(
                        f"Posible sesgo de género: '{termino}' ({categoria})"
                    )
        
        # Sugerir alternativas inclusivas
        texto_neutral = self.sugerir_lenguaje_inclusivo(texto)
        
        return ResultadoValidacion(
            es_valido=True,  # No es error bloqueante
            errores=[],
            advertencias=advertencias,
            sugerencias={'texto_neutral': texto_neutral}
        )
```

### 7.6.4 Validaciones de Complejidad Cognitiva

```python
class ValidadorComplejidad:
    """Valida que la complejidad sea apropiada al nivel educativo"""
    
    NIVELES_BLOOM = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar', 'crear']
    
    VERBOS_POR_NIVEL = {
        'recordar': ['identificar', 'recordar', 'reconocer', 'nombrar', 'listar'],
        'comprender': ['describir', 'explicar', 'resumir', 'clasificar', 'comparar'],
        'aplicar': ['aplicar', 'usar', 'demostrar', 'resolver', 'ejecutar'],
        'analizar': ['analizar', 'diferenciar', 'organizar', 'relacionar', 'comparar'],
        'evaluar': ['evaluar', 'justificar', 'defender', 'criticar', 'recomendar'],
        'crear': ['crear', 'diseñar', 'construir', 'formular', 'proponer']
    }
    
    NIVEL_ESPERADO = {
        '1ro-4to_basico': ['recordar', 'comprender'],
        '5to-8vo_basico': ['comprender', 'aplicar'],
        '1ro-4to_medio': ['aplicar', 'analizar', 'evaluar']
    }
    
    async def validar(self, texto: str, nivel_educativo: str) -> ResultadoValidacion:
        # Detectar verbos de Bloom en el texto
        verbos_detectados = self.detectar_verbos_bloom(texto)
        
        # Determinar nivel cognitivo predominante
        nivel_detectado = self.determinar_nivel(verbos_detectados)
        
        # Comparar con nivel esperado
        niveles_esperados = self.NIVEL_ESPERADO.get(nivel_educativo, ['comprender'])
        
        advertencias = []
        if nivel_detectado not in niveles_esperados:
            advertencias.append(
                f"Nivel cognitivo '{nivel_detectado}' puede ser "
                f"inapropiado para {nivel_educativo}. "
                f"Esperado: {', '.join(niveles_esperados)}"
            )
        
        return ResultadoValidacion(
            es_valido=True,
            errores=[],
            advertencias=advertencias,
            metricas={
                'nivel_cognitivo_detectado': nivel_detectado,
                'verbos_detectados': verbos_detectados
            }
        )
```

---

## 7.7 Esquemas de Salida Estructurados

### 7.7.1 Schema de Propuesta de Ítem

```python
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Tuple
from datetime import datetime
from enum import Enum

class TipoPropuesta(str, Enum):
    NUEVO = "nuevo"
    VARIANTE = "variante"
    REFORMULACION = "reformulacion"
    REDUNDANTE = "redundante"

class NivelConfianza(str, Enum):
    ALTA = "alta"       # 0.80-1.00
    MEDIA = "media"     # 0.60-0.79
    BAJA = "baja"       # 0.40-0.59
    MUY_BAJA = "muy_baja"  # < 0.40

class EstadoPropuesta(str, Enum):
    BORRADOR = "borrador"
    PENDIENTE_REVISION = "pendiente_revision"
    EN_REVISION = "en_revision"
    APROBADO = "aprobado"
    RECHAZADO = "rechazado"
    MODIFICADO = "modificado"

class OpcionRespuesta(BaseModel):
    valor: int = Field(..., ge=1, le=5)
    etiqueta: str = Field(..., min_length=1, max_length=50)
    descripcion: Optional[str] = None

class ItemSimilarEncontrado(BaseModel):
    id_item: str
    texto_item: str
    actor: str
    dimension: str
    subdimension: Optional[str]
    similitud_semantica: float = Field(..., ge=0, le=1)
    similitud_lexica: float = Field(..., ge=0, le=1)
    similitud_constructo: float = Field(..., ge=0, le=1)
    score_compuesto: float = Field(..., ge=0, le=1)
    analisis: str

class ScoreConfianzaClasificacion(BaseModel):
    score: float = Field(..., ge=0, le=1)
    intervalo_confianza: Tuple[float, float]
    nivel: NivelConfianza
    componentes: Dict[str, float]

class PropuestaItem(BaseModel):
    """Schema completo de una propuesta de ítem"""
    
    # Identificación
    id_propuesta: str = Field(..., description="ID único de la propuesta")
    id_solicitud: str = Field(..., description="ID de la solicitud que la generó")
    fecha_generacion: datetime = Field(default_factory=datetime.now)
    version_agente: str = Field(..., description="Versión del agente generador")
    
    # Contenido del ítem
    texto_item: str = Field(..., min_length=30, max_length=500)
    instruccion: Optional[str] = Field(None, max_length=200)
    opciones_respuesta: List[OpcionRespuesta] = Field(..., min_items=2, max_items=5)
    
    # Clasificación propuesta
    actor_sugerido: str
    dimension_sugerida: str
    subdimension_sugerida: Optional[str]
    indicador_sugerido: Optional[str]
    niveles_educativos: List[str]
    
    # Metadatos de generación
    tipo_propuesta: TipoPropuesta
    items_similares: List[ItemSimilarEncontrado]
    confianza_clasificacion: ScoreConfianzaClasificacion
    
    # Justificación
    justificacion_clasificacion: str = Field(..., min_length=50)
    justificacion_tipo: str
    nivel_redundancia: str = Field(..., regex="^(bajo|medio|alto)$")
    recomendacion_final: str
    notas_revision: Optional[str]
    
    # Estado
    estado: EstadoPropuesta = Field(default=EstadoPropuesta.BORRADOR)
    
    # Validaciones
    resultado_validacion: Optional[Dict]
    
    @validator('texto_item')
    def validar_longitud_palabras(cls, v):
        palabras = len(v.split())
        if palabras < 15:
            raise ValueError(f'Ítem debe tener al menos 15 palabras (tiene {palabras})')
        if palabras > 60:
            raise ValueError(f'Ítem debe tener máximo 60 palabras (tiene {palabras})')
        return v
    
    @validator('confianza_clasificacion')
    def validar_intervalo_confianza(cls, v):
        inferior, superior = v.intervalo_confianza
        if not (0 <= inferior <= v.score <= superior <= 1):
            raise ValueError('Intervalo de confianza inválido')
        return v

class SolicitudGeneracion(BaseModel):
    """Schema de entrada para solicitud de generación"""
    
    id_solicitud: str = Field(default_factory=lambda: str(uuid.uuid4()))
    actor: str
    dimension: str
    subdimension: Optional[str]
    proposito: str = Field(..., min_length=20)
    constructo_objetivo: Optional[str]
    nivel_educativo: str
    formato_requerido: str = "escala_likert_4"
    restricciones_adicionales: Optional[str]
    num_propuestas_solicitadas: int = Field(default=3, ge=1, le=5)
    contexto_adicional: Optional[str]
    solicitante: str
    fecha_solicitud: datetime = Field(default_factory=datetime.now)
```

### 7.7.2 Schema de Tablas de Base de Datos

```sql
-- Tabla de propuestas de ítems
CREATE TABLE propuestas_items (
    id_propuesta VARCHAR(50) PRIMARY KEY,
    id_solicitud VARCHAR(50) NOT NULL,
    texto_item TEXT NOT NULL,
    instruccion TEXT,
    opciones_respuesta JSONB NOT NULL,
    actor_propuesto VARCHAR(50) NOT NULL,
    dimension_propuesta VARCHAR(100) NOT NULL,
    subdimension_propuesta VARCHAR(100),
    indicador_propuesto VARCHAR(200),
    niveles_educativos JSONB,
    
    -- Metadatos de generación
    tipo_propuesta VARCHAR(20) NOT NULL CHECK (tipo_propuesta IN ('nuevo', 'variante', 'reformulacion', 'redundante')),
    items_similares JSONB,
    confianza_score DECIMAL(3,2),
    confianza_intervalo JSONB,
    confianza_nivel VARCHAR(20),
    
    -- Justificación
    justificacion_clasificacion TEXT NOT NULL,
    justificacion_tipo TEXT,
    nivel_redundancia VARCHAR(10) CHECK (nivel_redundancia IN ('bajo', 'medio', 'alto')),
    recomendacion_final TEXT,
    notas_revision TEXT,
    
    -- Estado y seguimiento
    estado VARCHAR(30) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'pendiente_revision', 'en_revision', 'aprobado', 'rechazado', 'modificado')),
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_cambio_estado TIMESTAMP,
    version_agente VARCHAR(20),
    
    -- Resultados de validación
    resultado_validacion JSONB,
    
    -- Claves foráneas
    FOREIGN KEY (id_solicitud) REFERENCES solicitudes_generacion(id_solicitud)
);

-- Tabla de solicitudes de generación
CREATE TABLE solicitudes_generacion (
    id_solicitud VARCHAR(50) PRIMARY KEY,
    actor VARCHAR(50) NOT NULL,
    dimension VARCHAR(100) NOT NULL,
    subdimension VARCHAR(100),
    proposito TEXT NOT NULL,
    constructo_objetivo VARCHAR(200),
    nivel_educativo VARCHAR(50) NOT NULL,
    formato_requerido VARCHAR(50) DEFAULT 'escala_likert_4',
    restricciones_adicionales TEXT,
    num_propuestas_solicitadas INTEGER DEFAULT 3,
    contexto_adicional TEXT,
    solicitante VARCHAR(100) NOT NULL,
    fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(30) DEFAULT 'pendiente'
);

-- Tabla de revisiones humanas
CREATE TABLE revisiones_propuestas (
    id_revision SERIAL PRIMARY KEY,
    id_propuesta VARCHAR(50) NOT NULL,
    revisor VARCHAR(100) NOT NULL,
    decision VARCHAR(20) NOT NULL CHECK (decision IN ('aprobado', 'rechazado', 'modificado')),
    comentarios TEXT,
    cambios_realizados JSONB,
    clasificacion_corregida JSONB,
    fecha_revision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_propuesta) REFERENCES propuestas_items(id_propuesta)
);

-- Índices para búsquedas eficientes
CREATE INDEX idx_propuestas_estado ON propuestas_items(estado);
CREATE INDEX idx_propuestas_actor ON propuestas_items(actor_propuesto);
CREATE INDEX idx_propuestas_dimension ON propuestas_items(dimension_propuesta);
CREATE INDEX idx_propuestas_confianza ON propuestas_items(confianza_score);
CREATE INDEX idx_propuestas_tipo ON propuestas_items(tipo_propuesta);
CREATE INDEX idx_propuestas_fecha ON propuestas_items(fecha_generacion);
```

---

## 7.8 Implementación del Servicio

```python
# agente_generador_clasificador.py
"""
Servicio del Agente Generador y Clasificador IDPS
Sistema de Homologación Longitudinal - Agencia de Calidad de la Educación Chile
"""

import uuid
import re
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
import numpy as np
from pydantic import BaseModel, Field
import asyncio

# Modelos de datos (definidos en sección anterior)
from schemas import (
    PropuestaItem, SolicitudGeneracion, ItemSimilarEncontrado,
    ScoreConfianzaClasificacion, TipoPropuesta, EstadoPropuesta,
    OpcionRespuesta, NivelConfianza
)

class AgenteGeneradorClasificador:
    """
    Agente híbrido para generación y clasificación taxonómica de ítems IDPS.
    
    Este agente combina capacidades de:
    - Generación de ítems mediante LLM
    - Búsqueda semántica de similares
    - Clasificación taxonómica con confianza
    - Detección de redundancia
    - Validación automática de calidad
    """
    
    def __init__(
        self,
        db: Any,  # Database connection
        llm_client: Any,  # OpenAI/Azure client
        vector_store: Any,  # Vector database (pgvector/Pinecone)
        embedding_model: Any = None,
        config: Optional[Dict] = None
    ):
        self.db = db
        self.llm = llm_client
        self.vectors = vector_store
        self.embedding_model = embedding_model
        self.config = config or self._default_config()
        
        # Inicializar componentes
        self.validador_formato = ValidadorFormato()
        self.validador_legibilidad = ValidadorLegibilidad()
        self.validador_sesgo = ValidadorSesgo()
        self.validador_complejidad = ValidadorComplejidad()
        self.detector_redundancia = DetectorRedundancia()
        self.scoring_confianza = ScoringConfianza()
    
    def _default_config(self) -> Dict:
        return {
            'umbral_similitud_busqueda': 0.5,
            'umbral_redundancia': 0.85,
            'umbral_variante': 0.60,
            'max_items_similares': 15,
            'num_propuestas_default': 3,
            'temperatura_llm': 0.3,
            'modelo_llm': 'gpt-4-turbo-preview',
            'version_agente': '1.0.0'
        }
    
    # ========================================================================
    # MÉTODO PRINCIPAL: Generar ítems
    # ========================================================================
    
    async def generar_items(
        self,
        request: SolicitudGeneracion
    ) -> List[PropuestaItem]:
        """
        Método principal: Genera propuestas de ítems basado en la solicitud.
        
        Flujo completo:
        1. Validar solicitud
        2. Buscar ítems similares
        3. Generar propuestas con LLM
        4. Clasificar taxonómicamente
        5. Validar calidad
        6. Guardar en tabla de propuestas
        7. Notificar revisores
        """
        
        print(f"[Agente] Iniciando generación para solicitud {request.id_solicitud}")
        
        # Paso 1: Validar solicitud
        await self._validar_solicitud(request)
        
        # Paso 2: Buscar ítems similares
        print("[Agente] Buscando ítems similares...")
        items_similares = await self._buscar_items_similares(request)
        
        # Paso 3: Generar propuestas con LLM
        print(f"[Agente] Generando {request.num_propuestas_solicitadas} propuestas...")
        propuestas_crudas = await self._generar_con_llm(request, items_similares)
        
        # Paso 4: Procesar cada propuesta
        propuestas_finales = []
        for propuesta_data in propuestas_crudas:
            
            # Clasificar taxonómicamente
            clasificacion = await self._clasificar_taxonomicamente(
                propuesta_data['texto_item'],
                request
            )
            
            # Detectar redundancia
            analisis_redundancia = await self._analizar_redundancia(
                propuesta_data['texto_item'],
                items_similares
            )
            
            # Calcular confianza
            score_confianza = self.scoring_confianza.calcular_confianza(
                propuesta_data,
                items_similares,
                request
            )
            
            # Validar calidad
            resultado_validacion = await self._validar_propuesta(
                propuesta_data,
                request.nivel_educativo
            )
            
            # Construir objeto PropuestaItem
            propuesta = self._construir_propuesta(
                propuesta_data=propuesta_data,
                request=request,
                clasificacion=clasificacion,
                analisis_redundancia=analisis_redundancia,
                score_confianza=score_confianza,
                resultado_validacion=resultado_validacion,
                items_similares=items_similares
            )
            
            propuestas_finales.append(propuesta)
        
        # Paso 5: Guardar propuestas en base de datos
        print("[Agente] Guardando propuestas...")
        for propuesta in propuestas_finales:
            await self._guardar_propuesta(propuesta)
        
        # Paso 6: Notificar revisores
        await self._notificar_revisores(propuestas_finales)
        
        print(f"[Agente] Generación completada. {len(propuestas_finales)} propuestas creadas.")
        
        return propuestas_finales
    
    # ========================================================================
    # PASO 2: Búsqueda de ítems similares
    # ========================================================================
    
    async def buscar_similares(
        self,
        texto: str,
        umbral: float = 0.5,
        filtros: Optional[Dict] = None
    ) -> List[ItemSimilarEncontrado]:
        """
        Búsqueda híbrida: combina embeddings semánticos + búsqueda léxica
        """
        # Generar embedding de la consulta
        embedding_query = await self._generar_embedding(texto)
        
        # 1. Búsqueda semántica por similitud de coseno
        resultados_semanticos = await self.vectors.similarity_search_with_score(
            embedding=embedding_query,
            k=self.config['max_items_similares'] * 2,
            filter=filtros
        )
        
        # 2. Búsqueda léxica (full-text search)
        resultados_lexicos = await self._busqueda_lexica(texto, filtros)
        
        # 3. Fusión con Reciprocal Rank Fusion
        resultados_fusionados = self._reciprocal_rank_fusion(
            [resultados_semanticos, resultados_lexicos],
            k=60
        )
        
        # 4. Análisis detallado de similitud
        items_similares = []
        for resultado in resultados_fusionados[:self.config['max_items_similares']]:
            
            # Calcular similitudes múltiples
            sim_semantica = resultado['score']
            sim_lexica = self._jaccard_similarity(texto, resultado['texto_item'])
            sim_constructo = await self._analizar_similitud_constructo(
                texto, resultado['texto_item']
            )
            
            # Score compuesto
            score_compuesto = (
                0.5 * sim_semantica +
                0.3 * sim_lexica +
                0.2 * sim_constructo
            )
            
            if score_compuesto >= umbral:
                items_similares.append(ItemSimilarEncontrado(
                    id_item=resultado['id_item'],
                    texto_item=resultado['texto_item'],
                    actor=resultado['actor'],
                    dimension=resultado['dimension'],
                    subdimension=resultado.get('subdimension'),
                    similitud_semantica=round(sim_semantica, 3),
                    similitud_lexica=round(sim_lexica, 3),
                    similitud_constructo=round(sim_constructo, 3),
                    score_compuesto=round(score_compuesto, 3),
                    analisis=self._generar_analisis_similitud(
                        texto, resultado['texto_item'], score_compuesto
                    )
                ))
        
        return sorted(items_similares, key=lambda x: x.score_compuesto, reverse=True)
    
    async def _buscar_items_similares(
        self,
        request: SolicitudGeneracion
    ) -> List[ItemSimilarEncontrado]:
        """Busca ítems similares basado en propósito y contexto"""
        
        # Construir texto de consulta
        texto_consulta = f"""
        {request.proposito}
        {request.constructo_objetivo or ''}
        {request.contexto_adicional or ''}
        """
        
        # Filtros por actor y dimensión
        filtros = {
            'actor': request.actor,
            'dimension': request.dimension
        }
        if request.subdimension:
            filtros['subdimension'] = request.subdimension
        
        return await self.buscar_similares(
            texto=texto_consulta,
            umbral=self.config['umbral_similitud_busqueda'],
            filtros=filtros
        )
    
    # ========================================================================
    # PASO 3: Generación con LLM
    # ========================================================================
    
    async def _generar_con_llm(
        self,
        request: SolicitudGeneracion,
        items_similares: List[ItemSimilarEncontrado]
    ) -> List[Dict]:
        """Genera propuestas de ítems usando el LLM"""
        
        # Construir prompt completo
        prompt = self._construir_prompt_generacion(request, items_similares)
        
        # Llamar al LLM
        response = await self.llm.chat.completions.create(
            model=self.config['modelo_llm'],
            messages=[
                {"role": "system", "content": self._get_system_prompt()},
                {"role": "user", "content": prompt}
            ],
            temperature=self.config['temperatura_llm'],
            max_tokens=2500,
            response_format={"type": "json_object"}
        )
        
        # Parsear respuesta
        import json
        resultado = json.loads(response.choices[0].message.content)
        
        return resultado.get('propuestas', [])
    
    def _construir_prompt_generacion(
        self,
        request: SolicitudGeneracion,
        items_similares: List[ItemSimilarEncontrado]
    ) -> str:
        """Construye el prompt para el LLM"""
        
        # Formatear ítems similares
        similares_texto = "\n".join([
            f"ID: {item.id_item}\n"
            f"Texto: {item.texto_item}\n"
            f"Actor: {item.actor}, Dimensión: {item.dimension}\n"
            f"Similitud: {item.score_compuesto}\n"
            f"---"
            for item in items_similares[:5]  # Top 5
        ])
        
        return f"""
TAREA: Generar ítems IDPS para el sistema educativo chileno.

SOLICITUD:
- Actor: {request.actor}
- Dimensión: {request.dimension}
- Subdimensión: {request.subdimension or 'No especificada'}
- Propósito: {request.proposito}
- Constructo objetivo: {request.constructo_objetivo or 'No especificado'}
- Nivel educativo: {request.nivel_educativo}
- Formato requerido: {request.formato_requerido}
- Restricciones: {request.restricciones_adicionales or 'Ninguna'}
- Contexto adicional: {request.contexto_adicional or 'Ninguno'}

ÍTEMS SIMILARES ENCONTRADOS:
{similares_texto if items_similares else 'No se encontraron ítems similares.'}

Genera {request.num_propuestas_solicitadas} opciones de ítems en formato JSON.
"""
    
    def _get_system_prompt(self) -> str:
        """Retorna el system prompt completo del agente"""
        return """Eres un experto psicometra especializado en ítems IDPS..."""  # Ver sección 7.5
    
    # ========================================================================
    # PASO 4: Clasificación Taxonómica
    # ========================================================================
    
    async def clasificar_taxonomicamente(
        self,
        texto: str,
        contexto: Dict
    ) -> Dict:
        """
        Clasifica un ítem dentro de la taxonomía IDPS con nivel de confianza.
        """
        # Buscar ejemplos similares ya clasificados
        ejemplos_similares = await self._buscar_ejemplos_clasificados(texto)
        
        # Usar LLM para clasificación
        prompt_clasificacion = f"""
        Clasifica el siguiente ítem IDPS:
        
        ÍTEM: {texto}
        
        CONTEXTO:
        - Actor sugerido: {contexto.get('actor')}
        - Dimensión sugerida: {contexto.get('dimension')}
        
        EJEMPLOS SIMILARES CLASIFICADOS:
        {ejemplos_similares}
        
        Responde en JSON con:
        - actor_clasificado
        - dimension_clasificada
        - subdimension_clasificada
        - indicador_clasificado
        - justificacion
        """
        
        response = await self.llm.chat.completions.create(
            model=self.config['modelo_llm'],
            messages=[
                {"role": "system", "content": "Eres un clasificador taxonómico experto en IDPS."},
                {"role": "user", "content": prompt_clasificacion}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        import json
        clasificacion = json.loads(response.choices[0].message.content)
        
        return clasificacion
    
    # ========================================================================
    # PASO 5: Detección de Redundancia
    # ========================================================================
    
    async def detectar_redundancia(
        self,
        nuevo_item: str,
        existentes: List[str]
    ) -> Dict:
        """
        Detecta si un ítem nuevo es redundante respecto a ítems existentes.
        """
        if not existentes:
            return {
                'es_redundante': False,
                'max_similitud': 0.0,
                'items_redundantes': [],
                'tipo': 'nuevo'
            }
        
        # Generar embedding del nuevo ítem
        embedding_nuevo = await self._generar_embedding(nuevo_item)
        
        similitudes = []
        for existente in existentes:
            embedding_existente = await self._generar_embedding(existente)
            
            # Similitud semántica
            sim_cos = self._cosine_similarity(embedding_nuevo, embedding_existente)
            
            # Similitud léxica
            sim_lex = self._jaccard_similarity(nuevo_item, existente)
            
            # Score compuesto
            score = 0.6 * sim_cos + 0.4 * sim_lex
            similitudes.append(score)
        
        max_similitud = max(similitudes)
        
        # Clasificar tipo según similitud
        if max_similitud > self.config['umbral_redundancia']:
            tipo = 'redundante'
        elif max_similitud > 0.70:
            tipo = 'reformulacion'
        elif max_similitud > self.config['umbral_variante']:
            tipo = 'variante'
        else:
            tipo = 'nuevo'
        
        return {
            'es_redundante': max_similitud > self.config['umbral_redundancia'],
            'max_similitud': round(max_similitud, 3),
            'items_redundantes': [
                existentes[i] for i, s in enumerate(similitudes) 
                if s > self.config['umbral_redundancia']
            ],
            'tipo': tipo,
            'todas_similitudes': [round(s, 3) for s in similitudes]
        }
    
    # ========================================================================
    # PASO 6: Guardar Propuesta
    # ========================================================================
    
    async def guardar_propuesta(self, propuesta: PropuestaItem) -> str:
        """
        Guarda una propuesta en la tabla de propuestas.
        """
        query = """
        INSERT INTO propuestas_items (
            id_propuesta, id_solicitud, texto_item, instruccion,
            opciones_respuesta, actor_propuesto, dimension_propuesta,
            subdimension_propuesta, indicador_propuesto, niveles_educativos,
            tipo_propuesta, items_similares, confianza_score,
            confianza_intervalo, confianza_nivel, justificacion_clasificacion,
            justificacion_tipo, nivel_redundancia, recomendacion_final,
            notas_revision, estado, fecha_generacion, version_agente,
            resultado_validacion
        ) VALUES (
            :id_propuesta, :id_solicitud, :texto_item, :instruccion,
            :opciones_respuesta, :actor_propuesto, :dimension_propuesta,
            :subdimension_propuesta, :indicador_propuesto, :niveles_educativos,
            :tipo_propuesta, :items_similares, :confianza_score,
            :confianza_intervalo, :confianza_nivel, :justificacion_clasificacion,
            :justificacion_tipo, :nivel_redundancia, :recomendacion_final,
            :notas_revision, :estado, :fecha_generacion, :version_agente,
            :resultado_validacion
        )
        """
        
        params = {
            'id_propuesta': propuesta.id_propuesta,
            'id_solicitud': propuesta.id_solicitud,
            'texto_item': propuesta.texto_item,
            'instruccion': propuesta.instruccion,
            'opciones_respuesta': [op.dict() for op in propuesta.opciones_respuesta],
            'actor_propuesto': propuesta.actor_sugerido,
            'dimension_propuesta': propuesta.dimension_sugerida,
            'subdimension_propuesta': propuesta.subdimension_sugerida,
            'indicador_propuesto': propuesta.indicador_sugerido,
            'niveles_educativos': propuesta.niveles_educativos,
            'tipo_propuesta': propuesta.tipo_propuesta.value,
            'items_similares': [item.dict() for item in propuesta.items_similares],
            'confianza_score': propuesta.confianza_clasificacion.score,
            'confianza_intervalo': list(propuesta.confianza_clasificacion.intervalo_confianza),
            'confianza_nivel': propuesta.confianza_clasificacion.nivel.value,
            'justificacion_clasificacion': propuesta.justificacion_clasificacion,
            'justificacion_tipo': propuesta.justificacion_tipo,
            'nivel_redundancia': propuesta.nivel_redundancia,
            'recomendacion_final': propuesta.recomendacion_final,
            'notas_revision': propuesta.notas_revision,
            'estado': propuesta.estado.value,
            'fecha_generacion': propuesta.fecha_generacion,
            'version_agente': propuesta.version_agente,
            'resultado_validacion': propuesta.resultado_validacion
        }
        
        await self.db.execute(query, params)
        
        return propuesta.id_propuesta
    
    # ========================================================================
    # MÉTODOS AUXILIARES
    # ========================================================================
    
    async def _generar_embedding(self, texto: str) -> List[float]:
        """Genera embedding para un texto"""
        if self.embedding_model:
            return self.embedding_model.encode(texto, normalize_embeddings=True)
        else:
            # Fallback: usar API de embeddings
            response = await self.llm.embeddings.create(
                model="text-embedding-ada-002",
                input=texto
            )
            return response.data[0].embedding
    
    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calcula similitud de coseno entre dos vectores"""
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    
    def _jaccard_similarity(self, text1: str, text2: str) -> float:
        """Calcula similitud de Jaccard entre dos textos"""
        set1 = set(text1.lower().split())
        set2 = set(text2.lower().split())
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        return intersection / union if union > 0 else 0.0
    
    def _reciprocal_rank_fusion(
        self,
        listas_resultados: List[List[Dict]],
        k: int = 60
    ) -> List[Dict]:
        """Fusiona múltiples listas de resultados usando RRF"""
        scores = {}
        
        for lista in listas_resultados:
            for rank, item in enumerate(lista):
                id_item = item['id_item']
                if id_item not in scores:
                    scores[id_item] = {'score': 0, 'item': item}
                scores[id_item]['score'] += 1 / (k + rank)
        
        # Ordenar por score
        resultados_ordenados = sorted(
            scores.values(),
            key=lambda x: x['score'],
            reverse=True
        )
        
        return [r['item'] for r in resultados_ordenados]
    
    async def _validar_solicitud(self, request: SolicitudGeneracion):
        """Valida que la solicitud sea válida"""
        # Verificar que actor existe en taxonomía
        # Verificar que dimensión existe
        # Verificar coherencia nivel educativo
        pass
    
    async def _validar_propuesta(
        self,
        propuesta: Dict,
        nivel_educativo: str
    ) -> Dict:
        """Ejecuta todas las validaciones sobre una propuesta"""
        
        validaciones = {
            'formato': await self.validador_formato.validar(propuesta),
            'legibilidad': await self.validador_legibilidad.validar(
                propuesta['texto_item'], nivel_educativo
            ),
            'sesgo': await self.validador_sesgo.validar(propuesta['texto_item']),
            'complejidad': await self.validador_complejidad.validar(
                propuesta['texto_item'], nivel_educativo
            )
        }
        
        return {
            'es_valido': all(v.es_valido for v in validaciones.values()),
            'validaciones': {k: v.dict() for k, v in validaciones.items()}
        }
    
    async def _notificar_revisores(self, propuestas: List[PropuestaItem]):
        """Notifica a revisores humanos de nuevas propuestas"""
        # Implementar notificación (email, dashboard, etc.)
        pass
    
    def _construir_propuesta(
        self,
        propuesta_data: Dict,
        request: SolicitudGeneracion,
        clasificacion: Dict,
        analisis_redundancia: Dict,
        score_confianza: ScoreConfianzaClasificacion,
        resultado_validacion: Dict,
        items_similares: List[ItemSimilarEncontrado]
    ) -> PropuestaItem:
        """Construye objeto PropuestaItem completo"""
        
        return PropuestaItem(
            id_propuesta=f"PROP-{uuid.uuid4().hex[:12].upper()}",
            id_solicitud=request.id_solicitud,
            texto_item=propuesta_data['texto_item'],
            instruccion=propuesta_data.get('instruccion'),
            opciones_respuesta=[
                OpcionRespuesta(**op) 
                for op in propuesta_data['opciones_respuesta']
            ],
            actor_sugerido=clasificacion['actor_clasificado'],
            dimension_sugerida=clasificacion['dimension_clasificada'],
            subdimension_sugerida=clasificacion.get('subdimension_clasificada'),
            indicador_sugerido=clasificacion.get('indicador_clasificado'),
            niveles_educativos=propuesta_data.get('niveles_educativos', [request.nivel_educativo]),
            tipo_propuesta=TipoPropuesta(analisis_redundancia['tipo']),
            items_similares=items_similares,
            confianza_clasificacion=score_confianza,
            justificacion_clasificacion=clasificacion['justificacion'],
            justificacion_tipo=propuesta_data.get('justificacion_tipo', ''),
            nivel_redundancia='alto' if analisis_redundancia['es_redundante'] else 
                            ('medio' if analisis_redundancia['max_similitud'] > 0.60 else 'bajo'),
            recomendacion_final=propuesta_data.get('recomendacion', ''),
            notas_revision=propuesta_data.get('notas_revision'),
            estado=EstadoPropuesta.BORRADOR,
            version_agente=self.config['version_agente'],
            resultado_validacion=resultado_validacion
        )


# ============================================================================
# CLASES VALIDADORAS (implementaciones simplificadas)
# ============================================================================

class ValidadorFormato:
    async def validar(self, propuesta: Dict) -> Any:
        # Implementación de validaciones de formato
        pass

class ValidadorLegibilidad:
    async def validar(self, texto: str, nivel: str) -> Any:
        # Implementación de validaciones de legibilidad
        pass

class ValidadorSesgo:
    async def validar(self, texto: str) -> Any:
        # Implementación de validaciones de sesgo
        pass

class ValidadorComplejidad:
    async def validar(self, texto: str, nivel: str) -> Any:
        # Implementación de validaciones de complejidad
        pass

class DetectorRedundancia:
    pass

class ScoringConfianza:
    def calcular_confianza(self, propuesta, similares, contexto) -> ScoreConfianzaClasificacion:
        # Implementación del cálculo de confianza
        return ScoreConfianzaClasificacion(
            score=0.75,
            intervalo_confianza=(0.68, 0.82),
            nivel=NivelConfianza.MEDIA,
            componentes={}
        )
```

---

## 7.9 Ejemplo Completo de Uso

### 7.9.1 Solicitud de Generación

```python
import asyncio
from datetime import datetime

async def ejemplo_uso_completo():
    """
    Ejemplo end-to-end del uso del Agente Generador y Clasificador
    """
    
    # 1. CREAR SOLICITUD DE GENERACIÓN
    # ==================================
    
    solicitud = SolicitudGeneracion(
        actor="estudiante",
        dimension="habilidades_sociales",
        subdimension="trabajo_colaborativo",
        proposito="""
            Evaluar la capacidad del estudiante para trabajar efectivamente 
            en equipo, compartir responsabilidades y contribuir al logro 
            de objetivos grupales en contextos escolares.
        """,
        constructo_objetivo="Colaboración y trabajo en equipo",
        nivel_educativo="7mo-8vo_basico",
        formato_requerido="escala_likert_4",
        restricciones_adicionales="""
            - Evitar términos muy formales
            - Contexto de proyectos grupales escolares
            - No más de 45 palabras por ítem
        """,
        contexto_adicional="""
            Contexto educativo chileno, estudiantes de establecimientos 
            municipales y subvencionados, diversidad socioeconómica.
        """,
        num_propuestas_solicitadas=3,
        solicitante="maria.gonzalez@agenciaeducacion.cl"
    )
    
    print("=" * 70)
    print("EJEMPLO DE USO: Agente Generador y Clasificador IDPS")
    print("=" * 70)
    print(f"\n[1] SOLICITUD CREADA:")
    print(f"    ID: {solicitud.id_solicitud}")
    print(f"    Actor: {solicitud.actor}")
    print(f"    Dimensión: {solicitud.dimension}")
    print(f"    Nivel: {solicitud.nivel_educativo}")
    
    
    # 2. INICIALIZAR AGENTE
    # =====================
    
    # (En producción, estas serían conexiones reales)
    db = MockDatabase()
    llm_client = MockLLMClient()
    vector_store = MockVectorStore()
    
    agente = AgenteGeneradorClasificador(
        db=db,
        llm_client=llm_client,
        vector_store=vector_store
    )
    
    print(f"\n[2] AGENTE INICIALIZADO")
    print(f"    Versión: {agente.config['version_agente']}")
    print(f"    Modelo LLM: {agente.config['modelo_llm']}")
    
    
    # 3. EJECUTAR GENERACIÓN
    # ======================
    
    print(f"\n[3] EJECUTANDO GENERACIÓN...")
    print(f"    Buscando ítems similares...")
    print(f"    Consultando banco histórico...")
    
    propuestas = await agente.generar_items(solicitud)
    
    
    # 4. MOSTRAR RESULTADOS
    # =====================
    
    print(f"\n[4] RESULTADOS: {len(propuestas)} propuestas generadas")
    print("-" * 70)
    
    for i, propuesta in enumerate(propuestas, 1):
        print(f"\n>>> PROPUESTA {i}: {propuesta.id_propuesta}")
        print(f"    Estado: {propuesta.estado.value}")
        print(f"    Tipo: {propuesta.tipo_propuesta.value.upper()}")
        print(f"    Confianza: {propuesta.confianza_clasificacion.score} "
              f"({propuesta.confianza_clasificacion.nivel.value})")
        print(f"\n    TEXTO DEL ÍTEM:")
        print(f'    "{propuesta.texto_item}"')
        print(f"\n    CLASIFICACIÓN PROPUESTA:")
        print(f"    - Actor: {propuesta.actor_sugerido}")
        print(f"    - Dimensión: {propuesta.dimension_sugerida}")
        print(f"    - Subdimensión: {propuesta.subdimension_sugerida}")
        print(f"\n    OPCIONES DE RESPUESTA:")
        for op in propuesta.opciones_respuesta:
            print(f"      {op.valor}. {op.etiqueta}")
        print(f"\n    ÍTEMS SIMILARES ENCONTRADOS: {len(propuesta.items_similares)}")
        for sim in propuesta.items_similares[:3]:
            print(f"      - {sim.id_item} (sim: {sim.score_compuesto})")
        print(f"\n    JUSTIFICACIÓN:")
        print(f"    {propuesta.justificacion_clasificacion[:150]}...")
        print(f"\n    RECOMENDACIÓN:")
        print(f"    {propuesta.recomendacion_final}")
        print("-" * 70)
    
    
    # 5. REGISTRO EN BASE DE DATOS
    # =============================
    
    print(f"\n[5] REGISTRO EN BASE DE DATOS")
    print(f"    Tabla: propuestas_items")
    print(f"    Estado inicial: BORRADOR")
    print(f"    Requiere revisión humana: SÍ")
    
    
    # 6. NOTIFICACIÓN A REVISORES
    # ============================
    
    print(f"\n[6] NOTIFICACIÓN A REVISORES")
    print(f"    Revisores notificados: 3")
    print(f"    Propuestas de baja confianza: "
          f"{sum(1 for p in propuestas if p.confianza_clasificacion.nivel == NivelConfianza.BAJA)}")
    
    
    # 7. RESUMEN FINAL
    # ================
    
    print(f"\n" + "=" * 70)
    print("RESUMEN DE GENERACIÓN")
    print("=" * 70)
    
    resumen = {
        'total_propuestas': len(propuestas),
        'por_tipo': {},
        'por_confianza': {},
        'requieren_revision_urgente': 0
    }
    
    for p in propuestas:
        tipo = p.tipo_propuesta.value
        conf = p.confianza_clasificacion.nivel.value
        resumen['por_tipo'][tipo] = resumen['por_tipo'].get(tipo, 0) + 1
        resumen['por_confianza'][conf] = resumen['por_confianza'].get(conf, 0) + 1
        if p.confianza_clasificacion.nivel in [NivelConfianza.BAJA, NivelConfianza.MUY_BAJA]:
            resumen['requieren_revision_urgente'] += 1
    
    print(f"\nTotal propuestas: {resumen['total_propuestas']}")
    print(f"\nPor tipo:")
    for tipo, count in resumen['por_tipo'].items():
        print(f"  - {tipo}: {count}")
    print(f"\nPor nivel de confianza:")
    for conf, count in resumen['por_confianza'].items():
        print(f"  - {conf}: {count}")
    print(f"\nRequieren revisión urgente: {resumen['requieren_revision_urgente']}")
    
    print(f"\n" + "=" * 70)
    print("PROCESO COMPLETADO - Esperando revisión humana")
    print("=" * 70)
    
    return propuestas


# Ejecutar ejemplo
if __name__ == "__main__":
    asyncio.run(ejemplo_uso_completo())
```

### 7.9.2 Salida Esperada del Ejemplo

```
======================================================================
EJEMPLO DE USO: Agente Generador y Clasificador IDPS
======================================================================

[1] SOLICITUD CREADA:
    ID: SOL-a1b2c3d4-e5f6-7890
    Actor: estudiante
    Dimensión: habilidades_sociales
    Nivel: 7mo-8vo_basico

[2] AGENTE INICIALIZADO
    Versión: 1.0.0
    Modelo LLM: gpt-4-turbo-preview

[3] EJECUTANDO GENERACIÓN...
    Buscando ítems similares...
    Consultando banco histórico...

[4] RESULTADOS: 3 propuestas generadas
----------------------------------------------------------------------

>>> PROPUESTA 1: PROP-ABC123XYZ789
    Estado: borrador
    Tipo: NUEVO
    Confianza: 0.82 (alta)

    TEXTO DEL ÍTEM:
    "Cuando trabajo en grupo para un proyecto escolar, me aseguro de 
    que todas las opiniones sean escuchadas antes de tomar una decisión."

    CLASIFICACIÓN PROPUESTA:
    - Actor: estudiante
    - Dimensión: habilidades_sociales
    - Subdimensión: trabajo_colaborativo

    OPCIONES DE RESPUESTA:
      1. Nunca
      2. A veces
      3. Frecuentemente
      4. Siempre

    ÍTEMS SIMILARES ENCONTRADOS: 2
      - ID-2023-045 (sim: 0.58)
      - ID-2022-112 (sim: 0.52)

    JUSTIFICACIÓN:
    El ítem evalúa la capacidad de promover la participación equitativa...

    RECOMENDACIÓN:
    Propuesta de alta calidad. Recomendado para aprobación con revisión...

----------------------------------------------------------------------

>>> PROPUESTA 2: PROP-DEF456UVW012
    Estado: borrador
    Tipo: VARIANTE
    Confianza: 0.75 (media)

    TEXTO DEL ÍTEM:
    "En trabajos grupales, prefiero que todos participemos por igual 
    en lugar de que una persona tome todas las decisiones."

    ...

----------------------------------------------------------------------

[5] REGISTRO EN BASE DE DATOS
    Tabla: propuestas_items
    Estado inicial: BORRADOR
    Requiere revisión humana: SÍ

[6] NOTIFICACIÓN A REVISORES
    Revisores notificados: 3
    Propuestas de baja confianza: 0

======================================================================
RESUMEN DE GENERACIÓN
======================================================================

Total propuestas: 3

Por tipo:
  - nuevo: 1
  - variante: 1
  - reformulacion: 1

Por nivel de confianza:
  - alta: 1
  - media: 2

Requieren revisión urgente: 0

======================================================================
PROCESO COMPLETADO - Esperando revisión humana
======================================================================
```

---

## 7.10 Consideraciones de Implementación

### 7.10.1 Escalabilidad

- **Búsqueda vectorial**: Usar índices aproximados (IVFFlat, HNSW) para búsqueda eficiente
- **Cache de embeddings**: Almacenar embeddings de ítems frecuentemente consultados
- **Procesamiento asíncrono**: Colas de tareas para generación masiva

### 7.10.2 Seguridad

- **Validación de inputs**: Sanitizar todas las entradas del usuario
- **Rate limiting**: Limitar solicitudes por usuario/hora
- **Auditoría**: Registrar todas las operaciones del agente

### 7.10.3 Mantenibilidad

- **Versionado**: Cada versión del agente debe ser reproducible
- **Logging**: Logs detallados de decisiones del agente
- **Métricas**: Monitorear precisión de clasificación vs. revisores humanos

---

## 7.11 Conclusión

El Agente Generador y Clasificador representa un componente crítico del Sistema de Homologación Longitudinal IDPS, combinando capacidades avanzadas de generación de lenguaje natural con análisis taxonómico sofisticado. Su diseño prioriza:

1. **Calidad sobre velocidad**: Validaciones exhaustivas antes de cualquier propuesta
2. **Transparencia**: Justificaciones completas para cada decisión
3. **Colaboración humano-IA**: El agente asiste, no reemplaza, el juicio experto
4. **Mejora continua**: Aprendizaje de feedback de revisores humanos
5. **Trazabilidad**: Registro completo del proceso de generación

Este agente permite escalar la generación de ítems IDPS manteniendo altos estándares de calidad psicométrica y validez de constructo, siempre bajo supervisión humana experta.

---

*Documento generado para la Agencia de Calidad de la Educación de Chile*
*Sistema de Homologación Longitudinal IDPS - Sección 7*
