# Navegador remoto para el cargador de carros.
#
# Es la imagen oficial de Selenium con UNA diferencia: el chromedriver de
# fabrica inyecta en cada pagina variables globales con el prefijo `cdc_`
# (p. ej. `window.cdc_adoQpoasnfa76pfcZLmcfl_Array`). Los anti-bot las buscan
# por nombre: PerimeterX/HUMAN, que protege a Lider, es uno de ellos. Con esa
# marca presente el desafio "manten presionado" nunca valida aunque lo
# resuelva una persona, porque el backend ya decidio que es un bot.
#
# Reescribir el prefijo en el binario (misma longitud, para no mover offsets)
# elimina la marca sin cambiar el comportamiento del driver. Es la tecnica de
# undetected-chromedriver. El `grep` final hace fallar el build si quedara
# alguna ocurrencia: mejor no construir que construir algo que se cree limpio.
FROM selenium/standalone-chromium:4.46.0-20260707

USER root
RUN set -eu; \
    drivers="$(find / -xdev -type f -name 'chromedriver*' -perm -u+x 2>/dev/null || true)"; \
    [ -n "$drivers" ] || { echo 'chromedriver no encontrado' >&2; exit 1; }; \
    for bin in $drivers; do \
      perl -pi -e 's/cdc_/wbd_/g' "$bin"; \
      if grep -q 'cdc_' "$bin"; then echo "cdc_ sigue presente en $bin" >&2; exit 1; fi; \
      echo "chromedriver parcheado: $bin"; \
    done
USER 1200
