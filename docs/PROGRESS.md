# PROGRESS — FIT Platform (map 저장소)

> 세션 인수인계용 진행 문서. 최종 갱신: **2026-06-24** · 저장소: https://github.com/fit-platform/map

---

## 🚀 시작 프롬프트 (다음 세션에 이걸 그대로 붙여넣으세요)

```
이어서 작업할게요. 먼저 docs/PROGRESS.md 를 읽고 FIT Platform(map 저장소)의
전체 구조 — 루트 허브(로그인+앱 카드) + 5개 방(jubyung/shinjae/sangeun/heejin/yoonhee) —
를 파악해줘. heejin 방(매싱 스튜디오)의 상세 아키텍처가 필요하면
heejin/old/ARCHITECTURE.md 도 참고. 그 다음 아래 "방별 현황·TODO"에서
내가 지정하는 방(또는 [우선순위 높음] 항목)부터 이어서 작업하고,
작업 후 PROGRESS.md 의 '최종 갱신'과 해당 방 현황을 갱신한 뒤
repo 관례대로 main 에 `update <날짜 시각>` 메시지로 커밋 & push 해줘.
```

---

## 1. 플랫폼 개요
- **정체**: 사내 사업기획팀(FIT Platform)의 **앱 테스트베드**. 빌드 없는 정적 웹 + 일부 Netlify 앱.
- **루트 허브** ([index.html](../index.html)): Supabase 이메일/비밀번호 **로그인** 게이트 + 5개 앱 카드 그리드. 로그인 성공 시 오버레이가 사라지며 허브 노출. Apple HIG 무채색 디자인.
- **호스팅**: GitHub Pages — https://fit-platform.github.io/map/ (각 방은 `/map/<방>/`). 단 yoonhee는 외부(Cloudflare Pages), jubyung은 Netlify도 사용.
- **운영 관례**: `main` 브랜치에 직접 커밋, 메시지 형식 `update YYYY-MM-DD HH:MM`. 배포는 `_deploy.ps1`(=`배포.bat`)이 `git add -A → commit → push` 자동 수행, 최신본 받기는 `_pull.ps1`(=`최신버전_받기.bat`).

## 2. 방(앱)별 구성 — 5개
| 방(폴더) | 앱 이름 | 담당 | 형태 / 스택 | 상태 |
|---|---|---|---|---|
| `jubyung/` | **FIT Platform SCM Matrix** | 이주병 그룹장 | Netlify 앱 (`netlify.toml`, `package.json` + `@netlify/blobs`, `_redirects`, `404.html`), index.html ~193KB | 개발 중 |
| `shinjae/` | **PJT Report Helper** (title: Consulting Tool) | 이신재 프로 | 단일 index.html ~352KB | 개발 중 |
| `sangeun/` | **Massing to Estimate** (title: FIT PLATFORM · MASSING) | 한상은 프로 | 단일 index.html ~2.2MB (매스 → 견적) | 개발 중 |
| `heejin/` | **Massing to Render** | 엄희진 프로 | VWORLD 3D 매싱 스튜디오, 단일 index.html ~2.2MB + `source/`(텍스처 PNG) | 개발 중 |
| `yoonhee/` | **Project Management** | 조윤희 프로 | 로컬은 "Hub 연동 예정" 플레이스홀더, 실서비스는 외부 https://fit-workflow.pages.dev/ | 외부 연동 |

## 3. 공용 인프라 (`shared/` + 루트)
- [shared/supabase.js](../shared/supabase.js): Supabase 클라이언트 생성. 세션은 `sessionStorage`(탭 단위) — 같은 탭 내 앱 간 이동 시 로그인 유지, 탭/브라우저 닫으면 로그아웃. URL/anon 키 하드코딩(공개키, RLS로 보호).
- [shared/style.css](../shared/style.css): 공용 스타일.
- [db_setup.sql](../db_setup.sql): Supabase `public.notes` 테이블 + **RLS** — 로그인(`authenticated`) 사용자만 read/insert/delete, 비로그인(`anon`)은 전부 차단.
- 인증/배포 보조: `_deploy.ps1`, `_pull.ps1`, `배포.bat`, `배포_jubyung.bat`, `최신버전_받기.bat`.

## 4. heejin 방 상세 (Massing to Render)
- 빌드 없는 **단일 HTML 앱**. VWORLD WebGL(Cesium) 3D 지도 위 대지분석 + 신축 매스/입면 + AI 실사 렌더(탭 A~D).
- 외부 의존성: VWORLD(JSONP — REST가 CORS 미지원), Nominatim(보조 지오코딩), Gemini(AI 렌더, 키는 `localStorage`).
- **상세 문서**: [heejin/old/ARCHITECTURE.md](../heejin/old/ARCHITECTURE.md) (전역 상태·DOM 계약·통합 가이드).
- 이전 버전 백업은 `heejin/old/`, 텍스처/원본은 `heejin/source/`(PSD는 `.gitignore`).

## 5. 진행 현황 (2026-06-24 기준)
- [x] 루트 허브 + Supabase 로그인 게이트 + 5개 앱 카드 구성 완료.
- [x] 공용 인프라(supabase.js, style.css, db_setup.sql, 배포 스크립트) 구축.
- [x] heejin 방 문서 정리: `ARCHITECTURE.md`/`_diagram.svg` → `old/` 이동, 미사용 `reference/SE_3D_23.html` 삭제 (`cbf014f`).
- [x] 현재 버전 전체 서버 저장(커밋 & push) 완료.
- [~] 5개 앱 모두 "개발 중" — 각 방 기능 고도화 진행 중.

## 6. 방별 현황·TODO (다음 작업)
> 다음 세션에서 우선순위/지정 방 순으로 진행.

- [ ] **[우선순위 높음]** (다음에 할 작업을 여기에 적으세요 — 어느 방의 무슨 기능인지 명시)
- [ ] **jubyung (SCM Matrix)**: Netlify Blobs 기반 데이터 저장/조회 흐름 정리.
- [ ] **shinjae (Report Helper)**: 컨설팅 리포트 생성 기능 고도화.
- [ ] **sangeun (Massing→Estimate)**: 매스 입력 → 견적 산출 로직.
- [ ] **heejin (Massing→Render)**: 상태 영속화(Supabase 연동 — 새로고침 시 그린 건물 초기화 개선), 부정형 대지 프리셋 정확도.
- [ ] **yoonhee (PM)**: 외부 fit-workflow와 허브 연동(현재 플레이스홀더).
- [ ] **공통**: 허브↔각 앱 SSO 세션 공유 검증(탭 단위 sessionStorage 동작 확인), 앱 카드 상태 배지 갱신.

## 7. 알려진 리스크 / 주의
- **민감정보**: Supabase anon 키는 공개 가능(RLS로 보호)하나, **service_role 키·비밀번호·`.env`·`_secret/`·`*대외비*`는 절대 커밋 금지**(`.gitignore`로 차단됨). 폴더 통압축(zip) 공유 시 .gitignore가 무시되므로 주의 — 공유는 GitHub 저장소 또는 `git archive` 사용.
- **heejin**: VWORLD JSONP가 회사망/방화벽에 막히면 건축제한 미표시. 단일 VWORLD 키 노출(도메인 제한 없음).
- **상태 비영속**(heejin): 새로고침 시 작업 초기화 — 백엔드 연동 필요.
- **전역 네임스페이스**(heejin): 한 페이지 인라인 통합 시 충돌 → iframe 격리 권장.
