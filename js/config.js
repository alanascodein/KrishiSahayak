/* ==========================================================================
   KrishiSahayak AI — Configuration
   --------------------------------------------------------------------------
   1) Create a free project at https://supabase.com
   2) Supabase Dashboard → Project Settings → API
   3) Copy the "Project URL" and the "anon public" key below.
   4) Run setup.sql in the Supabase SQL Editor (creates tables + policies).
   5) Deploy the edge function (see README) so photo reports work.

   The anon key is PUBLIC — row-level security protects the data.
   NEVER put the OpenAI/Groq key in this file; it stays server-side.
   ========================================================================== */

const KS_CONFIG = {
  // ⬇️ YOUR VALUES (Supabase Dashboard → Settings → API / General)
  SUPABASE_URL: "https://fukfuwrtbdpnebbwmtnv.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1a2Z1d3J0YmRwbmViYndtdG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MzUxMjYsImV4cCI6MjEwNTQxMTEyNn0.uUbh-ZS57Hr-o45AwlWz8gUF0L4rHKOUzkg_yaMNMBQ",
};

/* ---- helpers (no need to edit below) ------------------------------------ */
window.KS = (() => {
  const configured =
    !KS_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
    !KS_CONFIG.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");

  let client = null;
  if (configured && window.supabase) {
    client = window.supabase.createClient(
      KS_CONFIG.SUPABASE_URL,
      KS_CONFIG.SUPABASE_ANON_KEY,
      { auth: { persistSession: true, autoRefreshToken: true } },
    );
  }

  /** Redirect to login with a reason. */
  function requireLogin(message = "Please sign in to continue.") {
    location.href = `login.html?next=${encodeURIComponent(location.pathname + location.hash)}&reason=${encodeURIComponent(message)}`;
  }

  /** Show a short toast message. */
  let toastTimer;
  function toast(text, isError = false) {
    const el = document.getElementById("toast");
    if (!el) return alert(text);
    el.textContent = text;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
  }

  /** Small helpers used across pages. */
  const initials = (name) =>
    (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /** Public URL of an uploaded photo (bucket "crop-photos"). */
  async function photoUrl(path) {
    if (!path || !client) return null;
    const { data } = await client.storage.from("crop-photos").createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  }

  return { config: KS_CONFIG, configured, client, requireLogin, toast, initials, fmtDate, esc, photoUrl };
})();
