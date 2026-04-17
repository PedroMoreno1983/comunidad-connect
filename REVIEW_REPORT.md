# Revisión general del proyecto

Fecha: 2026-02-24

## Resultado de checks ejecutados

### 1) Lint (`npm run lint`)

- Estado: **falló**.
- Resultado: **221 problemas** detectados por ESLint.
  - **67 errores** (bloqueantes)
  - **154 warnings**

Patrones principales encontrados:

- Uso de `require()` prohibido por regla `@typescript-eslint/no-require-imports` en scripts JS de raíz.
- Uso de `any` (`@typescript-eslint/no-explicit-any`) en múltiples módulos de `src/`.
- Interfaces vacías (`@typescript-eslint/no-empty-object-type`) en componentes UI.
- Variables/imports sin uso (`@typescript-eslint/no-unused-vars`).
- Dependencias faltantes en hooks (`react-hooks/exhaustive-deps`).
- Llamadas impuras en render (`react-hooks/purity`).

### 2) Build de producción (`npm run build`)

- Estado: **falló**.
- Causa: error de descarga de fuentes `Geist` y `Geist Mono` desde Google Fonts en entorno sin conectividad efectiva al endpoint de fonts.
- Módulo implicado: `src/app/layout.tsx` (import de `next/font/google`).

## Prioridad de corrección recomendada

1. **Corregir errores de lint bloqueantes** (67 errores) para estabilizar CI.
2. **Reducir deuda de tipos** reemplazando `any` por tipos explícitos/union types.
3. **Limpiar imports y variables no usadas** para reducir ruido de warnings.
4. **Hacer resiliente el build offline**:
   - Migrar a `next/font/local` para fuentes embebidas, o
   - Configurar fallback de sistema cuando no haya acceso a Google Fonts.

## Observación

Esta revisión es de diagnóstico global y no incluyó refactor masivo, para evitar introducir cambios funcionales amplios en un solo lote.
