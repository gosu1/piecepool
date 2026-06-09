# Packaging (macOS 배포)

PiecePool을 macOS 설치 파일(`.dmg` / `.app`)로 빌드·배포하는 절차. **Tauri 2.x bundler** 기반.

> **빌드 플랫폼 제약**: macOS 산출물(`.dmg`/`.app`)은 **macOS에서만 빌드된다**. 현재 일부 개발은 Windows에서 진행되므로, 실제 `.dmg` 빌드·서명 검증은 macOS 머신(또는 macOS CI runner)에서 수행한다.

상태: ✅ 설정됨 · 🔜 MVP 예정 · ⏳ post-MVP

---

## 1. 개요

| 항목 | MVP 결정 | 근거 |
|---|---|---|
| 대상 플랫폼 | **macOS만** | [`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md) §2.1 |
| 산출물 포맷 | `.dmg` (배포) + `.app` (실행) | 데스크톱 표준 |
| 코드 사이닝 | **ad-hoc** (무료·자동) | MVP 비용 절감 |
| 배포 채널 | **GitHub Releases 수동** | MVP 단순화 |

정식 Developer ID 서명·공증과 자동 릴리즈는 **post-MVP** ([§4](#4-코드-사이닝), [§5](#5-배포-채널)).

---

## 2. Bundle 설정

빌드 명세는 [`../../src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json)의 `bundle` 블록이 결정한다.

| 키 | 현재 값 | 의미 |
|---|---|---|
| `productName` | `PiecePool` | 앱 표시 이름 |
| `version` | `0.1.0` | 산출물 파일명에 포함 |
| `identifier` | `com.piecepool.app` | macOS 앱 고유 ID. 서명·Gatekeeper가 식별 키로 사용 |
| `bundle.active` | `true` | 번들 생성 on |
| `bundle.targets` | `"all"` | 빌드할 포맷 |
| `bundle.icon` | `.icns` / `.ico` / `.png` | 앱 아이콘 |

### targets 권장값

현재 `"all"`은 Windows/Linux 포맷까지 포함한다. MVP는 macOS만 대상이므로 다음으로 좁히길 권장한다:

```jsonc
"bundle": { "targets": ["dmg", "app"] }
```

> 본 문서는 권장값만 명시한다. 실제 `tauri.conf.json` 변경은 빌드 도입 시 별도 PR로 수행한다 (코드 동반 변경).

---

## 3. 빌드 명령 / 산출물

```bash
npm run tauri build
```

산출물 위치 (Apple Silicon 기준):

```
src-tauri/target/release/bundle/
├─ dmg/PiecePool_0.1.0_aarch64.dmg   # 배포용 디스크 이미지
└─ macos/PiecePool.app                # 실행 번들
```

- Intel Mac은 `x64`, Apple Silicon은 `aarch64` 접미사가 붙는다.
- 두 아키텍처 모두 지원하려면 universal 빌드(`--target universal-apple-darwin`)를 사용한다 (post-MVP 검토).

---

## 4. 코드 사이닝

macOS는 서명되지 않은 앱 실행을 제한한다. 특히 **Apple Silicon에서는 최소 ad-hoc 서명이 없으면 앱이 실행되지 않는다**.

### MVP: ad-hoc 서명

- Tauri는 서명 신원(identity)이 지정되지 않으면 **빌드 시 자동으로 ad-hoc 서명**을 적용한다. 별도 설정·비용이 없다.
- 빌드 머신에서는 정상 실행된다.

### 사용자 측 Gatekeeper 우회

ad-hoc 서명 앱을 **다른 Mac에 배포**하면 Gatekeeper가 "확인되지 않은 개발자" 경고를 띄운다. 사용자는 첫 실행 시 다음으로 우회한다:

1. `PiecePool.app` **우클릭 → 열기 → 열기** (한 번만)
2. 또는 터미널: `xattr -dr com.apple.quarantine /Applications/PiecePool.app`

> 이 안내는 Releases 노트에 포함한다.

### post-MVP: 정식 서명 + 공증 ⏳

경고 없는 배포는 다음이 필요하다 (Apple Developer Program, 연 $99):

1. **서명** — Developer ID Application 인증서로 codesign
2. **공증(notarization)** — Apple에 제출해 악성코드 스캔 통과
3. **stapling** — 공증 티켓을 `.app`에 부착 (오프라인 검증용)

정책 결정 추적: [`../00-overview/open-questions.md`](../00-overview/open-questions.md) §1 (코드 사이닝).

---

## 5. 배포 채널

### MVP: GitHub Releases 수동 🔜

1. `npm run tauri build`로 `.dmg` 생성 (macOS)
2. GitHub에서 버전 tag로 Release 생성
3. `.dmg`를 Release 자산으로 업로드
4. Release 노트에 §4 Gatekeeper 우회 안내 포함

### post-MVP: 자동 릴리즈 ⏳

tag push → GitHub Actions(macOS runner) + [tauri-action](https://github.com/tauri-apps/tauri-action)으로 빌드·서명·업로드 자동화. 추적: [`../00-overview/open-questions.md`](../00-overview/open-questions.md) §4 (자동 릴리즈).

---

## 6. 의존 / 참고

- [`../00-overview/scope-mvp.md`](../00-overview/scope-mvp.md) — `.dmg`/`.pkg` MVP 범위
- [`../00-overview/open-questions.md`](../00-overview/open-questions.md) — 코드 사이닝·자동 릴리즈 보류 항목
- [`../../src-tauri/tauri.conf.json`](../../src-tauri/tauri.conf.json) — bundle 설정 (SSOT)
- [`README.md`](README.md) — 40-frontend 영역 개요
- [Tauri Distribution 공식 문서](https://v2.tauri.app/distribute/)
