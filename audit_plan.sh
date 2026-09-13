#!/bin/bash
echo "=== 🔍 AUDITORIA DE COMPLIANCE E ROTAS DA BCOST API ==="
echo ""
echo "1. Verificando suporte/referências a CBS, IBS e Fator R no código:"
grep -rnE "cbs|ibs|fatorR|fator_r" src/ || echo "⚠️ Nenhum termo explícito de CBS/IBS encontrado em src/"

echo ""
echo "2. Verificando rotas de Revenue e Billing no código:"
grep -rnE "revenue/stats|billing/entitlements|modules/fiscal/tax-data" src/ || echo "⚠️ Rotas de estatísticas fiscais/billing precisam de revisão de alias."

echo ""
echo "3. Verificando Guards de Permissão e Segurança:"
ls -la src/common/guards/

echo ""
echo "=== FIM DA AUDITORIA ==="
