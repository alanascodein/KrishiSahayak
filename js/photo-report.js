// KrishiSahayak AI — Photo-based crop report (MAIN AI FEATURE)
// Flow: pick photo → strip GPS/EXIF → upload → edge function calls AI →
//       farmer confirms/edits → save as unverified report.
(function () {
  "use strict";

  const MAX_INPUT_BYTES = 15 * 1024 * 1024; // reject huge originals
  const MAX_SIDE = 1024;                    // resized: small, cheap, fast

  const $ = (id) => document.getElementById(id);
  const els = {
    dropzone: $("dropzone"), photo: $("photo"), preview: $("photo-preview"),
    description: $("description"), analyze: $("analyze-btn"),
    status: $("photo-status"), progress: $("ai-progress"),
    dots: $("report-dots"),
    steps: [1, 2, 3].map((n) => $(`rstep-${n}`)),
    aiSummary: $("ai-summary"),
    form: $("report-form"), crop: $("crop"), part: $("part"),
    symptoms: $("symptoms"), severity: $("severity"), area: $("area"),
    save: $("save-btn"), saveStatus: $("save-status"),
  };

  const state = { photoPath: null, aiResult: null, file: null };
  const esc = window.KS.esc;
  const setStatus = (msg, kind = "info") => {
    els.status.textContent = msg;
    els.status.className = `status ${kind}`;
  };
  const setBusy = (busy) => { els.analyze.disabled = busy || !state.file; };

  // ---- Wizard step navigation ---------------------------------------------
  function goToStep(n) {
    els.steps.forEach((s, i) => s.classList.toggle("active", i === n - 1));
    els.dots.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("on", i < n));
    els.dots.style.visibility = n === 3 ? "hidden" : "visible";
  }
  window.__ksGoToReportStep = goToStep; // used by dashboard tab switching

  // ---- Photo selection (tap dropzone or drag & drop) -----------------------
  function acceptFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Choose an image file, like a JPG or PNG.", "error");
      return;
    }
    state.file = file;
    if (els.preview.src) URL.revokeObjectURL(els.preview.src);
    els.preview.src = URL.createObjectURL(file);
    els.preview.hidden = false;
    els.dropzone.style.display = "none";
    setBusy(false);
    setStatus("Photo ready. Tap “Read my photo” — or tap the image to change it.", "success");
  }

  els.dropzone.addEventListener("click", () => els.photo.click());
  els.dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.photo.click(); }
  });
  els.dropzone.addEventListener("dragover", (e) => { e.preventDefault(); els.dropzone.classList.add("dragover"); });
  els.dropzone.addEventListener("dragleave", () => els.dropzone.classList.remove("dragover"));
  els.dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("dragover");
    acceptFile(e.dataTransfer.files[0]);
  });
  els.photo.addEventListener("change", () => acceptFile(els.photo.files[0]));
  els.preview.addEventListener("click", () => els.photo.click());

  // Redrawing on a canvas strips EXIF data, including GPS location. 🔒
  async function prepareImage(file) {
    if (file.size > MAX_INPUT_BYTES) throw new Error("That photo is over 15 MB. Choose a smaller one.");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Could not process the photo."))),
        "image/jpeg", 0.85,
      ));
  }

  function showProgress(activeStep) {
    els.progress.classList.remove("hidden");
    els.progress.querySelectorAll("li").forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle("active", n === activeStep);
      li.classList.toggle("done", n < activeStep);
    });
  }
  function hideProgress() { els.progress.classList.add("hidden"); }

  // ---- Analyze: upload + AI extraction ------------------------------------
  els.analyze.addEventListener("click", async () => {
    const client = window.KS?.client;
    if (!client) return setStatus("Connect Supabase first (see js/config.js).", "error");
    if (!state.file) return setStatus("Choose or take a photo first.", "warn");

    setBusy(true);
    hideProgress();
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      showProgress(1);
      const blob = await prepareImage(state.file);

      showProgress(2);
      const path = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await client.storage
        .from("crop-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw new Error("Upload failed. Check your connection and try again.");
      state.photoPath = path;

      showProgress(3);
      const { data, error } = await client.functions.invoke("extract-crop-report", {
        body: { path, note: els.description.value },
      });
      if (error || !data?.result) {
        const msg = error?.context ? await error.context.json().then((b) => b.error).catch(() => null) : null;
        throw new Error(msg ?? "Photo reading failed.");
      }
      state.aiResult = data.result;

      showProgress(4);
      fillForm(data.result);
      setTimeout(() => { hideProgress(); goToStep(2); }, 450);
    } catch (err) {
      hideProgress();
      // The form still opens, so the farmer can always finish the report by hand.
      setStatus(`${err.message} You can fill in the form yourself.`, "error");
      els.form.hidden = false;
      setBusy(false);
      // fall through to manual entry
      state.aiResult = null;
      showManualForm();
    }
  });

  function showManualForm() {
    els.aiSummary.innerHTML =
      `<p class="muted">ℹ️ AI couldn't read this photo automatically. Please fill the form below — it takes under a minute.</p>`;
    goToStep(2);
  }

  function fillForm(r) {
    const clear = r.is_crop_photo && r.photo_quality === "clear";
    if (!r.is_crop_photo) {
      els.aiSummary.innerHTML =
        `<p>🤔 <strong>This doesn't look like a crop photo.</strong></p>
         <p class="small muted">Try to photograph the affected part up close, in daylight. Or fill the form below.</p>`;
    } else if (!clear) {
      els.aiSummary.innerHTML =
        `<p>📷 <strong>The photo isn't clear enough</strong> (${esc(r.photo_quality)}).</p>
         <p class="small muted">Retake it closer to the affected part, in daylight. Or fill the form below.</p>`;
    } else {
      const symptoms = (r.visible_symptoms ?? []).map((s) => `<li>${esc(s)}</li>`).join("");
      const sev = { mild: "Mild 🙂", moderate: "Moderate 😐", severe: "Severe 😟" }[r.severity] ?? "Not sure";
      els.aiSummary.innerHTML =
        `<ul>
           <li><strong>Crop:</strong> ${esc(r.crop ?? "not sure")}</li>
           <li><strong>Affected part:</strong> ${esc(r.affected_part?.replace("_", " ") ?? "not sure")}</li>
           <li><strong>What it sees:</strong> <ul>${symptoms || "<li>nothing specific</li>"}</ul></li>
           <li><strong>How bad:</strong> ${sev}</li>
         </ul>
         ${r.notes ? `<p class="small muted">“${esc(r.notes)}”</p>` : ""}`;
    }
    els.crop.value = r.crop ?? "";
    els.part.value = r.affected_part ?? "";
    els.symptoms.value = (r.visible_symptoms ?? []).join(", ");
    els.severity.value = ["mild", "moderate", "severe"].includes(r.severity) ? r.severity : "";
  }

  // ---- Save the FARMER-confirmed report -----------------------------------
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const client = window.KS?.client;
    if (!client) return;
    if (!els.crop.value.trim()) return setStatus("Please enter the crop.", "warn");

    els.save.disabled = true;
    els.saveStatus.className = "status info";
    els.saveStatus.textContent = "Saving your report…";
    try {
      const { data: { user } } = await client.auth.getUser();
      if (!user) throw new Error("Please sign in again.");

      const { error } = await client.from("farmer_reports").insert({
        farmer_id: user.id,
        photo_path: state.photoPath,
        ai_extracted: state.aiResult,
        crop: els.crop.value.trim(),
        affected_part: els.part.value || null,
        symptoms: els.symptoms.value.split(",").map((s) => s.trim()).filter(Boolean),
        severity: els.severity.value || null,
        description: els.description.value.trim() || null,
        area: els.area.value.trim(),
      });
      if (error) throw new Error("Could not save the report. Try again.");

      els.saveStatus.className = "status success";
      els.saveStatus.textContent = "Saved!";
      window.KS.toast("✅ Report saved — an officer will review it.");
      goToStep(3);
    } catch (err) {
      els.saveStatus.className = "status error";
      els.saveStatus.textContent = err.message;
    } finally {
      els.save.disabled = false;
    }
  });

  // ---- Reset / navigation buttons -----------------------------------------
  function resetWizard() {
    state.file = null; state.photoPath = null; state.aiResult = null;
    els.photo.value = "";
    if (els.preview.src) URL.revokeObjectURL(els.preview.src);
    els.preview.hidden = true;
    els.dropzone.style.display = "";
    els.description.value = "";
    els.form.reset();
    setStatus("");
    els.status.className = "status info hidden";
    setBusy(false);
    goToStep(1);
  }
  $("another-report")?.addEventListener("click", resetWizard);
  $("report-cancel-1")?.addEventListener("click", resetWizard);
  $("back-to-1")?.addEventListener("click", () => goToStep(1));

  // Restore area from profile if saved.
  window.addEventListener("ks:profile", (e) => {
    if (e.detail?.area && !els.area.value) els.area.value = e.detail.area;
  });
})();
