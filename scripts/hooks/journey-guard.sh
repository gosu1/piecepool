#!/usr/bin/env bash
# journey-guard — Claude Code 공유 훅 (.claude/settings.json PreToolUse/Bash).
# `gh pr create` 시점에 여정 기록 누락을 차단한다: feat 커밋이 있는 브랜치인데
# docs/00-overview/journey.md 변경이 없으면 exit 2 로 막고 Claude 에게 추가 방법을 안내한다.
# 규칙 SSOT: docs/00-overview/journey.md 상단 + CONTRIBUTING.md §브랜치 & PR.
set -uo pipefail

input=$(cat)
# Bash 도구 호출 중 gh pr create 만 검사 (compound 명령 포함 substring 매칭)
case "$input" in
  *"gh pr create"*) ;;
  *) exit 0 ;;
esac

# 기준점 확보 실패(오프라인 등)로 PR 생성 자체를 막지 않는다
base=$(git merge-base origin/main HEAD 2>/dev/null) || exit 0

# feat 커밋이 없으면 사소한 PR(docs/fix/chore 등) — 통과
git log --format=%s "$base"..HEAD | grep -Eq '^feat[(:!]' || exit 0

# 이미 여정 기록을 고쳤으면 통과
git diff --name-only "$base"..HEAD | grep -q '^docs/00-overview/journey.md$' && exit 0

cat >&2 <<'MSG'
[journey-guard] feat 커밋이 있는 PR인데 docs/00-overview/journey.md 변경이 없습니다.
큰 변화는 여정 기록(보고서·사업·PPT 원재료)에 남겨야 합니다. PR 생성 전에:

1. docs/00-overview/journey.md 의 "§2 마일스톤 타임라인" 표에 한 줄 추가
   형식: | 날짜 | 사건 | 의미 — PPT 슬라이드에 그대로 쓸 한 문장 |
2. 커밋에 포함한 뒤 gh pr create 를 다시 실행하세요.

(기록할 가치가 없는 기계적 feat 이라고 판단되면 사용자에게 먼저 확인하세요.)
MSG
exit 2
