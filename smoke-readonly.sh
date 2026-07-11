#!/bin/bash
set -e

BASE="https://api.bcost.com.br"
COMPANY_ID="da78cb39-d18a-46bd-85fb-5dce9eda3751"

echo "=== PUBLIC ==="
curl -s -o /dev/null -w "health: %{http_code}\n" "$BASE/health"
curl -s -o /dev/null -w "root: %{http_code}\n" "$BASE/api/v1"
curl -s -o /dev/null -w "docs: %{http_code}\n" "$BASE/docs"

echo "=== AUTH TOKEN ==="
TOKEN=$(curl -s -X POST "$BASE/api/v1/auth/login" \
-H "Content-Type: application/json" \
-d '{"email":"contato@bcost.com.br","password":"admin_bcost_2026"}' \
| node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).access_token")

echo "token: OK"

echo "=== AUTHENTICATED READS ==="
curl -s -o /dev/null -w "auth/me: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/auth/me"
curl -s -o /dev/null -w "company: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/company"
curl -s -o /dev/null -w "contracts: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/contracts?companyId=$COMPANY_ID"
curl -s -o /dev/null -w "certificates: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/digital-certificates?companyId=$COMPANY_ID"
curl -s -o /dev/null -w "fiscal invoices: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/fiscal/invoices/$COMPANY_ID"
curl -s -o /dev/null -w "revenue factor-r: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/revenue/factor-r/$COMPANY_ID"
curl -s -o /dev/null -w "revenue metrics: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/revenue/metrics/$COMPANY_ID?month=4&year=2026"
curl -s -o /dev/null -w "dashboard overview: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/dashboard/overview"
curl -s -o /dev/null -w "dashboard realtime: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/dashboard/metrics/real-time"
curl -s -o /dev/null -w "finance health: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/finance/health-summary"
curl -s -o /dev/null -w "automation metrics: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/automation/metrics"
curl -s -o /dev/null -w "notifications: %{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/notifications"

echo "=== DONE ==="
