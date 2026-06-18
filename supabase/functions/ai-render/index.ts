// ============================================================================
// FIT 실사 변환 프록시 (Supabase Edge Function)  ―  키를 서버에만 보관
// ----------------------------------------------------------------------------
// 브라우저(어느 PC든)는 "비밀번호 + 이미지 + 프롬프트"만 보냅니다.
// 이 함수가 비밀번호를 확인하고, 서버 비밀(GEMINI_KEY)로 Gemini를 호출해
// 결과 이미지만 돌려줍니다. → Gemini 키는 절대 브라우저로 내려가지 않습니다.
//
// 배포 전 비밀 2개 설정:
//   supabase secrets set GEMINI_KEY=새로발급한키  APP_PASSWORD=팀공유비밀번호
// 배포(JWT 검증 끄기 — 우리 비밀번호가 관문):
//   supabase functions deploy ai-render --no-verify-jwt
// (대시보드로도 가능: Edge Functions에서 코드 붙여넣기 + Verify JWT 끄기,
//  Settings → Edge Functions → Secrets 에 위 두 값 추가)
// ============================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
};

function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST만 허용됩니다." });

  const APP_PASSWORD = Deno.env.get("APP_PASSWORD");
  const GEMINI_KEY = Deno.env.get("GEMINI_KEY");
  if (!APP_PASSWORD || !GEMINI_KEY) {
    return json(500, { error: "서버 설정 누락(APP_PASSWORD / GEMINI_KEY). 관리자에게 문의하세요." });
  }

  let b: any;
  try { b = await req.json(); } catch { return json(400, { error: "요청 형식 오류." }); }

  if (!b || typeof b.password !== "string" || b.password !== APP_PASSWORD) {
    return json(401, { error: "비밀번호가 올바르지 않습니다." });
  }
  if (!b.image || !b.image.data) {
    return json(400, { error: "이미지가 없습니다." });
  }

  const model = String(b.model || "gemini-3.1-flash-image").trim();
  const parts: any[] = [
    { text: String(b.prompt || "") },
    { inline_data: { mime_type: b.image.mime || "image/png", data: b.image.data } },
  ];
  if (b.ref && b.ref.data) {
    parts.push({ inline_data: { mime_type: b.ref.mime || "image/png", data: b.ref.data } });
  }

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(GEMINI_KEY);

  let r: Response, data: any;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE"] } }),
    });
    data = await r.json();
  } catch (e) {
    return json(502, { error: "Gemini 호출 실패: " + (e?.message || String(e)) });
  }

  if (!r.ok) {
    return json(r.status, { error: (data?.error?.message) || ("Gemini HTTP " + r.status) });
  }

  const rparts = data?.candidates?.[0]?.content?.parts || [];
  let img: any = null, text: string | null = null;
  for (const p of rparts) {
    if (p.inlineData || p.inline_data) img = p.inlineData || p.inline_data;
    else if (p.text) text = p.text;
  }
  if (!img) {
    return json(502, { error: "이미지가 반환되지 않았습니다(다시 시도해 보세요)." + (text ? " 모델 응답: " + text : "") });
  }

  return json(200, { mime: img.mimeType || img.mime_type || "image/png", data: img.data });
});
