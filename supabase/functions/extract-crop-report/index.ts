// Supabase Edge Function: extract-crop-report
// Runs server-side, so the AI key never reaches the browser.
//
// One-time setup (in this folder):
//   supabase secrets set GROQ_API_KEY=gsk_...      ← what test-extract.mjs uses
//   (or) supabase secrets set OPENAI_API_KEY=sk-...
//   supabase functions deploy extract-crop-report
//
// The prompt + schema + parsing live in extract-core.mjs — the SAME file the
// local test harness (test-extract.mjs) uses, so what you test is what runs.

import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { extractFromPhoto, GROQ_BASE_URL } from "./extract-core.mjs";

// Groq (tested) first, OpenAI as fallback. Model override via GROQ_MODEL secret.
const GROQ_KEY = Deno.env.get("GROQ_API_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

const AI = GROQ_KEY
  ? { client: makeClient(GROQ_BASE_URL, GROQ_KEY), model: Deno.env.get("GROQ_MODEL") ?? undefined }
  : OPENAI_KEY
    ? { client: makeClient("https://api.openai.com/v1", OPENAI_KEY), model: Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini" }
    : null;

// Minimal OpenAI-compatible client over fetch — same surface extract-core.mjs
// expects (client.chat.completions.create + err.status on failures).
function makeClient(baseUrl, apiKey) {
  return {
    chat: {
      completions: {
        create: async (body) => {
          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) {
            const err = new Error(await res.text());
            err.status = res.status;
            throw err;
          }
          return res.json();
        },
      },
    },
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  try {
    if (!AI) return json({ error: "Photo reading is not configured yet. Fill in the form yourself." }, 503);

    // 1. Who is calling? Use the caller's own token, so storage rules apply.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Sign in to send a photo report." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "Sign in to send a photo report." }, 401);

    // 2. Validate input. A farmer may only analyze photos in their own folder.
    const { path, note } = await req.json();
    if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) {
      return json({ error: "Invalid photo path." }, 400);
    }
    const safeNote = String(note ?? "").slice(0, 500);

    // 3. Download the photo from private storage.
    const { data: file, error: dlErr } = await supabase.storage
      .from("crop-photos")
      .download(path);
    if (dlErr || !file) return json({ error: "Could not read the uploaded photo." }, 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return json({ error: "The photo is too large." }, 413);
    const dataUrl = `data:image/jpeg;base64,${encodeBase64(bytes)}`;

    // 4. Shared extraction logic (same prompt/schema as the local test harness).
    try {
      const { result } = await extractFromPhoto(AI.client, { dataUrl, note: safeNote, model: AI.model });
      return json({ result });
    } catch (err) {
      console.error("AI error", err?.status, err?.message);
      return json(
        { error: "Photo reading is busy right now. Try again, or fill in the form yourself." },
        502,
      );
    }
  } catch (err) {
    console.error(err);
    return json({ error: "Photo reading failed. Fill in the form yourself." }, 500);
  }
});
