# =============================================================================
# TABLAS INICIALES CCCE 2024 - VERSIÓN FINAL CON RADARES CORREGIDOS
# =============================================================================
# Grados: 4b, 6b, 2m (ya normalizados en la base de datos)
# Genera: Nacional, GSE (barras), GSE (radares alto/bajo),
#         Género (barras), Género (radares alto/bajo)
# Total: 4 indicadores × 3 grados × 7 gráficos = 84 gráficos
# =============================================================================

CONFIG <- list(
  archivo_datos = "Niveles_Estudiante_2024_cinfo.xlsx",
  archivo_matriz = "Matriz Master CCCE 2024_20250310.xlsx",
  # Los grados en 2024 ya vienen como 4b, 6b, 2m - no requieren mapeo
  colores_niveles = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
  colores_gse = c("#00495F", "#E84A2D", "#0C7891", "#616160", "#E41F1F"),
  colores_gen = c("#00495F", "#E84A2D")
)

# ---- PAQUETES ----
if (!require("pacman")) install.packages("pacman")
pacman::p_load(readxl, dplyr, tidyr, stringr, ggplot2, writexl, here, fmsb, scales)
setwd(here())

# ---- CARGAR DICCIONARIO ----
cat("=== CARGANDO DICCIONARIO ===\n")
matriz <- read_excel(CONFIG$archivo_matriz, sheet = 1)

mapeo_codigos <- matriz %>%
  filter(!is.na(Subdimension), !is.na(Dimension), !is.na(Indicador)) %>%
  mutate(
    sdim = paste(Indicador, Dimension, Subdimension, sep = "_"),
    codigo_col = toupper(Subdimension),
    label_sdim = str_trim(Subdimension_nombre)
  ) %>%
  select(codigo_col, sdim, label_sdim, Indicador) %>%
  distinct() %>%
  group_by(codigo_col) %>%
  slice(1) %>%
  ungroup()

cat("Códigos mapeados:", nrow(mapeo_codigos), "\n")

# ---- CARGAR DATOS ----
cat("\n=== CARGANDO DATOS ===\n")
datos <- read_excel(CONFIG$archivo_datos)
cat("Registros:", nrow(datos), "\n")

# Los grados ya están en formato correcto (4b, 6b, 2m)
datos$grado_norm <- as.character(datos$grado)

cat("Grados encontrados:")
print(table(datos$grado_norm, useNA = "ifany"))

grados_validos <- c("4b", "6b", "2m")
datos <- datos %>% filter(grado_norm %in% grados_validos)

cat("Registros después de filtrar:", nrow(datos), "\n")

# ---- TRANSFORMAR ----
GSE_ALU <- datos %>% select(idalumno, grado = grado_norm, rbd, gen, gse)
cols_demo <- c("idalumno", "grado", "grado_norm", "rbd", "gen", "gse")
cols_niveles <- setdiff(names(datos), cols_demo)

AUX_NIVELES <- datos %>%
  select(idalumno, all_of(cols_niveles)) %>%
  rename_with(toupper, all_of(cols_niveles)) %>%
  pivot_longer(cols = -idalumno, names_to = "codigo_col", values_to = "nivel") %>%
  filter(!is.na(nivel)) %>%
  # Extraer código de subdimensión (últimas 2 letras del nombre de columna)
  mutate(codigo_subdim = str_extract(codigo_col, "[A-Z]{2}$")) %>%
  left_join(mapeo_codigos, by = c("codigo_subdim" = "codigo_col")) %>%
  mutate(nivel = as.numeric(nivel)) %>%
  filter(nivel %in% c(1, 2, 3), !is.na(sdim))

NIVELES <- AUX_NIVELES %>%
  left_join(GSE_ALU, by = "idalumno", relationship = "many-to-many") %>%
  mutate(ind = Indicador) %>%
  select(-Indicador, -codigo_subdim)

cat("Registros finales:", nrow(NIVELES), "\n")

# ---- CREAR TABLAS ----
cat("\n=== CREANDO TABLAS ===\n")

TABLAS <- list()

for (grado in grados_validos) {
  cat("Grado", grado, "\n")

  NIVELES_GRADO <- NIVELES %>% filter(grado == !!grado)
  if (nrow(NIVELES_GRADO) == 0) next

  orden_sdim <- NIVELES_GRADO %>% distinct(sdim, label_sdim) %>% pull(label_sdim)

  # T1 - Nacional
  T1 <- NIVELES_GRADO %>%
    group_by(grado, sdim, label_sdim, nivel) %>%
    summarise(nalu = n(), .groups = "drop") %>%
    group_by(grado, sdim, label_sdim) %>%
    mutate(porc = round(100 * nalu / sum(nalu), 1)) %>%
    ungroup() %>%
    mutate(ind = substr(sdim, 1, 2)) %>%
    select(-nalu)

  # T2 - GSE con recodificación
  T2 <- NIVELES_GRADO %>%
    filter(!is.na(gse)) %>%
    mutate(
      gse_num = as.numeric(as.character(gse)),
      gse_etiq = case_when(
        gse_num == 1 ~ "Bajo",
        gse_num == 2 ~ "Medio bajo",
        gse_num == 3 ~ "Medio",
        gse_num == 4 ~ "Medio alto",
        gse_num == 5 ~ "Alto",
        TRUE ~ NA_character_
      ),
      gse_etiq = factor(gse_etiq, levels = c("Bajo", "Medio bajo", "Medio", "Medio alto", "Alto"))
    ) %>%
    filter(!is.na(gse_etiq)) %>%
    group_by(grado, sdim, label_sdim, gse = gse_etiq, nivel) %>%
    summarise(nalu = n(), .groups = "drop") %>%
    group_by(grado, sdim, label_sdim, gse) %>%
    mutate(porc = round(100 * nalu / sum(nalu), 1)) %>%
    ungroup() %>%
    mutate(ind = substr(sdim, 1, 2)) %>%
    select(-nalu)

  # T3 - Género con recodificación
  T3 <- NIVELES_GRADO %>%
    filter(!is.na(gen), gen %in% c(1, 2)) %>%
    mutate(gen_etiq = ifelse(gen == 1, "Hombre", "Mujer")) %>%
    group_by(grado, sdim, label_sdim, gen = gen_etiq, nivel) %>%
    summarise(nalu = n(), .groups = "drop") %>%
    group_by(grado, sdim, label_sdim, gen) %>%
    mutate(porc = round(100 * nalu / sum(nalu), 1)) %>%
    ungroup() %>%
    mutate(ind = substr(sdim, 1, 2)) %>%
    select(-nalu)

  cat("  T1:", nrow(T1), "| T2:", nrow(T2), "| T3:", nrow(T3), "\n")

  TABLAS[[grado]] <- list(T1 = T1, T2 = T2, T3 = T3, orden_sdim = orden_sdim)
}

# ---- FUNCIONES GRÁFICAS ----

tema_ccce <- function(es_facet = FALSE) {
  theme_minimal() +
    theme(
      axis.text.x = element_blank(),
      axis.text.y = element_text(size = ifelse(es_facet, 5, 5.5), color = "#707070"),
      axis.ticks.x = element_blank(),
      legend.title = element_blank(),
      legend.text = element_text(size = 4, color = "#707070"),
      legend.margin = margin(-5, 0, 0, 0, unit = "pt"),
      strip.text = element_text(size = 6, color = "#707070", face = "bold"),
      plot.title = element_blank(),
      legend.position = "bottom"
    )
}

crear_barras <- function(datos, orden_sdim, es_facet = FALSE, facet_var = NULL) {
  if (nrow(datos) == 0) return(NULL)

  datos <- datos %>%
    mutate(
      nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
      label_sdim = factor(str_wrap(label_sdim, 25), levels = str_wrap(orden_sdim, 25))
    )

  p <- ggplot(datos, aes(x = porc, y = label_sdim, fill = nivel)) +
    geom_bar(stat = "identity", position = "stack") +
    geom_text(aes(label = round(porc, 0)),
              position = position_stack(vjust = 0.5),
              color = "white", size = ifelse(es_facet, 2, 3), fontface = "bold") +
    labs(x = NULL, y = NULL, fill = NULL) +
    scale_fill_manual(values = CONFIG$colores_niveles) +
    scale_y_discrete(limits = rev) +
    tema_ccce(es_facet)

  if (es_facet && !is.null(facet_var)) {
    p <- p + facet_wrap(as.formula(paste("~", facet_var)), nrow = 1)
  }

  return(p)
}

crear_radar <- function(datos_orig, nivel_filtro, var_grupo, archivo_salida) {
  # Datos debe tener: sdim, label_sdim, porc, gse/gen, nivel

  # Convertir nivel_filtro texto a número
  nivel_num <- ifelse(nivel_filtro == "Alto", 3, 1)

  # 1. Filtrar por nivel (1=Bajo, 3=Alto)
  datos_nivel <- datos_orig %>%
    filter(nivel == nivel_num) %>%
    select(sdim, label_sdim, porc, all_of(var_grupo))

  if (nrow(datos_nivel) == 0) {
    cat("[sin datos nivel", nivel_filtro, "(=", nivel_num, ")] ")
    return(FALSE)
  }

  # 2. Pivotar para que cada sdim sea una columna
  datos_wide <- datos_nivel %>%
    pivot_wider(
      id_cols = all_of(var_grupo),
      names_from = sdim,
      values_from = porc
    )

  # 3. Verificar que tengamos suficientes columnas
  n_vars <- ncol(datos_wide) - 1  # Restar la columna de grupo (gse/gen)
  if (n_vars < 2) {
    cat("[pocas variables:", n_vars, "]")
    return(FALSE)
  }

  # 4. Crear filas min/max
  vars_cols <- setdiff(names(datos_wide), var_grupo)

  max_row <- datos_wide %>%
    select(all_of(vars_cols)) %>%
    summarise(across(everything(), ~ 100))
  max_row[[var_grupo]] <- "max"

  min_row <- datos_wide %>%
    select(all_of(vars_cols)) %>%
    summarise(across(everything(), ~ 0))
  min_row[[var_grupo]] <- "min"

  # 5. Combinar y preparar
  radar_data <- bind_rows(max_row, min_row, datos_wide) %>%
    select(-all_of(var_grupo))

  # 6. Renombrar columnas con label_sdim
  label_dict <- datos_nivel %>% distinct(sdim, label_sdim) %>% {setNames(.$label_sdim, .$sdim)}
  colnames(radar_data) <- recode(colnames(radar_data), !!!label_dict)

  # 7. Configurar colores y etiquetas
  if (var_grupo == "gse") {
    colores <- CONFIG$colores_gse
    etiquetas <- c("B", "MB", "M", "MA", "A")
  } else {
    colores <- CONFIG$colores_gen
    etiquetas <- c("Hombres", "Mujeres")
  }

  # 8. Generar radar
  png(archivo_salida, width = 11, height = 11, units = "cm", res = 300)
  par(mar = c(2.5, 1, 2.5, 1))

  radarchart(
    as.data.frame(radar_data),
    axistype = 1,
    pcol = colores,
    pfcol = alpha(colores, 0.0),
    plwd = 1,
    plty = 1,
    cglcol = "#707070",
    cglty = 1,
    cglwd = 0.4,
    axislabcol = "#707070",
    vlcex = 0.5,
    caxislabels = seq(0, 100, 25),
    calcex = 0.6
  )

  legend("bottomright",
         legend = etiquetas,
         bty = "n",
         pch = 8,
         col = colores,
         text.col = "black",
         cex = 0.5,
         pt.cex = 0.8)

  dev.off()
  return(TRUE)
}

# ---- GENERAR GRÁFICOS ----
cat("\n=== GENERANDO GRÁFICOS ===\n")

indicadores <- c("am", "cc", "hv", "pf")
contador <- 0

for (grado in names(TABLAS)) {
  cat("\n--- GRADO:", grado, "---\n")

  T1 <- TABLAS[[grado]]$T1
  T2 <- TABLAS[[grado]]$T2
  T3 <- TABLAS[[grado]]$T3
  orden_sdim <- TABLAS[[grado]]$orden_sdim

  for (ind in indicadores) {
    cat(toupper(ind), ":")

    # NACIONAL
    datos_nac <- T1 %>% filter(ind == !!ind)
    if (nrow(datos_nac) > 0) {
      g <- crear_barras(datos_nac, orden_sdim)
      if (!is.null(g)) {
        archivo <- paste0(ind, "_NAC_", grado, ".png")
        ggsave(archivo, g, width = 13, height = 6, units = "cm", dpi = 300)
        print(g)
        cat(" NAC")
        contador <- contador + 1
      }
    }

    # GSE
    datos_gse <- T2 %>% filter(ind == !!ind)
    if (nrow(datos_gse) > 0) {
      g <- crear_barras(datos_gse, orden_sdim, TRUE, "gse")
      if (!is.null(g)) {
        archivo <- paste0(ind, "_GSE1_", grado, ".png")
        ggsave(archivo, g, width = 13, height = 6, units = "cm", dpi = 300)
        print(g)
        cat(" GSE1")
        contador <- contador + 1
      }

      # RADAR GSE ALTO
      if (crear_radar(datos_gse, "Alto", "gse", paste0(ind, "_GSE_ALTO_", grado, ".png"))) {
        cat(" GSE_ALTO")
        contador <- contador + 1
      }

      # RADAR GSE BAJO
      if (crear_radar(datos_gse, "Bajo", "gse", paste0(ind, "_GSE_BAJO_", grado, ".png"))) {
        cat(" GSE_BAJO")
        contador <- contador + 1
      }
    }

    # GÉNERO
    datos_gen <- T3 %>% filter(ind == !!ind)
    if (nrow(datos_gen) > 0) {
      g <- crear_barras(datos_gen, orden_sdim, TRUE, "gen")
      if (!is.null(g)) {
        archivo <- paste0(ind, "_GEN1_", grado, ".png")
        ggsave(archivo, g, width = 13, height = 6, units = "cm", dpi = 300)
        print(g)
        cat(" GEN1")
        contador <- contador + 1
      }

      # RADAR GEN ALTO
      if (crear_radar(datos_gen, "Alto", "gen", paste0(ind, "_GEN_ALTO_", grado, ".png"))) {
        cat(" GEN_ALTO")
        contador <- contador + 1
      }

      # RADAR GEN BAJO
      if (crear_radar(datos_gen, "Bajo", "gen", paste0(ind, "_GEN_BAJO_", grado, ".png"))) {
        cat(" GEN_BAJO")
        contador <- contador + 1
      }
    }

    cat("\n")
  }
}

cat("\n=== TOTAL:", contador, "gráficos ===\n")

# ---- EXPORTAR ----
cat("\n=== EXPORTANDO EXCEL ===\n")
lista_exportar <- list()
for (grado in names(TABLAS)) {
  lista_exportar[[paste0("Nacional_", grado)]] <- TABLAS[[grado]]$T1
  lista_exportar[[paste0("GSE_", grado)]] <- TABLAS[[grado]]$T2
  lista_exportar[[paste0("Genero_", grado)]] <- TABLAS[[grado]]$T3
}
write_xlsx(lista_exportar, "Tablas_CCCE_2024.xlsx")
cat("Exportado:", length(lista_exportar), "hojas\n")
cat("\n=== COMPLETADO ===\n")
