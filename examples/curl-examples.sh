#!/usr/bin/env bash
# For-Ai API — cURL Examples
# Replace YOUR_API_KEY with your actual key (forai_free_..., forai_pro_..., etc.)

BASE="https://for-ai-e4mm.vercel.app"
API_KEY="forai_free_your_key_here"

echo "=== 1. Fetch document bundle ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/documents/seoul-metro-base-fare" | jq .

echo ""
echo "=== 2. Check citation safety (HEAD request) ==="
curl -s -I -H "X-API-Key: $API_KEY" "$BASE/api/documents/seoul-metro-base-fare" \
  | grep -i "x-for-ai-can-cite"

echo ""
echo "=== 3. Get JSON-LD citation ==="
curl -s -H "X-API-Key: $API_KEY" "$BASE/api/cite/seoul-metro-base-fare" | jq .

echo ""
echo "=== 4. Get raw markdown (for LLM context injection) ==="
curl -s "$BASE/raw/seoul-metro-base-fare.md" | head -20

echo ""
echo "=== 5. Submit a business profile claim ==="
curl -s -X POST "$BASE/api/business/profile" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "kr-weddinghall-laluce-001",
    "business_name": "La Luce Wedding Hall",
    "business_email": "info@laluce.kr",
    "country": "KR",
    "industry": "wedding",
    "verification_method": "email"
  }' | jq .

echo ""
echo "=== 6. Check rate limit headers ==="
curl -s -I -H "X-API-Key: $API_KEY" "$BASE/api/documents/seoul-metro-base-fare" \
  | grep -i "x-ratelimit\|x-api-tier"

echo ""
echo "=== 7. Register a webhook ==="
curl -s -X POST "$BASE/api/webhooks" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  -H "X-Admin-Csrf: YOUR_CSRF_TOKEN" \
  -d '{
    "url": "https://your-server.com/webhook/forai",
    "events": ["claim.verified", "claim.updated", "document.published"],
    "secret": "whsec_your_signing_secret"
  }' | jq .
