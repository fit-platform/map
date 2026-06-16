# 매싱 스튜디오 (VWORLD 3D) — 아키텍처 문서
> 다른 앱과 합칠 때 참고용. 기준 파일: `map/heejin/index.html` (단일 HTML 앱). 최종 갱신: 2026-06-16

---

## 1. 개요
- **정체**: 의존성 빌드 없는 **단일 정적 HTML 파일** 앱. VWORLD WebGL(=Cesium 기반) 3D 지도 위에서 대지 분석 + 신축 매스/입면 스터디 + AI 실사 렌더링을 한다.
- **실행 환경**: 브라우저만. 서버/번들러 없음. GitHub Pages 정적 호스팅.
- **스택**: HTML + 바닐라 JS(ES5 스타일, 모듈/네임스페이스 없음, 전부 전역) + VWORLD WebGL API(내부에 `window.Cesium` 포함).
- **현재 배포 위치**: `https://fit-platform.github.io/map/heejin/` (FIT Platform `map` 저장소의 heejin 방).

## 2. 파일 구성
```
heejin/
├─ index.html        ← 앱 전체 (UI + 스타일 + 모든 JS, 단일 파일)
├─ source/           ← 입면 패널 텍스처 PNG (상대경로로 fetch)
│   ├─ frame-1.png ~ frame-4.png   (프레임 레이어)
│   ├─ cart-1.png, cart-2.png      (카트리지 랜덤 배치)
│   └─ frame-hero.png
├─ ARCHITECTURE.md   ← (이 문서)
└─ old/              ← 이전 버전 백업 (index_v1=로그인템플릿, index_260615=로그인+iframe판)
```
- `index.html` 과 `source/` 는 **항상 같은 디렉터리 구조**로 함께 둬야 함(텍스처가 `source/파일.png` 상대경로).
- HTTP(S)로 열어야 함. `file://` 로 열면 텍스처 fetch가 막혀 회색 플레이스홀더가 뜸.

## 3. 외부 의존성 (통합 시 가장 중요)
| # | 서비스 | 용도 | 호출 방식 | 키 / 제약 |
|---|---|---|---|---|
| 1 | `map.vworld.kr/js/webglMapInit.js` | 3D 지도 엔진(Cesium 포함) | `<script src>` (head) | `apiKey` 쿼리에 포함. 전역 `vw`, `Cesium` 노출 |
| 2 | `api.vworld.kr/req/address` | 지오코딩(도로명/지번→좌표) | **JSONP** (`&callback=`) | `key`. CORS 미지원이라 JSONP 필수 |
| 3 | `api.vworld.kr/req/data` (GetFeature) | 대지경계(`LP_PA_CBND_BUBUN`)·용도지역(`LT_C_UQ111`)·인접도로 | **JSONP** | `key`+`domain` 파라미터. CORS 미지원 |
| 4 | `nominatim.openstreetmap.org` | 보조 지오코딩(장소명) | `fetch` (CORS OK) | 없음 |
| 5 | `generativelanguage.googleapis.com` | AI 실사 렌더(Gemini 이미지) | `fetch` POST | 사용자 키, `localStorage["geminiKey"]` 에 저장 |
| 6 | `source/*.png` | 입면 패널 텍스처 | `fetch` (상대경로) | 같은 폴더 필요 |

- **VWORLD 키**: `B5CEDD7D-84D6-314E-875C-9B5BF7E1233A` — `index.html`에 2곳(스크립트 태그 + `var VWORLD_KEY`). 지도·지오코더·데이터·WMS 서비스 모두 활성, **도메인 제한 없음**(어느 출처에서나 동작 확인).
- **CORS 회피 핵심**: VWORLD REST는 브라우저 `fetch` 시 CORS로 막힘 → `jsonpGet()`(`<script>` 주입 + `callback`)으로 호출. 간헐 실패 대비 `jsonpGet` 3회 재시도 + `fetchFeatureResilient` 항목별 3회 재시도.

## 4. 기능 모듈 맵 (탭 단위)
좌상단 `#panel`(탭 A~D) + 우하단 `#coveragePanel`(건폐율 체크) + 전체화면 `#vmap`.

- **탭 A · 위치·투명화**
  - 위치 검색: `searchAddress()` → 지오코딩 → 카메라 이동
  - 건축제한: 대지경계 폴리라인 + 용도지역/건폐율/용적률(국토계획법 시행령 상한표 `ZONING_TABLE`) + 대지면적 자동
  - 최대 건축가능영역: 변별 후퇴(도로측/인접대지/추가) 적용한 내측 폴리곤 (`computeBuildable`)
  - 건물 투명화: VWORLD 기존 건물 클릭 → 투명 토글 (`toggleTransparent`)
- **탭 B · 신축·입면**
  - 신축 건물: **프리셋**(가능영역 내 건폐율 만족 최대 내접 직사각형, `makePresetRectangle`) / **직접 그리기**(점 찍기·편집). 공통: 층고·층수·수평투영
  - 입면 모듈 패널링: `source/` PNG를 벽면 텍스처로 (`rebuildPaneling`)
- **탭 C · 포디움·지붕**: 지면에서 띄우기(포디움 폴리곤), 지붕 폴리곤 디자인
- **탭 D · AI 실사**: 화면 캡쳐(`getDisplayMedia`)/업로드 → Gemini로 실사 변환(`runAiRender`)
- **건폐율 체크 패널**: 대지면적 대비 수평투영면적 합집합 → 건폐율(`updateCoverage`, `computeTotalProjArea`)

## 5. 데이터 흐름
```
주소 입력 → geocodeVWorld(JSONP) ─실패→ geocodeNominatim(fetch)
        → 좌표(lon,lat) → map.moveTo
        → loadParcelAndRestrictions(lon,lat)
             ├─ Promise.all: 대지(LP_PA_CBND_BUBUN) + 용도지역(LT_C_UQ111)  [fetchFeatureResilient]
             ├─ drawSiteBoundary()  (sitePlaneH = 평균 지반고, 동일 z 폴리라인)
             ├─ applyZoning() → 건폐율/용적률 표기 + presetBCR 자동입력
             └─ detectRoadEdges()(BOX 인접필지) → computeBuildable() → buildableCoords
주소 결과 → (탭 B) makePresetRectangle(buildableCoords, 목표건폐율) → drawCoords
        또는 직접 그리기 → drawCoords
        → rebuildDraft() (매스 솔리드) → rebuildPaneling() (입면 텍스처)
        → updateCoverage() (건폐율 갱신)
(탭 D) 화면 캡쳐/업로드 → runAiRender() → Gemini → 결과 이미지
```

## 6. 전역 상태 & DOM 계약
> ⚠️ **모든 상태가 전역 변수, 모든 핸들러가 전역 함수**(인라인 `onclick`). 이름공간 없음 → 다른 앱과 한 페이지에 합치면 충돌 위험. (8장 참고)

- **핵심 전역 변수**: `map`, `viewer`(=`map._wsViewer`), `mode`, `drawCoords`, `draftEntities`/`draftSolid`/`draftBaseH`, `panelEntities`, `transparentList`, `elevateMeter`, `groundPolygonsList`, `roofPolygonsList`, `siteBoundaryCoords`/`siteBoundaryEnts`, `roadEdgeFlags`, `buildableCoords`/`buildableEnts`, `sitePlaneH`, `buildMode`, `PANEL_LAYERS`, `CART_IMG`/`CART_URL`, `VWORLD_KEY`, `ZONING_TABLE`.
- **핵심 DOM ID**: `vmap`(지도 컨테이너), `panel`, `coveragePanel`, `tabA~tabD`; 입력 `address`,`storyH`,`floors`,`sbRoad`,`sbAdj`,`sbExtra`,`presetBCR`,`siteArea`,`modW`; 표기 `rsAddr`,`rsZone`,`rsArea`,`rsBCR`,`rsFAR`,`rsBuildable`,`projArea`,`coverageRatio`; AI `aiKey`,`aiPrompt`,`aiResImg`.
- **공개 함수(=인라인 onclick 진입점, 사실상 앱의 API)**: `switchTab`, `searchAddress`, `toggleDraw/Edit`, `undoPoint`, `onBuildingDims`, `setBuildMode`, `makePresetRectangle`, `rebuildDraft`, `clearBuilding`, `onModuleInput`, `onLayerGapChange`, `onCartRatioChange`, `onInteriorLightChange`, `onElevateChange`, `toggleGroundDraw/Edit`, `confirmGroundPoly`, `clearAllGroundPolygons`, `onRoofHeightChange`, `toggleRoofDraw/Edit`, `confirmRoofPoly`, `clearAllRoofPolygons`, `computeBuildable`, `updateCoverage`, `saveAiKey`, `applyAiPreset`, `captureScreen`, `onAiUpload`, `runAiRender`, `downloadAiResult`.
- **초기화**: `window.onload` → `new vw.Map()` → `map.setOption` → `map.start()` → 1.5초 후 `viewer=map._wsViewer`, 클릭 핸들러 등록, 패널 이미지 로드.

## 7. 좌표·렌더링 규약 (합칠 때 호환 위해)
- 좌표: `{lon, lat}` (EPSG:4326). 면적은 위도보정 미터 변환 후 신발끈 공식(`areaOfCoords`).
- 모든 평면 폴리라인은 **동일 z = `sitePlaneH`**(건물 없을 때 대지 평균 지반고, `globe.getHeight` 기준)로 그림. 지형 provider(`sampleTerrainMostDetailed`)는 표고 기준이 달라 **쓰지 않음**(쓰면 경계가 공중에 뜸).
- 가림에도 보이게 폴리라인에 `depthFailMaterial` 사용.
- VWORLD 푸터/로고는 CSS로 숨김(`#footer3d`, `.cesium-viewer-bottom`).

## 8. 다른 앱과 합치는 가이드 (권장 순서)
**A. iframe 격리 (강력 추천)** — 이전 heejin 방식이 이거였음.
- 호스트 페이지에서 `<iframe src="heejin/index.html">` 로 통째 임베드. 전역/CSS 충돌 0, 그대로 동작.
- 양방향 통신이 필요하면 `postMessage`: 예) 호스트 → iframe `{type:'search', address}`; iframe → 호스트 `{type:'siteArea', value}`. (현재 코드엔 postMessage 리스너가 없으므로, 합칠 때 `searchAddress` 등에 훅을 한두 줄 추가.)
- 로그인/권한이 필요하면 **호스트(게이트) + iframe(앱)** 구조 (FIT Platform 방 패턴) 그대로 재사용.

**B. 한 페이지에 인라인(비권장)** — 꼭 합쳐야 하면:
- 전역 변수·함수 충돌 위험 → IIFE/객체로 감싸 네임스페이스화 필요(예: `window.Massing = {...}`), 인라인 `onclick`을 `addEventListener`로 전환.
- CSS 충돌: 앱은 `html,body{height:100%;overflow:hidden}` 전체화면 가정 → 컨테이너에 가두고 스코프트 CSS로 변경.
- `#vmap` 단일 지도 인스턴스 가정. 한 페이지에 VWORLD 지도 2개는 키/리소스 충돌 주의.
- `Cesium`/`vw` 전역은 VWORLD 스크립트가 한 번만 로드되도록.

**C. 지도 공유형** — 다른 지도 앱과 한 Cesium 뷰어를 공유하려면, `viewer.entities`/`imageryLayers`에 본 앱의 그리기 함수를 어댑터로 연결. 단 본 앱은 `map._wsViewer` 단일 전역 가정이라 리팩터 필요.

## 9. 알려진 제약 / 리스크
- **JSONP 의존**: VWORLD REST가 CORS 미지원이라 JSONP 필수. 회사망/방화벽이 `<script>` 로드를 막으면 건축제한이 안 뜸 → 재시도 로직으로 완화했으나 환경 의존.
- **단일 VWORLD 키 노출**: 정적 파일이라 키가 공개됨(도메인 제한 없음). 남용 시 키 차단 가능.
- **Gemini 키**: 사용자 브라우저 `localStorage` 에만 저장(서버 없음). 기밀 키를 코드/저장소에 넣지 말 것.
- **부정형 대지**: 최대 내접 직사각형(프리셋)은 ㄱ/凹자 대지에서 목표 건폐율을 못 채울 수 있음(보수적). 깊은 노치는 반평면 클리핑 폴백.
- **전역 네임스페이스**: 인라인 통합 시 충돌. iframe 격리가 가장 안전.
- **상태 비영속**: 새로고침 시 그린 건물/투명화 초기화(저장 기능 없음). 영속화하려면 Supabase 등 백엔드 연동 필요.
