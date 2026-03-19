"""
Importador de Excel IDPS para archivos locales.

Uso:
    python scripts/importador_local.py --ruta "/ruta/a/tus/Matrices" --anio 2019
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd
import psycopg2


DEFAULT_CONFIG = {
    "db_host": "localhost",
    "db_port": 5432,
    "db_name": "idps_homologacion",
    "db_user": "postgres",
    "db_password": "idps2024",
}


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class ImportadorIDPSLocal:
    """
    Importador que trabaja directamente con archivos Excel locales
    sin necesidad de subirlos a ningun servidor externo.
    """

    def __init__(self, config: Optional[Dict] = None):
        self.config = config or DEFAULT_CONFIG
        self.conn = None
        self.cursor = None
        self._conectar_db()

    def _conectar_db(self):
        """Establece conexion con PostgreSQL local."""
        try:
            self.conn = psycopg2.connect(
                host=self.config["db_host"],
                port=self.config["db_port"],
                database=self.config["db_name"],
                user=self.config["db_user"],
                password=self.config["db_password"],
            )
            self.cursor = self.conn.cursor()
            logger.info("Conectado a PostgreSQL: %s", self.config["db_name"])
        except Exception as exc:
            logger.error("Error conectando a PostgreSQL: %s", exc)
            raise

    def _clasificar_archivo(self, archivo: Path) -> str:
        """Clasifica el archivo segun su nombre."""
        nombre = archivo.stem.lower()
        if "resultado" in nombre:
            return "resultados"
        if "matriz" in nombre:
            return "matriz"
        return "otro"

    def _es_hoja_tabular(self, df: pd.DataFrame) -> bool:
        """Heuristica simple para detectar hojas con datos importables."""
        if df.empty:
            return False

        columnas = [
            str(col).strip()
            for col in df.columns
            if col is not None and not str(col).startswith("Unnamed:")
        ]
        if len(columnas) >= 3:
            return True

        palabras_clave = (
            "base",
            "grado",
            "actor",
            "indicador",
            "dimension",
            "subdimension",
            "pregunta",
            "item",
            "enunciado",
            "alternativa",
            "np",
        )
        return any(
            any(palabra in columna.lower() for palabra in palabras_clave)
            for columna in columnas
        )

    def detectar_hojas_relevantes(self, ruta_excel: str) -> List[str]:
        """Detecta hojas que parecen contener datos tabulares."""
        excel_file = pd.ExcelFile(ruta_excel)
        hojas_relevantes: List[str] = []

        for hoja in excel_file.sheet_names:
            try:
                muestra = pd.read_excel(ruta_excel, sheet_name=hoja, nrows=5)
            except Exception as exc:
                logger.warning("No se pudo analizar la hoja '%s': %s", hoja, exc)
                continue

            if self._es_hoja_tabular(muestra):
                hojas_relevantes.append(hoja)

        if not hojas_relevantes and excel_file.sheet_names:
            hojas_relevantes = [excel_file.sheet_names[0]]

        return hojas_relevantes

    def descubrir_archivos(self, ruta_base: str) -> List[Dict]:
        """
        Descubre todos los archivos Excel en la ruta base.

        Estructura esperada:
            /ruta/base/
                2015/
                    Matriz_docentes.xlsx
                    Matriz_estudiantes.xlsx
                    Matriz_padres.xlsx
                    Resultados.xlsx
                2024/
                    Matriz.xlsx
                    Resultados_2m.xlsx
                    Resultados_4b.xlsx
                    Resultados_6b.xlsx
                ...
        """
        ruta = Path(ruta_base)
        archivos: List[Dict] = []

        if not ruta.exists():
            logger.error("La ruta no existe: %s", ruta)
            return archivos

        for anio_dir in ruta.iterdir():
            if not anio_dir.is_dir():
                continue

            anio = anio_dir.name
            for patron in ("*.xlsx", "*.xls"):
                for excel in anio_dir.glob(patron):
                    archivos.append(
                        {
                            "anio": anio,
                            "ruta": str(excel),
                            "nombre": excel.name,
                            "tamano": excel.stat().st_size,
                            "tipo_archivo": self._clasificar_archivo(excel),
                        }
                    )

        archivos.sort(key=lambda x: (x["anio"], x["nombre"]))

        logger.info("Encontrados %s archivos Excel", len(archivos))
        for arch in archivos:
            logger.info(
                "   %s: %s [%s] (%.1f KB)",
                arch["anio"],
                arch["nombre"],
                arch["tipo_archivo"],
                arch["tamano"] / 1024,
            )

        return archivos

    def analizar_estructura(self, ruta_excel: str) -> Dict:
        """
        Analiza la estructura de un archivo Excel para entender sus columnas.
        """
        logger.info("Analizando: %s", ruta_excel)

        try:
            hojas = self.detectar_hojas_relevantes(ruta_excel)
            info_hojas: Dict[str, Dict] = {}

            for hoja in hojas[:3]:
                df = pd.read_excel(ruta_excel, sheet_name=hoja, nrows=5)
                info_hojas[hoja] = {
                    "columnas": list(df.columns),
                    "num_columnas": len(df.columns),
                    "filas_muestra": df.head(3).to_dict("records"),
                    "tipos_datos": df.dtypes.astype(str).to_dict(),
                }

                logger.info(
                    "   Hoja '%s' con %s columnas",
                    hoja,
                    info_hojas[hoja]["num_columnas"],
                )
                for col in info_hojas[hoja]["columnas"]:
                    logger.info("     - %s", col)

            return {
                "tipo_archivo": self._clasificar_archivo(Path(ruta_excel)),
                "hojas_detectadas": hojas,
                "hojas_analizadas": info_hojas,
            }

        except Exception as exc:
            logger.error("Error analizando archivo: %s", exc)
            return {}

    def normalizar_nombre_columna(self, nombre: str) -> str:
        """Normaliza nombres de columnas heterogeneas a nombres estandar."""
        nombre_lower = str(nombre).lower().strip()

        mapeos = {
            "pregunta": "texto_item",
            "item": "texto_item",
            "enunciado": "texto_item",
            "texto": "texto_item",
            "texto_pregunta": "texto_item",
            "contenido": "texto_item",
            "actor": "actor",
            "tipo_actor": "actor",
            "perspectiva": "actor",
            "evaluador": "actor",
            "dimension": "dimension",
            "dimensión": "dimension",
            "eje": "dimension",
            "area": "dimension",
            "subdimension": "subdimension",
            "subdimensión": "subdimension",
            "sub_dimension": "subdimension",
            "componente": "subdimension",
            "codigo": "codigo_item",
            "código": "codigo_item",
            "id": "codigo_item",
            "id_item": "codigo_item",
            "numero": "codigo_item",
            "nro": "codigo_item",
            "anio": "anio",
            "año": "anio",
            "year": "anio",
            "formulario": "formulario",
            "tipo_prueba": "formulario",
            "instrumento": "formulario",
        }

        return mapeos.get(nombre_lower, nombre_lower)

    def crear_tabla_raw_si_no_existe(self):
        """Crea tabla temporal para importacion raw si no existe."""
        query = """
            CREATE TABLE IF NOT EXISTS importaciones_raw (
                id SERIAL PRIMARY KEY,
                "año" INTEGER NOT NULL,
                tipo_archivo VARCHAR(50),
                hoja_fuente VARCHAR(255),
                datos_json JSONB NOT NULL,
                columnas_mapeadas JSONB,
                archivo_fuente VARCHAR(255),
                fecha_importacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                procesado BOOLEAN DEFAULT FALSE
            );

            ALTER TABLE importaciones_raw
            ADD COLUMN IF NOT EXISTS "año" INTEGER;

            ALTER TABLE importaciones_raw
            ADD COLUMN IF NOT EXISTS tipo_archivo VARCHAR(50);

            ALTER TABLE importaciones_raw
            ADD COLUMN IF NOT EXISTS hoja_fuente VARCHAR(255);

            CREATE INDEX IF NOT EXISTS idx_importaciones_raw_anio
            ON importaciones_raw("año");

            CREATE INDEX IF NOT EXISTS idx_importaciones_raw_procesado
            ON importaciones_raw(procesado);

            CREATE INDEX IF NOT EXISTS idx_importaciones_raw_tipo_archivo
            ON importaciones_raw(tipo_archivo);
        """

        self.cursor.execute(query)
        self.conn.commit()
        logger.info("Tabla importaciones_raw verificada")

    def importar_archivo(
        self,
        ruta_excel: str,
        anio: str,
        mapeo_columnas: Optional[Dict] = None,
    ) -> int:
        """
        Importa un archivo Excel a la tabla raw.

        Args:
            ruta_excel: Ruta al archivo Excel.
            anio: Año al que corresponden los datos.
            mapeo_columnas: Diccionario opcional de mapeo de columnas.

        Returns:
            Numero de filas importadas.
        """
        logger.info("Importando %s: %s", anio, ruta_excel)

        try:
            archivo = Path(ruta_excel)
            tipo_archivo = self._clasificar_archivo(archivo)
            hojas = self.detectar_hojas_relevantes(ruta_excel)

            logger.info("   Tipo detectado: %s", tipo_archivo)
            logger.info("   Hojas seleccionadas: %s", ", ".join(hojas))

            filas_insertadas = 0
            for hoja in hojas:
                df = pd.read_excel(ruta_excel, sheet_name=hoja)
                if df.empty:
                    logger.warning("Hoja vacia omitida: %s", hoja)
                    continue

                logger.info("   Hoja '%s': %s filas", hoja, len(df))

                columnas_normalizadas: Dict[str, str] = {}
                for col in df.columns:
                    col_norm = self.normalizar_nombre_columna(col)
                    columnas_normalizadas[str(col)] = col_norm

                if mapeo_columnas:
                    columnas_normalizadas.update(mapeo_columnas)

                for orig, norm in columnas_normalizadas.items():
                    if orig.lower() != norm:
                        logger.info("     '%s' -> '%s'", orig, norm)

                for _, row in df.iterrows():
                    datos = {}
                    for col in df.columns:
                        val = row[col]
                        datos[str(col)] = None if pd.isna(val) else str(val)

                    query = """
                        INSERT INTO importaciones_raw
                        ("año", tipo_archivo, hoja_fuente, datos_json, columnas_mapeadas, archivo_fuente)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """

                    self.cursor.execute(
                        query,
                        (
                            int(anio),
                            tipo_archivo,
                            hoja,
                            json.dumps(datos),
                            json.dumps(columnas_normalizadas),
                            archivo.name,
                        ),
                    )

                    filas_insertadas += 1
                    if filas_insertadas % 100 == 0:
                        logger.info("   Progreso acumulado: %s filas", filas_insertadas)

            self.conn.commit()
            logger.info(
                "Importadas %s filas de %s desde %s hoja(s)",
                filas_insertadas,
                "año",
                len(hojas),
            )
            return filas_insertadas

        except Exception as exc:
            self.conn.rollback()
            logger.error("Error importando archivo: %s", exc)
            raise

    def obtener_estadisticas(self) -> Dict:
        """Obtiene estadisticas de importaciones."""
        query = """
            SELECT
                "año" as anio,
                COUNT(*) as total_filas,
                COUNT(DISTINCT archivo_fuente) as archivos,
                MIN(fecha_importacion) as primera_importacion,
                MAX(fecha_importacion) as ultima_importacion
            FROM importaciones_raw
            GROUP BY "año"
            ORDER BY "año"
        """

        self.cursor.execute(query)
        resultados = self.cursor.fetchall()

        stats = {}
        for row in resultados:
            stats[row[0]] = {
                "total_filas": row[1],
                "archivos": row[2],
                "primera_importacion": row[3],
                "ultima_importacion": row[4],
            }

        return stats

    def cerrar(self):
        """Cierra conexion a base de datos."""
        if self.cursor:
            self.cursor.close()
        if self.conn:
            self.conn.close()
        logger.info("Conexion cerrada")


def main():
    parser = argparse.ArgumentParser(
        description="Importador de Excel IDPS - Trabaja con archivos locales"
    )
    parser.add_argument(
        "--ruta",
        type=str,
        required=True,
        help="Ruta base donde estan los Excel (ej: /home/usuario/IDPS/Matrices)",
    )
    parser.add_argument(
        "--anio",
        "--año",
        dest="anio",
        type=str,
        help="Importar solo un año especifico",
    )
    parser.add_argument(
        "--analizar",
        action="store_true",
        help="Solo analizar estructura, no importar",
    )
    parser.add_argument("--db-host", default="localhost", help="Host de PostgreSQL")
    parser.add_argument(
        "--db-name",
        default="idps_homologacion",
        help="Nombre de base de datos",
    )
    parser.add_argument("--db-user", default="postgres", help="Usuario de PostgreSQL")
    parser.add_argument(
        "--db-password",
        default="idps2024",
        help="Password de PostgreSQL",
    )

    args = parser.parse_args()

    config = {
        "db_host": args.db_host,
        "db_port": 5432,
        "db_name": args.db_name,
        "db_user": args.db_user,
        "db_password": args.db_password,
    }

    importador = ImportadorIDPSLocal(config)

    try:
        importador.crear_tabla_raw_si_no_existe()
        archivos = importador.descubrir_archivos(args.ruta)

        if not archivos:
            logger.warning("No se encontraron archivos Excel")
            return

        if args.analizar:
            logger.info("Modo analisis (sin importar)")
            for arch in archivos[:3]:
                importador.analizar_estructura(arch["ruta"])
                print("-" * 50)
            return

        if args.anio:
            archivos_filtrados = [a for a in archivos if a["anio"] == args.anio]
            if not archivos_filtrados:
                logger.error("No se encontro archivo para anio %s", args.anio)
                return

            for arch in archivos_filtrados:
                importador.importar_archivo(arch["ruta"], arch["anio"])
        else:
            for arch in archivos:
                importador.importar_archivo(arch["ruta"], arch["anio"])

        stats = importador.obtener_estadisticas()
        logger.info("ESTADISTICAS DE IMPORTACION:")
        for anio, info in sorted(stats.items()):
            logger.info(
                "   %s: %s filas (%s archivos)",
                anio,
                info["total_filas"],
                info["archivos"],
            )

        logger.info("Importacion completada")

    except KeyboardInterrupt:
        logger.info("Importacion interrumpida por usuario")
    except Exception as exc:
        logger.error("Error: %s", exc)
        raise
    finally:
        importador.cerrar()


if __name__ == "__main__":
    main()
