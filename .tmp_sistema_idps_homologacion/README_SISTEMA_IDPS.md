# Sistema de Homologación Longitudinal IDPS
## Agencia de Calidad de la Educación - Chile

---

## 📋 Resumen Ejecutivo

Este repositorio contiene la **solución integral** para el Sistema de Homologación Longitudinal de Ítems IDPS (Indicadores de Desarrollo Personal y Social), diseñado para la Agencia de Calidad de la Educación de Chile.

### Objetivo Principal
Construir un sistema que permita:
- **Homologar** ítems desde 2014 hasta 2026
- **Consultar** el banco de ítems con trazabilidad completa
- **Expandir** el banco con generación asistida por IA
- **Clasificar** automáticamente nuevos ítems en la taxonomía oficial

---

## 📁 Estructura del Repositorio

```
/mnt/okcomputer/output/
│
├── 📄 DOCUMENTACIÓN COMPLETA
│   ├── SISTEMA_HOMOLOGACION_IDPS_COMPLETO.md    # Documento maestro (10 secciones)
│   ├── sistema_homologacion_idps_secciones_1_2.md  # Secciones 1-2: Definición y supuestos
│   ├── seccion3_y_5_sistema_idps.md               # Secciones 3 y 5: Modelo de datos e IDs
│   ├── seccion_4_pipeline_homologacion_idps.md    # Sección 4: Pipeline ETL
│   ├── seccion_7_agente_generador_clasificador.md # Sección 7: Agente IA
│   └── 05_secciones_8_9_completas.md              # Secciones 8-9: Implementación y plan
│
├── 💾 BASE DE DATOS
│   ├── 01_database_schema.sql             # Esquema alineado con el backend actual
│   └── seccion3_modelo_datos_idps.sql     # Esquema alternativo y referencia conceptual
│
├── 🔧 ETL Y MATCHING
│   └── 02_etl_matching.py                 # Módulo ETL + Matching (exacto, fuzzy, semántico)
│
├── 🖥️ BACKEND (FastAPI)
│   ├── backend/app/main.py                # Backend FastAPI actual
│   └── backend/app/services/agente_generador_clasificador.py
│
├── 🎨 FRONTEND (React + TypeScript)
│   └── 04_frontend_react.tsx              # Frontend completo
│
└── 🐳 ORQUESTACIÓN
    └── idps-homologacion/                 # Proyecto Docker completo
        ├── docker-compose.yml
        ├── backend/                       # Backend Dockerizado
        └── frontend/                      # Frontend Dockerizado
```

---

## 🚀 Inicio Rápido

### Opción 1: Usar Docker (Recomendado)

```bash
cd /mnt/okcomputer/output/idps-homologacion
docker-compose up -d
```

La carga inicial ahora considera:

- `database/01_database_schema.sql`
- `database/02_canonical_bank.sql`

Y la capa canónica queda expuesta en:

- `GET /api/v1/bank/overview`
- `GET /api/v1/bank/items`
- `GET /api/v1/bank/items/{id_canonico}`
- `GET /api/v1/bank/revisions`

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Documentación API**: http://localhost:8000/docs

### Opción 2: Instalación Manual

#### 1. Base de Datos PostgreSQL

```bash
# Crear base de datos
createdb idps_db

# Ejecutar esquema
psql -d idps_db -f /mnt/okcomputer/output/idps-homologacion/database/01_database_schema.sql
```

#### 2. Backend

```bash
cd /mnt/okcomputer/output/idps-homologacion/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Ejecutar backend
uvicorn app.main:app --reload
```

#### 3. Frontend

```bash
# Crear proyecto React
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom

# Copiar código
# (Copiar contenido de 04_frontend_react.tsx)

npm run dev
```

---

## 📊 Estadísticas del Sistema

| Métrica | Valor |
|---------|-------|
| **Líneas de código SQL** | ~1,600 |
| **Líneas de Python** | ~3,600 |
| **Líneas de TypeScript/React** | ~900 |
| **Líneas de documentación** | ~12,000 |
| **Total líneas** | ~18,000 |
| **Palabras documentación** | > 50,000 |
| **Tablas en BD** | 14 |
| **Endpoints API** | 20+ |
| **Componentes React** | 15+ |

---

## 📑 Contenido de las 10 Secciones

### SECCIÓN 1: Definición Operativa del Problema
- Resumen ejecutivo del problema
- Producto: qué se debe construir
- Datos: qué se tiene y sus problemas
- Entidades principales
- Procesos principales
- Gobernanza y riesgos

### SECCIÓN 2: Supuestos y Decisiones Críticas
- Criterio de equivalencia entre ítems
- Cambios menores vs sustantivos
- Prioridad entre reglas de matching
- Gobernanza de revisión humana
- Umbrales psicométricos
- Criterios de clasificación taxonómica

### SECCIÓN 3: Modelo de Datos
- 12 tablas principales diseñadas
- Relaciones y constraints
- Índices optimizados
- Estrategia de normalización
- Auditoría y trazabilidad

### SECCIÓN 4: Pipeline de Homologación
- 10 pasos del pipeline ETL
- Matching exacto, difuso y semántico
- Taxonomía de decisión
- Métricas y umbrales
- Pseudocódigo completo

### SECCIÓN 5: Sistema de IDs y Versionamiento
- Formato de IDs canónicos
- IDs de variantes y ocurrencias
- Versionamiento inmutable
- Trazabilidad completa

### SECCIÓN 6: Plataforma Funcional
- Arquitectura funcional
- Stack tecnológico
- Backend FastAPI
- Frontend React
- Docker Compose

### SECCIÓN 7: Agente Generador-Clasificador
- Flujo del agente (12 pasos)
- Prompt interno del LLM
- Validaciones automáticas
- Detección de redundancia
- Código Python completo

### SECCIÓN 8: Artefactos de Implementación
- Esquema SQL ejecutable
- Pseudocódigo ETL
- Reglas de matching
- Backend completo
- Frontend completo
- Ejemplos JSON

### SECCIÓN 9: Plan de Ejecución por Fases
- Fase 0: Inventario (2-3 semanas)
- Fase 1: Homologación MVP (4-6 semanas)
- Fase 2: Banco consultable (3-4 semanas)
- Fase 3: Resultados longitudinales (3-4 semanas)
- Fase 4: Agente generador (4-5 semanas)
- Fase 5: Mejora continua

### SECCIÓN 10: MVP Ejecutable
- Estructura de proyecto
- Código funcional
- Datos de ejemplo
- Instrucciones de uso

---

## 🔑 Características Clave

### Homologación
✅ Matching exacto (hash)  
✅ Matching difuso (RapidFuzz)  
✅ Matching semántico (embeddings)  
✅ Combinación híbrida de scores  
✅ Clasificación automática de decisiones  
✅ Revisión humana para casos ambiguos  

### Base de Datos
✅ 14 tablas normalizadas  
✅ Trazabilidad completa (canónico → variante → ocurrencia)  
✅ Índices para búsqueda full-text y similaridad  
✅ Funciones auxiliares PL/pgSQL  
✅ Datos iniciales de actores, dimensiones, subdimensiones  

### Plataforma
✅ API RESTful completa  
✅ Autenticación JWT  
✅ Búsqueda avanzada con filtros  
✅ Paginación  
✅ Exportación de datos  
✅ Interfaz de revisión humana  

### Agente IA
✅ Generación de ítems  
✅ Clasificación taxonómica automática  
✅ Detección de redundancia  
✅ Justificación explicable  
✅ Nivel de confianza  
✅ Estado borrador (revisión obligatoria)  

---

## 📖 Uso del Sistema

### Importar Archivos Excel

```python
from etl_matching import ExcelReader, MatchingOrchestrator

# Leer Excel heterogéneo
reader = ExcelReader()
df = reader.read_excel("items_2019.xlsx")

# Ejecutar pipeline de homologación
orchestrator = MatchingOrchestrator()
results = orchestrator.process_batch(items_nuevos, items_existentes)
```

### Consultar Ítems

```bash
# Buscar ítems
curl "http://localhost:8000/api/v1/items/search?q=autorregulacion&actor=EST"

# Obtener ficha de ítem
curl "http://localhost:8000/api/v1/items/IDPS-CAN-2014-0001"
```

### Generar Nuevos Ítems

```python
from agente_generador_clasificador import AgenteGeneradorClasificador

agente = AgenteGeneradorClasificador(db, llm_client, vector_store)

solicitud = SolicitudGeneracion(
    actor_solicitado="EST",
    dimension_solicitada="Autorregulación",
    proposito="Medir gestión emocional",
    restricciones="Nivel primaria, 4 opciones"
)

propuestas = await agente.generar_items(solicitud)
```

---

## 🔧 Stack Tecnológico

### Backend
- **Python 3.11+**
- **FastAPI** (async)
- **PostgreSQL 15+**
- **SQLAlchemy 2.0+** (async)
- **Pydantic** (validación)
- **Pandas** (procesamiento)
- **Sentence-Transformers** (embeddings)
- **RapidFuzz** (matching difuso)

### Frontend
- **React 18+**
- **TypeScript**
- **TailwindCSS**
- **React Router**
- **React Query**
- **AG Grid** (tablas avanzadas)
- **Recharts** (gráficos)

### Infraestructura
- **Docker** + **Docker Compose**
- **Nginx** (reverse proxy)
- **PostgreSQL** con extensiones (pg_trgm, vector)

---

## 📚 Documentación Adicional

- **Documento completo**: `SISTEMA_HOMOLOGACION_IDPS_COMPLETO.md`
- **Arquitectura funcional**: `idps-homologacion/docs/ARQUITECTURA_FUNCIONAL.md`
- **Índice de archivos**: `00_INDICE_ARCHIVOS.md`

---

## ⚠️ Notas Importantes

1. **Revisión humana obligatoria**: Los ítems generados por el agente NO ingresan automáticamente al banco oficial. Deben pasar por revisión humana.

2. **Ambigüedades**: Los casos ambiguos en la homologación se envían automáticamente a revisión humana.

3. **Trazabilidad**: Todo cambio queda registrado en el historial de versiones.

4. **Escalabilidad**: El sistema está diseñado para soportar más de una década de datos.

---

## 📞 Contacto y Soporte

**Agencia de Calidad de la Educación - Chile**

Para dudas o soporte técnico, contactar al equipo de desarrollo.

---

**Versión**: 1.0.0  
**Fecha**: Marzo 2026  
**Estado**: MVP Funcional
