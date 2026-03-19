"""
================================================================================
AGENTE GENERADOR Y CLASIFICADOR IDPS
Sistema de Homologación Longitudinal - Agencia de Calidad de la Educación Chile
================================================================================

Este módulo implementa el Agente Generador y Clasificador para ítems IDPS,
que combina capacidades de:
- Generación de ítems mediante LLM
- Búsqueda semántica de similares
- Clasificación taxonómica con confianza
- Detección de redundancia
- Validación automática de calidad

Uso:
    from agente_generador_clasificador import AgenteGeneradorClasificador
    
    agente = AgenteGeneradorClasificador(db, llm_client, vector_store)
    propuestas = await agente.generar_items(solicitud)

Autor: Sistema IDPS - Agencia de Calidad de la Educación
Versión: 1.0.0
================================================================================
"""

import uuid
import re
from typing import List, Dict, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import numpy as np
from pydantic import BaseModel, Field, validator
import asyncio
import json


# =============================================================================
# ENUMERACIONES Y CONSTANTES
# =============================================================================

class TipoPropuesta(str, Enum):
    """Tipos de propuesta según similitud con ítems existentes"""
    NUEVO = "nuevo"
    VARIANTE = "variante"
    REFORMULACION = "reformulacion"
    REDUNDANTE = "redundante"


class NivelConfianza(str, Enum):
    """Niveles de confianza de clasificación"""
    ALTA = "alta"           # 0.80-1.00
    MEDIA = "media"         # 0.60-0.79
    BAJA = "baja"           # 0.40-0.59
    MUY_BAJA = "muy_baja"   # < 0.40


class EstadoPropuesta(str, Enum):
    """Estados posibles de una propuesta"""
    BORRADOR = "borrador"
    PENDIENTE_REVISION = "pendiente_revision"
    EN_REVISION = "en_revision"
    APROBADO = "aprobado"
    RECHAZADO = "rechazado"
    MODIFICADO = "modificado"


# =============================================================================
# SCHEMAS PYDANTIC
# =============================================================================

class OpcionRespuesta(BaseModel):
    """Opción de respuesta para un ítem"""
    valor: int = Field(..., ge=1, le=5, description="Valor numérico de la opción")
    etiqueta: str = Field(..., min_length=1, max_length=50, description="Texto de la opción")
    descripcion: Optional[str] = Field(None, max_length=100, description="Descripción adicional")


class ItemSimilarEncontrado(BaseModel):
    """Ítem similar encontrado en el banco"""
    id_item: str = Field(..., description="ID del ítem en el banco")
    texto_item: str = Field(..., description="Texto completo del ítem")
    actor: str = Field(..., description="Actor asignado")
    dimension: str = Field(..., description="Dimensión IDPS")
    subdimension: Optional[str] = Field(None, description="Subdimensión")
    similitud_semantica: float = Field(..., ge=0, le=1)
    similitud_lexica: float = Field(..., ge=0, le=1)
    similitud_constructo: float = Field(..., ge=0, le=1)
    score_compuesto: float = Field(..., ge=0, le=1)
    analisis: str = Field(..., description="Análisis de la similitud")


class ScoreConfianzaClasificacion(BaseModel):
    """Score de confianza con intervalo de confianza"""
    score: float = Field(..., ge=0, le=1, description="Score de confianza 0-1")
    intervalo_confianza: Tuple[float, float] = Field(..., description="Intervalo de confianza")
    nivel: NivelConfianza = Field(..., description="Nivel cualitativo")
    componentes: Dict[str, float] = Field(default_factory=dict, description="Componentes del score")


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
    subdimension_sugerida: Optional[str] = None
    indicador_sugerido: Optional[str] = None
    niveles_educativos: List[str] = Field(default_factory=list)
    
    # Metadatos de generación
    tipo_propuesta: TipoPropuesta
    items_similares: List[ItemSimilarEncontrado] = Field(default_factory=list)
    confianza_clasificacion: ScoreConfianzaClasificacion
    
    # Justificación
    justificacion_clasificacion: str = Field(..., min_length=50)
    justificacion_tipo: str = ""
    nivel_redundancia: str = Field(..., regex="^(bajo|medio|alto)$")
    recomendacion_final: str = ""
    notas_revision: Optional[str] = None
    
    # Estado
    estado: EstadoPropuesta = Field(default=EstadoPropuesta.BORRADOR)
    
    # Validaciones
    resultado_validacion: Optional[Dict] = None
    
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
    actor: str = Field(..., description="Actor objetivo (estudiante, docente, etc.)")
    dimension: str = Field(..., description="Dimensión IDPS")
    subdimension: Optional[str] = Field(None, description="Subdimensión específica")
    proposito: str = Field(..., min_length=20, description="Propósito de medición")
    constructo_objetivo: Optional[str] = Field(None, description="Constructo a medir")
    nivel_educativo: str = Field(..., description="Nivel educativo objetivo")
    formato_requerido: str = Field(default="escala_likert_4")
    restricciones_adicionales: Optional[str] = None
    num_propuestas_solicitadas: int = Field(default=3, ge=1, le=5)
    contexto_adicional: Optional[str] = None
    solicitante: str = Field(..., description="Email del solicitante")
    fecha_solicitud: datetime = Field(default_factory=datetime.now)


class ResultadoValidacion(BaseModel):
    """Resultado de una validación"""
    es_valido: bool
    errores: List[str] = Field(default_factory=list)
    advertencias: List[str] = Field(default_factory=list)
    metricas: Optional[Dict[str, Any]] = None
    sugerencias: Optional[Dict[str, Any]] = None


# =============================================================================
# CLASES VALIDADORAS
# =============================================================================

class ValidadorFormato:
    """Validaciones técnicas del ítem"""
    
    REGLAS_FORMATO = {
        'longitud_minima': 15,
        'longitud_maxima': 60,
        'opciones_minimas': 2,
        'opciones_maximas': 5,
        'longitud_opcion_max': 25
    }
    
    async def validar(self, propuesta: Dict) -> ResultadoValidacion:
        errores = []
        advertencias = []
        
        texto = propuesta.get('texto_item', '')
        opciones = propuesta.get('opciones_respuesta', [])
        
        # Validar longitud del ítem
        palabras = len(texto.split())
        if palabras < self.REGLAS_FORMATO['longitud_minima']:
            errores.append(f"Ítem demasiado corto ({palabras} palabras)")
        elif palabras > self.REGLAS_FORMATO['longitud_maxima']:
            errores.append(f"Ítem demasiado largo ({palabras} palabras)")
        
        # Validar opciones de respuesta
        num_opciones = len(opciones)
        if num_opciones < self.REGLAS_FORMATO['opciones_minimas']:
            errores.append(f"Muy pocas opciones ({num_opciones})")
        elif num_opciones > self.REGLAS_FORMATO['opciones_maximas']:
            errores.append(f"Demasiadas opciones ({num_opciones})")
        
        # Validar longitud de cada opción
        for opcion in opciones:
            etiqueta = opcion.get('etiqueta', '')
            if len(etiqueta) > self.REGLAS_FORMATO['longitud_opcion_max']:
                advertencias.append(f"Opción larga: '{etiqueta[:20]}...'")
        
        return ResultadoValidacion(
            es_valido=len(errores) == 0,
            errores=errores,
            advertencias=advertencias
        )


class ValidadorLegibilidad:
    """Validaciones de legibilidad y comprensión"""
    
    UMBRALES = {
        '1ro-4to_basico': {'huerta_min': 80, 'inflesz_min': 55},
        '5to-8vo_basico': {'huerta_min': 70, 'inflesz_min': 50},
        '1ro-4to_medio': {'huerta_min': 60, 'inflesz_min': 45},
    }
    
    async def validar(self, texto: str, nivel_educativo: str) -> ResultadoValidacion:
        advertencias = []
        
        # Índice de legibilidad Fernández Huerta
        huerta = self._indice_fernandez_huerta(texto)
        
        # Índice INFLESZ
        inflesz = self._indice_inflesz(texto)
        
        umbral = self.UMBRALES.get(nivel_educativo, {'huerta_min': 60, 'inflesz_min': 45})
        
        if huerta < umbral['huerta_min']:
            advertencias.append(
                f"Legibilidad baja (Huerta: {huerta:.1f}, recomendado > {umbral['huerta_min']})"
            )
        
        if inflesz < umbral['inflesz_min']:
            advertencias.append(
                f"Complejidad alta (INFLESZ: {inflesz:.1f}, recomendado > {umbral['inflesz_min']})"
            )
        
        return ResultadoValidacion(
            es_valido=True,
            errores=[],
            advertencias=advertencias,
            metricas={'huerta': round(huerta, 2), 'inflesz': round(inflesz, 2)}
        )
    
    def _indice_fernandez_huerta(self, texto: str) -> float:
        """Calcula índice de legibilidad Fernández Huerta para español"""
        oraciones = len(re.split(r'[.!?]+', texto))
        palabras = len(texto.split())
        silabas = self._contar_silabas(texto)
        
        if oraciones == 0 or palabras == 0:
            return 0
        
        return 206.84 - 0.60 * (palabras / oraciones) - 1.02 * (silabas / palabras)
    
    def _indice_inflesz(self, texto: str) -> float:
        """Calcula índice INFLESZ"""
        # Simplificación del cálculo
        palabras = len(texto.split())
        oraciones = len(re.split(r'[.!?]+', texto))
        
        if oraciones == 0 or palabras == 0:
            return 0
        
        # Fórmula simplificada
        return 100 - (palabras / oraciones) * 2
    
    def _contar_silabas(self, texto: str) -> int:
        """Cuenta sílabas aproximadas en español"""
        vocales = 'aeiouáéíóúü'
        texto = texto.lower()
        silabas = 0
        prev_vocal = False
        
        for char in texto:
            if char in vocales:
                if not prev_vocal:
                    silabas += 1
                prev_vocal = True
            else:
                prev_vocal = False
        
        return silabas


class ValidadorSesgo:
    """Validaciones de sesgo de género y cultural"""
    
    TERMINOS_PROBLEMATICOS = {
        'masculinizados': ['el líder', 'el jefe', 'el experto', 'los chicos'],
        'femenizados': ['la cuidadora', 'la secretaria'],
        'exclusivos': ['los alumnos', 'los estudiantes'],
        'culturales': ['navidad', 'thanksgiving', 'halloween']
    }
    
    async def validar(self, texto: str) -> ResultadoValidacion:
        advertencias = []
        texto_lower = texto.lower()
        
        # Detectar términos problemáticos
        for categoria, terminos in self.TERMINOS_PROBLEMATICOS.items():
            for termino in terminos:
                if termino in texto_lower:
                    advertencias.append(f"Posible sesgo ({categoria}): '{termino}'")
        
        # Sugerir alternativas
        sugerencias = self._sugerir_lenguaje_inclusivo(texto)
        
        return ResultadoValidacion(
            es_valido=True,
            errores=[],
            advertencias=advertencias,
            sugerencias={'alternativas': sugerencias}
        )
    
    def _sugerir_lenguaje_inclusivo(self, texto: str) -> List[str]:
        """Sugiere alternativas inclusivas"""
        sugerencias = []
        
        if 'los chicos' in texto.lower():
            sugerencias.append("'los estudiantes' o 'las y los estudiantes'")
        if 'el líder' in texto.lower():
            sugerencias.append("'la persona líder' o 'quien lidera'")
        
        return sugerencias


class ValidadorComplejidad:
    """Valida complejidad cognitiva apropiada al nivel"""
    
    VERBOS_BLOOM = {
        'recordar': ['identificar', 'recordar', 'reconocer', 'nombrar', 'listar'],
        'comprender': ['describir', 'explicar', 'resumir', 'clasificar'],
        'aplicar': ['aplicar', 'usar', 'demostrar', 'resolver'],
        'analizar': ['analizar', 'diferenciar', 'organizar', 'relacionar'],
        'evaluar': ['evaluar', 'justificar', 'defender', 'criticar'],
        'crear': ['crear', 'diseñar', 'construir', 'formular']
    }
    
    NIVEL_ESPERADO = {
        '1ro-4to_basico': ['recordar', 'comprender'],
        '5to-8vo_basico': ['comprender', 'aplicar'],
        '1ro-4to_medio': ['aplicar', 'analizar', 'evaluar']
    }
    
    async def validar(self, texto: str, nivel_educativo: str) -> ResultadoValidacion:
        texto_lower = texto.lower()
        verbos_detectados = []
        
        # Detectar verbos de Bloom
        for nivel, verbos in self.VERBOS_BLOOM.items():
            for verbo in verbos:
                if verbo in texto_lower:
                    verbos_detectados.append((verbo, nivel))
        
        # Determinar nivel predominante
        niveles_detectados = [v[1] for v in verbos_detectados]
        nivel_predominante = max(set(niveles_detectados), key=niveles_detectados.count) if niveles_detectados else 'comprender'
        
        # Verificar contra nivel esperado
        niveles_esperados = self.NIVEL_ESPERADO.get(nivel_educativo, ['comprender'])
        
        advertencias = []
        if nivel_predominante not in niveles_esperados:
            advertencias.append(
                f"Nivel cognitivo '{nivel_predominante}' puede ser inapropiado. "
                f"Esperado: {', '.join(niveles_esperados)}"
            )
        
        return ResultadoValidacion(
            es_valido=True,
            errores=[],
            advertencias=advertencias,
            metricas={
                'nivel_cognitivo': nivel_predominante,
                'verbos_detectados': [v[0] for v in verbos_detectados]
            }
        )


class ScoringConfianza:
    """Calcula confianza de clasificación"""
    
    def calcular_confianza(
        self,
        propuesta: Dict,
        ejemplos_similares: List[ItemSimilarEncontrado],
        contexto: Any
    ) -> ScoreConfianzaClasificacion:
        """Calcula score de confianza usando múltiples señales"""
        
        # Señal 1: Consistencia con ejemplos similares
        consistencia = self._calcular_consistencia(propuesta, ejemplos_similares)
        
        # Señal 2: Claridad del constructo
        claridad = self._evaluar_claridad(propuesta.get('texto_item', ''))
        
        # Señal 3: Alineación taxonómica
        alineacion = 0.75  # Valor base
        
        # Señal 4: Cobertura
        cobertura = 0.70  # Valor base
        
        # Score compuesto
        score_final = (
            0.35 * consistencia +
            0.25 * claridad +
            0.25 * alineacion +
            0.15 * cobertura
        )
        
        # Intervalo de confianza (simplificado)
        margen = 0.08
        ic_inferior = max(0, score_final - margen)
        ic_superior = min(1, score_final + margen)
        
        # Clasificar nivel
        if score_final >= 0.80:
            nivel = NivelConfianza.ALTA
        elif score_final >= 0.60:
            nivel = NivelConfianza.MEDIA
        elif score_final >= 0.40:
            nivel = NivelConfianza.BAJA
        else:
            nivel = NivelConfianza.MUY_BAJA
        
        return ScoreConfianzaClasificacion(
            score=round(score_final, 3),
            intervalo_confianza=(round(ic_inferior, 3), round(ic_superior, 3)),
            nivel=nivel,
            componentes={
                'consistencia': round(consistencia, 3),
                'claridad': round(claridad, 3),
                'alineacion': round(alineacion, 3),
                'cobertura': round(cobertura, 3)
            }
        )
    
    def _calcular_consistencia(
        self,
        propuesta: Dict,
        ejemplos: List[ItemSimilarEncontrado]
    ) -> float:
        """Calcula consistencia con ejemplos similares"""
        if not ejemplos:
            return 0.55  # Sin ejemplos, confianza base
        
        # Promedio de similitudes
        similitudes = [e.score_compuesto for e in ejemplos[:5]]
        return np.mean(similitudes) if similitudes else 0.55
    
    def _evaluar_claridad(self, texto: str) -> float:
        """Evalúa claridad del texto"""
        palabras = len(texto.split())
        
        # Ítem muy corto o muy largo reduce claridad
        if palabras < 15:
            return 0.60
        elif palabras > 50:
            return 0.70
        else:
            return 0.85


# =============================================================================
# AGENTE PRINCIPAL
# =============================================================================

class AgenteGeneradorClasificador:
    """
    Agente híbrido para generación y clasificación taxonómica de ítems IDPS.
    
    Este agente combina:
    - Generación de ítems mediante LLM
    - Búsqueda semántica de similares
    - Clasificación taxonómica con confianza
    - Detección de redundancia
    - Validación automática de calidad
    
    Args:
        db: Conexión a base de datos
        llm_client: Cliente de LLM (OpenAI, Azure, etc.)
        vector_store: Almacén de vectores (pgvector, Pinecone, etc.)
        embedding_model: Modelo de embeddings (opcional)
        config: Configuración personalizada (opcional)
    
    Example:
        >>> agente = AgenteGeneradorClasificador(db, llm, vectors)
        >>> solicitud = SolicitudGeneracion(
        ...     actor="estudiante",
        ...     dimension="habilidades_sociales",
        ...     proposito="Evaluar trabajo en equipo"
        ... )
        >>> propuestas = await agente.generar_items(solicitud)
    """
    
    def __init__(
        self,
        db: Any,
        llm_client: Any,
        vector_store: Any,
        embedding_model: Any = None,
        config: Optional[Dict] = None
    ):
        self.db = db
        self.llm = llm_client
        self.vectors = vector_store
        self.embedding_model = embedding_model
        self.config = config or self._default_config()
        
        # Inicializar validadores
        self.validador_formato = ValidadorFormato()
        self.validador_legibilidad = ValidadorLegibilidad()
        self.validador_sesgo = ValidadorSesgo()
        self.validador_complejidad = ValidadorComplejidad()
        self.scoring_confianza = ScoringConfianza()
    
    def _default_config(self) -> Dict:
        """Configuración por defecto del agente"""
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
    # MÉTODO PRINCIPAL
    # ========================================================================
    
    async def generar_items(
        self,
        request: SolicitudGeneracion
    ) -> List[PropuestaItem]:
        """
        Genera propuestas de ítems basado en la solicitud.
        
        Flujo completo:
        1. Validar solicitud
        2. Buscar ítems similares
        3. Generar propuestas con LLM
        4. Clasificar taxonómicamente
        5. Validar calidad
        6. Guardar en tabla de propuestas
        7. Notificar revisores
        
        Args:
            request: Solicitud de generación con parámetros
            
        Returns:
            Lista de propuestas de ítems generadas
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
        
        # Paso 5: Guardar propuestas
        print("[Agente] Guardando propuestas...")
        for propuesta in propuestas_finales:
            await self._guardar_propuesta(propuesta)
        
        # Paso 6: Notificar revisores
        await self._notificar_revisores(propuestas_finales)
        
        print(f"[Agente] Generación completada. {len(propuestas_finales)} propuestas creadas.")
        
        return propuestas_finales
    
    # ========================================================================
    # BÚSQUEDA DE SIMILARES
    # ========================================================================
    
    async def buscar_similares(
        self,
        texto: str,
        umbral: float = 0.5,
        filtros: Optional[Dict] = None
    ) -> List[ItemSimilarEncontrado]:
        """
        Búsqueda híbrida: embeddings semánticos + búsqueda léxica.
        
        Args:
            texto: Texto de consulta
            umbral: Umbral mínimo de similitud
            filtros: Filtros adicionales (actor, dimensión, etc.)
            
        Returns:
            Lista de ítems similares ordenados por score
        """
        # Generar embedding
        embedding_query = await self._generar_embedding(texto)
        
        # 1. Búsqueda semántica
        resultados_semanticos = await self._busqueda_semantica(
            embedding_query, filtros
        )
        
        # 2. Búsqueda léxica
        resultados_lexicos = await self._busqueda_lexica(texto, filtros)
        
        # 3. Fusión RRF
        resultados_fusionados = self._reciprocal_rank_fusion(
            [resultados_semanticos, resultados_lexicos]
        )
        
        # 4. Análisis detallado
        items_similares = []
        for resultado in resultados_fusionados[:self.config['max_items_similares']]:
            
            sim_semantica = resultado.get('score', 0)
            sim_lexica = self._jaccard_similarity(texto, resultado.get('texto', ''))
            sim_constructo = 0.7  # Simplificado
            
            score_compuesto = 0.5 * sim_semantica + 0.3 * sim_lexica + 0.2 * sim_constructo
            
            if score_compuesto >= umbral:
                items_similares.append(ItemSimilarEncontrado(
                    id_item=resultado.get('id', 'unknown'),
                    texto_item=resultado.get('texto', ''),
                    actor=resultado.get('actor', ''),
                    dimension=resultado.get('dimension', ''),
                    subdimension=resultado.get('subdimension'),
                    similitud_semantica=round(sim_semantica, 3),
                    similitud_lexica=round(sim_lexica, 3),
                    similitud_constructo=round(sim_constructo, 3),
                    score_compuesto=round(score_compuesto, 3),
                    analisis=f"Similitud compuesta: {score_compuesto:.3f}"
                ))
        
        return sorted(items_similares, key=lambda x: x.score_compuesto, reverse=True)
    
    async def _buscar_items_similares(
        self,
        request: SolicitudGeneracion
    ) -> List[ItemSimilarEncontrado]:
        """Busca ítems similares para una solicitud"""
        
        texto_consulta = f"{request.proposito} {request.constructo_objetivo or ''}"
        
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
    # GENERACIÓN CON LLM
    # ========================================================================
    
    async def _generar_con_llm(
        self,
        request: SolicitudGeneracion,
        items_similares: List[ItemSimilarEncontrado]
    ) -> List[Dict]:
        """Genera propuestas usando el LLM"""
        
        prompt = self._construir_prompt(request, items_similares)
        
        try:
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
            
            resultado = json.loads(response.choices[0].message.content)
            return resultado.get('propuestas', [])
            
        except Exception as e:
            print(f"[Error] Fallo en generación LLM: {e}")
            return []
    
    def _construir_prompt(
        self,
        request: SolicitudGeneracion,
        items_similares: List[ItemSimilarEncontrado]
    ) -> str:
        """Construye el prompt para el LLM"""
        
        similares_texto = "\n".join([
            f"ID: {item.id_item}\nTexto: {item.texto_item}\nSimilitud: {item.score_compuesto}\n---"
            for item in items_similares[:5]
        ])
        
        return f"""Genera {request.num_propuestas_solicitadas} ítems IDPS.

SOLICITUD:
- Actor: {request.actor}
- Dimensión: {request.dimension}
- Subdimensión: {request.subdimension or 'No especificada'}
- Propósito: {request.proposito}
- Constructo: {request.constructo_objetivo or 'No especificado'}
- Nivel: {request.nivel_educativo}

ÍTEMS SIMILARES:
{similares_texto if items_similares else 'Ninguno encontrado.'}

Responde en JSON con estructura: {{"propuestas": [...]}}"""
    
    def _get_system_prompt(self) -> str:
        """System prompt del agente"""
        return """Eres un experto psicometra especializado en ítems IDPS para el sistema educativo chileno.

RESTRICCIONES:
- 15-60 palabras por ítem
- Escala Likert 1-4 (Nunca, A veces, Frecuentemente, Siempre)
- Lenguaje inclusivo y neutral
- Contexto cultural chileno

Genera ítems claros, específicos y válidos psicométricamente."""
    
    # ========================================================================
    # CLASIFICACIÓN TAXONÓMICA
    # ========================================================================
    
    async def clasificar_taxonomicamente(
        self,
        texto: str,
        contexto: Dict
    ) -> Dict:
        """
        Clasifica un ítem en la taxonomía IDPS.
        
        Args:
            texto: Texto del ítem a clasificar
            contexto: Contexto de clasificación
            
        Returns:
            Diccionario con clasificación propuesta
        """
        prompt = f"""Clasifica el siguiente ítem IDPS:

ÍTEM: "{texto}"

CONTEXTO:
- Actor sugerido: {contexto.get('actor', 'No especificado')}
- Dimensión sugerida: {contexto.get('dimension', 'No especificada')}

Responde en JSON:
{{
    "actor_clasificado": "...",
    "dimension_clasificada": "...",
    "subdimension_clasificada": "...",
    "indicador_clasificado": "...",
    "justificacion": "..."
}}"""
        
        try:
            response = await self.llm.chat.completions.create(
                model=self.config['modelo_llm'],
                messages=[
                    {"role": "system", "content": "Eres un clasificador taxonómico experto en IDPS."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=800,
                response_format={"type": "json_object"}
            )
            
            return json.loads(response.choices[0].message.content)
            
        except Exception as e:
            print(f"[Error] Fallo en clasificación: {e}")
            return {
                'actor_clasificado': contexto.get('actor', 'estudiante'),
                'dimension_clasificada': contexto.get('dimension', 'general'),
                'justificacion': 'Clasificación por defecto debido a error'
            }
    
    # ========================================================================
    # DETECCIÓN DE REDUNDANCIA
    # ========================================================================
    
    async def detectar_redundancia(
        self,
        nuevo_item: str,
        existentes: List[ItemSimilarEncontrado]
    ) -> Dict:
        """
        Detecta si un ítem es redundante respecto a existentes.
        
        Args:
            nuevo_item: Texto del ítem nuevo
            existentes: Lista de ítems existentes
            
        Returns:
            Análisis de redundancia
        """
        if not existentes:
            return {
                'es_redundante': False,
                'max_similitud': 0.0,
                'tipo': 'nuevo',
                'items_redundantes': []
            }
        
        # Calcular similitudes
        similitudes = [e.score_compuesto for e in existentes]
        max_similitud = max(similitudes)
        
        # Clasificar tipo
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
            'tipo': tipo,
            'items_redundantes': [
                e.id_item for e in existentes 
                if e.score_compuesto > self.config['umbral_redundancia']
            ]
        }
    
    # ========================================================================
    # GUARDAR Y NOTIFICAR
    # ========================================================================
    
    async def guardar_propuesta(self, propuesta: PropuestaItem) -> str:
        """
        Guarda una propuesta en la base de datos.
        
        Args:
            propuesta: Propuesta a guardar
            
        Returns:
            ID de la propuesta guardada
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
            'opciones_respuesta': json.dumps([op.dict() for op in propuesta.opciones_respuesta]),
            'actor_propuesto': propuesta.actor_sugerido,
            'dimension_propuesta': propuesta.dimension_sugerida,
            'subdimension_propuesta': propuesta.subdimension_sugerida,
            'indicador_propuesto': propuesta.indicador_sugerido,
            'niveles_educativos': json.dumps(propuesta.niveles_educativos),
            'tipo_propuesta': propuesta.tipo_propuesta.value,
            'items_similares': json.dumps([item.dict() for item in propuesta.items_similares]),
            'confianza_score': propuesta.confianza_clasificacion.score,
            'confianza_intervalo': json.dumps(list(propuesta.confianza_clasificacion.intervalo_confianza)),
            'confianza_nivel': propuesta.confianza_clasificacion.nivel.value,
            'justificacion_clasificacion': propuesta.justificacion_clasificacion,
            'justificacion_tipo': propuesta.justificacion_tipo,
            'nivel_redundancia': propuesta.nivel_redundancia,
            'recomendacion_final': propuesta.recomendacion_final,
            'notas_revision': propuesta.notas_revision,
            'estado': propuesta.estado.value,
            'fecha_generacion': propuesta.fecha_generacion,
            'version_agente': propuesta.version_agente,
            'resultado_validacion': json.dumps(propuesta.resultado_validacion) if propuesta.resultado_validacion else None
        }
        
        try:
            await self.db.execute(query, params)
            return propuesta.id_propuesta
        except Exception as e:
            print(f"[Error] Fallo al guardar propuesta: {e}")
            raise
    
    # ========================================================================
    # MÉTODOS AUXILIARES
    # ========================================================================
    
    async def _generar_embedding(self, texto: str) -> List[float]:
        """Genera embedding para un texto"""
        if self.embedding_model:
            return self.embedding_model.encode(texto, normalize_embeddings=True).tolist()
        
        # Fallback: simulación
        return np.random.randn(1536).tolist()
    
    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Similitud de coseno entre vectores"""
        return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
    
    def _jaccard_similarity(self, text1: str, text2: str) -> float:
        """Similitud de Jaccard entre textos"""
        set1 = set(text1.lower().split())
        set2 = set(text2.lower().split())
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        return intersection / union if union > 0 else 0.0
    
    def _reciprocal_rank_fusion(
        self,
        listas: List[List[Dict]],
        k: int = 60
    ) -> List[Dict]:
        """Fusión RRF de múltiples listas"""
        scores = {}
        
        for lista in listas:
            for rank, item in enumerate(lista):
                id_item = item.get('id', str(rank))
                if id_item not in scores:
                    scores[id_item] = {'score': 0, 'item': item}
                scores[id_item]['score'] += 1 / (k + rank)
        
        ordenados = sorted(scores.values(), key=lambda x: x['score'], reverse=True)
        return [r['item'] for r in ordenados]
    
    async def _validar_solicitud(self, request: SolicitudGeneracion):
        """Valida la solicitud"""
        # Implementar validaciones
        pass
    
    async def _validar_propuesta(
        self,
        propuesta: Dict,
        nivel: str
    ) -> Dict:
        """Valida una propuesta"""
        
        validaciones = {
            'formato': await self.validador_formato.validar(propuesta),
            'legibilidad': await self.validador_legibilidad.validar(
                propuesta.get('texto_item', ''), nivel
            ),
            'sesgo': await self.validador_sesgo.validar(propuesta.get('texto_item', '')),
            'complejidad': await self.validador_complejidad.validar(
                propuesta.get('texto_item', ''), nivel
            )
        }
        
        return {
            'es_valido': all(v.es_valido for v in validaciones.values()),
            'validaciones': {k: v.dict() for k, v in validaciones.items()}
        }
    
    async def _notificar_revisores(self, propuestas: List[PropuestaItem]):
        """Notifica a revisores"""
        # Implementar notificación
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
        """Construye objeto PropuestaItem"""
        
        opciones = [
            OpcionRespuesta(**op) 
            for op in propuesta_data.get('opciones_respuesta', [])
        ]
        
        return PropuestaItem(
            id_propuesta=f"PROP-{uuid.uuid4().hex[:12].upper()}",
            id_solicitud=request.id_solicitud,
            texto_item=propuesta_data['texto_item'],
            instruccion=propuesta_data.get('instruccion'),
            opciones_respuesta=opciones if opciones else [
                OpcionRespuesta(valor=1, etiqueta="Nunca"),
                OpcionRespuesta(valor=2, etiqueta="A veces"),
                OpcionRespuesta(valor=3, etiqueta="Frecuentemente"),
                OpcionRespuesta(valor=4, etiqueta="Siempre")
            ],
            actor_sugerido=clasificacion.get('actor_clasificado', request.actor),
            dimension_sugerida=clasificacion.get('dimension_clasificada', request.dimension),
            subdimension_sugerida=clasificacion.get('subdimension_clasificada'),
            indicador_sugerido=clasificacion.get('indicador_clasificado'),
            niveles_educativos=propuesta_data.get('niveles_educativos', [request.nivel_educativo]),
            tipo_propuesta=TipoPropuesta(analisis_redundancia.get('tipo', 'nuevo')),
            items_similares=items_similares,
            confianza_clasificacion=score_confianza,
            justificacion_clasificacion=clasificacion.get('justificacion', ''),
            justificacion_tipo=propuesta_data.get('justificacion_tipo', ''),
            nivel_redundancia='alto' if analisis_redundancia.get('es_redundante') else 
                            ('medio' if analisis_redundancia.get('max_similitud', 0) > 0.60 else 'bajo'),
            recomendacion_final=propuesta_data.get('recomendacion', ''),
            notas_revision=propuesta_data.get('notas_revision'),
            estado=EstadoPropuesta.BORRADOR,
            version_agente=self.config['version_agente'],
            resultado_validacion=resultado_validacion
        )
    
    async def _busqueda_semantica(self, embedding: List[float], filtros: Dict) -> List[Dict]:
        """Búsqueda semántica en vector store"""
        # Implementar con vector store real
        return []
    
    async def _busqueda_lexica(self, texto: str, filtros: Dict) -> List[Dict]:
        """Búsqueda léxica full-text"""
        # Implementar con base de datos real
        return []
    
    async def _analizar_redundancia(
        self,
        texto: str,
        similares: List[ItemSimilarEncontrado]
    ) -> Dict:
        """Analiza redundancia"""
        return await self.detectar_redundancia(texto, similares)
    
    async def _clasificar_taxonomicamente(
        self,
        texto: str,
        request: SolicitudGeneracion
    ) -> Dict:
        """Clasifica taxonómicamente"""
        contexto = {'actor': request.actor, 'dimension': request.dimension}
        return await self.clasificar_taxonomicamente(texto, contexto)


# =============================================================================
# EJEMPLO DE USO
# =============================================================================

async def ejemplo_uso():
    """Ejemplo de uso del agente"""
    
    # Crear solicitud
    solicitud = SolicitudGeneracion(
        actor="estudiante",
        dimension="habilidades_sociales",
        subdimension="trabajo_colaborativo",
        proposito="Evaluar capacidad de trabajo en equipo",
        constructo_objetivo="Colaboración",
        nivel_educativo="7mo-8vo_basico",
        num_propuestas_solicitadas=2,
        solicitante="usuario@ejemplo.cl"
    )
    
    print(f"Solicitud creada: {solicitud.id_solicitud}")
    print(f"Actor: {solicitud.actor}")
    print(f"Dimensión: {solicitud.dimension}")
    
    # En producción:
    # agente = AgenteGeneradorClasificador(db, llm_client, vector_store)
    # propuestas = await agente.generar_items(solicitud)


if __name__ == "__main__":
    asyncio.run(ejemplo_uso())
