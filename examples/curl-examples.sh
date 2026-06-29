#!/usr/bin/env bash
# For-Ai API — cURL Examples
# Replace API_KEY with your actual key (forai_free_..., forai_pro_..., etc.)

set -euo pipefail

BASE="https://for-ai-e4mm.vercel.app"
API_KEY="forai_free_your_key_here"
SLUG="seoul-metro-base-fare"
ENTITY_ID="kr-transport-seoul-metro-001"

echo "=== 1. Source-backed citation for a known slug: /api/cite/[slug] ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/cite/$SLUG" | jq '.claims[] | select(.citation_ready == true)'

echo ""
echo "=== 2. Full claim bundle for a known slug: /api/documents/[slug] ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/documents/$SLUG" | jq '{document, citation_guidance, claims}'

echo ""
echo "=== 3. Verified-only discovery index: /api/index ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/index?verification=verified&cite=true&limit=5" | jq '.items[] | {slug, entity_id, can_cite, verified_claims, total_claims}'

echo ""
echo "=== 4. Entity-level facts ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/entities/$ENTITY_ID" | jq '{entity, summary, documents}'

echo ""
echo "=== 5. Citation safety header ==="
curl -s -I -H "X-API-Key: $API_KEY" "$BASE/api/documents/$SLUG" \
  | grep -i "x-for-ai-can-cite\|x-ratelimit\|x-api-tier"

echo ""
echo "=== 6. Needs-verification claims are not citable ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/documents/$SLUG" \
  | jq '.claims[] | select(.citation_ready != true) | {field_path, claim_value, confidence, status, citation_ready}'

echo ""
echo "=== 7. Register a verification-event webhook ==="
curl -s -X POST "$BASE/api/webhooks" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -H "X-Admin-Csrf: YOUR_CSRF_TOKEN" \
  -d '{
    "url": "https://your-server.com/webhook/forai",
    "events": ["claim.verified", "claim.updated", "claim.disputed"],
    "secret": "whsec_your_signing_secret"
  }' | jq .
