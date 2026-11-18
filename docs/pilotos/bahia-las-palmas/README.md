# Bahía Las Palmas: base documental del piloto

Fuente: `Antecedentes_Loteo_Lote65_rol_508-96.pdf`, entregado por el usuario el 2 de noviembre de 2026. La nómina `sitios_superficies.csv` transcribe las superficies de la Resolución Exenta N.º 17 de la Dirección de Obras Municipales de Las Cabras (págs. 5–24 del PDF). El documento es un escaneo: las cifras se leyeron mediante OCR y se cotejaron con el total declarado en la pág. 25.

## Controles

- 79 sitios, numerados correlativamente del 1 al 79, sin duplicados.
- Suma de superficies individuales: **124.358 m²**, igual al total destinado a lotes de la pág. 25.
- El sitio 37 aparece con **1.544 m²** al inicio de la pág. 14; el encabezado queda en la pág. 13.
- El sitio 60 aparece como **1.444 m²** en la pág. 19. El OCR separó mal la coma, pero esa lectura concilia exactamente con el total oficial.
- La pág. 25 también consigna 38.374,70 m² de áreas comunes y 162.732,70 m² de superficie total del predio. Esas superficies **no** se suman a la superficie de los lotes para el escenario de reparto por metros cuadrados.

## Uso de las columnas

`sitio` y `superficie_m2` son datos documentales. `pagina_pdf` permite cotejarlos. Los dos porcentajes son **simulaciones matemáticas**, no derechos de copropiedad ni instrucciones de cobro:

- `porcentaje_superficie_simulado = superficie_m2 / 124358 × 100`.
- `porcentaje_igualitario_simulado = 100 / 79`.

Si el gasto común compartido fuera $1.000.000, el escenario igualitario asignaría $12.658,23 antes de distribuir los pesos de redondeo. El escenario por superficie asignaría a cada sitio `1.000.000 × superficie_m2 / 124358`. En ambos casos, el sistema debe cuadrar exactamente el total mediante una regla de redondeo explícita.

## Pendiente para cobrar

El expediente de subdivisión no contiene el reglamento de copropiedad vigente ni las cuotas de contribución por unidad. Por ello no se debe importar ninguna de las columnas simuladas como `units.share_permille` ni usarlas para emitir gastos comunes o ponderar votos. Primero corresponde cotejar el reglamento y eventuales modificaciones inscritas. También hace falta la nómina de propietarios/residentes, la cuenta CGE y las lecturas iniciales de los 81 remarcadores (79 sitios, sala de estanque y áreas comunes) para el piloto operativo.

El certificado de la pág. 26 autoriza enajenación de lotes 1–79 y consigna red particular de agua potable, solución particular de alcantarillado y red eléctrica de baja tensión. Eso no acredita por sí solo la situación actual de las redes ni la recepción de obras posteriores.
