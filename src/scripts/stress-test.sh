#!/usr/bin/env bash

TARGET_URL=${1:-"http://127.0.0.1:5000"}
DURATION=30
CONNECTIONS=100

echo "========================================================================"
echo "🚀 INICIANDO TESTE DE ESTRESSE: API bCost Core"
echo "🎯 URL ALVO: $TARGET_URL"
echo "👥 SOLICITAÇÕES SIMULTÂNEAS: $CONNECTIONS"
echo "⏱️  TEMPO DE EXECUÇÃO: ${DURATION}s"
echo "========================================================================"

if ! command -v autocannon &> /dev/null; then
    echo "⚠️  Autocannon não foi detectado globalmente. Instalando via NPM..."
    npm install -g autocannon
fi

echo "🔥 [Fase 1]: Degradando endpoint de Healthcheck (/health)..."
autocannon -c "$CONNECTIONS" -d "$DURATION" "$TARGET_URL/health" \
  --title "bCost Core - Health Stress" \
  --headers "x-bcost-trace-id=stress-test-pipeline-token" \
  --renderStatusCodes

echo ""
echo "🔥 [Fase 2]: Simulando coleta intensa de scraping de telemetria (/metrics)..."
autocannon -c 20 -d 10 "$TARGET_URL/metrics" \
  --title "bCost Core - Metrics Telemetry Stress" \
  --renderStatusCodes

echo "========================================================================"
echo "✅ Testes de estresse finalizados com sucesso!"
echo "========================================================================"
