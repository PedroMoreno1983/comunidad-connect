
# ---- Configuración inicial ----

## ---- Definición de paquetes ----
required_packages <- c("readxl", "dplyr", "summarytools", "haven", "tidyverse", "data.table", 
                       "lubridate", "stringr", "writexl", "shiny", "knitr", "rmarkdown", 
                       "chilemapas", "ggplot2", "sf", "ggrepel", "ggthemes", "gridExtra", 
                       "ggalluvial", "networkD3", "patchwork", "gtable", "here" , "fmsb")
missing_packages <- required_packages[!required_packages %in% installed.packages()]
if (length(missing_packages)) install.packages(missing_packages)
lapply(required_packages, library, character.only = TRUE)

ruta_base <- here()
print(ruta_base)
setwd(ruta_base)
cat("Directorio de trabajo configurado dinámicamente: ", ruta_base, "\n")

#DATOS
NIVELES_ALU  <- read_delim("DATOS/Niveles_Estudiante_2024_cinfo.csv", 
                                                        delim = ";", escape_double = FALSE, trim_ws = TRUE)
GSE_ALU <- NIVELES_ALU %>%
  select(idalumno, grado, rbd, gen, gse)


#Colores agencia
paleta_agencia <- c("#0f69b4",  "#eb3c46","#6bccd6","#e4db89", "#004677", "#007096",
                    "#d3def2","#e94860","#fad8e1","#f2e6d9",
                    "#07272d","#154c20","#51293c","#613b75","#f3d03e",
                    "#f1c40f","#d4810f","#0e4b69","#4d5665" ,"#9f3ea8",
                    "#2d7fb4","#c7424e","#006a82","#e84860","#043ba2","#cee4ef",
                    "#00495F", "#E84A2D", "#E84861", "#BFBFBF", "#0C7891")



## ---- Creación de listas ----
TABLAS <- list()
NACIONAL <- list()
GENERO <- list()
GSE <- list()


TABLAS[["NACIONAL"]] <- NACIONAL
TABLAS[["GSE"]] <- GSE
TABLAS[["GENERO"]] <- GENERO


rm(GENERO,GSE, NACIONAL)


#---- Construyendo df base

AUX_NIVELES_ALU <- NIVELES_ALU %>%
  select(-rbd, -gen, -gse) %>%
  rename_with(~ str_remove(., "^niv_ESTU_")) %>%  
  rename_with(~ tolower(.))  %>%
  pivot_longer(
    cols = -c(idalumno, grado),  # Todas las variables excepto idalumno y grado
    names_to = "sdim",  # Nombre de la nueva variable
    values_to = "nivel"  # Nombre de la columna con los valores
  )



NIVELES <- AUX_NIVELES_ALU %>%
  left_join(GSE_ALU, by = c("idalumno", "grado")) %>%
  mutate(label_sdim = case_when(
    sdim == "am_aa_aa" ~ "Autovaloración académica",
    sdim == "am_aa_pa" ~ "Promoción de la autoestima académica",
    sdim == "am_me_id" ~ "Interés y disposición al aprendizaje",
    sdim == "am_me_pm" ~ "Promoción de la motivación del aprendizaje",
    sdim == "cc_ar_cs" ~ "Cohesión social entre estudiantes",
    sdim == "cc_ar_ab" ~ "Apoyo y buen trato de las y los docentes",
    sdim == "cc_ao_ao" ~ "Ambiente organizado para el aprendizaje",
    sdim == "cc_ao_pr" ~ "Promoción de mecanismos constructivos de resolución de 
                          conflictos",
    sdim == "cc_as_mp" ~ "Mecanismos de prevención y acción ante la violencia",
    sdim == "cc_as_tv" ~ "Testimonios de violencia personal",
    sdim == "pf_pa_pe" ~ "Participación de la o el estudiante",
    sdim == "pf_pa_pp" ~ "Promoción de la participación",
    sdim == "pf_vd_ep" ~ "Expresión de opiniones",
    sdim == "pf_vd_rd" ~ "Representación democrática",
    sdim == "pf_vd_pd" ~ "Promoción de la deliberación democrática",
    sdim == "pf_sp_ie" ~ "Identificación con el establecimiento",
    sdim == "hv_va_af" ~ "Actitud frente a la actividad física",
    sdim == "hv_va_pv" ~ "Promoción de la vida activa",
    sdim == "hv_ha_al" ~ "Actitud frente a la alimentación",
    sdim == "hv_ha_ph" ~ "Promoción de hábitos alimenticios",
    sdim == "hv_ac_ac" ~ "Actitud de autocuidado",
    sdim == "hv_ac_pc" ~ "Promoción de conductas de autocuidado",
    TRUE ~ NA_character_  # Para manejar otros valores no definidos
  ))

  
NIVELES4B <- NIVELES %>%
  filter(grado=="4b")

rm(GSE_ALU, NIVELES_ALU, AUX_NIVELES_ALU)


orden_sdim <- c(
  "Autovaloración académica",
  "Promoción de la autoestima académica",
  "Interés y disposición al aprendizaje",
  "Promoción de la motivación del aprendizaje",
  "Cohesión social entre estudiantes",
  "Apoyo y buen trato de las y los docentes",
  "Ambiente organizado para el aprendizaje",
  "Promoción de mecanismos constructivos de resolución de conflictos",
  "Mecanismos de prevención y acción ante la violencia",
  "Testimonios de violencia personal",
  "Participación de la o el estudiante",
  "Promoción de la participación",
  "Expresión de opiniones",
  "Representación democrática",
  "Promoción de la deliberación democrática",
  "Identificación con el establecimiento",
  "Actitud frente a la actividad física",
  "Promoción de la vida activa",
  "Actitud frente a la alimentación",
  "Promoción de hábitos alimenticios",
  "Actitud de autocuidado",
  "Promoción de conductas de autocuidado"
)


# ---- Tablas ----

T1 <- NIVELES %>%
  filter(!is.na(nivel)) %>%  # Filtrar datos válidos
  group_by(grado, sdim, label_sdim, nivel) %>%
  summarise(nalu = n(), .groups = "drop") %>%
  group_by(grado, sdim, label_sdim) %>%
  mutate(porc = round(100 * nalu / sum(nalu), 1)) %>%
  ungroup() %>%
  mutate(ind = substr(as.character(sdim), 1, 2)) %>%
  select(-nalu)  

T2 <- NIVELES %>%
  filter(!is.na(nivel) & !is.na(gse)) %>%  # Filtrar datos válidos
  group_by(grado, sdim, label_sdim, gse, nivel) %>%
  summarise(nalu = n(), .groups = "drop") %>%
  group_by(grado, sdim, label_sdim, gse) %>%
  mutate(porc= round(100 * nalu / sum(nalu), 1)) %>%
  ungroup() %>%
  mutate(ind = substr(as.character(sdim), 1, 2)) %>%
  select(-nalu)

T3 <- NIVELES %>%
  filter(!is.na(nivel) & !is.na(gen)) %>%  # Filtrar datos válidos
  group_by(grado, sdim, label_sdim, gen, nivel) %>%
  summarise(nalu = n(), .groups = "drop") %>%
  group_by(grado, sdim, label_sdim, gen) %>%
  mutate(porc= round(100 * nalu / sum(nalu), 1)) %>%
  ungroup() %>%
  mutate(ind = substr(as.character(sdim), 1, 2)) %>%
  select(-nalu)


#---- Gráficos ----

##---- Clima de convivencia----

##---- Nacional----
AUX <- T1 %>%
  filter(grado == "4b" & ind == "cc") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +
  geom_text(aes(label = round(porc, 0)), 
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +
  labs(x = NULL, y = NULL, fill = NULL) +
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),
    axis.text.y = element_text(size = 5.5, color = "#707070"),
    axis.ticks.x = element_blank(),
    legend.title = element_blank(),
    legend.text = element_text(size = 4, color = "#707070"),
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),
    plot.title = element_blank(),
    legend.position = "bottom"
  )

ggsave("CC_NAC_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")
plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="4b" & ind == "cc" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("CC_GSE1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)

#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GSE_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()



#Ahora consideramos el nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GSE_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="4b" & ind == "cc" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("CC_GEN1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GEN_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GEN_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Autoestima y motivación escolar----

###---- Nacional ----
AUX <- T1 %>%
  filter(grado=="4b" & ind == "am") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("AM_NAC_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)

###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="4b" & ind == "am" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("AM_GSE1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("AM_GSE_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GSE_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="4b" & ind == "am" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("AM_GEN1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GEN_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GEN_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Hábitos de vida saludable----

###---- Nacional ----
AUX <- T1 %>%
  filter(ind == "hv" & grado=="4b") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("HV_NAC_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="4b" & ind == "hv" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("HV_GSE1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("HV_GSE_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GSE_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="4b" & ind == "hv" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("HV_GEN1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GEN_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GEN_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Participación y formación ciudadana----

###---- Nacional ----
AUX <- T1 %>%
  filter(grado=="4b" & ind == "pf") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("PF_NAC_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="4b" & ind == "pf" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("PF_GSE1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("PF_GSE_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GSE_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="4b" & ind == "pf" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("PF_GEN1_4b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GEN_ALTO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GEN_BAJO_4b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()

#---- Gráficos 6b ----

##---- Clima de convivencia----

##---- Nacional----
AUX <- T1 %>%
  filter(grado=="6b" & ind == "cc") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("CC_NAC_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="6b" & ind == "cc" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("CC_GSE1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)

#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GSE_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()



#Ahora consideramos el nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GSE_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="6b" & ind == "cc" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("CC_GEN1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GEN_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GEN_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Autoestima y motivación escolar----

###---- Nacional ----
AUX <- T1 %>%
  filter(grado=="6b" & ind == "am") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("AM_NAC_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)

###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="6b" & ind == "am" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("AM_GSE1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("AM_GSE_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GSE_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="6b" & ind == "am" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("AM_GEN1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GEN_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GEN_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Hábitos de vida saludable----

###---- Nacional ----
AUX <- T1 %>%
  filter(ind == "hv" & grado=="6b") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("HV_NAC_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="6b" & ind == "hv" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("HV_GSE1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("HV_GSE_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GSE_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="6b" & ind == "hv" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("HV_GEN1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GEN_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GEN_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Participación y formación ciudadana----

###---- Nacional ----
AUX <- T1 %>%
  filter(grado=="6b" & ind == "pf") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("PF_NAC_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="6b" & ind == "pf" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("PF_GSE1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("PF_GSE_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GSE_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="6b" & ind == "pf" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("PF_GEN1_6b.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GEN_ALTO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GEN_BAJO_6b.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()



#---- Gráficos 2m ----

##---- Clima de convivencia----

##---- Nacional----
AUX <- T1 %>%
  filter(grado=="2m" & ind == "cc") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("CC_NAC_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="2m" & ind == "cc" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("CC_GSE1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)

#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GSE_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()



#Ahora consideramos el nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GSE_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="2m" & ind == "cc" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("CC_GEN1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GEN_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("CC_GEN_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Autoestima y motivación escolar----

###---- Nacional ----
AUX <- T1 %>%
  filter(grado=="2m" & ind == "am") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("AM_NAC_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)

###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="2m" & ind == "am" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("AM_GSE1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("AM_GSE_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GSE_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="2m" & ind == "am" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("AM_GEN1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GEN_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("AM_GEN_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Hábitos de vida saludable----

###---- Nacional ----
AUX <- T1 %>%
  filter(ind == "hv" & grado=="2m") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("HV_NAC_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="2m" & ind == "hv" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("HV_GSE1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("HV_GSE_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GSE_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="2m" & ind == "hv" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("HV_GEN1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GEN_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("HV_GEN_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


##---- Participación y formación ciudadana----

###---- Nacional ----
AUX <- T1 %>%
  filter(grado=="2m" & ind == "pf") %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 3, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5.5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) 

ggsave("PF_NAC_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


###---- Grupo socioeconómico----
AUX <- T2 %>%
  filter(grado=="2m" & ind == "pf" & !is.na(gse)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gse_labels <- as_labeller(c("1" = "Bajo", "2"="Medio bajo" , "3"="Medio", "4"="Medio alto","5"="Alto"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gse, labeller = gse_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("PF_GSE1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

# Crear un diccionario de etiquetas usando un named vector
label_dict <- AUX %>%
  distinct(sdim, label_sdim) %>%
  deframe()  # Convierte en un named vector donde names = sdim y values = label_sdim

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)

png("PF_GSE_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gse = as.character(gse))

# Crear las filas "min" y "max"
max_row <- data.frame(gse = "max", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gse = "min", AUX_T %>% select(-gse) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gse)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GSE_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("B", "MB", "M", "MA", "A"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D", "#0C7891","#616160" , "#E41F1F"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


###---- Género----
AUX <- T3 %>%
  filter(grado=="2m" & ind == "pf" & !is.na(gen)) %>%
  mutate(
    nivel = factor(nivel, levels = c(1, 2, 3), labels = c("Bajo", "Medio", "Alto")),
    label_sdim = str_wrap(label_sdim, width = 25),  # Ajustar ancho del texto
    label_sdim = factor(label_sdim, levels = str_wrap(orden_sdim, width = 25))  # Aplicar el orden deseado
  )

# Definir etiquetas personalizadas para los facetes
gen_labels <- as_labeller(c("1" = "Hombre", "2"="Mujer"))

G <- ggplot(AUX, aes(x = porc, y = label_sdim, fill = nivel)) +
  geom_bar(stat = "identity", position = "stack") +  # Barras apiladas
  geom_text(aes(label = round(porc, 0)),  # Etiquetas dentro de las barras
            position = position_stack(vjust = 0.5), 
            color = "white", size = 2, fontface = "bold") +  
  labs(x = NULL, y = NULL, fill = NULL) +  # Eliminar títulos de ejes y leyenda
  scale_fill_manual(values = c("Bajo" = "#00495F", "Medio" = "#E84A2D", "Alto" = "#0C7891"),
                    guide = guide_legend(override.aes = list(size = 0.5))) +  # Reducir tamaño de símbolos
  scale_y_discrete(limits = rev) +  # Invertir el orden del eje Y
  theme_minimal() +
  theme(
    axis.text.x = element_blank(),  # Eliminar textos del eje X
    axis.text.y = element_text(size = 5, color = "#707070"),  # Mantener etiquetas del eje Y
    axis.ticks.x = element_blank(),  # Eliminar marcas del eje X
    legend.title = element_blank(),  # Eliminar el título de la leyenda
    legend.text = element_text(size = 4, color = "#707070"),  # Reducir tamaño del texto de la leyenda
    legend.margin = margin(-5, 0, 0, 0, unit = "pt"),  # Reducir margen entre la leyenda y el gráfico
    strip.text = element_text(size = 6, color = "#707070", face = "bold"),  # Modificar tamaño y color de títulos de facet
    plot.title = element_blank(),  # Tamaño del título del gráfico (si se agrega)
    legend.position = "bottom"  # Ubicar leyenda en la parte inferior
  ) +
  facet_wrap(~ gen, labeller = gen_labels, nrow = 1, ncol = 5)  # 1 fila, 5 columnas

ggsave("PF_GEN1_2m.png", G, width = 13, height = 6, units = "cm", dpi = 300, type = "cairo")

plot(G)


#GRAFICO DE RADAR

#Primero trabajamos con los estudiantes en alto
AUX2 <- AUX %>%
  filter(nivel == "Alto") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GEN_ALTO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()


#Nivel bajo
AUX2 <- AUX %>%
  filter(nivel == "Bajo") %>%
  select(-nivel, -ind, -grado, -label_sdim) %>%
  mutate(porc=porc)

# Pivotar los datos para que cada subd sea una columna
AUX_T <- AUX2 %>%
  pivot_wider(names_from = sdim, values_from = porc) %>%
  mutate(gen = as.character(gen))

# Crear las filas "min" y "max"
max_row <- data.frame(gen = "max", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 100)))
min_row <- data.frame(gen = "min", AUX_T %>% select(-gen) %>% summarise(across(everything(), ~ 0)))

# Combinar las filas "min" y "max" con el dataframe original
AUX_radar <- bind_rows(max_row, min_row, AUX_T)

# Eliminar la columna "grado" (no es necesaria para el gráfico)
AUX_radar <- AUX_radar %>% select(-gen)

# Renombrar columnas de AUX_radar usando las etiquetas de label_sdim
colnames(AUX_radar) <- recode(colnames(AUX_radar), !!!label_dict)

# Convertir a data frame (necesario para radarchart)
AUX_radar <- as.data.frame(AUX_radar)


png("PF_GEN_BAJO_2m.png", width = 11, height = 11, units = "cm", res = 300)

# Ajustar los márgenes del gráfico
par(mar = c(2.5, 1, 2.5, 1))  # Márgenes más reducidos

# Crear el radar chart sin título
radarchart(
  AUX_radar,
  axistype = 1,  # Tipo de eje (1 para líneas)
  pcol = c("#00495F", "#E84A2D"),  # Colores de las líneas para cada grupo
  pfcol = scales::alpha(c("#00495F", "#E84A2D"), 0.0),  # Colores de relleno con transparencia
  plwd = 1,  # Grosor de las líneas
  plty = 1,  # Estilo de las líneas (1 = sólido)
  cglcol = "#707070",  # Color de las líneas de la cuadrícula
  cglty =1,  # Estilo de las líneas de la cuadrícula
  cglwd = 0.4,  # Grosor de las líneas de la cuadrícula
  axislabcol = "#707070",  # Color de las etiquetas de los ejes
  vlcex = 0.5,  # Tamaño de las etiquetas de las variables
  caxislabels = seq(0, 100, 25),  # Etiquetas del eje (personalizables)
  calcex = 0.6  # Reducir el tamaño del texto del eje
)

# Colocar la leyenda en la esquina inferior derecha
legend(
  "bottomright",  # Fijar la leyenda en la parte inferior derecha
  legend = c("Hombres", "Mujeres"),  # Etiquetas de los grupos
  bty = "n",  # Sin bordes en la leyenda
  pch = 8,  # Símbolo de los puntos en la leyenda
  col = c("#00495F", "#E84A2D"),  # Colores de los grupos
  text.col = "black",  # Color del texto
  cex = 0.5,  # Tamaño del texto de la leyenda
  pt.cex = 0.8  # Tamaño de los símbolos en la leyenda
)

# Cerrar el dispositivo gráfico y guardar la imagen
dev.off()

