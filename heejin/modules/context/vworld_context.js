/* =====================================================================
 * FIT · VWORLD 컨텍스트 모듈 (vworld_context.js)
 * ---------------------------------------------------------------------
 * 역할:  sangeun 모델러(reference/index_ref_sangeun.html) 위에 얹어
 *        ① 주소 검색 → '대지 평면 윤곽선'만 불러오기
 *        ② 그 지리적 위치 기준으로 VWORLD 3D 인근 건물(실사 텍스처) 로드
 *           → 켜고/끄기 토글
 *
 * 설계 원칙(독립 개발/유지보수 용이):
 *   - 베이스 앱(sangeun)을 건드리지 않는다. 호스트는 이 파일을
 *     <script src="modules/context/vworld_context.js"></script> 한 줄로만 포함.
 *   - 호스트의 전역 THREE / scene / camera 를 "이름으로" 참조한다(전역 어휘 환경 공유).
 *     → 베이스가 갱신돼도 변수명(scene/camera/THREE)만 같으면 그대로 동작.
 *   - 모든 상태/DOM/로더는 이 모듈 내부에 캡슐화. 외부 노출은 window.VWorldContext 만.
 *
 * 좌표계:
 *   sangeun = 미터, Y up, 지면 XZ평면(GridHelper), 모델 원점 중심.
 *   VWORLD 타일 = WGS84 ECEF. → 대지 중심(lon0,lat0)에 ENU 프레임을 세워
 *   east→+X, up→+Y, north→−Z 로 변환. 대지 윤곽선과 건물이 같은 프레임을 써서 정확히 정렬.
 *
 * 버전(검증):
 *   호스트 THREE = r128. GLTFLoader/DRACOLoader도 r128(동일)로 로드.
 *   KTX2Loader/WorkerPool은 r128에 전역 빌드가 없어 r133에서 로드(인터페이스 호환).
 * ===================================================================== */
(function () {
  "use strict";

  var CFG = {
    VWORLD_KEY: "B5CEDD7D-84D6-314E-875C-9B5BF7E1233A", // 지도·지오코더·데이터 공용 키(도메인 제한 없음)
    TILES_ROOT: "https://cdn.vworld.kr/TDServer/services/map4/TG9ENA.json",
    LIB: {
      gltf:  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
      draco: "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/DRACOLoader.js",
      pool:  "https://cdn.jsdelivr.net/npm/three@0.133.0/examples/js/utils/WorkerPool.js",
      ktx2:  "https://cdn.jsdelivr.net/npm/three@0.133.0/examples/js/loaders/KTX2Loader.js",
      dracoDec: "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/",
      basis:    "https://cdn.jsdelivr.net/npm/three@0.133.0/examples/js/libs/basis/"
    },
    RADIUS_M: 250,      // 대지 주변 수집 반경(이 박스와 겹치는 타일 = 한 동네)
    MAX_TILES: 160,     // 안전 상한
    FETCH_BUDGET: 800,  // tileset 탐색 fetch 상한
    GROUND_R: 320,      // 항공사진 지면 반경(m)
    GROUND_ZOOM: 18,    // WMTS 줌(256px 타일)
    GROUND_SEG: 96,     // 지면 평면 분할(기복 표현용 — DEM 해상도 살리려 촘촘히)
    DEM_ZOOM: 13,       // AWS Terrarium DEM 줌(디테일은 살리고 노이즈는 아래 평활화로 제거)
    DEM_SMOOTH_M: 150,  // 지형 평활화 반경(m): 이보다 작은 건물/노이즈 제거, 순수 지형추세만
    DEM_EXAG: 1.0       // 지형 수직 과장(1=실제)
  };

  // ---- 호스트 전역 참조(이름으로 직접) ----
  function H() {
    var t = (typeof THREE !== "undefined") ? THREE : (window.THREE || null);
    var s = (typeof scene !== "undefined") ? scene : (window.scene || null);
    var c = (typeof camera !== "undefined") ? camera : (window.camera || null);
    var rd = (typeof renderer !== "undefined") ? renderer : (window.renderer || null);
    return { THREE: t, scene: s, camera: c, renderer: rd };
  }

  var ST = {
    loaders: null,         // {gltf, ktx2}
    loaderPromise: null,
    site: null,            // {lon0, lat0, ring:[{lon,lat}]}
    siteGroup: null,       // 대지 윤곽선
    buildingsGroup: null,  // 인근 건물
    groundGroup: null,     // 항공사진 지면
    dem: null,             // 실측 DEM 샘플러 캐시 {lon0,lat0,fn}
    deleted: [],           // 삭제(숨김)된 건물 타일 — 복원용
    delMode: false,        // 건물 삭제 모드(클릭 시 삭제)
    busy: false
  };

  // ====================== 스크립트 로더 ======================
  function injectScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error("스크립트 로드 실패: " + src)); };
      document.head.appendChild(s);
    });
  }

  // GLTFLoader + Draco + KTX2(Basis) 준비 (1회)
  function ensureLoaders() {
    if (ST.loaderPromise) return ST.loaderPromise;
    ST.loaderPromise = (async function () {
      var T = H().THREE;
      if (!T) throw new Error("THREE(호스트)를 찾을 수 없습니다.");
      await injectScript(CFG.LIB.gltf);
      await injectScript(CFG.LIB.draco);
      await injectScript(CFG.LIB.pool);     // KTX2Loader 의존: THREE.WorkerPool
      await injectScript(CFG.LIB.ktx2);
      if (typeof T.GLTFLoader !== "function") throw new Error("GLTFLoader 미탑재");
      if (typeof T.KTX2Loader !== "function") throw new Error("KTX2Loader 미탑재");

      var hostRenderer = H().renderer;       // 호스트 const renderer (가리지 말 것)
      if (!hostRenderer) throw new Error("호스트 renderer를 찾을 수 없습니다(KTX2 초기화 불가).");

      var gltf = new T.GLTFLoader();
      var draco = new T.DRACOLoader();
      draco.setDecoderPath(CFG.LIB.dracoDec);
      gltf.setDRACOLoader(draco);            // 메시 = Draco 압축
      var ktx2 = new T.KTX2Loader();
      ktx2.setTranscoderPath(CFG.LIB.basis);
      ktx2.detectSupport(hostRenderer);      // 필수: 안 하면 KTX2 디코드 실패
      gltf.setKTX2Loader(ktx2);              // 실사 텍스처 = KTX2(Basis Universal)
      ST.loaders = { gltf: gltf, ktx2: ktx2 };
      return ST.loaders;
    })();
    return ST.loaderPromise;
  }

  // ====================== VWORLD JSONP ======================
  var _seq = 0;
  function jsonpOnce(baseUrl) {
    return new Promise(function (resolve, reject) {
      var cb = "__vwctx_" + (++_seq) + "_" + Date.now();
      var script = document.createElement("script");
      var timer = setTimeout(function () { cleanup(); reject(new Error("JSONP 시간 초과")); }, 9000);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (d) { cleanup(); resolve(d); };
      script.onerror = function () { cleanup(); reject(new Error("JSONP 로드 실패")); };
      var sep = baseUrl.indexOf("?") === -1 ? "?" : "&";
      script.src = baseUrl + sep + "callback=" + cb;
      document.head.appendChild(script);
    });
  }
  async function jsonpGet(url) {
    var last;
    for (var i = 0; i < 3; i++) { try { return await jsonpOnce(url); } catch (e) { last = e; if (i < 2) await wait(400); } }
    throw last;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // 주소 → {lon,lat,refined}
  async function geocode(address) {
    var types = ["ROAD", "PARCEL"];
    for (var i = 0; i < types.length; i++) {
      try {
        var url = "https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0" +
          "&crs=EPSG:4326&type=" + types[i] + "&address=" + encodeURIComponent(address) +
          "&format=json&key=" + CFG.VWORLD_KEY;
        var d = await jsonpGet(url);
        var r = d.response;
        if (r && r.status === "OK" && r.result && r.result.point)
          return { lon: parseFloat(r.result.point.x), lat: parseFloat(r.result.point.y),
                   refined: (r.refined && r.refined.text) || address };
      } catch (e) { /* 다음 타입 시도 */ }
    }
    return null;
  }

  // 점 → 대지(지적) 외곽 링 [{lon,lat}]
  function extractOuterRing(geom) {
    if (!geom || !geom.coordinates) return null;
    var c = geom.coordinates;
    var ring = (geom.type === "MultiPolygon") ? (c[0] && c[0][0]) : (geom.type === "Polygon") ? c[0] : null;
    if (!ring) return null;
    var pts = ring.map(function (p) { return { lon: Number(p[0]), lat: Number(p[1]) }; });
    if (pts.length >= 2) { var f = pts[0], l = pts[pts.length - 1]; if (f.lon === l.lon && f.lat === l.lat) pts.pop(); }
    return pts;
  }
  async function fetchParcel(lon, lat) {
    for (var i = 0; i < 5; i++) {   // 지적 경계는 간헐적 0건 반환 → 재시도
      try {
        var url = "https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&format=json" +
          "&data=LP_PA_CBND_BUBUN&key=" + CFG.VWORLD_KEY +
          "&domain=" + encodeURIComponent(location.origin || location.href) +
          "&geomFilter=POINT(" + lon + " " + lat + ")&geometry=true&attribute=true&crs=EPSG:4326&size=10";
        var d = await jsonpGet(url);
        var fc = d.response && d.response.result && d.response.result.featureCollection;
        if (fc && fc.features && fc.features.length) {
          var ring = extractOuterRing(fc.features[0].geometry);
          if (ring && ring.length >= 3) return ring;
        }
      } catch (e) { /* 재시도 */ }
      await wait(400);
    }
    return null;
  }

  // ====================== 측지/ENU 좌표 ======================
  function geodeticToECEF(lonDeg, latDeg, h) {
    var T = H().THREE;
    var a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f);
    var lon = lonDeg * Math.PI / 180, lat = latDeg * Math.PI / 180;
    var sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
    var N = a / Math.sqrt(1 - e2 * sl * sl);
    return new T.Vector3((N + h) * cl * co, (N + h) * cl * so, (N * (1 - e2) + h) * sl);
  }
  function enuBasis(lonDeg, latDeg) {
    var T = H().THREE;
    var lon = lonDeg * Math.PI / 180, lat = latDeg * Math.PI / 180;
    var sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
    return {
      up:    new T.Vector3(cl * co, cl * so, sl),
      east:  new T.Vector3(-so, co, 0),
      north: new T.Vector3(-sl * co, -sl * so, cl)
    };
  }
  // ECEF→로컬(east=+X, up=+Y, north=−Z) 회전행렬(원점=anchor lon0/lat0)
  function worldToLocalMatrix(lon0, lat0) {
    var T = H().THREE, b = enuBasis(lon0, lat0);
    var negN = b.north.clone().multiplyScalar(-1);
    var Rl2w = new T.Matrix4().makeBasis(b.east, b.up, negN); // 열 = 로컬축(월드표현)
    var Rw2l = Rl2w.clone().transpose();                      // world→local 회전
    var A = geodeticToECEF(lon0, lat0, 0);
    var t = A.clone().applyMatrix4(Rw2l).multiplyScalar(-1);  // -Rw2l·A
    var M = Rw2l.clone(); M.setPosition(t);
    return { M: M, Rw2l: Rw2l, A: A };
  }

  // ====================== 3D Tiles 탐색/디코드 ======================
  async function fetchTileset(url) {
    var t = await (await fetch(url)).text();
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); // UTF-8 BOM
    return JSON.parse(t);
  }
  function makeRegionTest(lon0, lat0) {
    var tLon = lon0 * Math.PI / 180, tLat = lat0 * Math.PI / 180;
    var dLat = CFG.RADIUS_M / 6378137, dLon = CFG.RADIUS_M / (6378137 * Math.cos(tLat));
    return function (bv) {
      if (!bv || !bv.region) return true;
      var r = bv.region; // [w,s,e,n,minH,maxH] (rad)
      return r[0] <= tLon + dLon && r[2] >= tLon - dLon && r[1] <= tLat + dLat && r[3] >= tLat - dLat;
    };
  }
  // 대지 주변 AOI와 겹치는 리프 b3dm(고해상도) 수집
  // VWORLD 트리는 곳에 따라 얕은 깊이에서 끝나는 '거친 광역 덩어리' 리프가 섞임
  // (geometricError는 리프 전부 0이라 구분 불가) → 가장 깊은 LOD만 채택해 걸러낸다.
  async function collectLeaves(lon0, lat0) {
    var inAOI = makeRegionTest(lon0, lat0);
    var found = [], budget = CFG.FETCH_BUDGET;
    async function walk(node, tsUrl, depth) {
      if (found.length >= CFG.MAX_TILES || budget <= 0 || !node || !inAOI(node.boundingVolume)) return;
      var hc = !!(node.children && node.children.length);
      var c = node.content, full = (c && (c.uri || c.url)) ? new URL(c.uri || c.url, tsUrl).href : null;
      if (full && /\.json/i.test(full)) {
        budget--;
        try { var ts = await fetchTileset(full); if (ts && ts.root) await walk(ts.root, full, depth + 1); } catch (e) {}
      }
      if (hc) for (var i = 0; i < node.children.length && found.length < CFG.MAX_TILES && budget > 0; i++)
        await walk(node.children[i], tsUrl, depth + 1);
      if (full && /\.b3dm/i.test(full) && !hc) found.push({ url: full, depth: depth });
    }
    var root = await fetchTileset(CFG.TILES_ROOT);
    await walk(root.root, CFG.TILES_ROOT, 0);
    if (!found.length) return [];
    var maxD = found.reduce(function (m, f) { return Math.max(m, f.depth); }, 0);
    // 최심 LOD에서 1단계까지만 허용(얕은 광역 덩어리 제외)
    return found.filter(function (f) { return f.depth >= maxD - 1; }).map(function (f) { return f.url; });
  }
  function extractGLB(ab) {
    var dv = new DataView(ab);
    var magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "b3dm") throw new Error("b3dm 아님: " + magic);
    var ftJSON = dv.getUint32(12, true), ftBIN = dv.getUint32(16, true),
        btJSON = dv.getUint32(20, true), btBIN = dv.getUint32(24, true);
    var glbStart = 28 + ftJSON + ftBIN + btJSON + btBIN, rtc = null;
    if (ftJSON > 0) { try { var ft = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 28, ftJSON))); rtc = ft.RTC_CENTER || null; } catch (e) {} }
    return { glb: ab.slice(glbStart), rtc: rtc };
  }
  async function loadTileGroup(url) {
    var T = H().THREE, ab = await (await fetch(url)).arrayBuffer(), ex = extractGLB(ab);
    var base = url.substring(0, url.lastIndexOf("/") + 1);
    return new Promise(function (res, rej) {
      ST.loaders.gltf.parse(ex.glb, base, function (g) {
        var grp = new T.Group();
        // 3D Tiles 기본 gltfUpAxis=Y → glTF(Y-up)를 ECEF(Z-up)로: +90° about X (Cesium Y_UP_TO_Z_UP)
        g.scene.rotation.x = Math.PI / 2;
        grp.add(g.scene);
        if (ex.rtc) grp.position.set(ex.rtc[0], ex.rtc[1], ex.rtc[2]); // 진짜 ECEF (RTC_CENTER)
        res(grp);
      }, function (e) { rej(e); });
    });
  }

  // ====================== 대지 윤곽선 ======================
  function drawOutline(ring, lon0, lat0) {
    var T = H().THREE, scene = H().scene;
    if (ST.siteGroup) { scene.remove(ST.siteGroup); disposeGroup(ST.siteGroup); }
    ST.siteGroup = new T.Group(); ST.siteGroup.name = "fitSiteOutline";
    var info = worldToLocalMatrix(lon0, lat0);
    var pts = ring.map(function (p) {
      var P = geodeticToECEF(p.lon, p.lat, 0).sub(info.A).applyMatrix4(info.Rw2l); // 회전만(translation 0)
      return new T.Vector3(P.x, 0.06, P.z);
    });
    pts.push(pts[0].clone());
    var line = new T.LineLoop(new T.BufferGeometry().setFromPoints(pts.slice(0, -1)),
      new T.LineBasicMaterial({ color: 0x1a73e8, linewidth: 2 }));
    ST.siteGroup.add(line);
    // 얇은 채움(반투명)
    var shapePts = pts.slice(0, -1).map(function (v) { return new T.Vector2(v.x, v.z); });
    try {
      var shape = new T.Shape(shapePts);
      var geo = new T.ShapeGeometry(shape);
      var mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0x1a73e8, transparent: true, opacity: 0.10, side: T.DoubleSide, depthWrite: false }));
      mesh.rotation.x = Math.PI / 2; mesh.position.y = 0.04;
      ST.siteGroup.add(mesh);
    } catch (e) {}
    scene.add(ST.siteGroup);
  }

  // ====================== 인근 건물 ======================
  async function loadBuildings(lon0, lat0, onStatus) {
    var T = H().THREE, scene = H().scene;
    await ensureLoaders();
    onStatus && onStatus("인근 타일 탐색 중…");
    var leaves = await collectLeaves(lon0, lat0);
    if (!leaves.length) { onStatus && onStatus("주변 건물 타일을 찾지 못했습니다."); return 0; }
    onStatus && onStatus("건물 " + leaves.length + "동 불러오는 중…");

    if (ST.buildingsGroup) { scene.remove(ST.buildingsGroup); disposeGroup(ST.buildingsGroup); ST.buildingsGroup = null; }
    ST.deleted = [];   // 새로 로드 → 삭제 이력 초기화
    var info = worldToLocalMatrix(lon0, lat0);
    var bg = new T.Group(); bg.name = "fitContextBuildings";

    // 실측 DEM(공통) — 건물·지면이 같은 지형을 쓰게 함
    onStatus && onStatus("지형(DEM) 불러오는 중…");
    var dem = await ensureDem(lon0, lat0);

    var ok = 0, skipped = 0, tmp = new T.Vector3();
    for (var i = 0; i < leaves.length; i++) {
      try {
        var grp = await loadTileGroup(leaves[i]);     // grp.position = ECEF(RTC)
        var ecef = grp.position.clone();
        grp.updateMatrixWorld(true);
        var sz = new T.Box3().setFromObject(grp).getSize(tmp);
        if (Math.max(sz.x, sz.y, sz.z) > 600) { disposeGroup(grp); skipped++; continue; } // 거친 광역 덩어리 제외
        grp.applyMatrix4(info.M);                       // ECEF → ENU 월드(개별 타일)
        grp.__ecef = ecef;                              // 재안착용 원 좌표
        bg.add(grp); ok++;
      } catch (e) { /* 개별 타일 실패는 건너뜀 */ }
      if (i % 10 === 0) onStatus && onStatus("건물 로드 " + ok + "/" + leaves.length + "…");
    }
    if (skipped) console.info("[VWorldContext] 광역 덩어리 타일 " + skipped + "개 제외");

    scene.add(bg); bg.updateMatrixWorld(true);

    // ── 건물 재안착: 각 타일 바닥을 실측 DEM 지형 높이에 앉힘(지형·건물 완전 일치) ──
    var centerElev = dem ? dem(lon0, lat0) : 0, v = new T.Vector3();
    bg.children.forEach(function (grp) {
      var mn = Infinity;
      grp.traverse(function (o) {
        if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
          var p = o.geometry.attributes.position, mw = o.matrixWorld, st = Math.max(1, Math.floor(p.count / 24));
          for (var k = 0; k < p.count; k += st) { v.set(p.getX(k), p.getY(k), p.getZ(k)).applyMatrix4(mw); if (v.y < mn) mn = v.y; }
        }
      });
      if (mn > 1e7) return;
      var target = 0;
      if (dem && grp.__ecef) { var ll = ecefToGeodetic(grp.__ecef); target = (dem(ll.lon, ll.lat) - centerElev) * CFG.DEM_EXAG; }
      grp.position.y += (target - mn);                 // 바닥을 지형에 맞춤(높이 보존)
      grp.updateMatrixWorld(true);
    });

    ST.buildingsGroup = bg;
    onStatus && onStatus("주변 건물 " + ok + "동 표시됨" + (dem ? " · 지형 재안착" : ""));
    return ok;
  }

  // ECEF → 측지경위도(Bowring)
  function ecefToGeodetic(p) {
    var a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), e2 = f * (2 - f), ep2 = (a * a - b * b) / (b * b);
    var x = p.x, y = p.y, z = p.z, r = Math.sqrt(x * x + y * y), th = Math.atan2(z * a, r * b);
    var lon = Math.atan2(y, x);
    var lat = Math.atan2(z + ep2 * b * Math.pow(Math.sin(th), 3), r - e2 * a * Math.pow(Math.cos(th), 3));
    return { lon: lon * 180 / Math.PI, lat: lat * 180 / Math.PI };
  }

  // 실측 DEM 샘플러 캐시(건물·지면 공통). max(GROUND_R, RADIUS_M) 영역 커버.
  // 도심 DEM은 건물이 섞여(DSM 성격) 세밀줌이 노이즈 → 반경 DEM_SMOOTH_M 공간평균으로
  // 건물 규모 구조물을 제거하고 순수 지형 추세만 남긴다.
  async function ensureDem(lon0, lat0) {
    if (ST.dem && ST.dem.lon0 === lon0 && ST.dem.lat0 === lat0) return ST.dem.fn;
    var Rcov = Math.max(CFG.GROUND_R, CFG.RADIUS_M) + CFG.DEM_SMOOTH_M + 120;
    var dLat = Rcov / 111320, dLon = Rcov / (111320 * Math.cos(lat0 * Math.PI / 180));
    var raw = await buildDemSampler(lon0 - dLon, lon0 + dLon, lat0 + dLat, lat0 - dLat);
    var fn = null;
    if (raw) {
      var Rs = CFG.DEM_SMOOTH_M, sLat = Rs / 111320, sLon = Rs / (111320 * Math.cos(lat0 * Math.PI / 180)), n = 3;
      fn = function (lon, lat) {                 // 반경 Rs 공간평균(7x7)
        var s = 0, c = 0;
        for (var j = -n; j <= n; j++) for (var i = -n; i <= n; i++) {
          s += raw(lon + (i / n) * sLon, lat + (j / n) * sLat); c++;
        }
        return s / c;
      };
    }
    ST.dem = { lon0: lon0, lat0: lat0, fn: fn };
    return fn;
  }

  // 실제 정점 기준 최저 Y(회전객체 AABB 과대평가 회피)
  function trueMinY(group) {
    var T = H().THREE, v = new T.Vector3(), minY = Infinity;
    group.updateMatrixWorld(true);
    group.traverse(function (o) {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        var pos = o.geometry.attributes.position, mw = o.matrixWorld;
        for (var i = 0; i < pos.count; i++) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mw);
          if (v.y < minY) minY = v.y;
        }
      }
    });
    return minY;
  }

  // ====================== 항공사진 지면 ======================
  function lonlat2tile(lon, lat, z) {
    var n = Math.pow(2, z), lr = lat * Math.PI / 180;
    return { x: Math.floor((lon + 180) / 360 * n),
             y: Math.floor((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n) };
  }
  function tile2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function tile2lat(y, z) { var nn = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(nn) - Math.exp(-nn))); }
  function merc(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function invMerc(m) { return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI; }

  // 각 건물 타일의 최저점(바닥) = 그 위치의 VWORLD 지면 고도 → [[x,z,y],...]
  function getBasePoints(group) {
    var T = H().THREE, bg = group || ST.buildingsGroup;
    if (!bg) return [];
    var pivot = bg.children[0]; if (!pivot) return [];
    bg.updateMatrixWorld(true);
    var pts = [], v = new T.Vector3();
    pivot.children.forEach(function (g) {
      var mn = Infinity, mx = 0, mz = 0;
      g.traverse(function (o) {
        if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
          var p = o.geometry.attributes.position, mw = o.matrixWorld, st = Math.max(1, Math.floor(p.count / 24));
          for (var i = 0; i < p.count; i += st) { v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mw); if (v.y < mn) { mn = v.y; mx = v.x; mz = v.z; } }
        }
      });
      if (mn < 1e8) pts.push([mx, mz, mn]);
    });
    return pts;
  }

  // 건물 바닥점들로 역거리가중(IDW) 지형 보간 → VWORLD 건물과 정확히 일치하는 실제 기복.
  // 외부 DEM(AWS 등)은 데이터/datum이 달라 과장·부정합 → VWORLD 자체 지면(건물바닥)을 기준으로 함.
  function makeTerrain(pts) {
    if (!pts || pts.length < 3) return null;
    // 이상치 제거: 일부 타일은 바닥점이 비정상적으로 높음(부유 조각 등) → 지형 스파이크 유발.
    // 중앙값 ± max(35m, 6·MAD) 밖은 버린다(실제 도심 지형 범위).
    var ys = pts.map(function (p) { return p[2]; }).slice().sort(function (a, b) { return a - b; });
    var med = ys[Math.floor(ys.length / 2)];
    var devs = ys.map(function (y) { return Math.abs(y - med); }).sort(function (a, b) { return a - b; });
    var mad = devs[Math.floor(devs.length / 2)] || 0;
    var thr = Math.max(35, 6 * mad);
    var f = pts.filter(function (p) { return Math.abs(p[2] - med) <= thr; });
    if (f.length < 3) f = pts;
    return function (x, z) {
      var sw = 0, sv = 0;
      for (var i = 0; i < f.length; i++) {
        var dx = x - f[i][0], dz = z - f[i][1], d2 = dx * dx + dz * dz;
        if (d2 < 1) return f[i][2];         // 점 위
        var w = 1 / (d2 * d2);              // 거리^4 역가중(국지성↑, 부드러움 유지)
        sw += w; sv += w * f[i][2];
      }
      return sv / sw;
    };
  }

  // (폴백 참고용) 건물 바닥 평면 최소제곱 피팅
  function planarFitBases(group) {
    var pts = getBasePoints(group);
    if (pts.length < 3) return null;
    // 정규방정식 (a,b,c)
    var Sxx = 0, Sxz = 0, Sx = 0, Szz = 0, Sz = 0, Sn = pts.length, Sxy = 0, Szy = 0, Sy = 0;
    pts.forEach(function (p) { var x = p[0], z = p[1], y = p[2];
      Sxx += x * x; Sxz += x * z; Sx += x; Szz += z * z; Sz += z; Sxy += x * y; Szy += z * y; Sy += y; });
    // 3x3 선형계 풀이 (크라메르)
    var M = [[Sxx, Sxz, Sx], [Sxz, Szz, Sz], [Sx, Sz, Sn]], B = [Sxy, Szy, Sy];
    function det3(m){return m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);}
    var D = det3(M); if (Math.abs(D) < 1e-6) return null;
    function rep(col){ var m=[[M[0][0],M[0][1],M[0][2]],[M[1][0],M[1][1],M[1][2]],[M[2][0],M[2][1],M[2][2]]]; for(var r=0;r<3;r++)m[r][col]=B[r]; return m; }
    return { a: det3(rep(0)) / D, b: det3(rep(1)) / D, c: det3(rep(2)) / D };
  }

  async function loadGround(lon0, lat0, onStatus) {
    var T = H().THREE, scene = H().scene;
    var z = CFG.GROUND_ZOOM, R = CFG.GROUND_R;
    var dLat = R / 111320, dLon = R / (111320 * Math.cos(lat0 * Math.PI / 180));
    var tl = lonlat2tile(lon0 - dLon, lat0 + dLat, z); // 좌상(서/북)
    var br = lonlat2tile(lon0 + dLon, lat0 - dLat, z); // 우하(동/남)
    var nx = br.x - tl.x + 1, ny = br.y - tl.y + 1;
    if (nx < 1 || ny < 1 || nx * ny > 240) { onStatus && onStatus("지면 영역 계산 오류"); return 0; }
    onStatus && onStatus("항공사진 " + (nx * ny) + "타일 불러오는 중…");

    var TS = 256, canvas = document.createElement("canvas");
    canvas.width = nx * TS; canvas.height = ny * TS;
    var ctx = canvas.getContext("2d"), got = 0;
    var tasks = [];
    for (var ty = tl.y; ty <= br.y; ty++) for (var tx = tl.x; tx <= br.x; tx++) {
      (function (tx, ty) {
        tasks.push(new Promise(function (res) {
          var im = new Image(); im.crossOrigin = "anonymous";
          im.onload = function () { ctx.drawImage(im, (tx - tl.x) * TS, (ty - tl.y) * TS, TS, TS); got++; res(); };
          im.onerror = function () { res(); };
          im.src = "https://api.vworld.kr/req/wmts/1.0.0/" + CFG.VWORLD_KEY + "/Satellite/" + z + "/" + ty + "/" + tx + ".jpeg";
        }));
      })(tx, ty);
    }
    await Promise.all(tasks);
    if (!got) { onStatus && onStatus("항공사진 타일을 불러오지 못했습니다."); return 0; }

    var tex = new T.CanvasTexture(canvas);
    tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = T.ClampToEdgeWrapping;

    // 캔버스의 지리 범위(타일 경계)
    var W = tile2lon(tl.x, z), E = tile2lon(br.x + 1, z), Nrth = tile2lat(tl.y, z), Sth = tile2lat(br.y + 1, z);
    var mN = merc(Nrth), mS = merc(Sth);
    var info = worldToLocalMatrix(lon0, lat0);

    // --- 지형 = 실측 DEM(건물 재안착과 동일 소스·datum → 지형·건물 완전 일치) ---
    var dem = await ensureDem(lon0, lat0);
    var centerElev = dem ? dem(lon0, lat0) : 0;
    function terrainY(lon, lat, x, z2) { return dem ? (dem(lon, lat) - centerElev) * CFG.DEM_EXAG : 0; }

    // ENU 그리드 평면(기복 + UV)
    var seg = CFG.GROUND_SEG, N = seg + 1;
    var pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
    for (var j = 0; j < N; j++) {
      var fy = j / seg, lat = invMerc(mN + (mS - mN) * fy);
      for (var i = 0; i < N; i++) {
        var fx = i / seg, lon = W + (E - W) * fx;
        var P = geodeticToECEF(lon, lat, 0).sub(info.A).applyMatrix4(info.Rw2l); // 회전만
        var k = (j * N + i);
        pos[k * 3] = P.x; pos[k * 3 + 1] = terrainY(lon, lat, P.x, P.z); pos[k * 3 + 2] = P.z;
        uv[k * 2] = fx; uv[k * 2 + 1] = 1 - fy;
      }
    }
    var idx = [];
    for (var jj = 0; jj < seg; jj++) for (var ii = 0; ii < seg; ii++) {
      var a = jj * N + ii, b = a + 1, c = a + N, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();

    if (ST.groundGroup) { scene.remove(ST.groundGroup); disposeGroup(ST.groundGroup); }
    var mesh = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }));
    mesh.renderOrder = -1;                 // 건물보다 먼저(밑바탕)
    var gg = new T.Group(); gg.name = "fitContextGround"; gg.add(mesh);
    scene.add(gg); ST.groundGroup = gg;
    onStatus && onStatus("항공사진 지면 표시됨 · " + (dem ? "실측 지형(DEM)" : "평탄(DEM 없음)"));
    return got;
  }

  // AWS Terrarium DEM 타일을 받아 (lon,lat)→고도(m) 보간 샘플러 반환. 실패 시 null.
  async function buildDemSampler(W, E, N, S) {
    try {
      var z = CFG.DEM_ZOOM;
      var tl = lonlat2tile(W, N, z), br = lonlat2tile(E, S, z);
      var nx = br.x - tl.x + 1, ny = br.y - tl.y + 1;
      if (nx < 1 || ny < 1 || nx * ny > 48) return null;
      var c = document.createElement("canvas"); c.width = nx * 256; c.height = ny * 256;
      var ctx = c.getContext("2d"), got = 0, tasks = [];
      for (var ty = tl.y; ty <= br.y; ty++) for (var tx = tl.x; tx <= br.x; tx++) {
        (function (tx, ty) {
          tasks.push(new Promise(function (res) {
            var im = new Image(); im.crossOrigin = "anonymous";
            im.onload = function () { ctx.drawImage(im, (tx - tl.x) * 256, (ty - tl.y) * 256); got++; res(); };
            im.onerror = function () { res(); };
            im.src = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/" + z + "/" + tx + "/" + ty + ".png";
          }));
        })(tx, ty);
      }
      await Promise.all(tasks);
      if (!got) return null;
      var W2 = tile2lon(tl.x, z), E2 = tile2lon(br.x + 1, z), N2 = tile2lat(tl.y, z), S2 = tile2lat(br.y + 1, z);
      var mNd = merc(N2), mSd = merc(S2), Wpx = c.width, Hpx = c.height;
      var data = ctx.getImageData(0, 0, Wpx, Hpx).data;
      function elev(ix, iy) { var k = (iy * Wpx + ix) * 4; return (data[k] * 256 + data[k + 1] + data[k + 2] / 256) - 32768; }
      return function (lon, lat) {
        var fx = (lon - W2) / (E2 - W2) * Wpx, fy = (mNd - merc(lat)) / (mNd - mSd) * Hpx;
        fx = Math.max(0, Math.min(Wpx - 1.001, fx)); fy = Math.max(0, Math.min(Hpx - 1.001, fy));
        var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = x0 + 1, y1 = y0 + 1, tx = fx - x0, tyy = fy - y0;
        var top = elev(x0, y0) * (1 - tx) + elev(x1, y0) * tx;
        var bot = elev(x0, y1) * (1 - tx) + elev(x1, y1) * tx;
        return top * (1 - tyy) + bot * tyy; // 이중선형
      };
    } catch (e) { return null; }
  }

  function disposeGroup(g) {
    g.traverse(function (o) {
      if (o.geometry) o.geometry.dispose && o.geometry.dispose();
      if (o.material) { var m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach(function (mm) { if (mm.map) mm.map.dispose && mm.map.dispose(); mm.dispose && mm.dispose(); }); }
    });
  }

  // ====================== UI ======================
  var EL = {};
  function buildUI() {
    var wrap = document.createElement("div");
    wrap.id = "fitCtxPanel";
    wrap.innerHTML =
      '<style>' +
      '#fitCtxPanel{position:fixed;top:14px;left:14px;z-index:9000;width:262px;font-family:"IBM Plex Sans KR","Apple SD Gothic Neo",sans-serif;' +
        'background:#fff;border:1px solid #dcdcd6;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.12);padding:13px 14px;color:#1a1a1a;}' +
      '#fitCtxPanel h4{margin:0 0 9px;font-size:12px;font-weight:700;letter-spacing:.04em;color:#1a1a1a;display:flex;align-items:center;gap:6px;}' +
      '#fitCtxPanel h4 .d{width:7px;height:7px;border-radius:50%;background:#e68d39;display:inline-block;}' +
      '#fitCtxPanel .ci{display:flex;gap:6px;}' +
      '#fitCtxPanel input[type=text]{flex:1;min-width:0;font:inherit;font-size:12px;padding:7px 8px;border:1px solid #dcdcd6;border-radius:4px;outline:none;}' +
      '#fitCtxPanel input[type=text]:focus{border-color:#e68d39;}' +
      '#fitCtxPanel button.go{font:inherit;font-size:12px;font-weight:600;padding:7px 10px;border:1px solid #e68d39;background:#e68d39;color:#fff;border-radius:4px;cursor:pointer;white-space:nowrap;}' +
      '#fitCtxPanel button.go:disabled{opacity:.5;cursor:default;}' +
      '#fitCtxPanel .pre{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0 0;}' +
      '#fitCtxPanel .pre b{font:inherit;font-size:10px;font-weight:600;padding:3px 6px;border:1px solid #e6e6e0;border-radius:3px;background:#faf9f7;color:#666;cursor:pointer;}' +
      '#fitCtxPanel .pre b:hover{border-color:#e68d39;color:#1a1a1a;}' +
      '#fitCtxPanel .tog{display:flex;align-items:center;gap:7px;margin-top:11px;padding-top:10px;border-top:1px solid #eee;font-size:12px;color:#555;}' +
      '#fitCtxPanel .tog input{width:15px;height:15px;accent-color:#e68d39;}' +
      '#fitCtxPanel .tog.dis{opacity:.45;}' +
      '#fitCtxPanel .delrow{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding-top:9px;border-top:1px solid #eee;font-size:12px;color:#555;}' +
      '#fitCtxPanel .delrow label{display:flex;align-items:center;gap:7px;cursor:pointer;}' +
      '#fitCtxPanel .delrow input{width:15px;height:15px;accent-color:#d9534f;}' +
      '#fitCtxPanel .delrow button{font:inherit;font-size:11px;font-weight:600;padding:4px 10px;border:1px solid #dcdcd6;background:#fff;color:#555;border-radius:4px;cursor:pointer;}' +
      '#fitCtxPanel .delrow button:hover{border-color:#e68d39;color:#1a1a1a;}' +
      '#fitCtxPanel .st{margin-top:9px;font-size:11px;line-height:1.45;color:#888;min-height:15px;}' +
      '#fitCtxPanel .min{position:absolute;top:10px;right:10px;border:none;background:none;color:#bbb;font-size:14px;cursor:pointer;padding:0;line-height:1;}' +
      '</style>' +
      '<h4><span class="d"></span>주변 컨텍스트 (VWORLD)</h4>' +
      '<div class="ci"><input id="fitCtxAddr" type="text" placeholder="도로명/지번 주소" autocomplete="off">' +
        '<button class="go" id="fitCtxGo">대지 불러오기</button></div>' +
      '<div class="pre" id="fitCtxPre"></div>' +
      '<label class="tog dis" id="fitCtxTogWrap"><input type="checkbox" id="fitCtxTog" disabled> 주변 건물 표시</label>' +
      '<label class="tog dis" id="fitCtxGndWrap" style="margin-top:6px;padding-top:0;border-top:none;"><input type="checkbox" id="fitCtxGnd" disabled> 땅(항공사진) 표시</label>' +
      '<div class="delrow" id="fitCtxDelRow"><label><input type="checkbox" id="fitCtxDel"> 건물 삭제 모드(클릭)</label>' +
        '<button id="fitCtxRestore" type="button">복원</button></div>' +
      '<div class="st" id="fitCtxSt">주소를 입력하고 대지 윤곽선을 불러오세요.</div>' +
      '<button class="min" id="fitCtxMin" title="접기">—</button>';
    document.body.appendChild(wrap);

    EL.addr = document.getElementById("fitCtxAddr");
    EL.go = document.getElementById("fitCtxGo");
    EL.tog = document.getElementById("fitCtxTog");
    EL.togWrap = document.getElementById("fitCtxTogWrap");
    EL.gnd = document.getElementById("fitCtxGnd");
    EL.gndWrap = document.getElementById("fitCtxGndWrap");
    EL.del = document.getElementById("fitCtxDel");
    EL.restore = document.getElementById("fitCtxRestore");
    EL.st = document.getElementById("fitCtxSt");

    var presets = ["성수이로 121", "백제고분로 69", "영동대로 508", "테헤란로 203", "세종대로 73"];
    var pre = document.getElementById("fitCtxPre");
    presets.forEach(function (a) {
      var b = document.createElement("b"); b.textContent = a;
      b.onclick = function () { EL.addr.value = a; runSite(); };
      pre.appendChild(b);
    });

    EL.go.onclick = runSite;
    EL.addr.addEventListener("keydown", function (e) { if (e.key === "Enter") runSite(); });
    EL.tog.addEventListener("change", function () {
      if (ST.buildingsGroup) { ST.buildingsGroup.visible = EL.tog.checked; }
      else if (EL.tog.checked) { runBuildings(); }
    });
    EL.gnd.addEventListener("change", function () {
      if (ST.groundGroup) { ST.groundGroup.visible = EL.gnd.checked; }
      else if (EL.gnd.checked) { runGround(); }
    });
    EL.del.addEventListener("change", function () {
      ST.delMode = EL.del.checked;
      var cv = canvasEl(); if (cv) cv.style.cursor = ST.delMode ? "crosshair" : "";
      status(ST.delMode ? "삭제 모드: 지울 건물을 클릭하세요." : "삭제 모드 해제됨.");
    });
    EL.restore.addEventListener("click", restoreBuildings);
    attachPicking();
    var min = document.getElementById("fitCtxMin"), body = wrap.children, collapsed = false;
    min.onclick = function () {
      collapsed = !collapsed;
      for (var i = 2; i < wrap.childNodes.length; i++) {
        var n = wrap.childNodes[i]; if (n.id === "fitCtxMin" || n.tagName === "STYLE") continue;
        if (n.style) n.style.display = collapsed ? "none" : "";
      }
      min.textContent = collapsed ? "+" : "—";
    };
  }
  function status(msg) { if (EL.st) EL.st.textContent = msg; }

  // ── 클릭 삭제 / 복원 ──
  var _ray = null, _ndc = null, _down = null;
  function canvasEl() { var r = H().renderer; return r ? r.domElement : null; }
  function attachPicking() {
    var cv = canvasEl(); if (!cv || cv.__fitPick) return;
    cv.__fitPick = true;
    cv.addEventListener("pointerdown", function (e) { _down = { x: e.clientX, y: e.clientY }; }, true);
    cv.addEventListener("pointerup", onPickUp, true);
  }
  function onPickUp(e) {
    if (!ST.delMode || !ST.buildingsGroup) return;
    var d = _down; _down = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return; // 드래그(궤도회전)은 삭제 안 함
    var T = H().THREE, cam = H().camera, cv = canvasEl(); if (!T || !cam || !cv) return;
    if (!_ray) { _ray = new T.Raycaster(); _ndc = new T.Vector2(); }
    var r = cv.getBoundingClientRect();
    _ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    _ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    _ray.setFromCamera(_ndc, cam);
    var hits = _ray.intersectObjects(ST.buildingsGroup.children, true);
    if (!hits.length) return;                    // 빈 곳 클릭 → 통과(궤도 등)
    var o = hits[0].object;                       // 최상위 타일까지 거슬러 올라감
    while (o && o.parent !== ST.buildingsGroup) o = o.parent;
    if (o && o.visible) {
      o.visible = false; ST.deleted.push(o);
      status("건물 삭제됨 (" + ST.deleted.length + "개) · 복원으로 되돌리기");
      e.stopImmediatePropagation(); e.preventDefault();   // sangeun으로 전파 차단
    }
  }
  function restoreBuildings() {
    if (!ST.deleted.length) { status("복원할 건물이 없습니다."); return; }
    var n = ST.deleted.length;
    ST.deleted.forEach(function (o) { o.visible = true; });
    ST.deleted = [];
    status("건물 " + n + "개 복원됨.");
  }

  // ====================== 동작 ======================
  async function runSite() {
    if (ST.busy) return;
    var addr = (EL.addr.value || "").trim();
    if (!addr) { status("주소를 입력하세요."); return; }
    ST.busy = true; EL.go.disabled = true; status("주소 검색 중…");
    // 새 대지를 불러오면 이전 위치의 건물/지면은 정리(위치 불일치 방지)
    if (ST.buildingsGroup) { H().scene.remove(ST.buildingsGroup); disposeGroup(ST.buildingsGroup); ST.buildingsGroup = null; }
    if (ST.groundGroup) { H().scene.remove(ST.groundGroup); disposeGroup(ST.groundGroup); ST.groundGroup = null; }
    ST.dem = null;   // 새 대지 → DEM 캐시 무효화
    ST.deleted = [];
    EL.tog.checked = false; EL.gnd.checked = false;
    try {
      var pt = await geocode(addr);
      if (!pt) { status("주소를 찾지 못했습니다."); return; }
      status("대지 경계 조회 중…");
      var ring = await fetchParcel(pt.lon, pt.lat);
      var lon0 = pt.lon, lat0 = pt.lat;
      if (ring) {
        // 대지 중심을 원점으로
        var s = 0, slon = 0, slat = 0;
        ring.forEach(function (p) { slon += p.lon; slat += p.lat; s++; });
        lon0 = slon / s; lat0 = slat / s;
        drawOutline(ring, lon0, lat0);
        status("대지 윤곽선 표시됨 · " + (pt.refined || addr));
      } else {
        // 대지 경계 실패 시 점 기준 작은 사각형으로 표시
        drawOutline(squareRing(pt.lon, pt.lat, 15), pt.lon, pt.lat);
        status("대지 경계 미확인 — 위치만 표시(" + (pt.refined || addr) + ")");
      }
      ST.site = { lon0: lon0, lat0: lat0, ring: ring };
      EL.tog.disabled = false; EL.togWrap.classList.remove("dis");
      EL.gnd.disabled = false; EL.gndWrap.classList.remove("dis");
    } catch (e) {
      status("오류: " + e.message);
    } finally {
      ST.busy = false; EL.go.disabled = false;
    }
  }
  function squareRing(lon, lat, half) {
    var dLat = half / 111320, dLon = half / (111320 * Math.cos(lat * Math.PI / 180));
    return [{ lon: lon - dLon, lat: lat - dLat }, { lon: lon + dLon, lat: lat - dLat },
            { lon: lon + dLon, lat: lat + dLat }, { lon: lon - dLon, lat: lat + dLat }];
  }
  async function runBuildings() {
    if (!ST.site) { status("먼저 대지를 불러오세요."); EL.tog.checked = false; return; }
    if (ST.busy) return;
    ST.busy = true; EL.tog.disabled = true;
    try {
      await loadBuildings(ST.site.lon0, ST.site.lat0, status);
      // 지면이 켜져 있으면 새 건물 바닥에 맞춰 지형 재피팅
      if (ST.groundGroup && EL.gnd.checked) await loadGround(ST.site.lon0, ST.site.lat0, status);
    }
    catch (e) { status("건물 로드 실패: " + e.message); EL.tog.checked = false; }
    finally { ST.busy = false; EL.tog.disabled = false; }
  }
  async function runGround() {
    if (!ST.site) { status("먼저 대지를 불러오세요."); EL.gnd.checked = false; return; }
    if (ST.busy) return;
    ST.busy = true; EL.gnd.disabled = true;
    try { await loadGround(ST.site.lon0, ST.site.lat0, status); }
    catch (e) { status("지면 로드 실패: " + e.message); EL.gnd.checked = false; }
    finally { ST.busy = false; EL.gnd.disabled = false; }
  }

  // ====================== 공개 API ======================
  window.VWorldContext = {
    config: CFG,
    loadSite: function (addr) { EL.addr.value = addr; return runSite(); },
    showBuildings: function (v) { EL.tog.checked = v !== false; runBuildings(); },
    showGround: function (v) { EL.gnd.checked = v !== false; runGround(); },
    state: ST
  };

  // ====================== 초기화 ======================
  function init() {
    if (!H().scene) { console.warn("[VWorldContext] 호스트 scene 미발견 — 200ms 후 재시도"); setTimeout(init, 200); return; }
    buildUI();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
