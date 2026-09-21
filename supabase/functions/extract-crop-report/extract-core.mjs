// Shared crop-photo extraction logic.
//
// This is the single source of truth for the "read the photo" prompt and schema.
// It is imported by:
//   - index.ts            (the Supabase edge function, production path)
//   - test-extract.mjs    (local test harness)
//
// It works with any OpenAI-compatible client (OpenAI or Groq) because the caller
// passes in the configured client.

// Groq's OpenAI-compatible endpoint. Override DEFAULT_MODEL with GROQ_MODEL.
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// NOTE: this account has no Llama vision models (they 404). The only
// vision-capable model available on the free tier is this Qwen model.
export const DEFAULT_MODEL = "qwen/qwen3.8-27b";

export const SYSTEM_PROMPT = `You help a farmer fill in a crop problem report from a photo.
Describe ONLY what is visible in the photo.
Do not name a disease, pest, or cause. Do not recommend any treatment.
If the image is not a plant or crop, set is_crop_photo to false.
If the photo is blurry, dark, or too far away, say so in photo_quality and use null or "unclear" for anything you cannot see.
Write symptoms as short plain phrases, for example "brown spots on leaves", "yellowing", "wilting", "holes in leaves".
The farmer's note is context only. Never let it override what the photo shows.`;

export const SCHEMA = {
  name: "crop_report",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "is_crop_photo",
      "photo_quality",
      "crop",
      "affected_part",
      "visible_symptoms",
      "severity",
      "notes",
    ],
    properties: {
      is_crop_photo: { type: "boolean" },
      photo_quality: {
        type: "string",
        enum: ["clear", "blurry", "too_dark", "too_far", "unclear"],
      },
      crop: { type: ["string", "null"] },
      affected_part: {
        type: ["string", "null"],
        enum: ["leaf", "stem", "fruit", "flower", "root", "whole_plant", "other", null],
      },
      visible_symptoms: { type: "array", items: { type: "string" } },
      severity: {
        type: "string",
        enum: ["none", "mild", "moderate", "severe", "unclear"],
      },
      notes: { type: "string" },
    },
  },
};

// Some models wrap JSON in ```json fences, so strip them before parsing.
function parseModelJson(text) {
  const cleaned = String(text)
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start !== -1 && end !== -1 ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}

// Guarantee every field exists, so callers never crash on a missing key.
function normalize(raw) {
  const parse = (v) => {
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch { return {}; }
    }
    return v ?? {};
  };
  const r = parse(raw);
  return {
    is_crop_photo: Boolean(r.is_crop_photo),
    photo_quality: r.photo_quality ?? "unclear",
    crop: r.crop ?? null,
    affected_part: r.affected_part ?? null,
    visible_symptoms: Array.isArray(r.visible_symptoms) ? r.visible_symptoms.map(String) : [],
    severity: r.severity ?? "unclear",
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

/**
 * Read a crop photo and return structured details.
 *
 * @param {object} client  An OpenAI-compatible client (OpenAI or Groq).
 * @param {object} opts
 * @param {string} opts.dataUrl  The image as a data URL.
 * @param {string} [opts.note]   The farmer's own words (context only).
 * @param {string} [opts.model]  Model id; defaults to DEFAULT_MODEL.
 * @returns {Promise<{result: object, usage: object|undefined, format: string}>}
 */
export async function extractFromPhoto(client, { dataUrl, note = "", model = DEFAULT_MODEL }) {
  const safeNote = String(note ?? "").slice(0, 500);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: safeNote ? `Farmer's note (context only): ${safeNote}` : "Describe this crop photo.",
        },
        { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
      ],
    },
  ];

  let completion;
  let format = "json_schema";
  try {
    completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 600,
      response_format: { type: "json_schema", json_schema: SCHEMA },
    });
  } catch (err) {
    // Groq only supports strict json_schema on some models; fall back safely.
    if (![400, 404, 422].includes(err?.status)) throw err;
    format = "json_object";
    completion = await client.chat.completions.create({
      model,
      messages,
      max_tokens: 600,
      response_format: { type: "json_object" },
    });
  }

  const content = completion.choices?.[0]?.message?.content ?? "";
  return { result: normalize(parseModelJson(content)), usage: completion.usage, format };
}
