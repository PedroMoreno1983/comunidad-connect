#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sistema de Homologación Longitudinal IDPS
=========================================
Módulo ETL y Matching

Este módulo contiene las funciones para:
- Lectura de archivos Excel heterogéneos
- Normalización de columnas
- Matching exacto, fuzzy y semántico
- Clasificación de decisiones

Autor: Sistema IDPS
Versión: 1.0.0
"""

import re
import hashlib
import logging
from typing import List, Dict, Optional, Tuple, Any, Union
from dataclasses import dataclass
from enum import Enum
import numpy as np
from datetime import datetime

import pandas as pd
from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# Configuración de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# ENUMERACIONES Y CLASES DE DATOS
# =============================================================================

class MatchDecision(Enum):
    """Decisiones posibles del proceso de matching."""
    MATCH_EXACTO = "MATCH_EXACTO"
    MATCH_FUZZY_ALTO = "MATCH_FUZZY_ALTO"
    MATCH_SEMANTICO_ALTO = "MATCH_SEMANTICO_ALTO"
    REVISION_MANUAL = "REVISION_MANUAL"
    NUEVO_ITEM = "NUEVO_ITEM"
    DESCARTAR = "DESCARTAR"


class ConfidenceLevel(Enum):
    """Niveles de confianza del matching."""
    MUY_ALTA = "MUY_ALTA"    # > 0.95
    ALTA = "ALTA"            # 0.85 - 0.95
    MEDIA = "MEDIA"          # 0.70 - 0.85
    BAJA = "BAJA"            # 0.50 - 0.70
    MUY_BAJA = "MUY_BAJA"    # < 0.50


@dataclass
class MatchResult:
    """Resultado de un intento de matching."""
    source_item_id: str
    candidate_item_id: Optional[str]
    exact_match_score: float
    fuzzy_match_score: float
    semantic_match_score: float
    combined_score: float
    confidence: ConfidenceLevel
    decision: MatchDecision
    decision_reason: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Convierte el resultado a diccionario."""
        return {
            'source_item_id': self.source_item_id,
            'candidate_item_id': self.candidate_item_id,
            'exact_match_score': self.exact_match_score,
            'fuzzy_match_score': self.fuzzy_match_score,
            'semantic_match_score': self.semantic_match_score,
            'combined_score': self.combined_score,
            'confidence': self.confidence.value,
            'decision': self.decision.value,
            'decision_reason': self.decision_reason
        }


@dataclass
class NormalizedItem:
    """Ítem normalizado listo para procesamiento."""
    original_id: str
    statement: str
    statement_normalized: str
    options: Optional[List[str]]
    correct_answer: Optional[str]
    evaluation_code: Optional[str]
    year: Optional[int]
    dimension_code: Optional[str]
    subdimension_code: Optional[str]
    metadata: Dict[str, Any]
    
    def get_full_text(self) -> str:
        """Obtiene el texto completo para embeddings."""
        text = self.statement_normalized
        if self.options:
            text += " " + " ".join(self.options)
        return text


# =============================================================================
# CONFIGURACIÓN DE MATCHING
# =============================================================================

class MatchingConfig:
    """Configuración para el proceso de matching."""
    
    # Umbrales de decisión
    EXACT_THRESHOLD: float = 0.95
    FUZZY_HIGH_THRESHOLD: float = 0.85
    FUZZY_MEDIUM_THRESHOLD: float = 0.70
    SEMANTIC_HIGH_THRESHOLD: float = 0.85
    SEMANTIC_MEDIUM_THRESHOLD: float = 0.70
    COMBINED_HIGH_THRESHOLD: float = 0.85
    COMBINED_MEDIUM_THRESHOLD: float = 0.60
    
    # Pesos para combinación de scores
    WEIGHT_EXACT: float = 0.40
    WEIGHT_FUZZY: float = 0.30
    WEIGHT_SEMANTIC: float = 0.30
    
    # Modelo de embeddings
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"
    
    # Batch size para procesamiento
    BATCH_SIZE: int = 100


# =============================================================================
# FUNCIONES DE LECTURA DE EXCEL
# =============================================================================

class ExcelReader:
    """Lector de archivos Excel heterogéneos."""
    
    # Mapeo de posibles nombres de columnas a nombres estandarizados
    COLUMN_MAPPINGS = {
        'id': ['id', 'ID', 'Id', 'codigo', 'Código', 'Codigo', 'CODE', 'item_id', 'id_item'],
        'statement': ['enunciado', 'Enunciado', 'statement', 'Statement', 'pregunta', 'Pregunta', 
                      'texto', 'Texto', 'item', 'Item', 'descripcion', 'Descripción', 'DESCRIPCION'],
        'options': ['opciones', 'Opciones', 'options', 'Options', 'alternativas', 'Alternativas',
                    'respuestas', 'Respuestas', 'choices', 'Choices'],
        'correct_answer': ['respuesta_correcta', 'Respuesta_Correcta', 'correct', 'Correct',
                          'respuesta', 'Respuesta', 'clave', 'Clave', 'answer', 'Answer'],
        'evaluation': ['evaluacion', 'Evaluacion', 'evaluation', 'Evaluation', 'prueba', 'Prueba',
                       'test', 'Test', 'codigo_evaluacion', 'Codigo_Evaluacion'],
        'year': ['año', 'Año', 'year', 'Year', 'ano', 'Ano', 'periodo', 'Periodo'],
        'dimension': ['dimension', 'Dimension', 'dimensión', 'Dimensión', 'eje', 'Eje',
                      'area', 'Area', 'área', 'Área'],
        'subdimension': ['subdimension', 'Subdimension', 'subdimensión', 'Subdimensión',
                         'subeje', 'Subeje', 'sub_area', 'Sub_Area'],
        'difficulty': ['dificultad', 'Dificultad', 'difficulty', 'Difficulty', 
                       'nivel', 'Nivel', 'complexity', 'Complexity']
    }
    
    def __init__(self):
        self.column_mapping: Dict[str, str] = {}
    
    def read_excel(
        self,
        file_path: str,
        sheet_name: Optional[Union[str, int]] = 0,
        header_row: int = 0,
        skip_rows: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Lee un archivo Excel y retorna un DataFrame.
        
        Args:
            file_path: Ruta al archivo Excel
            sheet_name: Nombre o índice de la hoja
            header_row: Fila que contiene los headers
            skip_rows: Número de filas a saltar al inicio
            
        Returns:
            DataFrame con los datos leídos
        """
        try:
            # Leer el Excel
            df = pd.read_excel(
                file_path,
                sheet_name=sheet_name,
                header=header_row,
                skiprows=skip_rows
            )
            
            logger.info(f"Excel leído exitosamente: {len(df)} filas, {len(df.columns)} columnas")
            logger.info(f"Columnas originales: {list(df.columns)}")
            
            return df
            
        except Exception as e:
            logger.error(f"Error al leer Excel: {str(e)}")
            raise
    
    def detect_columns(self, df: pd.DataFrame) -> Dict[str, str]:
        """
        Detecta automáticamente el mapeo de columnas.
        
        Args:
            df: DataFrame con los datos
            
        Returns:
            Diccionario con el mapeo detectado
        """
        detected = {}
        df_columns_lower = [str(col).lower().strip() for col in df.columns]
        
        for standard_name, possible_names in self.COLUMN_MAPPINGS.items():
            for possible_name in possible_names:
                possible_lower = possible_name.lower().strip()
                
                # Búsqueda exacta
                if possible_lower in df_columns_lower:
                    idx = df_columns_lower.index(possible_lower)
                    detected[standard_name] = df.columns[idx]
                    break
                
                # Búsqueda parcial
                for i, col_lower in enumerate(df_columns_lower):
                    if possible_lower in col_lower or col_lower in possible_lower:
                        detected[standard_name] = df.columns[i]
                        break
        
        self.column_mapping = detected
        logger.info(f"Columnas detectadas: {detected}")
        
        return detected
    
    def read_multiple_sheets(
        self,
        file_path: str,
        sheet_pattern: Optional[str] = None
    ) -> Dict[str, pd.DataFrame]:
        """
        Lee múltiples hojas de un archivo Excel.
        
        Args:
            file_path: Ruta al archivo Excel
            sheet_pattern: Patrón para filtrar nombres de hojas
            
        Returns:
            Diccionario con DataFrames por hoja
        """
        xl_file = pd.ExcelFile(file_path)
        result = {}
        
        for sheet_name in xl_file.sheet_names:
            if sheet_pattern and sheet_pattern not in sheet_name:
                continue
                
            try:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                result[sheet_name] = df
                logger.info(f"Hoja '{sheet_name}' leída: {len(df)} filas")
            except Exception as e:
                logger.warning(f"Error al leer hoja '{sheet_name}': {str(e)}")
        
        return result


# =============================================================================
# FUNCIONES DE NORMALIZACIÓN
# =============================================================================

class TextNormalizer:
    """Normalizador de texto para ítems."""
    
    # Palabras comunes a eliminar
    STOPWORDS_ES = {
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
        'de', 'del', 'al', 'y', 'o', 'pero', 'por', 'para',
        'con', 'sin', 'sobre', 'entre', 'hasta', 'desde',
        'que', 'cual', 'quien', 'cuando', 'donde', 'como',
        'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
        'a', 'en', 'se', 'es', 'son', 'fue', 'era', 'ser', 'estar'
    }
    
    @classmethod
    def normalize(cls, text: str) -> str:
        """
        Normaliza un texto para comparación.
        
        Args:
            text: Texto a normalizar
            
        Returns:
            Texto normalizado
        """
        if not text or not isinstance(text, str):
            return ""
        
        # Convertir a minúsculas
        text = text.lower()
        
        # Eliminar acentos
        text = cls._remove_accents(text)
        
        # Eliminar caracteres especiales y números
        text = re.sub(r'[^\w\s]', ' ', text)
        text = re.sub(r'\d+', ' ', text)
        
        # Eliminar espacios múltiples
        text = re.sub(r'\s+', ' ', text)
        
        # Eliminar stopwords
        words = text.split()
        words = [w for w in words if w not in cls.STOPWORDS_ES and len(w) > 2]
        
        return ' '.join(words).strip()
    
    @classmethod
    def _remove_accents(cls, text: str) -> str:
        """Elimina acentos del texto."""
        accents = {
            'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
            'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
            'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U'
        }
        for accent, replacement in accents.items():
            text = text.replace(accent, replacement)
        return text
    
    @classmethod
    def generate_hash(cls, text: str) -> str:
        """Genera un hash del texto normalizado."""
        normalized = cls.normalize(text)
        return hashlib.md5(normalized.encode()).hexdigest()


class ItemNormalizer:
    """Normalizador de ítems completos."""
    
    def __init__(self):
        self.text_normalizer = TextNormalizer()
    
    def normalize_item(self, row: pd.Series, column_mapping: Dict[str, str]) -> NormalizedItem:
        """
        Normaliza un ítem desde una fila de DataFrame.
        
        Args:
            row: Fila del DataFrame
            column_mapping: Mapeo de columnas
            
        Returns:
            Ítem normalizado
        """
        # Extraer campos
        original_id = self._get_value(row, column_mapping, 'id', 'UNKNOWN')
        statement = self._get_value(row, column_mapping, 'statement', '')
        options_str = self._get_value(row, column_mapping, 'options', None)
        correct_answer = self._get_value(row, column_mapping, 'correct_answer', None)
        evaluation_code = self._get_value(row, column_mapping, 'evaluation', None)
        year = self._parse_year(self._get_value(row, column_mapping, 'year', None))
        dimension_code = self._get_value(row, column_mapping, 'dimension', None)
        subdimension_code = self._get_value(row, column_mapping, 'subdimension', None)
        
        # Normalizar statement
        statement_normalized = self.text_normalizer.normalize(statement)
        
        # Parsear opciones
        options = self._parse_options(options_str)
        
        # Metadatos adicionales
        metadata = {
            'original_row': row.to_dict(),
            'normalization_date': datetime.now().isoformat()
        }
        
        return NormalizedItem(
            original_id=str(original_id),
            statement=str(statement),
            statement_normalized=statement_normalized,
            options=options,
            correct_answer=str(correct_answer) if correct_answer else None,
            evaluation_code=str(evaluation_code) if evaluation_code else None,
            year=year,
            dimension_code=str(dimension_code) if dimension_code else None,
            subdimension_code=str(subdimension_code) if subdimension_code else None,
            metadata=metadata
        )
    
    def _get_value(
        self,
        row: pd.Series,
        column_mapping: Dict[str, str],
        field: str,
        default: Any = None
    ) -> Any:
        """Obtiene un valor del row usando el mapeo de columnas."""
        if field in column_mapping:
            col_name = column_mapping[field]
            value = row.get(col_name, default)
            # Manejar NaN de pandas
            if pd.isna(value):
                return default
            return value
        return default
    
    def _parse_year(self, value: Any) -> Optional[int]:
        """Parsea un valor de año."""
        if value is None:
            return None
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return None
    
    def _parse_options(self, value: Any) -> Optional[List[str]]:
        """Parsea las opciones de respuesta."""
        if value is None:
            return None
        
        if isinstance(value, str):
            # Intentar dividir por separadores comunes
            for separator in ['|', ';', '//', '##']:
                if separator in value:
                    return [opt.strip() for opt in value.split(separator)]
            return [value]
        
        if isinstance(value, list):
            return [str(opt) for opt in value]
        
        return None
    
    def normalize_dataframe(
        self,
        df: pd.DataFrame,
        column_mapping: Optional[Dict[str, str]] = None
    ) -> List[NormalizedItem]:
        """
        Normaliza un DataFrame completo.
        
        Args:
            df: DataFrame con los datos
            column_mapping: Mapeo de columnas (opcional)
            
        Returns:
            Lista de ítems normalizados
        """
        if column_mapping is None:
            reader = ExcelReader()
            column_mapping = reader.detect_columns(df)
        
        items = []
        for _, row in df.iterrows():
            try:
                item = self.normalize_item(row, column_mapping)
                items.append(item)
            except Exception as e:
                logger.warning(f"Error al normalizar fila: {str(e)}")
        
        logger.info(f"Normalizados {len(items)} ítems de {len(df)} filas")
        return items


# =============================================================================
# FUNCIONES DE MATCHING
# =============================================================================

class ExactMatcher:
    """Matcher exacto basado en hash."""
    
    def __init__(self):
        self.text_normalizer = TextNormalizer()
    
    def match(
        self,
        source_item: NormalizedItem,
        candidate_items: List[NormalizedItem]
    ) -> List[Tuple[NormalizedItem, float]]:
        """
        Realiza matching exacto por hash.
        
        Args:
            source_item: Ítem fuente
            candidate_items: Lista de ítems candidatos
            
        Returns:
            Lista de tuplas (item, score)
        """
        source_hash = self.text_normalizer.generate_hash(source_item.statement)
        results = []
        
        for candidate in candidate_items:
            candidate_hash = self.text_normalizer.generate_hash(candidate.statement)
            
            if source_hash == candidate_hash:
                results.append((candidate, 1.0))
            else:
                # Calcular similitud de texto normalizado
                if source_item.statement_normalized == candidate.statement_normalized:
                    results.append((candidate, 1.0))
        
        return results
    
    def calculate_score(
        self,
        source_item: NormalizedItem,
        candidate_item: NormalizedItem
    ) -> float:
        """Calcula el score de matching exacto."""
        source_hash = self.text_normalizer.generate_hash(source_item.statement)
        candidate_hash = self.text_normalizer.generate_hash(candidate_item.statement)
        
        return 1.0 if source_hash == candidate_hash else 0.0


class FuzzyMatcher:
    """Matcher fuzzy usando RapidFuzz."""
    
    def __init__(self):
        self.scorer = fuzz.WRatio  # Weighted ratio para mejor precisión
    
    def match(
        self,
        source_item: NormalizedItem,
        candidate_items: List[NormalizedItem],
        threshold: float = 70.0,
        limit: int = 5
    ) -> List[Tuple[NormalizedItem, float]]:
        """
        Realiza matching fuzzy.
        
        Args:
            source_item: Ítem fuente
            candidate_items: Lista de ítems candidatos
            threshold: Umbral mínimo de similitud (0-100)
            limit: Número máximo de resultados
            
        Returns:
            Lista de tuplas (item, score normalizado 0-1)
        """
        # Preparar candidatos
        choices = [(item, item.statement_normalized) for item in candidate_items]
        
        # Realizar matching
        matches = process.extract(
            source_item.statement_normalized,
            choices,
            scorer=self.scorer,
            score_cutoff=threshold,
            limit=limit
        )
        
        # Normalizar scores a 0-1
        results = []
        for match_text, score, item in matches:
            normalized_score = score / 100.0
            results.append((item, normalized_score))
        
        return results
    
    def calculate_score(
        self,
        source_item: NormalizedItem,
        candidate_item: NormalizedItem
    ) -> float:
        """Calcula el score de matching fuzzy entre dos ítems."""
        score = self.scorer(
            source_item.statement_normalized,
            candidate_item.statement_normalized
        )
        return score / 100.0


class SemanticMatcher:
    """Matcher semántico usando embeddings."""
    
    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or MatchingConfig.EMBEDDING_MODEL
        self._model = None
    
    @property
    def model(self):
        """Lazy loading del modelo de embeddings."""
        if self._model is None:
            logger.info(f"Cargando modelo de embeddings: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
        return self._model
    
    def encode(self, texts: List[str]) -> np.ndarray:
        """Codifica textos a embeddings."""
        return self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    
    def match(
        self,
        source_item: NormalizedItem,
        candidate_items: List[NormalizedItem],
        threshold: float = 0.70,
        limit: int = 5
    ) -> List[Tuple[NormalizedItem, float]]:
        """
        Realiza matching semántico.
        
        Args:
            source_item: Ítem fuente
            candidate_items: Lista de ítems candidatos
            threshold: Umbral mínimo de similitud coseno
            limit: Número máximo de resultados
            
        Returns:
            Lista de tuplas (item, score)
        """
        # Generar embeddings
        source_text = source_item.get_full_text()
        candidate_texts = [item.get_full_text() for item in candidate_items]
        
        source_embedding = self.encode([source_text])
        candidate_embeddings = self.encode(candidate_texts)
        
        # Calcular similitudes
        similarities = cosine_similarity(source_embedding, candidate_embeddings)[0]
        
        # Filtrar por threshold y ordenar
        results = []
        for i, score in enumerate(similarities):
            if score >= threshold:
                results.append((candidate_items[i], float(score)))
        
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:limit]
    
    def calculate_score(
        self,
        source_item: NormalizedItem,
        candidate_item: NormalizedItem
    ) -> float:
        """Calcula el score de matching semántico entre dos ítems."""
        source_text = source_item.get_full_text()
        candidate_text = candidate_item.get_full_text()
        
        embeddings = self.encode([source_text, candidate_text])
        similarity = cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]
        
        return float(similarity)


# =============================================================================
# COMBINADOR DE SCORES
# =============================================================================

class ScoreCombiner:
    """Combina múltiples scores de matching."""
    
    @staticmethod
    def combine_scores(
        exact_score: float,
        fuzzy_score: float,
        semantic_score: float,
        weights: Optional[Dict[str, float]] = None
    ) -> float:
        """
        Combina scores usando pesos configurables.
        
        Args:
            exact_score: Score de matching exacto
            fuzzy_score: Score de matching fuzzy
            semantic_score: Score de matching semántico
            weights: Pesos personalizados (opcional)
            
        Returns:
            Score combinado
        """
        if weights is None:
            weights = {
                'exact': MatchingConfig.WEIGHT_EXACT,
                'fuzzy': MatchingConfig.WEIGHT_FUZZY,
                'semantic': MatchingConfig.WEIGHT_SEMANTIC
            }
        
        combined = (
            exact_score * weights['exact'] +
            fuzzy_score * weights['fuzzy'] +
            semantic_score * weights['semantic']
        )
        
        return round(combined, 3)
    
    @staticmethod
    def calculate_confidence(combined_score: float) -> ConfidenceLevel:
        """Calcula el nivel de confianza basado en el score combinado."""
        if combined_score > 0.95:
            return ConfidenceLevel.MUY_ALTA
        elif combined_score > 0.85:
            return ConfidenceLevel.ALTA
        elif combined_score > 0.70:
            return ConfidenceLevel.MEDIA
        elif combined_score > 0.50:
            return ConfidenceLevel.BAJA
        else:
            return ConfidenceLevel.MUY_BAJA


# =============================================================================
# CLASIFICADOR DE DECISIONES
# =============================================================================

class DecisionClassifier:
    """Clasifica la decisión final basada en scores."""
    
    def classify(
        self,
        combined_score: float,
        confidence: ConfidenceLevel,
        exact_score: float,
        fuzzy_score: float,
        semantic_score: float,
        has_candidate: bool
    ) -> Tuple[MatchDecision, str]:
        """
        Clasifica la decisión de matching.
        
        Args:
            combined_score: Score combinado
            confidence: Nivel de confianza
            exact_score: Score exacto
            fuzzy_score: Score fuzzy
            semantic_score: Score semántico
            has_candidate: Si existe un candidato
            
        Returns:
            Tupla (decisión, razón)
        """
        if not has_candidate:
            return MatchDecision.NUEVO_ITEM, "No se encontraron candidatos potenciales"
        
        # Match exacto
        if exact_score >= MatchingConfig.EXACT_THRESHOLD:
            return MatchDecision.MATCH_EXACTO, f"Match exacto con score {exact_score:.3f}"
        
        # Match fuzzy alto
        if fuzzy_score >= MatchingConfig.FUZZY_HIGH_THRESHOLD and confidence in [ConfidenceLevel.ALTA, ConfidenceLevel.MUY_ALTA]:
            return MatchDecision.MATCH_FUZZY_ALTO, f"Match fuzzy alto con score {fuzzy_score:.3f}"
        
        # Match semántico alto
        if semantic_score >= MatchingConfig.SEMANTIC_HIGH_THRESHOLD and confidence in [ConfidenceLevel.ALTA, ConfidenceLevel.MUY_ALTA]:
            return MatchDecision.MATCH_SEMANTICO_ALTO, f"Match semántico alto con score {semantic_score:.3f}"
        
        # Revisión manual para scores medios
        if combined_score >= MatchingConfig.COMBINED_MEDIUM_THRESHOLD:
            return MatchDecision.REVISION_MANUAL, f"Score combinado {combined_score:.3f} requiere revisión humana"
        
        # Nuevo ítem para scores bajos pero con algún candidato
        if combined_score > 0.3:
            return MatchDecision.NUEVO_ITEM, f"Score combinado {combined_score:.3f} indica ítem nuevo"
        
        # Descartar para scores muy bajos
        return MatchDecision.DESCARTAR, f"Score combinado {combined_score:.3f} muy bajo, ítem descartado"


# =============================================================================
# ORQUESTADOR DE MATCHING
# =============================================================================

class MatchingOrchestrator:
    """Orquesta el proceso completo de matching."""
    
    def __init__(
        self,
        use_semantic: bool = True,
        semantic_model: Optional[str] = None
    ):
        self.exact_matcher = ExactMatcher()
        self.fuzzy_matcher = FuzzyMatcher()
        self.semantic_matcher = SemanticMatcher(semantic_model) if use_semantic else None
        self.score_combiner = ScoreCombiner()
        self.decision_classifier = DecisionClassifier()
        self.use_semantic = use_semantic
    
    def process_item(
        self,
        source_item: NormalizedItem,
        candidate_items: List[NormalizedItem]
    ) -> MatchResult:
        """
        Procesa un ítem completo mediante todos los matchers.
        
        Args:
            source_item: Ítem fuente a homologar
            candidate_items: Lista de ítems candidatos en el banco
            
        Returns:
            Resultado del matching
        """
        logger.info(f"Procesando ítem: {source_item.original_id}")
        
        if not candidate_items:
            return MatchResult(
                source_item_id=source_item.original_id,
                candidate_item_id=None,
                exact_match_score=0.0,
                fuzzy_match_score=0.0,
                semantic_match_score=0.0,
                combined_score=0.0,
                confidence=ConfidenceLevel.MUY_BAJA,
                decision=MatchDecision.NUEVO_ITEM,
                decision_reason="No hay ítems candidatos disponibles"
            )
        
        # Encontrar el mejor candidato con cada método
        best_candidate = None
        best_exact_score = 0.0
        best_fuzzy_score = 0.0
        best_semantic_score = 0.0
        
        # Matching exacto
        exact_matches = self.exact_matcher.match(source_item, candidate_items)
        if exact_matches:
            best_exact_score = max(score for _, score in exact_matches)
            best_candidate = max(exact_matches, key=lambda x: x[1])[0]
        
        # Matching fuzzy
        fuzzy_matches = self.fuzzy_matcher.match(source_item, candidate_items)
        if fuzzy_matches:
            best_fuzzy_score = max(score for _, score in fuzzy_matches)
            if not best_candidate:
                best_candidate = max(fuzzy_matches, key=lambda x: x[1])[0]
        
        # Matching semántico
        if self.use_semantic and self.semantic_matcher:
            semantic_matches = self.semantic_matcher.match(source_item, candidate_items)
            if semantic_matches:
                best_semantic_score = max(score for _, score in semantic_matches)
                if not best_candidate:
                    best_candidate = max(semantic_matches, key=lambda x: x[1])[0]
        
        # Combinar scores
        combined_score = self.score_combiner.combine_scores(
            best_exact_score,
            best_fuzzy_score,
            best_semantic_score
        )
        
        # Calcular confianza
        confidence = self.score_combiner.calculate_confidence(combined_score)
        
        # Clasificar decisión
        decision, reason = self.decision_classifier.classify(
            combined_score,
            confidence,
            best_exact_score,
            best_fuzzy_score,
            best_semantic_score,
            best_candidate is not None
        )
        
        result = MatchResult(
            source_item_id=source_item.original_id,
            candidate_item_id=best_candidate.original_id if best_candidate else None,
            exact_match_score=round(best_exact_score, 3),
            fuzzy_match_score=round(best_fuzzy_score, 3),
            semantic_match_score=round(best_semantic_score, 3),
            combined_score=combined_score,
            confidence=confidence,
            decision=decision,
            decision_reason=reason
        )
        
        logger.info(f"Resultado: {decision.value} - {reason}")
        
        return result
    
    def process_batch(
        self,
        source_items: List[NormalizedItem],
        candidate_items: List[NormalizedItem],
        batch_size: int = None
    ) -> List[MatchResult]:
        """
        Procesa un lote de ítems.
        
        Args:
            source_items: Lista de ítems fuente
            candidate_items: Lista de ítems candidatos
            batch_size: Tamaño del lote
            
        Returns:
            Lista de resultados
        """
        batch_size = batch_size or MatchingConfig.BATCH_SIZE
        results = []
        
        for i in range(0, len(source_items), batch_size):
            batch = source_items[i:i + batch_size]
            logger.info(f"Procesando lote {i//batch_size + 1}/{(len(source_items)-1)//batch_size + 1}")
            
            for item in batch:
                try:
                    result = self.process_item(item, candidate_items)
                    results.append(result)
                except Exception as e:
                    logger.error(f"Error procesando ítem {item.original_id}: {str(e)}")
                    results.append(MatchResult(
                        source_item_id=item.original_id,
                        candidate_item_id=None,
                        exact_match_score=0.0,
                        fuzzy_match_score=0.0,
                        semantic_match_score=0.0,
                        combined_score=0.0,
                        confidence=ConfidenceLevel.MUY_BAJA,
                        decision=MatchDecision.DESCARTAR,
                        decision_reason=f"Error: {str(e)}"
                    ))
        
        return results


# =============================================================================
# EJEMPLO DE USO
# =============================================================================

def example_usage():
    """Ejemplo de uso del sistema de matching."""
    
    # Crear ítems de ejemplo
    source_items = [
        NormalizedItem(
            original_id="SRC-001",
            statement="¿Cuál es la importancia de escuchar activamente a los demás?",
            statement_normalized="importancia escuchar activamente demas",
            options=["Muy importante", "Algo importante", "Poco importante", "Nada importante"],
            correct_answer="Muy importante",
            evaluation_code="SIMCE-2024",
            year=2024,
            dimension_code="HABILIDADES_RELACIONALES",
            subdimension_code="COMUNICACION",
            metadata={}
        ),
        NormalizedItem(
            original_id="SRC-002",
            statement="¿Cómo te sientes cuando logras una meta que te propusiste?",
            statement_normalized="sientes logras meta propusiste",
            options=["Orgulloso", "Satisfecho", "Indiferente", "Preocupado"],
            correct_answer=None,
            evaluation_code="PAES-2024",
            year=2024,
            dimension_code="AUTOCONOCIMIENTO",
            subdimension_code="AUTOEFICACIA",
            metadata={}
        )
    ]
    
    candidate_items = [
        NormalizedItem(
            original_id="CAN-001",
            statement="¿Por qué es fundamental escuchar atentamente a las personas?",
            statement_normalized="fundamental escuchar atentamente personas",
            options=["Es muy importante", "Es algo importante", "No es tan importante", "No es importante"],
            correct_answer="Es muy importante",
            evaluation_code="SIMCE-2023",
            year=2023,
            dimension_code="HABILIDADES_RELACIONALES",
            subdimension_code="COMUNICACION",
            metadata={}
        ),
        NormalizedItem(
            original_id="CAN-002",
            statement="Describe cómo te sientes al completar un objetivo personal.",
            statement_normalized="sientes completar objetivo personal",
            options=["Feliz", "Contento", "Neutral", "Triste"],
            correct_answer=None,
            evaluation_code="SIMCE-2022",
            year=2022,
            dimension_code="AUTOCONOCIMIENTO",
            subdimension_code="AUTOEFICACIA",
            metadata={}
        )
    ]
    
    # Crear orquestador (sin semántico para ejemplo rápido)
    orchestrator = MatchingOrchestrator(use_semantic=False)
    
    # Procesar ítems
    results = orchestrator.process_batch(source_items, candidate_items)
    
    # Mostrar resultados
    for result in results:
        print(f"\nÍtem: {result.source_item_id}")
        print(f"  Decisión: {result.decision.value}")
        print(f"  Score combinado: {result.combined_score}")
        print(f"  Confianza: {result.confidence.value}")
        print(f"  Razón: {result.decision_reason}")
        if result.candidate_item_id:
            print(f"  Candidato: {result.candidate_item_id}")


if __name__ == "__main__":
    example_usage()
