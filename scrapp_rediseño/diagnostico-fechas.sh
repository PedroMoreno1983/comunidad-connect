#!/bin/bash

# Script de diagnóstico completo para encontrar errores de fecha

echo "🔍 DIAGNÓSTICO COMPLETO - Búsqueda de errores de fecha"
echo "======================================================="

FRONTEND_DIR="/var/www/datawiseconsultoria.com/app/frontend/src"

echo ""
echo "📂 Buscando archivos con format(new Date(...)) SIN validación..."
echo "----------------------------------------------------------------"

grep -rn "format(new Date(" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | \
while IFS=: read -r file line content; do
    # Verificar si la línea anterior o siguiente tiene validación
    prev_line=$((line - 1))
    next_line=$((line + 1))
    
    # Buscar isNaN o validación cerca
    has_validation=$(sed -n "${prev_line},${next_line}p" "$file" | grep -c "isNaN\|if (!.*timestamp\|if (.*timestamp")
    
    if [ "$has_validation" -eq 0 ]; then
        echo "❌ $file:$line"
        echo "   $content"
    fi
done

echo ""
echo "📂 Buscando new Date(...) dentro de .filter() o .map()..."
echo "------------------------------------------------------------"

grep -rn "\.filter.*new Date\|\.map.*new Date" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | \
while IFS=: read -r file line content; do
    echo "⚠️  $file:$line"
    echo "   $content"
done

echo ""
echo "📂 Buscando formatDistanceToNow sin validación..."
echo "---------------------------------------------------"

grep -rn "formatDistanceToNow" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | \
grep -v "isNaN\|safeFormat" | \
while IFS=: read -r file line content; do
    echo "⚠️  $file:$line"
    echo "   $content"
done

echo ""
echo "📂 Verificando archivos que YA deberían estar corregidos..."
echo "-------------------------------------------------------------"

FILES_TO_CHECK=(
    "pages/DashboardPage.tsx"
    "pages/LiveTranscriptMonitor.tsx"
    "pages/MentionsPage.tsx"
    "pages/ReportsPage.tsx"
    "pages/SourcesPage.tsx"
    "pages/UserMentionsPage.tsx"
    "components/MentionDetailModal.tsx"
    "components/NotificationPanel.tsx"
)

for file in "${FILES_TO_CHECK[@]}"; do
    full_path="$FRONTEND_DIR/$file"
    if [ -f "$full_path" ]; then
        has_validation=$(grep -c "isNaN(.*getTime())" "$full_path")
        if [ "$has_validation" -eq 0 ]; then
            echo "❌ $file - NO tiene validación isNaN"
        else
            echo "✅ $file - Tiene validación ($has_validation ocurrencias)"
        fi
    else
        echo "⚠️  $file - NO EXISTE"
    fi
done

echo ""
echo "📂 Verificando timestamp del build actual..."
echo "----------------------------------------------"

if [ -f "$FRONTEND_DIR/../dist/build-info.txt" ]; then
    echo "✅ Build timestamp:"
    cat "$FRONTEND_DIR/../dist/build-info.txt"
else
    echo "❌ No existe build-info.txt - El build puede ser antiguo"
fi

echo ""
echo "🔍 Buscando componentes que usan API de menciones..."
echo "------------------------------------------------------"

grep -rn "api.get.*mention\|mentionService\|/pilot/mentions" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | \
cut -d: -f1 | sort -u | \
while read -r file; do
    relative=$(echo "$file" | sed "s|$FRONTEND_DIR/||")
    echo "📄 $relative usa API de menciones"
done

echo ""
echo "======================================================="
echo "✅ Diagnóstico completo"
echo ""
echo "Siguiente paso:"
echo "1. Revisar archivos marcados con ❌"
echo "2. Si build-info.txt es antiguo, hacer rebuild"
echo "3. Revisar componentes que usan API de menciones"