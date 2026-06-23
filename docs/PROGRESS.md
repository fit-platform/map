# PROGRESS — 매싱 스튜디오 (VWORLD 3D)

> 세션 인수인계용 진행 문서. 최종 갱신: **2026-06-24**, 작성자: heejin

---

## 🚀 시작 프롬프트 (다음 세션에 이걸 그대로 붙여넣으세요)

```
이어서 작업할게요. 먼저 docs/PROGRESS.md 와 heejin/old/ARCHITECTURE.md 를 읽고
프로젝트 현황(매싱 스튜디오 / 단일 HTML 앱)을 파악한 뒤,
아래 "다음 작업(TODO)" 항목 중 [우선순위 높음]부터 이어서 진행해줘.
작업 후에는 PROGRESS.md 의 '최종 갱신' 날짜와 '진행 현황'을 갱신하고,
repo 관례대로 main 에 `update <날짜 시각>` 메시지로 커밋 & push 해줘.
```

---

## 1. 프로젝트 개요
- **정체**: 빌드/번들러 없는 **단일 정적 HTML 앱**. VWORLD WebGL(Cesium 기반) 3D 지도 위에서 대지 분석 + 신축 매스/입면 스터디 + AI 실사 렌더링.
- **실행**: 브라우저만. GitHub Pages 정적 호스팅.
- **배포 위치**: https://fit-platform.github.io/map/heejin/
- **저장소**: https://github.com/fit-platform/map (FIT Platform 공용 — heejin/jubyung/sangeun/shinjae/yoonhee 각자 방)
- **운영 관례**: `main` 브랜치에 직접 커밋. 커밋 메시지 형식 `update YYYY-MM-DD HH:MM`.

## 2. 폴더 구조 (heejin 방 기준)
```
map/
├─ index.html              ← 루트 진입/포털
├─ shared/                 ← 공용 style.css, supabase.js
├─ heejin/
│  ├─ index.html           ← 앱 전체 (UI+CSS+JS 단일 파일, ~2.2MB)
│  ├─ source/              ← 입면 텍스처 PNG, 카트리지 PNG (상대경로 fetch) + 디자인 PSD(.gitignore)
│  ├─ modules/context/     ← 작업 컨텍스트
│  └─ old/                 ← 이전 버전 백업 + ARCHITECTURE.md, ARCHITECTURE_diagram.svg
└─ jubyung/ sangeun/ shinjae/ yoonhee/   ← 다른 팀원 방
```
- **상세 아키텍처**: `heejin/old/ARCHITECTURE.md` 참고 (외부 의존성·전역 상태·DOM 계약·통합 가이드 정리됨).

## 3. 외부 의존성 (요약)
- VWORLD WebGL/지오코딩/데이터(GetFeature) — REST는 CORS 미지원이라 **JSONP** 사용, 재시도 로직 포함.
- Nominatim(보조 지오코딩), Gemini(AI 실사 렌더, 키는 `localStorage`).
- VWORLD 키는 `index.html`에 하드코딩(도메인 제한 없음). Gemini 키는 코드/레포에 넣지 말 것.

## 4. 진행 현황 (2026-06-24 기준)
- [x] 핵심 기능 구현: 위치검색·건축제한·최대건축가능영역·신축매스/입면·포디움/지붕·건폐율 체크·AI 실사 렌더(탭 A~D).
- [x] 문서 정리: `ARCHITECTURE.md`/`_diagram.svg` → `heejin/old/` 로 이동, 미사용 `reference/SE_3D_23.html` 삭제.
- [x] 현재 버전 서버 저장(커밋 & push) 완료 — commit `cbf014f`.

## 5. 다음 작업 (TODO)
> 다음 세션에서 우선순위 순으로 진행.

- [ ] **[우선순위 높음]** (여기에 다음에 할 작업을 적으세요 — 예: 상태 영속화, postMessage 통합 훅 등)
- [ ] 상태 비영속 개선: 새로고침 시 그린 건물/투명화 초기화됨 → Supabase 연동으로 영속화 검토 (`shared/supabase.js` 존재).
- [ ] 다른 앱과 통합: iframe 격리 방식 권장 (ARCHITECTURE.md 8장), 필요 시 `postMessage` 훅 추가.
- [ ] 부정형 대지(ㄱ/凹자) 프리셋 정확도 개선.

## 6. 알려진 리스크
- JSONP/방화벽 의존(회사망에서 `<script>` 로드 차단 시 건축제한 미표시).
- 단일 VWORLD 키 노출(정적 파일), 남용 시 차단 가능.
- 전역 네임스페이스 — 한 페이지 인라인 통합 시 충돌(iframe 격리가 안전).
