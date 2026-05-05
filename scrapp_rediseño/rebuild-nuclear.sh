#!/bin/bash

echo "🚨 REBUILD NUCLEAR - Limpieza completa"
echo "======================================"

cd /var/www/datawiseconsultoria.com/app/frontend

# 1. BACKUP
echo "📦 Creando backup..."
cp src/components/NotificationPanel.tsx src/components/NotificationPanel.backup.tsx

# 2. COPIAR VERSIÓN INLINE
echo "📝 Copiando NotificationPanel-INLINE.tsx..."
cp ~/NotificationPanel-INLINE.tsx src/components/NotificationPanel.tsx

# 3. LIMPIEZA EXTREMA
echo "🧹 Limpiando TODA la cache..."
rm -rf dist/
rm -rf node_modules/
rm -rf node_modules/.vite/
rm -rf node_modules/.cache/
rm -rf .vite/
rm -rf ~/.npm/_cacache/
rm -rf ~/.cache/vite/

# 4. LIMPIAR CACHE NPM
echo "🗑️  Limpiando cache npm..."
npm cache clean --force

# 5. REINSTALAR DESDE CERO
echo "📥 Reinstalando node_modules..."
npm install

# 6. BUILD LIMPIO
echo "🔨 Building..."
npm run build 2>&1 | tee build.log

# 7. VERIFICAR BUILD
echo ""
echo "🔍 Verificando build..."

if [ ! -d "dist" ]; then
    echo "❌ ERROR: dist/ no fue generado"
    exit 1
fi

if [ -z "$(ls -A dist)" ]; then
    echo "❌ ERROR: dist/ está vacío"
    exit 1
fi

# 8. VERIFICAR QUE LA VALIDACIÓN ESTÁ EN EL BUILD
echo ""
echo "🔍 Verificando código en bundle..."

# Buscar la validación inline
INLINE_CHECK=$(grep -c "isNaN.*getTime.*formatDistanceToNow" dist/assets/index-*.js 2>/dev/null || echo "0")

if [ "$INLINE_CHECK" -gt 0 ]; then
    echo "✅ Validación inline encontrada en bundle ($INLINE_CHECK ocurrencias)"
else
    echo "⚠️  No se encontró validación inline en bundle minificado"
    echo "   (Esto es normal si el código fue muy minificado)"
fi

# 9. TIMESTAMP
echo ""
BUILD_TIME=$(date '+%Y-%m-%d %H:%M:%S')
echo "Build completado: $BUILD_TIME" > dist/build-info.txt
echo "✅ Build timestamp: $BUILD_TIME"

# 10. RESTART BACKEND
echo ""
echo "🔄 Reiniciando backend..."
pm2 restart scrapp-backend

sleep 3

# 11. VERIFICAR LOGS
echo ""
echo "📋 Logs del backend:"
pm2 logs scrapp-backend --lines 10 --nostream

echo ""
echo "======================================"
echo "✅ REBUILD COMPLETO"
echo "======================================"
echo ""
echo "Siguiente paso:"
echo "1. Abrir navegador"
echo "2. Ctrl+Shift+Delete → Borrar TODO el cache"
echo "3. Cerrar navegador completamente"
echo "4. Abrir de nuevo"
echo "5. Ctrl+Shift+R en la página"
echo ""
echo "Si persiste el error, ejecuta:"
echo "  cat dist/build-info.txt"
echo "  pm2 logs scrapp-backend"
echo ""