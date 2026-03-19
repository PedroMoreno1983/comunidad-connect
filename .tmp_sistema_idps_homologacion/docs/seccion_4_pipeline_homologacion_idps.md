# SECCIÓN 4: PIPELINE DE HOMOLOGACIÓN LONGITUDINAL IDPS

## 4.1 Introducción al Pipeline de Homologación

El pipeline de homologación longitudinal IDPS constituye el núcleo operativo del sistema, diseñado para procesar planillas Excel heterogéneas distribuidas temporalmente desde 2014 hasta 2026. Este pipeline implementa una estrategia híbrida que combina tres niveles de matching (exacto, difuso y semántico) para identificar equivalencias entre ítems psicométricos, agruparlos en familias conceptuales y derivar representaciones canónicas que permitan análisis longitudinales consistentes.

La arquitectura del pipeline prioriza la eficiencia computacional mediante un enfoque cascada: primero resuelve los casos obvios mediante matching exacto (rápido y determinístico), luego aplica técnicas difusas para capturar variaciones menores de texto, y finalmente emplea modelos de lenguaje para detectar equivalencias semánticas en ítems reformulados sustancialmente.

---

## 4.2 Estrategia Híbrida de Matching

### 4.2.1 Orden de Aplicación de Métodos

La estrategia híbrida implementa un flujo cascada optimizado:

| Orden | Método | Propósito | Complejidad |
|-------|--------|-----------|-------------|
| 1 | Matching Exacto | Identificar duplicados literales | O(n) |
| 2 | Matching Difuso (Fuzzy) | Capturar variaciones tipográficas menores | O(n²) con optimización |
| 3 | Matching Semántico (NLP) | Detectar reformulaciones conceptuales | O(n) con embeddings pre-calculados |

### 4.2.2 Combinación de Scores

Para ítems que reciben scores de múltiples métodos, se aplica la siguiente fórmula ponderada:

```
score_hibrido = max(score_exacto, 
                    0.4 * score_fuzzy + 0.6 * score_semantico)
```

**Justificación de ponderadores:**
- El matching semántico recibe mayor peso (0.6) porque captura equivalencias conceptuales más profundas
- El matching difuso complementa (0.4) capturando similitudes superficiales que el modelo de embeddings podría omitir
- El score exacto actúa como ceiling (máximo) porque representa identidad literal

### 4.2.3 Reglas de Decisión Híbrida

```
SI score_exacto == 1.0:
    → EXACTO
SINO SI score_hibrido >= 0.95:
    → EQUIVALENTE_CANONICO
SINO SI score_hibrido >= 0.85:
    → VARIANTE_MENOR
SINO SI score_hibrido >= 0.70:
    → VARIANTE_SUSTANTIVA
SINO SI |score_fuzzy - score_semantico| > 0.15:
    → AMBIGUO (conflicto métodos)
SINO:
    → DIFERENTE
```

---

## 4.3 Métricas y Umbrales

### 4.3.1 Tabla de Umbrales por Tipo de Matching

| Tipo de Matching | Umbral Equivalente | Umbral Variante Menor | Umbral Variante Mayor | Umbral Revisar |
|------------------|-------------------|----------------------|----------------------|----------------|
| **Exacto** | 1.0 | - | - | < 1.0 |
| **Fuzzy (Levenshtein)** | ≥ 0.95 | 0.85 - 0.95 | 0.70 - 0.85 | < 0.70 |
| **Fuzzy (Jaro-Winkler)** | ≥ 0.95 | 0.88 - 0.95 | 0.75 - 0.88 | < 0.75 |
| **Semántico (Coseno)** | ≥ 0.95 | 0.85 - 0.95 | 0.70 - 0.85 | < 0.70 |

### 4.3.2 Ajuste de Umbrales según Longitud del Texto

Los umbrales se ajustan dinámicamente considerando la longitud del texto del ítem:

```python
def ajustar_umbral(umbral_base, longitud_texto):
    """
    Ajusta umbrales según longitud del texto.
    Textos cortos requieren umbrales más permisivos.
    """
    if longitud_texto <= 20:      # Ítems muy cortos
        factor_ajuste = -0.10
    elif longitud_texto <= 50:    # Ítems cortos
        factor_ajuste = -0.05
    elif longitud_texto <= 150:   # Ítems medianos (óptimo)
        factor_ajuste = 0.0
    elif longitud_texto <= 300:   # Ítems largos
        factor_ajuste = +0.02
    else:                         # Ítems muy largos
        factor_ajuste = +0.05
    
    return max(0.5, min(1.0, umbral_base + factor_ajuste))
```

**Justificación:** Ítems cortos (ej: "Me siento feliz") tienen menos "material" para comparar, por lo que pequeñas diferencias representan proporcionalmente más cambio. Ítems largos pueden tolerar variaciones menores sin alterar el constructo medido.

### 4.3.3 Métricas de Calidad del Pipeline

| Métrica | Definición | Target | Cálculo |
|---------|-----------|--------|---------|
| **Precisión** | Proporción de matches correctos entre todos los matches propuestos | ≥ 0.92 | TP / (TP + FP) |
| **Recall** | Proporción de ítems equivalentes correctamente identificados | ≥ 0.88 | TP / (TP + FN) |
| **F1-Score** | Media armónica de precisión y recall | ≥ 0.90 | 2 * (P * R) / (P + R) |
| **Tasa de Ambigüedad** | Proporción de ítems enviados a revisión humana | ≤ 0.08 | Ambiguos / Total |
| **Tiempo de Procesamiento** | Tiempo promedio por ítem | < 500ms | Total tiempo / Total ítems |

---

## 4.4 Pipeline de 10 Pasos: Descripción Detallada

---

### PASO 1: LECTURA DE EXCELS HETEROGÉNEOS

#### Descripción
Este paso se encarga de la ingestión de datos desde múltiples formatos de archivo (XLS, XLSX, CSV) con estructuras variables. Implementa detección automática de codificación, identificación de hojas relevantes y manejo de encabezados en posiciones variables.

#### Pseudocódigo del Paso 1

```
FUNCIÓN leer_archivo_excel(ruta_archivo, configuracion=None):
    
    ENTRADA:
        - ruta_archivo: str (ruta al archivo)
        - configuracion: dict (opcional, con overrides)
    
    SALIDA:
        - dataframe: pandas.DataFrame
        - metadatos: dict (información de lectura)
        - errores: list (lista de advertencias)
    
    INICIO:
        errores ← []
        metadatos ← {
            'archivo_origen': ruta_archivo,
            'fecha_procesamiento': ahora(),
            'codificacion_detectada': None,
            'hojas_encontradas': [],
            'hoja_seleccionada': None,
            'fila_encabezado': None
        }
        
        # 1.1 Detectar formato de archivo
        extension ← obtener_extension(ruta_archivo).lower()
        
        SI extension NO ESTÁ EN ['.xls', '.xlsx', '.csv']:
            LANZAR ErrorFormatoNoSoportado(f"Formato {extension} no soportado")
        
        # 1.2 Detectar codificación (para CSV)
        SI extension == '.csv':
            INTENTAR:
                codificacion ← detectar_codificacion(ruta_archivo)
                metadatos['codificacion_detectada'] ← codificacion
            EXCEPTO ErrorDeteccionCodificacion:
                codificacion ← 'utf-8'  # fallback
                errores.append("No se pudo detectar codificación, usando utf-8")
        
        # 1.3 Leer según formato
        INTENTAR:
            SI extension EN ['.xls', '.xlsx']:
                # Identificar hojas disponibles
                libro ← pandas.ExcelFile(ruta_archivo)
                metadatos['hojas_encontradas'] ← libro.sheet_names
                
                # Seleccionar hoja relevante
                hoja ← seleccionar_hoja_relevante(
                    libro.sheet_names, 
                    configuracion.get('nombre_hoja_preferida')
                )
                metadatos['hoja_seleccionada'] ← hoja
                
                # Detectar fila de encabezado
                fila_encabezado ← detectar_fila_encabezado(ruta_archivo, hoja)
                metadatos['fila_encabezado'] ← fila_encabezado
                
                # Leer datos
                dataframe ← pandas.read_excel(
                    ruta_archivo,
                    sheet_name=hoja,
                    header=fila_encabezado
                )
                
            SINO SI extension == '.csv':
                # Detectar delimitador
                delimitador ← detectar_delimitador(ruta_archivo, codificacion)
                
                # Detectar fila de encabezado
                fila_encabezado ← detectar_fila_encabezado_csv(ruta_archivo, codificacion)
                metadatos['fila_encabezado'] ← fila_encabezado
                
                # Leer datos
                dataframe ← pandas.read_csv(
                    ruta_archivo,
                    encoding=codificacion,
                    delimiter=delimitador,
                    skiprows=fila_encabezado - 1 if fila_encabezado > 0 else 0
                )
        
        EXCEPTO ErrorLecturaArchivo COMO e:
            errores.append(f"Error leyendo archivo: {str(e)}")
            REGISTRAR_ERROR(ruta_archivo, e)
            RETORNAR None, metadatos, errores
        
        # 1.4 Validaciones post-lectura
        SI dataframe.empty:
            errores.append("DataFrame vacío después de lectura")
            RETORNAR None, metadatos, errores
        
        SI len(dataframe.columns) < 2:
            errores.append(f"Solo {len(dataframe.columns)} columnas detectadas, posible error de delimitador")
        
        # 1.5 Logging de éxito
        REGISTRAR_LOG('INFO', f"Archivo {ruta_archivo} leído exitosamente: {len(dataframe)} filas, {len(dataframe.columns)} columnas")
        
        RETORNAR dataframe, metadatos, errores
    FIN


FUNCIÓN seleccionar_hoja_relevante(nombres_hojas, nombre_preferido=None):
    """
    Selecciona la hoja más probable de contener datos de ítems IDPS.
    """
    # Prioridad explícita
    SI nombre_preferido Y nombre_preferido EN nombres_hojas:
        RETORNAR nombre_preferido
    
    # Palabras clave de prioridad (ordenadas por relevancia)
    palabras_clave ← ['items', 'ítems', 'preguntas', 'indicadores', 'idps', 
                      'datos', 'data', 'hoja1', 'sheet1']
    
    PARA palabra EN palabras_clave:
        PARA nombre EN nombres_hojas:
            SI palabra EN nombre.lower():
                RETORNAR nombre
    
    # Fallback: primera hoja
    RETORNAR nombres_hojas[0]


FUNCIÓN detectar_fila_encabezado(ruta_archivo, nombre_hoja):
    """
    Detecta la fila que contiene los nombres de columnas.
    Busca la primera fila con contenido que parezcan nombres de columnas válidos.
    """
    # Leer primeras 20 filas sin encabezado
    muestra ← pandas.read_excel(ruta_archivo, sheet_name=nombre_hoja, 
                                 header=None, nrows=20)
    
    PARA fila EN rango(min(20, len(muestra))):
        contenido_fila ← muestra.iloc[fila].astype(str).tolist()
        
        # Heurísticas de fila de encabezado:
        # 1. Contiene palabras clave de columnas IDPS
        # 2. No tiene valores puramente numéricos
        # 3. Tiene longitudes razonables para nombres de columnas
        
        score ← 0
        texto_concatenado ← ' '.join(contenido_fila).lower()
        
        # Palabras clave indicativas de encabezado
        palabras_clave ← ['item', 'pregunta', 'texto', 'enunciado', 'dimensión', 
                          'actor', 'subdimensión', 'código', 'categoria']
        
        PARA palabra EN palabras_clave:
            SI palabra EN texto_concatenado:
                score ← score + 1
        
        # Penalizar si tiene muchos números puros
        numeros_puros ← sum(1 PARA celda EN contenido_fila SI es_numero(celda))
        SI numeros_puros > len(contenido_fila) * 0.5:
            score ← score - 2
        
        # Score mínimo para considerar encabezado
        SI score >= 2:
            RETORNAR fila
    
    # Fallback: primera fila
    RETORNAR 0
```

---

### PASO 2: NORMALIZACIÓN DE COLUMNAS

#### Descripción
Este paso estandariza los nombres de columnas entre diferentes archivos mediante un mapeo flexible basado en diccionarios de sinónimos. Detecta automáticamente columnas por su contenido cuando los nombres no son reconocibles.

#### Pseudocódigo del Paso 2

```
FUNCIÓN normalizar_columnas(dataframe, mapeo_columnas=None):
    
    ENTRADA:
        - dataframe: pandas.DataFrame (datos leídos)
        - mapeo_columnas: dict (mapeo personalizado opcional)
    
    SALIDA:
        - dataframe_normalizado: pandas.DataFrame
        - mapeo_aplicado: dict (mapeo efectivamente usado)
        - columnas_no_mapeadas: list (advertencias)
    
    INICIO:
        columnas_no_mapeadas ← []
        mapeo_aplicado ← {}
        
        # 2.1 Diccionario de sinónimos estándar IDPS
        diccionario_sinonimos ← {
            'texto_item': ['item', 'pregunta', 'texto', 'enunciado', 'ítem',
                          'descripcion', 'descripción', 'texto_pregunta', 
                          'enunciado_item', 'item_texto', 'pregunta_texto'],
            
            'actor': ['actor', 'tipo_actor', 'actor_tipo', 'perfil', 
                     'tipo_perfil', 'respondente', 'respondiente'],
            
            'dimension': ['dimension', 'dimensión', 'dimension_idps', 
                         'categoria', 'categoría', 'eje', 'area', 'área'],
            
            'subdimension': ['subdimension', 'subdimensión', 'sub_categoria',
                            'subcategoria', 'subcategoría', 'factor', 
                            'componente', 'sub_area', 'subárea'],
            
            'codigo_item': ['codigo', 'código', 'id_item', 'item_id', 
                           'codigo_item', 'código_item', 'id', 'numero',
                           'número', 'numero_item'],
            
            'año': ['año', 'ano', 'year', 'periodo', 'periodo_academico',
                   'año_evaluacion', 'año_aplicacion'],
            
            'instrumento': ['instrumento', 'tipo_instrumento', 'formato',
                           'tipo_prueba', 'evaluacion']
        }
        
        # 2.2 Combinar con mapeo personalizado si existe
        SI mapeo_columnas:
            diccionario_sinonimos.actualizar(mapeo_columnas)
        
        # 2.3 Normalizar nombres de columnas originales
        columnas_originales ← list(dataframe.columns)
        columnas_normalizadas ← []
        
        PARA col EN columnas_originales:
            nombre_limpio ← limpiar_nombre_columna(col)
            nombre_estandar ← None
            
            # Buscar en diccionario de sinónimos
            PARA estandar, sinonimos EN diccionario_sinonimos.items():
                SI nombre_limpio EN sinonimos:
                    nombre_estandar ← estandar
                    mapeo_aplicado[col] ← estandar
                    ROMPER
            
            # Si no se encontró, intentar matching difuso
            SI nombre_estandar ES None:
                nombre_estandar ← matching_difuso_columnas(
                    nombre_limpio, diccionario_sinonimos
                )
                SI nombre_estandar:
                    mapeo_aplicado[col] ← nombre_estandar
            
            # Si aún no se encontró, mantener original y reportar
            SI nombre_estandar ES None:
                nombre_estandar ← nombre_limpio
                columnas_no_mapeadas.append(col)
            
            columnas_normalizadas.append(nombre_estandar)
        
        # 2.4 Aplicar nuevos nombres
        dataframe.columns ← columnas_normalizadas
        
        # 2.5 Detección automática por contenido para columnas no mapeadas
        columnas_criticas ← ['texto_item', 'actor', 'dimension']
        columnas_faltantes ← [c PARA c EN columnas_criticas SI c NO ESTÁ EN columnas_normalizadas]
        
        PARA critica EN columnas_faltantes:
            columna_detectada ← detectar_columna_por_contenido(dataframe, critica)
            SI columna_detectada:
                dataframe.rename(columns={columna_detectada: critica}, inplace=True)
                mapeo_aplicado[f"[detectado_{columna_detectada}]"] ← critica
                REGISTRAR_LOG('INFO', f"Columna {critica} detectada automáticamente en {columna_detectada}")
        
        # 2.6 Validación de columnas mínimas requeridas
        columnas_requeridas ← ['texto_item']
        columnas_presentes ← [c PARA c EN columnas_requeridas SI c EN dataframe.columns]
        
        SI len(columnas_presentes) < len(columnas_requeridas):
            faltantes ← set(columnas_requeridas) - set(columnas_presentes)
            LANZAR ErrorColumnasRequeridas(f"Faltan columnas requeridas: {faltantes}")
        
        # 2.7 Logging
        REGISTRAR_LOG('INFO', f"Normalización completada. Columnas mapeadas: {len(mapeo_aplicado)}")
        
        RETORNAR dataframe, mapeo_aplicado, columnas_no_mapeadas
    FIN


FUNCIÓN limpiar_nombre_columna(nombre):
    """
    Normaliza un nombre de columna para comparación.
    """
    nombre ← str(nombre).lower().strip()
    nombre ← reemplazar_acentos(nombre)
    nombre ← re.sub(r'[^a-z0-9_]', '_', nombre)
    nombre ← re.sub(r'_+', '_', nombre)
    nombre ← nombre.strip('_')
    RETORNAR nombre


FUNCIÓN detectar_columna_por_contenido(dataframe, tipo_columna):
    """
    Detecta qué columna corresponde a un tipo específico basándose en su contenido.
    """
    PARA nombre_columna EN dataframe.columns:
        muestra ← dataframe[nombre_columna].dropna().head(50).astype(str)
        
        SI tipo_columna == 'texto_item':
            # Ítems típicamente son textos de longitud media con palabras clave psicométricas
            longitudes ← [len(s) PARA s EN muestra]
            longitud_promedio ← promedio(longitudes)
            
            # Heurísticas: longitud entre 15 y 300 caracteres, contiene palabras comunes de ítems
            SI 15 <= longitud_promedio <= 300:
                texto_muestra ← ' '.join(muestra).lower()
                palabras_item ← ['me', 'mi', 'yo', 'siento', 'pienso', 'creo', 'sé', 
                                'frecuencia', 'siempre', 'nunca', 'a veces']
                coincidencias ← sum(1 PARA p EN palabras_item SI p EN texto_muestra)
                
                SI coincidencias >= 3:
                    RETORNAR nombre_columna
        
        SINO SI tipo_columna == 'actor':
            # Actor típicamente tiene valores categóricos repetidos
            valores_unicos ← muestra.nunique()
            SI 2 <= valores_unicos <= 10:
                valores ← set(muestra.str.lower().unique())
                actores_comunes ← {'estudiante', 'apoderado', 'docente', 'directivo', 
                                  'auto', 'par', 'padre', 'profesor'}
                SI valores.interseccion(actores_comunes):
                    RETORNAR nombre_columna
        
        SINO SI tipo_columna == 'dimension':
            # Dimensión tiene valores categóricos de dominios psicosociales
            valores_unicos ← muestra.nunique()
            SI 3 <= valores_unicos <= 15:
                texto_muestra ← ' '.join(muestra).lower()
                dimensiones_comunes ← ['autoconcepto', 'motivacion', 'bienestar',
                                      'relaciones', 'convivencia', 'regulacion']
                coincidencias ← sum(1 PARA d EN dimensiones_comunes SI d EN texto_muestra)
                SI coincidencias >= 1:
                    RETORNAR nombre_columna
    
    RETORNAR None
```

---

### PASO 3: LIMPIEZA Y ESTANDARIZACIÓN DE TEXTOS

#### Descripción
Este paso normaliza el texto de los ítems para facilitar comparaciones posteriores. Incluye normalización de caracteres especiales, estandarización de espacios, conversión a minúsculas y eliminación opcional de artículos.

#### Pseudocódigo del Paso 3

```
FUNCIÓN limpiar_texto_item(texto, configuracion=None):
    
    ENTRADA:
        - texto: str (texto del ítem)
        - configuracion: dict (opciones de limpieza)
    
    SALIDA:
        - texto_limpio: str (texto normalizado)
        - texto_comparacion: str (texto para matching)
        - metadatos_limpieza: dict
    
    INICIO:
        configuracion_default ← {
            'normalizar_tildes': True,
            'estandarizar_espacios': True,
            'convertir_minusculas': True,
            'eliminar_articulos': False,
            'eliminar_puntuacion': False,
            'preservar_original': True
        }
        
        SI configuracion:
            configuracion_default.actualizar(configuracion)
        
        config ← configuracion_default
        
        # Guardar original
        texto_original ← str(texto) SI texto NO ES None SINO ''
        
        SI texto_original.strip() == '':
            RETORNAR '', '', {'vacio': True}
        
        texto_procesado ← texto_original
        
        # 3.1 Normalizar tildes y caracteres especiales
        SI config['normalizar_tildes']:
            texto_procesado ← normalizar_unicode(texto_procesado)
            texto_procesado ← texto_procesado.replace('á', 'a')
                                                .replace('é', 'e')
                                                .replace('í', 'i')
                                                .replace('ó', 'o')
                                                .replace('ú', 'u')
                                                .replace('ñ', 'n')
                                                .replace('ü', 'u')
                                                .replace('Á', 'A')
                                                .replace('É', 'E')
                                                .replace('Í', 'I')
                                                .replace('Ó', 'O')
                                                .replace('Ú', 'U')
                                                .replace('Ñ', 'N')
                                                .replace('Ü', 'U')
        
        # 3.2 Estandarizar espacios
        SI config['estandarizar_espacios']:
            # Eliminar espacios múltiples
            texto_procesado ← re.sub(r'\s+', ' ', texto_procesado)
            # Eliminar espacios al inicio y final
            texto_procesado ← texto_procesado.strip()
        
        # 3.3 Convertir a minúsculas
        SI config['convertir_minusculas']:
            texto_procesado ← texto_procesado.lower()
        
        # 3.4 Eliminar artículos (opcional, para matching)
        texto_comparacion ← texto_procesado
        
        SI config['eliminar_articulos']:
            articulos ← ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
                        'lo', 'al', 'del']
            PARA articulo EN articulos:
                # Usar word boundaries para no eliminar partes de palabras
                patron ← r'\b' + articulo + r'\b'
                texto_comparacion ← re.sub(patron, '', texto_comparacion)
            # Limpiar espacios dobles resultantes
            texto_comparacion ← re.sub(r'\s+', ' ', texto_comparacion).strip()
        
        # 3.5 Eliminar puntuación (opcional)
        SI config['eliminar_puntuacion']:
            texto_comparacion ← re.sub(r'[^\w\s]', '', texto_comparacion)
            texto_comparacion ← re.sub(r'\s+', ' ', texto_comparacion).strip()
        
        # 3.6 Generar hash para matching exacto
        hash_comparacion ← generar_hash_sha256(texto_comparacion)
        
        metadatos ← {
            'texto_original': texto_original SI config['preservar_original'] SINO None,
            'longitud_original': len(texto_original),
            'longitud_limpia': len(texto_procesado),
            'longitud_comparacion': len(texto_comparacion),
            'hash_comparacion': hash_comparacion,
            'opciones_aplicadas': config
        }
        
        RETORNAR texto_procesado, texto_comparacion, metadatos
    FIN


FUNCIÓN procesar_dataframe_textos(dataframe, columna_texto='texto_item'):
    """
    Aplica limpieza de textos a todo el dataframe.
    """
    ENTRADA:
        - dataframe: pandas.DataFrame
        - columna_texto: str (nombre de la columna con textos)
    
    SALIDA:
        - dataframe: pandas.DataFrame (con columnas adicionales)
    
    INICIO:
        resultados ← []
        
        PARA indice, fila EN dataframe.iterrows():
            texto ← fila.get(columna_texto, '')
            
            limpio, comparacion, metadatos ← limpiar_texto_item(texto)
            
            resultados.append({
                'texto_limpio': limpio,
                'texto_comparacion': comparacion,
                'hash_comparacion': metadatos['hash_comparacion'],
                'longitud_texto': metadatos['longitud_original']
            })
        
        # Agregar columnas al dataframe
        df_resultados ← pandas.DataFrame(resultados)
        dataframe ← pandas.concat([dataframe, df_resultados], axis=1)
        
        RETORNAR dataframe
    FIN
```

---

### PASO 4: MATCHING EXACTO

#### Descripción
Este paso identifica ítems idénticos mediante comparación de hashes de texto normalizado. Es el método más rápido y se ejecuta primero en la cascada de matching.

#### Pseudocódigo del Paso 4

```
FUNCIÓN matching_exacto(dataframe, columna_hash='hash_comparacion'):
    
    ENTRADA:
        - dataframe: pandas.DataFrame (con hashes pre-calculados)
        - columna_hash: str (nombre de columna con hashes)
    
    SALIDA:
        - grupos_exactos: dict {hash: [indices]}
        - matches_exactos: list de MatchExacto
        - estadisticas: dict
    
    INICIO:
        # 4.1 Agrupar por hash
        grupos ← dataframe.groupby(columna_hash).groups
        
        grupos_exactos ← {}
        matches_exactos ← []
        
        PARA hash_valor, indices EN grupos.items():
            lista_indices ← list(indices)
            
            SI len(lista_indices) > 1:
                grupos_exactos[hash_valor] ← lista_indices
                
                # Crear registros de match para cada par
                PARA i EN rango(len(lista_indices)):
                    PARA j EN rango(i + 1, len(lista_indices)):
                        idx_a ← lista_indices[i]
                        idx_b ← lista_indices[j]
                        
                        match ← {
                            'tipo': 'EXACTO',
                            'indice_a': idx_a,
                            'indice_b': idx_b,
                            'hash': hash_valor,
                            'score': 1.0,
                            'score_fuzzy': 1.0,
                            'score_semantico': 1.0,
                            'score_hibrido': 1.0,
                            'confianza': 'ALTA',
                            'metodo_principal': 'HASH',
                            'requiere_revision': False
                        }
                        matches_exactos.append(match)
        
        # 4.2 Aplicar reglas de prioridad
        # Para ítems exactos que aparecen múltiples veces, determinar cuál es la versión canónica
        PARA hash_valor, indices EN grupos_exactos.items():
            filas_grupo ← dataframe.loc[indices]
            
            # Prioridad: más reciente > más frecuente > más largo
            indice_canonico ← seleccionar_canonico_prioridad(filas_grupo, indices)
            
            PARA idx EN indices:
                SI idx != indice_canonico:
                    dataframe.loc[idx, 'id_canonico_propuesto'] ← indice_canonico
                    dataframe.loc[idx, 'tipo_match'] ← 'EXACTO'
        
        # 4.3 Estadísticas
        estadisticas ← {
            'total_items_procesados': len(dataframe),
            'grupos_exactos_encontrados': len(grupos_exactos),
            'items_en_grupos_exactos': sum(len(v) PARA v EN grupos_exactos.values()),
            'pares_match_exacto': len(matches_exactos),
            'items_unicos_exactos': len(dataframe) - sum(len(v) - 1 PARA v EN grupos_exactos.values())
        }
        
        REGISTRAR_LOG('INFO', f"Matching exacto completado: {estadisticas['pares_match_exacto']} pares encontrados")
        
        RETORNAR grupos_exactos, matches_exactos, estadisticas
    FIN


FUNCIÓN seleccionar_canonico_prioridad(filas, indices):
    """
    Selecciona el índice del ítem canónico según reglas de prioridad.
    """
    # Regla 1: Priorizar el más reciente (mayor año)
    SI 'año' EN filas.columns:
        max_año ← filas['año'].max()
        candidatos_recientes ← filas[filas['año'] == max_año]
        SI len(candidatos_recientes) == 1:
            RETORNAR candidatos_recientes.index[0]
        filas ← candidatos_recientes
        indices ← list(filas.index)
    
    # Regla 2: Priorizar el más completo (mayor longitud de texto)
    SI 'longitud_texto' EN filas.columns:
        max_longitud ← filas['longitud_texto'].max()
        candidatos_largos ← filas[filas['longitud_texto'] == max_longitud]
        SI len(candidatos_largos) == 1:
            RETORNAR candidatos_largos.index[0]
        filas ← candidatos_largos
        indices ← list(filas.index)
    
    # Regla 3: Priorizar el primero en la lista
    RETORNAR indices[0]
```

---

### PASO 5: MATCHING DIFUSO (FUZZY)

#### Descripción
Este paso aplica algoritmos de distancia de edición (Levenshtein, Jaro-Winkler) para identificar ítems con variaciones menores de texto. Utiliza umbrales adaptativos según la longitud del texto.

#### Pseudocódigo del Paso 5

```
FUNCIÓN matching_difuso(dataframe, items_pendientes, umbrales=None):
    
    ENTRADA:
        - dataframe: pandas.DataFrame (datos completos)
        - items_pendientes: list (índices de ítems sin match exacto)
        - umbrales: dict (configuración de umbrales)
    
    SALIDA:
        - matches_difusos: list de MatchDifuso
        - estadisticas: dict
    
    INICIO:
        # Configuración de umbrales por defecto
        umbrales_default ← {
            'equivalente': 0.95,
            'variante_menor': 0.85,
            'variante_sustantiva': 0.70,
            'revisar': 0.60
        }
        
        SI umbrales:
            umbrales_default.actualizar(umbrales)
        
        # 5.1 Preparar textos para comparación
        textos ← {}
        PARA idx EN items_pendientes:
            texto ← dataframe.loc[idx, 'texto_comparacion']
            textos[idx] ← texto
        
        matches_difusos ← []
        pares_procesados ← set()
        
        # 5.2 Comparar todos los pares (con optimización)
        # Para grandes volúmenes, usar blocking por longitud de texto
        
        PARA i, idx_a EN enumerate(items_pendientes):
            texto_a ← textos[idx_a]
            longitud_a ← len(texto_a)
            
            # Ajustar umbral según longitud
            umbral_ajustado ← ajustar_umbral_por_longitud(
                umbrales_default['variante_sustantiva'], 
                longitud_a
            )
            
            PARA idx_b EN items_pendientes[i+1:]:
                # Evitar procesar el mismo par dos veces
                par ← tuple(sorted([idx_a, idx_b]))
                SI par EN pares_procesados:
                    CONTINUAR
                pares_procesados.add(par)
                
                texto_b ← textos[idx_b]
                
                # 5.3 Calcular similitudes
                score_levenshtein ← calcular_levenshtein_similarity(texto_a, texto_b)
                score_jaro ← calcular_jaro_winkler(texto_a, texto_b)
                
                # Combinar scores (promedio ponderado)
                score_fuzzy ← 0.6 * score_jaro + 0.4 * score_levenshtein
                
                # 5.4 Clasificar según score
                SI score_fuzzy >= umbrales_default['equivalente']:
                    tipo_match ← 'EQUIVALENTE_CANONICO'
                    confianza ← 'ALTA'
                    requiere_revision ← False
                
                SINO SI score_fuzzy >= umbrales_default['variante_menor']:
                    tipo_match ← 'VARIANTE_MENOR'
                    confianza ← 'MEDIA'
                    requiere_revision ← False
                
                SINO SI score_fuzzy >= umbrales_default['variante_sustantiva']:
                    tipo_match ← 'VARIANTE_SUSTANTIVA'
                    confianza ← 'MEDIA-BAJA'
                    requiere_revision ← True
                
                SINO:
                    CONTINUAR  # No es match suficiente
                
                match ← {
                    'tipo': tipo_match,
                    'indice_a': idx_a,
                    'indice_b': idx_b,
                    'score_fuzzy': score_fuzzy,
                    'score_levenshtein': score_levenshtein,
                    'score_jaro': score_jaro,
                    'confianza': confianza,
                    'metodo_principal': 'FUZZY',
                    'requiere_revision': requiere_revision,
                    'diferencia_texto': generar_diff(texto_a, texto_b)
                }
                
                matches_difusos.append(match)
        
        # 5.5 Estadísticas
        estadisticas ← {
            'items_procesados': len(items_pendientes),
            'pares_comparados': len(pares_procesados),
            'matches_encontrados': len(matches_difusos),
            'equivalentes': sum(1 PARA m EN matches_difusos SI m['tipo'] == 'EQUIVALENTE_CANONICO'),
            'variantes_menores': sum(1 PARA m EN matches_difusos SI m['tipo'] == 'VARIANTE_MENOR'),
            'variantes_sustantivas': sum(1 PARA m EN matches_difusos SI m['tipo'] == 'VARIANTE_SUSTANTIVA')
        }
        
        REGISTRAR_LOG('INFO', f"Matching difuso completado: {len(matches_difusos)} matches encontrados")
        
        RETORNAR matches_difusos, estadisticas
    FIN


FUNCIÓN calcular_levenshtein_similarity(s1, s2):
    """
    Calcula similitud basada en distancia de Levenshtein.
    Retorna valor entre 0 y 1.
    """
    distancia ← levenshtein_distance(s1, s2)
    max_longitud ← max(len(s1), len(s2))
    
    SI max_longitud == 0:
        RETORNAR 1.0
    
    similitud ← 1 - (distancia / max_longitud)
    RETORNAR max(0, similitud)


FUNCIÓN calcular_jaro_winkler(s1, s2):
    """
    Calcula similitud de Jaro-Winkler.
    Da más peso a coincidencias al inicio de las cadenas.
    """
    # Implementación de Jaro
    jaro ← jaro_similarity(s1, s2)
    
    # Ajuste Winkler: bonus por prefijo común
    prefijo_comun ← 0
    PARA i EN rango(min(4, len(s1), len(s2))):
        SI s1[i] == s2[i]:
            prefijo_comun ← prefijo_comun + 1
        SINO:
            ROMPER
    
    jaro_winkler ← jaro + (prefijo_comun * 0.1 * (1 - jaro))
    RETORNAR min(1.0, jaro_winkler)


FUNCIÓN ajustar_umbral_por_longitud(umbral_base, longitud_texto):
    """
    Ajusta el umbral según la longitud del texto.
    """
    SI longitud_texto <= 20:
        factor ← -0.10
    SINO SI longitud_texto <= 50:
        factor ← -0.05
    SINO SI longitud_texto <= 150:
        factor ← 0.0
    SINO SI longitud_texto <= 300:
        factor ← 0.02
    SINO:
        factor ← 0.05
    
    RETORNAR max(0.5, min(1.0, umbral_base + factor))
```

---

### PASO 6: MATCHING SEMÁNTICO (NLP)

#### Descripción
Este paso utiliza modelos de sentence transformers para generar embeddings de texto y calcular similitud semántica mediante distancia coseno. Captura equivalencias conceptuales incluso cuando el texto ha sido reformulado sustancialmente.

#### Pseudocódigo del Paso 6

```
FUNCIÓN matching_semantico(dataframe, items_pendientes, modelo=None, batch_size=32):
    
    ENTRADA:
        - dataframe: pandas.DataFrame
        - items_pendientes: list (índices de ítems sin match previo)
        - modelo: objeto modelo (o None para cargar default)
        - batch_size: int (tamaño de lotes para embeddings)
    
    SALIDA:
        - matches_semanticos: list de MatchSemantico
        - embeddings: dict {indice: vector}
        - estadisticas: dict
    
    INICIO:
        # 6.1 Cargar modelo de embeddings
        SI modelo ES None:
            # Usar modelo multilingüe optimizado para español
            nombre_modelo ← 'hiiamsid/sentence_similarity_spanish'
            # Alternativa: 'paraphrase-multilingual-MiniLM-L12-v2'
            modelo ← cargar_modelo_sentence_transformer(nombre_modelo)
        
        # 6.2 Preparar textos
        textos ← []
        indices_map ← []
        
        PARA idx EN items_pendientes:
            # Usar texto limpio (con puntuación para mejor contexto)
            texto ← dataframe.loc[idx, 'texto_limpio']
            textos.append(texto)
            indices_map.append(idx)
        
        # 6.3 Generar embeddings por lotes
        REGISTRAR_LOG('INFO', f"Generando embeddings para {len(textos)} ítems...")
        
        embeddings_lista ← []
        PARA i EN rango(0, len(textos), batch_size):
            lote ← textos[i:i+batch_size]
            embeddings_lote ← modelo.encode(lote, convert_to_tensor=True)
            embeddings_lista.append(embeddings_lote)
        
        # Concatenar todos los embeddings
        embeddings_tensor ← torch.cat(embeddings_lista, dim=0)
        
        # 6.4 Calcular matriz de similitud coseno
        matriz_similitud ← cosine_similarity(embeddings_tensor)
        
        # 6.5 Almacenar embeddings individuales
        embeddings ← {}
        PARA i, idx EN enumerate(indices_map):
            embeddings[idx] ← embeddings_tensor[i].cpu().numpy()
        
        # 6.6 Identificar matches semánticos
        matches_semanticos ← []
        
        umbrales ← {
            'equivalente': 0.95,
            'similar': 0.85,
            'revisar': 0.70
        }
        
        PARA i EN rango(len(indices_map)):
            PARA j EN rango(i + 1, len(indices_map)):
                score_semantico ← matriz_similitud[i][j].item()
                
                # Aplicar umbral mínimo
                SI score_semantico < umbrales['revisar']:
                    CONTINUAR
                
                idx_a ← indices_map[i]
                idx_b ← indices_map[j]
                
                # Clasificar según score
                SI score_semantico >= umbrales['equivalente']:
                    tipo_match ← 'EQUIVALENTE_SEMANTICO'
                    confianza ← 'ALTA'
                
                SINO SI score_semantico >= umbrales['similar']:
                    tipo_match ← 'SIMILAR_SEMANTICO'
                    confianza ← 'MEDIA'
                
                SINO:
                    tipo_match ← 'POSIBLE_RELACION'
                    confianza ← 'BAJA'
                
                match ← {
                    'tipo': tipo_match,
                    'indice_a': idx_a,
                    'indice_b': idx_b,
                    'score_semantico': score_semantico,
                    'confianza': confianza,
                    'metodo_principal': 'SEMANTICO',
                    'requiere_revision': score_semantico < umbrales['similar']
                }
                
                matches_semanticos.append(match)
        
        # 6.7 Estadísticas
        estadisticas ← {
            'items_procesados': len(items_pendientes),
            'dimension_embedding': embeddings_tensor.shape[1],
            'matches_semanticos': len(matches_semanticos),
            'equivalentes': sum(1 PARA m EN matches_semanticos SI m['tipo'] == 'EQUIVALENTE_SEMANTICO'),
            'similares': sum(1 PARA m EN matches_semanticos SI m['tipo'] == 'SIMILAR_SEMANTICO'),
            'posibles': sum(1 PARA m EN matches_semanticos SI m['tipo'] == 'POSIBLE_RELACION')
        }
        
        REGISTRAR_LOG('INFO', f"Matching semántico completado: {len(matches_semanticos)} matches encontrados")
        
        RETORNAR matches_semanticos, embeddings, estadisticas
    FIN


FUNCIÓN precomputar_embeddings_base(dataframe, modelo, ruta_cache=None):
    """
    Pre-computa y cachea embeddings para ítems base.
    Útil para procesamiento incremental.
    """
    ENTRADA:
        - dataframe: pandas.DataFrame con ítems canónicos existentes
        - modelo: modelo sentence-transformer cargado
        - ruta_cache: str (opcional, ruta para guardar embeddings)
    
    SALIDA:
        - embeddings_cache: dict {id_item: vector}
    
    INICIO:
        textos ← dataframe['texto_limpio'].tolist()
        ids ← dataframe.index.tolist()
        
        REGISTRAR_LOG('INFO', f"Pre-computando {len(textos)} embeddings base...")
        
        embeddings ← modelo.encode(textos, show_progress_bar=True)
        
        embeddings_cache ← {ids[i]: embeddings[i] PARA i EN rango(len(ids))}
        
        SI ruta_cache:
            guardar_pickle(embeddings_cache, ruta_cache)
            REGISTRAR_LOG('INFO', f"Embeddings cacheados en {ruta_cache}")
        
        RETORNAR embeddings_cache
    FIN
```

---

### PASO 7: DETECCIÓN DE CLUSTERS O FAMILIAS

#### Descripción
Este paso agrupa ítems similares en familias o clusters utilizando algoritmos de clustering. Determina el centroide de cada familia como candidato a ítem canónico.

#### Pseudocódigo del Paso 7

```
FUNCIÓN detectar_familias(matches_combinados, embeddings, metodo='hierarchical'):
    
    ENTRADA:
        - matches_combinados: list (todos los matches de todos los métodos)
        - embeddings: dict {indice: vector}
        - metodo: str ('hierarchical' o 'dbscan')
    
    SALIDA:
        - familias: list de Familia
        - centroides: dict {id_familia: indice_centroide}
        - estadisticas: dict
    
    INICIO:
        # 7.1 Construir grafo de similitud
        grafo ← construir_grafo_similitud(matches_combinados)
        
        # Obtener todos los nodos (ítems) del grafo
        nodos ← list(grafo.nodes())
        
        SI len(nodos) == 0:
            RETORNAR [], {}, {'error': 'Grafo vacío'}
        
        # 7.2 Preparar matriz de features para clustering
        # Usar embeddings como features
        features ← numpy.array([embeddings[n] PARA n EN nodos])
        
        # 7.3 Aplicar algoritmo de clustering
        SI metodo == 'dbscan':
            # DBSCAN: no requiere número de clusters predefinido
            clustering ← DBSCAN(eps=0.3, min_samples=2, metric='cosine')
            etiquetas ← clustering.fit_predict(features)
        
        SINO SI metodo == 'hierarchical':
            # Clustering jerárquico aglomerativo
            # Primero estimar número óptimo de clusters
            n_clusters ← estimar_n_clusters(grafo, features)
            
            clustering ← AgglomerativeClustering(
                n_clusters=n_clusters,
                metric='cosine',
                linkage='average'
            )
            etiquetas ← clustering.fit_predict(features)
        
        # 7.4 Construir familias a partir de clusters
        familias ← []
        centroides ← {}
        
        # Identificar clusters únicos (excluyendo ruido: -1)
        clusters_unicos ← set(etiquetas) - {-1}
        
        PARA id_cluster EN clusters_unicos:
            # Índices de los nodos en este cluster
            indices_cluster ← [nodos[i] PARA i, e EN enumerate(etiquetas) SI e == id_cluster]
            
            SI len(indices_cluster) < 2:
                CONTINUAR
            
            # Calcular centroide del cluster
            embeddings_cluster ← numpy.array([embeddings[i] PARA i EN indices_cluster])
            centroide ← numpy.mean(embeddings_cluster, axis=0)
            
            # Encontrar el ítem más cercano al centroide
            distancias ← [cosine_distance(centroide, embeddings[i]) PARA i EN indices_cluster]
            indice_centroide ← indices_cluster[numpy.argmin(distancias)]
            
            # Calcular métricas de cohesión del cluster
            distancias_internas ← []
            PARA i EN rango(len(indices_cluster)):
                PARA j EN rango(i + 1, len(indices_cluster)):
                    dist ← cosine_distance(
                        embeddings[indices_cluster[i]], 
                        embeddings[indices_cluster[j]]
                    )
                    distancias_internas.append(dist)
            
            cohesión ← 1 - promedio(distancias_internas) SI distancias_internas SINO 1.0
            
            familia ← {
                'id_familia': f"FAM_{id_cluster:04d}",
                'indices': indices_cluster,
                'centroide': indice_centroide,
                'tamaño': len(indices_cluster),
                'cohesión': cohesión,
                'metodo_clustering': metodo
            }
            
            familias.append(familia)
            centroides[familia['id_familia']] ← indice_centroide
        
        # 7.5 Manejar ítems sin cluster (ruido DBSCAN o singletons)
        indices_sin_familia ← [nodos[i] PARA i, e EN enumerate(etiquetas) SI e == -1]
        
        PARA idx EN indices_sin_familia:
            # Crear familia singleton
            familia ← {
                'id_familia': f"FAM_SINGLE_{idx:06d}",
                'indices': [idx],
                'centroide': idx,
                'tamaño': 1,
                'cohesión': 1.0,
                'metodo_clustering': 'singleton'
            }
            familias.append(familia)
            centroides[familia['id_familia']] ← idx
        
        # 7.6 Estadísticas
        estadisticas ← {
            'total_familias': len(familias),
            'familias_multi_item': sum(1 PARA f EN familias SI f['tamaño'] > 1),
            'familias_singleton': sum(1 PARA f EN familias SI f['tamaño'] == 1),
            'tamaño_promedio': promedio([f['tamaño'] PARA f EN familias]),
            'cohesión_promedio': promedio([f['cohesión'] PARA f EN familias SI f['tamaño'] > 1])
        }
        
        REGISTRAR_LOG('INFO', f"Clustering completado: {estadisticas['total_familias']} familias detectadas")
        
        RETORNAR familias, centroides, estadisticas
    FIN


FUNCIÓN construir_grafo_similitud(matches):
    """
    Construye un grafo no dirigido donde los nodos son ítems y las aristas
    representan similitud (con peso = score de similitud).
    """
    grafo ← networkx.Graph()
    
    PARA match EN matches:
        idx_a ← match['indice_a']
        idx_b ← match['indice_b']
        score ← match.get('score_hibrido') O match.get('score_fuzzy') O match.get('score_semantico')
        
        grafo.add_edge(idx_a, idx_b, weight=score)
    
    RETORNAR grafo


FUNCIÓN estimar_n_clusters(grafo, features):
    """
    Estima el número óptimo de clusters usando el método del codo
    o basado en componentes conectados del grafo.
    """
    # Método 1: Basado en componentes conectados del grafo
    componentes ← list(networkx.connected_components(grafo))
    n_componentes ← len(componentes)
    
    # Método 2: Silhouette score para diferentes k
    k_candidatos ← range(2, min(n_componentes + 5, len(features)))
    mejor_score ← -1
    mejor_k ← n_componentes
    
    PARA k EN k_candidatos:
        clustering ← AgglomerativeClustering(n_clusters=k, metric='cosine', linkage='average')
        etiquetas ← clustering.fit_predict(features)
        
        SI len(set(etiquetas)) > 1:
            score ← silhouette_score(features, etiquetas, metric='cosine')
            SI score > mejor_score:
                mejor_score ← score
                mejor_k ← k
    
    RETORNAR mejor_k
```

---

### PASO 8: SEPARAR EQUIVALENTES DE VARIANTES Y DISTINTOS

#### Descripción
Este paso clasifica cada match en categorías taxonómicas basándose en scores combinados de todos los métodos. Implementa reglas de decisión híbrida para manejar casos conflictivos.

#### Pseudocódigo del Paso 8

```
FUNCIÓN clasificar_taxonomia(matches_combinados, umbrales=None):
    
    ENTRADA:
        - matches_combinados: list (matches de todos los métodos)
        - umbrales: dict (umbrales de clasificación)
    
    SALIDA:
        - matches_clasificados: list con clasificación taxonómica
        - resumen_taxonomia: dict
        - conflictos: list de matches conflictivos
    
    INICIO:
        # Umbrales por defecto
        umbrales_default ← {
            'exacto': 1.0,
            'equivalente': 0.95,
            'variante_menor_min': 0.85,
            'variante_sustantiva_min': 0.70,
            'diferente_max': 0.70,
            'zona_gris_inf': 0.75,
            'zona_gris_sup': 0.85,
            'diferencia_conflictiva': 0.15
        }
        
        SI umbrales:
            umbrales_default.actualizar(umbrales)
        
        matches_clasificados ← []
        conflictos ← []
        
        PARA match EN matches_combinados:
            # Extraer scores de todos los métodos
            score_exacto ← match.get('score_exacto', 0)
            score_fuzzy ← match.get('score_fuzzy', 0)
            score_semantico ← match.get('score_semantico', 0)
            score_hibrido ← match.get('score_hibrido', 0)
            
            # Calcular score híbrido si no existe
            SI score_hibrido == 0:
                score_hibrido ← calcular_score_hibrido(score_exacto, score_fuzzy, score_semantico)
            
            # Calcular diferencia entre métodos
            diferencia_metodos ← abs(score_fuzzy - score_semantico)
            
            # 8.1 Aplicar reglas de decisión
            
            # Regla 1: Matching exacto
            SI score_exacto >= umbrales_default['exacto']:
                clasificacion ← 'EXACTO'
                confianza ← 'ALTA'
                requiere_revision ← False
            
            # Regla 2: Equivalente canónico
            SINO SI score_hibrido >= umbrales_default['equivalente']:
                clasificacion ← 'EQUIVALENTE_CANONICO'
                confianza ← 'ALTA'
                requiere_revision ← False
            
            # Regla 3: Variante menor
            SINO SI score_hibrido >= umbrales_default['variante_menor_min']:
                clasificacion ← 'VARIANTE_MENOR'
                confianza ← 'MEDIA'
                requiere_revision ← False
            
            # Regla 4: Variante sustantiva
            SINO SI score_hibrido >= umbrales_default['variante_sustantiva_min']:
                clasificacion ← 'VARIANTE_SUSTANTIVA'
                confianza ← 'MEDIA-BAJA'
                requiere_revision ← True
            
            # Regla 5: Diferente
            SINO SI score_hibrido < umbrales_default['diferente_max']:
                clasificacion ← 'DIFERENTE'
                confianza ← 'ALTA'
                requiere_revision ← False
            
            # Regla 6: Zona gris - requiere revisión
            SINO SI (umbrales_default['zona_gris_inf'] <= score_hibrido <= umbrales_default['zona_gris_sup']):
                clasificacion ← 'AMBIGUO'
                confianza ← 'BAJA'
                requiere_revision ← True
            
            SINO:
                clasificacion ← 'NO_CLASIFICADO'
                confianza ← 'DESCONOCIDA'
                requiere_revision ← True
            
            # 8.2 Detectar conflictos entre métodos
            es_conflicto ← False
            razon_conflicto ← None
            
            # Conflicto: diferencia significativa entre fuzzy y semántico
            SI diferencia_metodos > umbrales_default['diferencia_conflictiva']:
                es_conflicto ← True
                razon_conflicto ← f"Diferencia métodos: {diferencia_metodos:.3f}"
            
            # Conflicto: fuzzy alto pero semántico bajo (o viceversa)
            SI (score_fuzzy >= 0.90 Y score_semantico < 0.70) O \
               (score_semantico >= 0.90 Y score_fuzzy < 0.70):
                es_conflicto ← True
                razon_conflicto ← "Discrepancia fuzzy vs semántico"
            
            # Conflicto: en zona gris
            SI umbrales_default['zona_gris_inf'] <= score_hibrido <= umbrales_default['zona_gris_sup']:
                es_conflicto ← True
                razon_conflicto ← "Zona gris de clasificación"
            
            SI es_conflicto:
                clasificacion ← 'AMBIGUO'
                confianza ← 'BAJA'
                requiere_revision ← True
                conflictos.append({
                    'match': match,
                    'razon': razon_conflicto,
                    'scores': {
                        'exacto': score_exacto,
                        'fuzzy': score_fuzzy,
                        'semantico': score_semantico,
                        'hibrido': score_hibrido
                    }
                })
            
            # 8.3 Agregar clasificación al match
            match_clasificado ← match.copiar()
            match_clasificado['clasificacion'] ← clasificacion
            match_clasificado['confianza'] ← confianza
            match_clasificado['requiere_revision'] ← requiere_revision
            match_clasificado['diferencia_metodos'] ← diferencia_metodos
            match_clasificado['es_conflicto'] ← es_conflicto
            match_clasificado['razon_conflicto'] ← razon_conflicto
            
            matches_clasificados.append(match_clasificado)
        
        # 8.4 Generar resumen taxonómico
        resumen_taxonomia ← {
            'EXACTO': sum(1 PARA m EN matches_clasificados SI m['clasificacion'] == 'EXACTO'),
            'EQUIVALENTE_CANONICO': sum(1 PARA m EN matches_clasificados SI m['clasificacion'] == 'EQUIVALENTE_CANONICO'),
            'VARIANTE_MENOR': sum(1 PARA m EN matches_clasificados SI m['clasificacion'] == 'VARIANTE_MENOR'),
            'VARIANTE_SUSTANTIVA': sum(1 PARA m EN matches_clasificados SI m['clasificacion'] == 'VARIANTE_SUSTANTIVA'),
            'DIFERENTE': sum(1 PARA m EN matches_clasificados SI m['clasificacion'] == 'DIFERENTE'),
            'AMBIGUO': sum(1 PARA m EN matches_clasificados SI m['clasificacion'] == 'AMBIGUO'),
            'total_conflictos': len(conflictos),
            'requieren_revision': sum(1 PARA m EN matches_clasificados SI m['requiere_revision'])
        }
        
        REGISTRAR_LOG('INFO', f"Clasificación taxonómica completada: {resumen_taxonomia}")
        
        RETORNAR matches_clasificados, resumen_taxonomia, conflictos
    FIN


FUNCIÓN calcular_score_hibrido(score_exacto, score_fuzzy, score_semantico):
    """
    Calcula score híbrido combinando los tres métodos.
    """
    SI score_exacto >= 1.0:
        RETORNAR 1.0
    
    # Si no hay score semántico, usar solo fuzzy
    SI score_semantico == 0:
        RETORNAR score_fuzzy
    
    # Si no hay score fuzzy, usar solo semántico
    SI score_fuzzy == 0:
        RETORNAR score_semantico
    
    # Combinar fuzzy y semántico con ponderación
    score_combinado ← 0.4 * score_fuzzy + 0.6 * score_semantico
    
    RETORNAR max(score_exacto, score_combinado)
```

---

### PASO 9: DERIVAR ÍTEMS CANÓNICOS

#### Descripción
Este paso selecciona el texto canónico para cada familia de ítems, crea los registros en la tabla de ítems canónicos y establece las relaciones entre variantes y sus representantes canónicos.

#### Pseudocódigo del Paso 9

```
FUNCIÓN derivar_items_canonicos(familias, dataframe, estrategia='frecuencia'):
    
    ENTRADA:
        - familias: list de Familia (del paso 7)
        - dataframe: pandas.DataFrame (datos originales)
        - estrategia: str ('frecuencia', 'reciente', 'consenso', 'largo')
    
    SALIDA:
        - items_canonicos: list de ItemCanonico
        - relaciones: list de RelacionVariante
        - estadisticas: dict
    
    INICIO:
        items_canonicos ← []
        relaciones ← []
        
        contador_canonico ← 0
        
        PARA familia EN familias:
            indices ← familia['indices']
            
            # 9.1 Seleccionar ítem canónico según estrategia
            indice_canonico ← seleccionar_canonico(
                indices, dataframe, estrategia
            )
            
            # 9.2 Extraer datos del ítem canónico
            fila_canonica ← dataframe.loc[indice_canonico]
            
            # Generar ID canónico
            contador_canonico ← contador_canonico + 1
            id_canonico ← f"IDPS-CAN-{contador_canonico:06d}"
            
            # 9.3 Crear registro canónico
            item_canonico ← {
                'id_canonico': id_canonico,
                'texto_canonico': fila_canonica['texto_item'],
                'texto_normalizado': fila_canonica['texto_limpio'],
                'actor': fila_canonica.get('actor'),
                'dimension': fila_canonica.get('dimension'),
                'subdimension': fila_canonica.get('subdimension'),
                'año_origen': fila_canonica.get('año'),
                'estrategia_seleccion': estrategia,
                'indice_origen': indice_canonico,
                'familia_id': familia['id_familia'],
                'num_variantes': len(indices) - 1,
                'fecha_creacion': ahora(),
                'version': 1
            }
            
            items_canonicos.append(item_canonico)
            
            # 9.4 Crear relaciones para variantes
            PARA idx EN indices:
                SI idx == indice_canonico:
                    CONTINUAR  # El canónico no es variante de sí mismo
                
                fila_variante ← dataframe.loc[idx]
                
                # Calcular tipo de variante
                tipo_variante ← determinar_tipo_variante(
                    fila_canonica['texto_comparacion'],
                    fila_variante['texto_comparacion']
                )
                
                relacion ← {
                    'id_canonico': id_canonico,
                    'indice_variante': idx,
                    'texto_variante': fila_variante['texto_item'],
                    'año_variante': fila_variante.get('año'),
                    'tipo_variante': tipo_variante,
                    'score_similitud': calcular_similitud(
                        fila_canonica['texto_comparacion'],
                        fila_variante['texto_comparacion']
                    ),
                    'diferencias': generar_diff_detallado(
                        fila_canonica['texto_item'],
                        fila_variante['texto_item']
                    ),
                    'fecha_relacion': ahora()
                }
                
                relaciones.append(relacion)
                
                # Actualizar dataframe original con referencia
                dataframe.loc[idx, 'id_canonico_asignado'] ← id_canonico
                dataframe.loc[idx, 'tipo_variante'] ← tipo_variante
        
        # 9.5 Estadísticas
        estadisticas ← {
            'total_canonicos_creados': len(items_canonicos),
            'total_variantes_relacionadas': len(relaciones),
            'promedio_variantes_por_canonico': len(relaciones) / len(items_canonicos) SI items_canonicos SINO 0,
            'estrategia_usada': estrategia
        }
        
        REGISTRAR_LOG('INFO', f"Derivación de canónicos completada: {estadisticas['total_canonicos_creados']} canónicos creados")
        
        RETORNAR items_canonicos, relaciones, estadisticas
    FIN


FUNCIÓN seleccionar_canonico(indices, dataframe, estrategia):
    """
    Selecciona el índice del ítem canónico según la estrategia especificada.
    """
    filas ← dataframe.loc[indices]
    
    SI estrategia == 'frecuencia':
        # Seleccionar el texto que aparece más frecuentemente
        textos ← filas['texto_comparacion'].tolist()
        conteo ← Counter(textos)
        texto_mas_frecuente ← conteo.most_common(1)[0][0]
        
        # Retornar el primer índice con ese texto
        PARA idx EN indices:
            SI dataframe.loc[idx, 'texto_comparacion'] == texto_mas_frecuente:
                RETORNAR idx
    
    SINO SI estrategia == 'reciente':
        # Seleccionar el ítem del año más reciente
        SI 'año' EN filas.columns:
            max_año ← filas['año'].max()
            candidatos ← [idx PARA idx EN indices SI dataframe.loc[idx, 'año'] == max_año]
            RETORNAR candidatos[0]  # Primero de los más recientes
    
    SINO SI estrategia == 'largo':
        # Seleccionar el ítem con texto más completo (mayor longitud)
        longitudes ← [(idx, len(dataframe.loc[idx, 'texto_item'])) PARA idx EN indices]
        longitudes.sort(key=lambda x: x[1], reverse=True)
        RETORNAR longitudes[0][0]
    
    SINO SI estrategia == 'consenso':
        # Seleccionar el ítem más cercano al centroide semántico de la familia
        # Requiere embeddings pre-calculados
        embeddings ← [dataframe.loc[idx, 'embedding'] PARA idx EN indices]
        centroide ← numpy.mean(embeddings, axis=0)
        
        distancias ← [(idx, cosine_distance(centroide, emb)) PARA idx, emb EN zip(indices, embeddings)]
        distancias.sort(key=lambda x: x[1])
        RETORNAR distancias[0][0]  # Más cercano al centroide
    
    # Fallback: primer índice
    RETORNAR indices[0]


FUNCIÓN determinar_tipo_variante(texto_canonico, texto_variante):
    """
    Determina el tipo de variante basándose en las diferencias.
    """
    score_fuzzy ← calcular_jaro_winkler(texto_canonico, texto_variante)
    
    SI score_fuzzy >= 0.95:
        RETORNAR 'ORTOGRAFICA'
    SINO SI score_fuzzy >= 0.85:
        RETORNAR 'MENOR'
    SINO SI score_fuzzy >= 0.70:
        RETORNAR 'SUSTANTIVA'
    SINO:
        RETORNAR 'MAYOR'
```

---

### PASO 10: ENVIAR AMBIGUOS A REVISIÓN HUMANA

#### Descripción
Este paso identifica los casos ambiguos que requieren revisión manual, genera propuestas de decisión para facilitar el trabajo del revisor y estructura la información para la interfaz de revisión.

#### Pseudocódigo del Paso 10

```
FUNCIÓN detectar_ambiguos_para_revision(matches_clasificados, dataframe, criterios=None):
    
    ENTRADA:
        - matches_clasificados: list (matches con clasificación)
        - dataframe: pandas.DataFrame
        - criterios: dict (criterios de ambigüedad)
    
    SALIDA:
        - casos_revision: list de CasoRevision
        - estadisticas: dict
    
    INICIO:
        # Criterios por defecto
        criterios_default ← {
            'diferencia_score_conflictiva': 0.15,
            'zona_gris_inf': 0.75,
            'zona_gris_sup': 0.85,
            'umbral_baja_confianza': 0.70,
            'incluir_variantes_sustantivas': True
        }
        
        SI criterios:
            criterios_default.actualizar(criterios)
        
        casos_revision ← []
        
        PARA match EN matches_clasificados:
            es_ambiguo ← False
            razones_ambiguedad ← []
            prioridad ← 'BAJA'
            
            # 10.1 Criterio: Diferencia significativa entre métodos
            diferencia ← match.get('diferencia_metodos', 0)
            SI diferencia > criterios_default['diferencia_score_conflictiva']:
                es_ambiguo ← True
                razones_ambiguedad.append(
                    f"Diferencia fuzzy vs semántico: {diferencia:.3f}"
                )
                prioridad ← 'ALTA'
            
            # 10.2 Criterio: Zona gris de similitud
            score_hibrido ← match.get('score_hibrido', 0)
            SI (criterios_default['zona_gris_inf'] <= score_hibrido <= criterios_default['zona_gris_sup']):
                es_ambiguo ← True
                razones_ambiguedad.append(
                    f"Score en zona gris: {score_hibrido:.3f}"
                )
                prioridad ← 'MEDIA'
            
            # 10.3 Criterio: Conflicto de clasificación
            SI match.get('es_conflicto', False):
                es_ambiguo ← True
                razones_ambiguedad.append(match.get('razon_conflicto', 'Conflicto no especificado'))
                prioridad ← 'ALTA'
            
            # 10.4 Criterio: Variante sustantiva marcada para revisión
            SI criterios_default['incluir_variantes_sustantivas'] Y \
               match.get('clasificacion') == 'VARIANTE_SUSTANTIVA':
                es_ambiguo ← True
                razones_ambiguedad.append('Variante sustantiva - verificar constructo')
                prioridad ← max(prioridad, 'MEDIA')
            
            # 10.5 Criterio: Baja confianza general
            SI match.get('confianza') == 'BAJA':
                es_ambiguo ← True
                razones_ambiguedad.append('Baja confianza en clasificación automática')
            
            # 10.6 Generar caso de revisión si es ambiguo
            SI es_ambiguo:
                idx_a ← match['indice_a']
                idx_b ← match['indice_b']
                
                fila_a ← dataframe.loc[idx_a]
                fila_b ← dataframe.loc[idx_b]
                
                # Generar propuesta de decisión
                propuesta ← generar_propuesta_decision(match, fila_a, fila_b)
                
                caso ← {
                    'id_caso': generar_id_caso(),
                    'indice_a': idx_a,
                    'indice_b': idx_b,
                    'texto_a': fila_a['texto_item'],
                    'texto_b': fila_b['texto_item'],
                    'año_a': fila_a.get('año'),
                    'año_b': fila_b.get('año'),
                    'actor_a': fila_a.get('actor'),
                    'actor_b': fila_b.get('actor'),
                    'dimension_a': fila_a.get('dimension'),
                    'dimension_b': fila_b.get('dimension'),
                    'scores': {
                        'exacto': match.get('score_exacto', 0),
                        'fuzzy': match.get('score_fuzzy', 0),
                        'semantico': match.get('score_semantico', 0),
                        'hibrido': match.get('score_hibrido', 0)
                    },
                    'clasificacion_automatica': match.get('clasificacion'),
                    'razones_ambiguedad': razones_ambiguedad,
                    'prioridad': prioridad,
                    'propuesta_decision': propuesta,
                    'decision_revisor': None,
                    'comentario_revisor': None,
                    'estado': 'PENDIENTE',
                    'fecha_creacion': ahora(),
                    'fecha_resolucion': None
                }
                
                casos_revision.append(caso)
        
        # 10.7 Ordenar por prioridad
        orden_prioridad ← {'ALTA': 0, 'MEDIA': 1, 'BAJA': 2}
        casos_revision.sort(key=lambda x: orden_prioridad[x['prioridad']])
        
        # 10.8 Estadísticas
        estadisticas ← {
            'total_casos_revision': len(casos_revision),
            'prioridad_alta': sum(1 PARA c EN casos_revision SI c['prioridad'] == 'ALTA'),
            'prioridad_media': sum(1 PARA c EN casos_revision SI c['prioridad'] == 'MEDIA'),
            'prioridad_baja': sum(1 PARA c EN casos_revision SI c['prioridad'] == 'BAJA'),
            'tasa_ambiguedad': len(casos_revision) / len(matches_clasificados) SI matches_clasificados SINO 0
        }
        
        REGISTRAR_LOG('INFO', f"Detección de ambigüedades completada: {len(casos_revision)} casos para revisión")
        
        RETORNAR casos_revision, estadisticas
    FIN


FUNCIÓN generar_propuesta_decision(match, fila_a, fila_b):
    """
    Genera una propuesta de decisión basada en los scores y contexto.
    """
    score_hibrido ← match.get('score_hibrido', 0)
    clasificacion ← match.get('clasificacion')
    
    propuesta ← {
        'decision_propuesta': None,
        'justificacion': None,
        'confianza_propuesta': None
    }
    
    # Analizar contexto adicional
    mismo_actor ← fila_a.get('actor') == fila_b.get('actor')
    misma_dimension ← fila_a.get('dimension') == fila_b.get('dimension')
    
    contexto_positivo ← mismo_actor Y misma_dimension
    
    SI clasificacion == 'VARIANTE_MENOR':
        propuesta['decision_propuesta'] ← 'MISMO_ITEM'
        propuesta['justificacion'] = 'Variante menor con contexto consistente'
        propuesta['confianza_propuesta'] = 'ALTA'
    
    SINO SI clasificacion == 'VARIANTE_SUSTANTIVA':
        SI contexto_positivo:
            propuesta['decision_propuesta'] ← 'MISMO_ITEM'
            propuesta['justificacion'] = 'Variante sustantiva pero mismo contexto (actor/dimensión)'
            propuesta['confianza_propuesta'] = 'MEDIA'
        SINO:
            propuesta['decision_propuesta'] ← 'ITEM_DIFERENTE'
            propuesta['justificacion'] = 'Variante sustantiva con contexto diferente'
            propuesta['confianza_propuesta'] = 'MEDIA'
    
    SINO SI clasificacion == 'AMBIGUO':
        SI score_hibrido >= 0.80:
            propuesta['decision_propuesta'] ← 'MISMO_ITEM'
            propuesta['justificacion'] = 'Score alto pero con conflictos menores entre métodos'
            propuesta['confianza_propuesta'] = 'BAJA'
        SINO:
            propuesta['decision_propuesta'] ← 'REVISION_MANUAL'
            propuesta['justificacion'] = 'Requiere evaluación experta del constructo'
            propuesta['confianza_propuesta'] = 'BAJA'
    
    SINO:
        propuesta['decision_propuesta'] ← 'REVISION_MANUAL'
        propuesta['justificacion'] = 'Caso no clasificado automáticamente'
        propuesta['confianza_propuesta'] = 'BAJA'
    
    RETORNAR propuesta


# ESTRUCTURA DE LA INTERFAZ DE REVISIÓN (descripción)
INTERFAZ_REVISION ← {
    'panel_comparacion': {
        'texto_item_a': 'Visualización del texto del ítem A',
        'texto_item_b': 'Visualización del texto del ítem B',
        'highlight_diferencias': 'Resaltado de diferencias entre textos'
    },
    'panel_contexto': {
        'año_a': 'Año de aplicación ítem A',
        'año_b': 'Año de aplicación ítem B',
        'actor_a': 'Actor evaluado ítem A',
        'actor_b': 'Actor evaluado ítem B',
        'dimension_a': 'Dimensión ítem A',
        'dimension_b': 'Dimensión ítem B'
    },
    'panel_scores': {
        'score_exacto': 'Indicador de match exacto',
        'score_fuzzy': 'Score de similitud difusa',
        'score_semantico': 'Score de similitud semántica',
        'score_hibrido': 'Score combinado',
        'grafico_comparacion': 'Visualización de scores'
    },
    'panel_decision': {
        'propuesta_sistema': 'Decisión propuesta por el sistema',
        'opciones_decision': [
            'MISMO_ITEM - Equivalentes, misma familia',
            'VARIANTE_MENOR - Misma familia, cambio menor',
            'VARIANTE_SUSTANTIVA - Misma familia, cambio importante',
            'ITEM_DIFERENTE - Ítems distintos',
            'NO_SURE - No puedo determinar'
        ],
        'campo_comentario': 'Espacio para notas del revisor',
        'boton_guardar': 'Guardar decisión'
    },
    'panel_navegacion': {
        'lista_casos': 'Lista de casos pendientes ordenados por prioridad',
        'filtros': 'Filtros por prioridad, año, actor',
        'busqueda': 'Búsqueda de casos específicos'
    }
}
```

---

## 4.5 Resumen del Pipeline Completo

### Flujo de Ejecución

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PIPELINE DE HOMOLOGACIÓN IDPS                        │
└─────────────────────────────────────────────────────────────────────────┘

PASO 1: LECTURA        → DataFrame con datos brutos
       ↓
PASO 2: NORMALIZACIÓN  → Columnas estandarizadas
       ↓
PASO 3: LIMPIEZA       → Textos normalizados + hashes
       ↓
PASO 4: MATCH EXACTO   → Grupos idénticos identificados
       ↓
PASO 5: MATCH DIFUSO   → Variaciones menores detectadas
       ↓
PASO 6: MATCH SEMÁNTICO→ Equivalencias conceptuales encontradas
       ↓
PASO 7: CLUSTERING     → Familias de ítems formadas
       ↓
PASO 8: CLASIFICACIÓN  → Taxonomía aplicada
       ↓
PASO 9: CANÓNICOS      → Ítems representativos derivados
       ↓
PASO 10: REVISIÓN      → Casos ambiguos para revisión humana
```

### Tabla Resumen de Umbrales y Decisiones

| Score Híbrido | Diferencia Métodos | Clasificación | Requiere Revisión | Acción |
|---------------|-------------------|---------------|-------------------|--------|
| 1.0 | - | EXACTO | No | Auto-aceptar |
| ≥ 0.95 | < 0.15 | EQUIVALENTE_CANONICO | No | Auto-aceptar |
| 0.85 - 0.95 | < 0.15 | VARIANTE_MENOR | No | Auto-aceptar |
| 0.70 - 0.85 | < 0.15 | VARIANTE_SUSTANTIVA | Sí | Revisión recomendada |
| 0.75 - 0.85 | - | AMBIGUO | Sí | Revisión obligatoria |
| - | ≥ 0.15 | AMBIGUO | Sí | Revisión obligatoria |
| < 0.70 | - | DIFERENTE | No | Auto-rechazar |

### Métricas de Calidad Esperadas

| Métrica | Valor Esperado | Mínimo Aceptable |
|---------|----------------|------------------|
| Precisión | 0.95 | 0.90 |
| Recall | 0.92 | 0.85 |
| F1-Score | 0.93 | 0.87 |
| Tasa Ambigüedad | 0.05 | 0.10 |
| Tiempo por ítem | < 300ms | < 1000ms |

---

*Documento generado para el Sistema de Homologación Longitudinal IDPS - Chile*
*Versión 1.0 - Pipeline de 10 Pasos*
