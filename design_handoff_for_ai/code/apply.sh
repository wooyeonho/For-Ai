#!/usr/bin/env bash
# =============================================================================
# For-Ai — 일괄 적용 스크립트 (디자인 + 기능 수정)
#
# 사용법:
#   1) 이 폴더(code/)를 저장소 루트에 복사:  예) cp -R design_handoff_for_ai/code _forai_apply
#   2) 저장소 루트에서 실행:                bash _forai_apply/apply.sh
#
# 안전장치: 각 단계는 idempotent(여러 번 돌려도 안전)하고, 패턴을 못 찾으면
#           실패시키지 않고 [SKIP] 경고만 출력합니다. git 으로 언제든 되돌릴 수 있습니다.
# 적용 순서: env 안내 → B4(인증) → B3(locale) → B1/B2(거짓성공) → 디자인
# =============================================================================
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(pwd)"
ok(){ printf "  \033[32m[OK]\033[0m %s\n" "$1"; }
skip(){ printf "  \033[33m[SKIP]\033[0m %s\n" "$1"; }
step(){ printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

if [ ! -f "$ROOT/app/globals.css" ]; then
  echo "!! app/globals.css 가 없습니다. 저장소 루트에서 실행하세요."; exit 1
fi

# ── 0. ENV 안내 (사람이 직접) ───────────────────────────────────────────────
step "0. 환경변수 (사람이 직접 — 비밀이라 스크립트가 못 넣음)"
if [ ! -f "$ROOT/.env.local" ]; then
  [ -f "$ROOT/.env.example" ] && cp "$ROOT/.env.example" "$ROOT/.env.local" && ok ".env.local 생성(.env.example 복사) — 값을 채우세요"
else
  skip ".env.local 이미 존재"
fi
echo "  → CONTRIBUTOR_SALT / SUPABASE 키 / ADMIN_SECRET / ADMIN_CSRF_SECRET 를 채우고"
echo "    Supabase 에 schema-v3.sql 을 실행하세요. (자세히: fixes/SETUP_CHECKLIST.md)"
echo "    openssl rand -hex 32  로 secret 생성."

# ── B4. 관리자 인증 fail-closed ─────────────────────────────────────────────
step "B4. 관리자 인증 (review 라우트를 공용 requireAdmin 으로 교체)"
TGT="$ROOT/app/api/admin/review/route.ts"
if [ -f "$SRC/fixes/app/api/admin/review/route.ts" ] && [ -f "$TGT" ]; then
  cp "$TGT" "$TGT.bak.$(date +%s)" 2>/dev/null
  cp "$SRC/fixes/app/api/admin/review/route.ts" "$TGT" && ok "review/route.ts 교체 (백업 .bak 생성)"
else
  skip "review/route.ts 또는 수정본 없음"
fi
echo "  → 다른 admin 라우트도 점검:"
echo "     grep -rn '!ADMIN_SECRET' app/api ;  grep -rLn 'requireAdmin' app/api/admin"

# ── B3. locale 하드코딩 (/ko/wiki → /wiki) ──────────────────────────────────
step "B3. locale 하드코딩 제거"
patch_ko(){
  local f="$1"
  if [ -f "$f" ] && grep -q "/ko/wiki/" "$f"; then
    sed -i.bak 's#/ko/wiki/#/wiki/#g' "$f" && ok "$(basename "$f"): /ko/wiki → /wiki"
  else
    skip "$(basename "$f"): /ko/wiki 없음"
  fi
}
patch_ko "$ROOT/app/report/[slug]/ReportForm.tsx"
patch_ko "$ROOT/app/community/CommunityClient.tsx"
# suggest-topic lang 하드코딩
ST="$ROOT/app/api/suggest-topic/route.ts"
if [ -f "$ST" ] && grep -q 'lang: "ko",' "$ST"; then
  sed -i.bak 's#lang: "ko",#lang: typeof body.lang === "string" \&\& body.lang ? body.lang : "ko",#' "$ST" && ok "suggest-topic: lang 동적화"
else
  skip "suggest-topic: lang:\"ko\" 없음"
fi

# ── B1. 정정/환각 신고: 미저장 시 거짓 성공 금지 (503) ────────────────────────
step "B1. 신고 stub 거짓 성공 제거"
patch_stub(){
  local f="$1" tag="$2"
  if [ -f "$f" ] && grep -q "\[$tag\] STUB mode" "$f"; then
    perl -0777 -pi -e "s/console\.log\('\[$tag\] STUB mode[^\n]*\);/console.error('[$tag] storage not configured — NOT persisted'); return NextResponse.json({ error: 'submission_storage_unavailable', persisted: false }, { status: 503 });/" "$f" && ok "$(basename "$f"): stub → 503"
  else
    skip "$(basename "$f"): STUB 블록 없음(이미 수정됐거나 경로 상이)"
  fi
}
patch_stub "$ROOT/app/api/report/[slug]/route.ts" "report"
patch_stub "$ROOT/app/api/hallucination/[slug]/route.ts" "hallucination"

# ── 디자인 (마지막) ──────────────────────────────────────────────────────────
step "디자인 리스킨 (globals.css)"
GC="$ROOT/app/globals.css"
FONT_IMPORT="@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');"
if grep -q "IBM+Plex+Sans+KR" "$GC"; then
  skip "폰트 import 이미 존재"
else
  printf '%s\n%s' "$FONT_IMPORT" "$(cat "$GC")" > "$GC.tmp" && mv "$GC.tmp" "$GC" && ok "폰트 @import 최상단 추가"
fi
if grep -q "For-Ai — Design reskin" "$GC"; then
  skip "리스킨 블록 이미 존재"
else
  printf '\n\n' >> "$GC"; cat "$SRC/globals.reskin.css" >> "$GC" && ok "globals.reskin.css 를 globals.css 하단에 추가"
fi

step "완료"
echo "  빌드 확인:  npm run lint && npm run build && npm run dev"
echo "  되돌리기:   git checkout -- . (또는 생성된 *.bak 파일 복원)"
echo "  검증:       fixes/SETUP_CHECKLIST.md 의 동작 확인 체크리스트"
