// Test the AI photo extraction on your own computer. No Supabase needed.
// It uses the same code as the real app (extract-core.mjs).
//
// One-time setup, in this folder:
//   npm install openai
//   npm install sharp      (optional: resizes photos to 1024px like the real app)
//
// Run (Windows PowerShell):
//   $env:GROQ_API_KEY="gsk_..."; node test-extract.mjs leaf1.jpg leaf2.jpg
// Run (Mac/Linux):
//   GROQ_API_KEY=gsk_... node test-extract.mjs leaf1.jpg leaf2.jpg
//
// Optional: NOTE="started after rain"   GROQ_MODEL=some-vision-model

import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  DEFAULT_MODEL,
  GROQ_BASE_URL,
  extractFromPhoto,
} from "./supabase/functions/extract-crop-report/extract-core.mjs";

const API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL ?? DEFAULT_MODEL;
const NOTE = process.env.NOTE ?? "";

// The prompt says "do not diagnose". These words in the output suggest it did anyway.
const DIAGNOSIS_WORDS = [
  "blight", "mildew", "rust", "mosaic", "virus", "viral", "fungus", "fungal",
  "bacterial", "infection", "infected", "deficiency", "pest", "disease", "treat",
];
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* optional */ }

async function loadImage(file) {
  let bytes = await readFile(file);
  let mime = MIME[path.extname(file).toLowerCase()];
  if (!mime) throw new Error("Use a .jpg, .png, or .webp file.");
  if (sharp) {
    // Same as the browser: fix rotation, shrink to 1024px, drop EXIF/GPS.
    bytes = await sharp(bytes).rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
    mime = "image/jpeg";
  }
  return { dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, kb: Math.round(bytes.length / 1024) };
}

const files = process.argv.slice(2);
if (!API_KEY) { console.error("Set GROQ_API_KEY first. See the top of this file."); process.exit(1); }
if (files.length === 0) { console.error("Give at least one photo: node test-extract.mjs photo.jpg"); process.exit(1); }

const client = new OpenAI({ apiKey: API_KEY, baseURL: GROQ_BASE_URL });
console.log(`Model: ${MODEL} | Resize with sharp: ${sharp ? "yes" : "no"}${NOTE ? ` | Note: "${NOTE}"` : ""}\n`);

for (const file of files) {
  console.log(`=== ${file}`);
  try {
    const { dataUrl, kb } = await loadImage(file);
    if (!sharp && kb > 3000) console.log("(Large photo. Install sharp or the app's 3 MB limit will reject it.)");
    const started = Date.now();
    const { result, usage, format } = await extractFromPhoto(client, { dataUrl, note: NOTE, model: MODEL });
    console.log(JSON.stringify(result, null, 2));
    console.log(`(sent ${kb} KB, ${((Date.now() - started) / 1000).toFixed(1)}s, ${usage?.total_tokens ?? "?"} tokens, mode: ${format})`);
    const text = `${result.notes} ${result.visible_symptoms.join(" ")}`.toLowerCase();
    const hits = DIAGNOSIS_WORDS.filter((w) => text.includes(w));
    if (hits.length) console.log(`WARNING: may be diagnosing (${hits.join(", ")}). Tighten the prompt.`);
  } catch (err) {
    console.log(`FAILED: ${err.status ? `${err.status} ` : ""}${err.message}`);
  }
  console.log();
}
