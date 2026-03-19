# Sistema de Homologación Longitudinal IDPS

## Agencia de Calidad de la Educación - Chile

Sistema integral para la homologación, consulta, trazabilidad y expansión asistida del banco de ítems IDPS (Indicadores de Desarrollo Personal y Social).

---

## 📋 Descripción

Este sistema permite:

- **Homologar** ítems desde 2014 hasta 2026, identificando equivalencias longitudinales
- **Consultar** el banco de ítems con búsqueda avanzada y filtros
- **Expandir** el banco con generación asistida por IA
- **Clasificar** automáticamente nuevos ítems en la taxonomía oficial
- **Trazar** la historia completa de cada ítem (canónico → variante → ocurrencia)

---

## 🚀 Inicio Rápido

### Opción 1: Docker (Recomendado)

```bash
# 1. Clonar repositorio
git clone https://github.com/PedroMoreno1983/Agente_IDPS.git
cd Agente_IDPS

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus configuraciones

# 3. Iniciar servicios
docker-compose up -d

# 4. Acceder
# Frontend: http://localhost:3000
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

### Opción 2: Instalación Manual

#### Requisitos
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- DBeaver (recomendado)

#### 1. Base de Datos
```bash
# Crear base de datos en PostgreSQL
createdb idps_homologacion

# Ejecutar esquema operativo + banco canonico
psql -d idps_homologacion -f database/01_database_schema.sql
psql -d idps_homologacion -f database/02_canonical_bank.sql
```

#### 2. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Configurar
export DATABASE_URL="postgresql+asyncpg://postgres:password@localhost:5432/idps_homologacion"

# Ejecutar
uvicorn app.main:app --reload
```

#### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📁 Estructura del Proyecto

```
Agente_IDPS/
├── 📄 docs/                    # Documentación completa
│   ├── SISTEMA_HOMOLOGACION_IDPS_COMPLETO.md
│   ├── secciones_1_2.md
│   ├── secciones_3_5.md
│   ├── seccion_4_pipeline.md
│   ├── seccion_7_agente.md
│   └── secciones_8_9.md
│
├── 💾 database/                # Scripts SQL
│   ├── seccion3_modelo_datos_idps.sql
│   └── 01_database_schema.sql
│
├── 🔧 backend/                 # Python FastAPI
│   ├── app/
│   │   ├── main.py            # API principal
│   │   ├── models/            # Modelos SQLAlchemy
│   │   ├── schemas/           # Schemas Pydantic
│   │   ├── routers/           # Endpoints API
│   │   ├── services/          # Lógica de negocio
│   │   └── core/              # Configuración
│   ├── requirements.txt
│   └── Dockerfile
│
├── 🎨 frontend/                # React + TypeScript
│   ├── src/
│   │   ├── App.tsx            # App principal
│   │   ├── components/        # Componentes UI
│   │   ├── pages/             # Páginas
│   │   ├── hooks/             # Custom hooks
│   │   └── services/          # API client
│   ├── package.json
│   └── Dockerfile
│
├── 🔨 scripts/                 # Utilidades
│   ├── 02_etl_matching.py     # ETL y matching
│   └── importador_local.py    # Importación de Excel
│
├── 📊 datos_ejemplo/           # Datos de prueba
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 📖 Documentación

La documentación completa está en la carpeta `docs/`:

| Documento | Contenido |
|-----------|-----------|
| `SISTEMA_HOMOLOGACION_IDPS_COMPLETO.md` | Documento maestro con las 10 secciones |
| `sistema_homologacion_idps_secciones_1_2.md` | Definición operativa y supuestos críticos |
| `seccion3_y_5_sistema_idps.md` | Modelo de datos y sistema de IDs |
| `seccion_4_pipeline_homologacion_idps.md` | Pipeline de homologación ETL |
| `seccion_7_agente_generador_clasificador.md` | Agente IA generador-clasificador |
| `05_secciones_8_9_completas.md` | Implementación y plan de ejecución |

---

## 🔑 Características

### Homologación Longitudinal
- ✅ Matching exacto (hash MD5)
- ✅ Matching difuso (RapidFuzz)
- ✅ Matching semántico (Sentence-Transformers)
- ✅ Combinación híbrida de scores
- ✅ Taxonomía de decisión: EXACTO, EQUIVALENTE, VARIANTE_MENOR, VARIANTE_SUSTANTIVA, DIFERENTE, AMBIGUO
- ✅ Revisión humana para casos ambiguos

### Base de Datos
- ✅ 14 tablas con integridad referencial
- ✅ Trazabilidad: canónico → variante → ocurrencia → resultado
- ✅ Índices para búsqueda full-text y similaridad
- ✅ Funciones auxiliares PL/pgSQL

### Plataforma Web
- ✅ API RESTful completa (20+ endpoints)
- ✅ Autenticación JWT con roles
- ✅ Búsqueda avanzada con filtros
- ✅ Ficha de ítem con trazabilidad
- ✅ Comparador longitudinal
- ✅ Módulo de revisión humana

### Agente IA
- ✅ Generación de ítems con LLM
- ✅ Clasificación taxonómica automática
- ✅ Detección de redundancia
- ✅ Justificación explicable
- ✅ Estado borrador (revisión obligatoria)

---

## 🛠️ Stack Tecnológico

### Backend
- **Python 3.11+**
- **FastAPI** (async)
- **PostgreSQL 15+**
- **SQLAlchemy 2.0+**
- **Pydantic**
- **Pandas**
- **Sentence-Transformers**
- **RapidFuzz**

### Frontend
- **React 18+**
- **TypeScript**
- **TailwindCSS**
- **React Router**
- **React Query**
- **AG Grid**
- **Recharts**

### Infraestructura
- **Docker** + **Docker Compose**
- **PostgreSQL** con extensiones (pg_trgm, vector)

---

## 📊 Uso

### Importar Excel Local

```python
from scripts.importador_local import ImportadorIDPSLocal

importador = ImportadorIDPSLocal()

# Descubrir archivos
archivos = importador.descubrir_archivos("Matrices")

# Importar año específico
importador.importar_archivo("Matrices/2019/Resultados.xls", "2019")
```

### API REST

```bash
# Buscar ítems
curl "http://localhost:8000/api/v1/items/search?q=autorregulacion"

# Obtener ficha
curl "http://localhost:8000/api/v1/items/IDPS-CAN-2014-0001"

# Crear ítem
curl -X POST "http://localhost:8000/api/v1/items" \
  -H "Content-Type: application/json" \
  -d '{"texto": "...", "actor": "EST", "dimension": "..."}'
```

---

## 📝 Variables de Entorno

Copia `.env.example` a `.env` y configura:

```bash
# Base de Datos
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=idps_homologacion
DB_PORT=5432

# Backend
BACKEND_PORT=8000
SECRET_KEY=tu_clave_secreta
DEBUG=true

# Frontend
FRONTEND_PORT=3000
```

---

## Banco Canonico 2026

El repositorio ahora incluye una capa operacional y una capa canonica:

- `database/01_database_schema.sql`: backend operativo, resultados resumidos y propuestas generadas.
- `database/02_canonical_bank.sql`: banco longitudinal con `item_canonico`, `item_variante`, `item_ocurrencia`, `resultado_item`, `revision_homologacion`, `item_generado` y `propuesta_clasificacion`.
- `scripts/03_pipeline_banco_canonico.py`: pipeline real para leer `Matrices/`, normalizar columnas, homologar items y dejar salidas auditables en JSON.
- `GET /api/v1/bank/overview`, `GET /api/v1/bank/items`, `GET /api/v1/bank/items/{id_canonico}` y `GET /api/v1/bank/revisions`: API del banco canonico ya conectada a la plataforma.

Flujo recomendado:

```bash
docker-compose up -d

python scripts/03_pipeline_banco_canonico.py \
  --matrices ./Matrices \
  --output ./datos_ejemplo/banco_canonico
```

La interfaz React usa estas rutas para consultar el banco canonico, ver la ficha longitudinal del item y revisar homologaciones ambiguas.

---

## 🤝 Contribución

1. Fork el repositorio
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto es propiedad de la **Agencia de Calidad de la Educación de Chile**.

---

## 📞 Contacto

**Agencia de Calidad de la Educación**
- Sitio web: [www.agenciaeducacion.cl](https://www.agenciaeducacion.cl)

---

**Versión**: 1.0.0  
**Última actualización**: Marzo 2026
