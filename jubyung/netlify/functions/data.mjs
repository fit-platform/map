import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });

// 상수 시간 비교 (타이밍 공격 방어). 길이 노출 방지 위해 해시 후 비교.
const safeEqual = (a, b) => {
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
};

// 초경량 in-memory rate limit (함수 인스턴스 생명주기 동안). IP당 분간 시도 제한.
const hits = new Map();
const rateLimited = (ip, limit = 20, windowMs = 60_000) => {
  const now = Date.now();
  const rec = hits.get(ip) || { c: 0, t: now };
  if (now - rec.t > windowMs) { rec.c = 0; rec.t = now; }
  rec.c += 1; hits.set(ip, rec);
  return rec.c > limit;
};

const MAX_BODY = 1_000_000; // 1MB 페이로드 상한 (저장소 DoS 방어)

export default async (req) => {
  const expected =
    (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get("TEAM_PASSWORD")) ||
    process.env.TEAM_PASSWORD;
  if (!expected) return json({ ok: false, error: "server misconfigured" }, 500); // 원인 비노출

  const ip = req.headers.get("x-nf-client-connection-ip") ||
             req.headers.get("x-forwarded-for") || "unknown";
  if (rateLimited(ip)) return json({ ok: false, error: "too many requests" }, 429);

  const pass = req.headers.get("x-team-pass") || "";
  if (!safeEqual(pass, expected)) return json({ ok: false, error: "unauthorized" }, 401);

  const store = getStore({ name: "fit-dashboard", consistency: "strong" });
  const IDX = "index";
  const SNAP = (id) => "snap:" + id;
  const LEGACY = "state";
  const MAX = 30;

  const readIndex = async () => {
    const idx = await store.get(IDX, { type: "json" });
    return Array.isArray(idx) ? idx : [];
  };

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) {
        if (id === "__legacy__") {
          const legacy = await store.get(LEGACY, { type: "json" });
          return json({ ok: true, snapshot: legacy || null });
        }
        const snap = await store.get(SNAP(id), { type: "json" });
        return json({ ok: true, snapshot: snap || null });
      }
      let idx = await readIndex();
      if (idx.length === 0) {
        const legacy = await store.get(LEGACY, { type: "json" });
        if (legacy && legacy.data) {
          idx = [{ id: "__legacy__", name: "이전 저장본", by: legacy.by || "", savedAt: legacy.savedAt || "" }];
        }
      }
      return json({ ok: true, list: idx });
    }

    if (req.method === "POST") {
      // 페이로드 크기 선제 검증
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ ok: false, error: "payload too large" }, 413);
      let body = {};
      try { body = JSON.parse(raw); } catch { body = {}; }

      if (body.op === "delete" && body.id) {
        if (body.id === "__legacy__") {
          await store.delete(LEGACY).catch(() => {});
          return json({ ok: true });
        }
        await store.delete(SNAP(body.id)).catch(() => {});
        const idx = (await readIndex()).filter((e) => e.id !== body.id);
        await store.setJSON(IDX, idx);
        return json({ ok: true });
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const savedAt = new Date().toISOString();
      const name = (body.name || "").toString().slice(0, 60);
      const by = (body.by || "").toString().slice(0, 40);
      await store.setJSON(SNAP(id), { id, name, by, savedAt, data: body.data });

      let idx = await readIndex();
      idx.unshift({ id, name, by, savedAt });
      if (idx.length > MAX) {
        const drop = idx.slice(MAX);
        idx = idx.slice(0, MAX);
        await Promise.all(drop.map((e) => store.delete(SNAP(e.id)).catch(() => {})));
      }
      await store.setJSON(IDX, idx);
      return json({ ok: true, id, savedAt });
    }

    return json({ ok: false, error: "method not allowed" }, 405);
  } catch (e) {
    console.error(e);                                  // 상세는 서버 로그로만
    return json({ ok: false, error: "internal error" }, 500); // 클라이언트엔 일반 메시지
  }
};

export const config = { path: "/api/data" };
