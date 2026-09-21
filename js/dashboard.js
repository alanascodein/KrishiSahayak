// KrishiSahayak AI — dashboard: tabs, profile, reports, groups, resources,
// knowledge, and officer tools (rule-based risk patterns).
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const { toast, esc, fmtDate, initials, configured } = window.KS;
  const client = window.KS.client;

  // ---- Auth guard ----------------------------------------------------------
  if (!configured) {
    toast("Connect Supabase in js/config.js first.", true);
    setTimeout(() => (location.href = "login.html"), 1200);
    return;
  }

  client.auth.getUser().then(({ data: { user } }) => {
    if (!user) return window.KS.requireLogin();
    init(user);
  });

  // ==========================================================================
  async function init(user) {
    // ---- Profile (create if missing) -------------------------------------
    let { data: profile } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) {
      const meta = user.user_metadata ?? {};
      const insert = {
        id: user.id,
        full_name: meta.full_name ?? "Farmer",
        role: meta.role ?? "farmer",
        area: meta.area ?? null,
      };
      const { data: created, error } = await client.from("profiles").insert(insert).select().single();
      if (!error) profile = created;
    }
    const role = profile?.role ?? "farmer";
    userId = user.id;
    myName = profile?.full_name ?? "Farmer";

    // ---- Role-based greeting & tabs ----------------------------------------
    const first = (profile?.full_name ?? "Friend").split(" ")[0];
    $("greet").textContent =
      role === "officer" ? `Officer ${first} 👮` :
      role === "expert"  ? `Welcome, ${first} 🎓` :
      `Welcome, ${first} 👋`;
    $("nav-name").textContent = profile?.full_name ?? "Profile";
    $("nav-avatar").textContent = initials(profile?.full_name);
    if (profile?.area) {
      $("greet-sub").textContent =
        role === "officer" ? `Regional dashboard — serving ${profile.area}.` :
        `Serving ${profile.area} — let's keep it healthy this season.`;
      document.dispatchEvent(new CustomEvent("ks:profile", { detail: profile }));
    }

    // Show only the tabs allowed for this role.
    const tabs = document.querySelectorAll("#dash-tabs .board-pill");
    tabs.forEach((t) => {
      const roles = (t.dataset.roles ?? "farmer,officer,expert").split(",");
      t.classList.toggle("hidden", !roles.includes(role));
    });

    const panes = document.querySelectorAll("main > .wizard-step");
    // Officers/experts land on their own home page.
    function openTab(name) {
      const target = name === "home" && role !== "farmer" ? "home-officer" : name;
      tabs.forEach((t) => {
        const tTarget = t.dataset.tab === "home" && role !== "farmer" ? "home-officer" : t.dataset.tab;
        t.classList.toggle("active", tTarget === target);
      });
      panes.forEach((p) => p.classList.toggle("active", p.id === `tab-${target}`));
      if (target === "home") loadHome();
      if (target === "home-officer") loadOfficerHome();
      if (name === "reports") loadMyReports();
      if (target === "review") loadOfficerReports();
      if (target === "signals") loadOfficerSignals();
      if (name === "groups") loadGroups();
      if (name === "resources") loadResources();
      if (name === "knowledge") loadKnowledge();
      location.hash = name;
    }
    tabs.forEach((t) => t.addEventListener("click", () => openTab(t.dataset.tab)));
    document.querySelectorAll("[data-goto]").forEach((b) =>
      b.addEventListener("click", () => openTab(b.dataset.goto)));
    // Deep link: dashboard.html#review
    openTab(location.hash.replace("#", "") || "home");
    window.addEventListener("hashchange", () =>
      openTab(location.hash.replace("#", "") || "home"));

    // ---- Profile form ------------------------------------------------------
    $("pf-name").value = profile?.full_name ?? "";
    $("pf-area").value = profile?.area ?? "";
    $("pf-role").value = role;
    $("profile-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const { error } = await client.from("profiles").upsert({
        id: user.id,
        full_name: $("pf-name").value.trim(),
        area: $("pf-area").value.trim() || null,
        role,
      });
      toast(error ? "Could not save profile." : "✅ Profile saved", !!error);
    });

    // ---- Sign out ----------------------------------------------------------
    $("signout-link").addEventListener("click", async (e) => {
      e.preventDefault();
      await client.auth.signOut();
      location.href = "login.html?switch=1";
    });

    if (role === "farmer") loadHome();
    else loadOfficerHome();
  }

  // ==========================================================================
  // HOME — stats + alerts
  // ==========================================================================
  async function loadHome() {
    const client2 = window.KS.client;

    // My reports count
    const { count: repCount } = await client2
      .from("farmer_reports").select("*", { count: "exact", head: true }).eq("farmer_id", (await client2.auth.getUser()).data.user.id);

    // Verified community alerts (risk patterns the officer confirmed)
    const { data: alerts } = await client2
      .from("risk_patterns").select("*").eq("status", "verified").order("created_at", { ascending: false }).limit(5);

    // My groups count
    const uid = (await client2.auth.getUser()).data.user.id;
    const { count: grpCount } = await client2
      .from("group_members").select("*", { count: "exact", head: true }).eq("farmer_id", uid);

    // My resource needs that have matches
    const { count: resCount } = await client2
      .from("resource_needs").select("*", { count: "exact", head: true }).eq("farmer_id", uid);

    $("stat-reports").textContent = repCount ?? 0;
    $("stat-alerts").textContent = alerts?.length ?? 0;
    $("stat-group").textContent = grpCount ?? 0;
    $("stat-needs").textContent = resCount ?? 0;

    // Verified alert banner
    if (alerts?.length) {
      const a = alerts[0];
      $("risk-banner").classList.remove("hidden");
      $("risk-title").textContent = `🚨 Verified alert: ${a.crop} — ${a.symptom}`;
      $("risk-text").textContent =
        `${a.report_count} farmers in ${a.area} reported this within the last days. Officer verified on ${fmtDate(a.verified_at)}.`;
      $("home-alerts").innerHTML = alerts.map((al) => `
        <div class="alert">
          <strong>🚨 ${esc(al.crop)} — ${esc(al.symptom)}</strong>
          <span class="small">${esc(al.report_count)} reports in ${esc(al.area)} · verified ${fmtDate(al.verified_at)}</span>
        </div>`).join("");
    } else {
      $("risk-banner").classList.add("hidden");
      $("home-alerts").innerHTML = `<div class="empty"><span class="icon">🌤️</span>No verified alerts right now — good news!</div>`;
    }
  }

  // ==========================================================================
  // MY REPORTS
  // ==========================================================================
  async function loadMyReports() {
    const { data: { user } } = await client.auth.getUser();
    const { data: reports, error } = await client
      .from("farmer_reports")
      .select("*")
      .eq("farmer_id", user.id)
      .order("created_at", { ascending: false });

    const box = $("my-reports");
    if (error) { box.innerHTML = `<div class="alert">Could not load reports: ${esc(error.message)}</div>`; return; }
    if (!reports?.length) {
      box.innerHTML = `<div class="empty"><span class="icon">📸</span>No reports yet.<br>
        <button class="btn btn-primary mt" data-goto="report">Report your first problem</button></div>`;
      box.querySelector("[data-goto]")?.addEventListener("click", () =>
        document.querySelector('[data-tab="report"]').click());
      return;
    }

    // Officer replies, most recent first — shown as cards above the table
    const replied = (reports ?? []).filter((r) => r.review_note);
    const repliesHtml = replied.length
      ? `<h3 class="mt">💬 Replies from your officer</h3>${replied.map((r) => `
        <div class="card officer-reply-card">
          <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:baseline">
            <strong>${esc(r.crop ?? "Your report")} — ${(r.symptoms ?? []).map(esc).join(", ") || "report"}</strong>
            <span class="small muted">${fmtDate(r.reviewed_at ?? r.created_at)}</span>
          </div>
          <p style="margin:.5rem 0 0;white-space:pre-wrap">${esc(r.review_note)}</p>
          ${r.photo_path ? `<img class="reply-photo photo-thumb" data-path="${esc(r.photo_path)}" alt="reported crop photo">` : ""}
        </div>`).join("")}`
      : "";

    box.innerHTML = `${repliesHtml}<div class="table-wrap"><table class="responsive">
      <thead><tr><th>Photo</th><th>Crop</th><th>Seen</th><th>Severity</th><th>Area</th><th>Status</th><th>When</th><th>Officer</th></tr></thead>
      <tbody>${reports.map((r) => `
        <tr>
          <td data-label="Photo">${r.photo_path
            ? `<img class="thumb photo-thumb" data-path="${esc(r.photo_path)}" alt="report photo">`
            : "—"}</td>
          <td data-label="Crop"><strong>${esc(r.crop)}</strong></td>
          <td data-label="Seen">${(r.symptoms ?? []).map((s) => esc(s)).join(", ") || "—"}</td>
          <td data-label="Severity">${sevBadge(r.severity)}</td>
          <td data-label="Area">${esc(r.area ?? "—")}</td>
          <td data-label="Status">${statusBadge(r.status)}${r.ai_extracted ? ' <span class="badge badge-ai">AI</span>' : ""}</td>
          <td data-label="When">${fmtDate(r.created_at)}</td>
          <td data-label="Officer">${r.review_note
            ? `<span class="officer-note" title="${esc(r.review_note)}">💬 Officer replied</span>`
            : '<span class="muted small">—</span>'}</td>
        </tr>`).join("")}</tbody></table></div>`;

    // Signed URLs for thumbnails
    box.querySelectorAll(".photo-thumb").forEach(async (img) => {
      const url = await window.KS.photoUrl(img.dataset.path);
      if (url) img.src = url; else img.replaceWith("—");
    });
  }

  function sevBadge(s) {
    if (!s) return "—";
    return `<span class="badge badge-sev-${esc(s)}">${esc(s)}</span>`;
  }
  function statusBadge(s) {
    const map = {
      unverified: '<span class="badge badge-unverified">⏳ unverified</span>',
      verified: '<span class="badge badge-verified">✅ verified</span>',
      rejected: '<span class="badge badge-rejected">❌ rejected</span>',
    };
    return map[s] ?? esc(s);
  }

  // ==========================================================================
  // GROUPS
  // ==========================================================================
  let userId = null;       // set in init() after auth guard
  let myName = "Farmer";   // profile full_name, set in init()

  async function loadGroups() {
    const { data: groups, error } = await client
      .from("farm_groups").select("*").order("created_at", { ascending: false });
    const { data: mine } = await client
      .from("group_members").select("group_id").eq("farmer_id", (await client.auth.getUser()).data.user.id);
    const myIds = new Set((mine ?? []).map((m) => m.group_id));

    const box = $("groups-list");
    if (error) { box.innerHTML = `<div class="alert">Could not load groups: ${esc(error.message)}</div>`; return; }
    if (!groups?.length) {
      box.innerHTML = `<div class="empty"><span class="icon">🤝</span>No groups yet — create the first one above!</div>`;
      return;
    }
    box.innerHTML = `<div class="card-grid">${groups.map((g) => `
      <div class="card">
        <h3>${esc(g.name)}</h3>
        <p class="small muted">📍 ${esc(g.area)}${g.main_crop ? ` · 🌾 ${esc(g.main_crop)}` : ""}</p>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap">
          <button class="btn ${myIds.has(g.id) ? "btn-ghost" : "btn-primary"} join-btn" data-id="${g.id}" data-joined="${myIds.has(g.id)}">
            ${myIds.has(g.id) ? "Member ✓" : "Join group"}
          </button>
          ${myIds.has(g.id) ? `<button class="btn btn-secondary chat-btn" data-id="${g.id}">💬 Chat</button>` : ""}
        </div>
      </div>`).join("")}</div>`;

    box.querySelectorAll(".join-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        if (btn.dataset.joined === "true") {
          await client.from("group_members").delete()
            .eq("group_id", id).eq("farmer_id", (await client.auth.getUser()).data.user.id);
          toast("Left the group");
          if (chatGroup?.id === id) closeGroupChat();
        } else {
          const { error: err } = await client.from("group_members")
            .insert({ group_id: id, farmer_id: (await client.auth.getUser()).data.user.id });
          toast(err ? "Could not join." : "✅ Joined! Welcome to the group.", !!err);
        }
        loadGroups();
      }));

    box.querySelectorAll(".chat-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        const group = groups.find((g) => g.id === btn.dataset.id);
        if (group) openGroupChat(group);
      }));
  }

  // ==========================================================================
  // GROUP CHAT — messages between members of one group (realtime)
  // ==========================================================================
  let chatGroup = null;      // farm_groups row currently open
  let chatChannel = null;    // realtime subscription for that group

  async function openGroupChat(group) {
    chatGroup = group;
    $("group-chat").classList.remove("hidden");
    $("chat-title").textContent = `💬 ${group.name}`;
    $("chat-input").value = "";
    $("chat-messages").innerHTML = `<div class="status info"><span class="spinner"></span> Loading messages…</div>`;
    $("group-chat").scrollIntoView({ behavior: "smooth", block: "start" });

    subscribeToChat();
    await loadChatMessages();
  }

  function closeGroupChat() {
    if (chatChannel) { client.removeChannel(chatChannel); chatChannel = null; }
    chatGroup = null;
    $("group-chat").classList.add("hidden");
  }

  function subscribeToChat() {
    if (chatChannel) client.removeChannel(chatChannel);
    chatChannel = client.channel(`group-chat-${chatGroup.id}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "group_messages", filter: `group_id=eq.${chatGroup.id}` },
        ({ new: msg }) => {
          if (!msg || msg.group_id !== chatGroup?.id) return;
          appendChatMessage(msg);
        })
      .subscribe();
  }

  async function loadChatMessages() {
    const { data: messages, error } = await client
      .from("group_messages").select("*")
      .eq("group_id", chatGroup.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      $("chat-messages").innerHTML = `<div class="alert">Could not load messages: ${esc(error.message)}</div>`;
      return;
    }
    renderChatMessages(messages ?? []);
  }

  function renderChatMessages(messages) {
    const box = $("chat-messages");
    if (!messages.length) {
      box.innerHTML = `<div class="empty"><span class="icon">💬</span>No messages yet — say hello to the group!</div>`;
      return;
    }
    box.innerHTML = messages.map(chatMessageHtml).join("");
    box.scrollTop = box.scrollHeight;
  }

  function appendChatMessage(msg) {
    const box = $("chat-messages");
    const empty = box.querySelector(".empty");
    if (empty) empty.remove();
    box.insertAdjacentHTML("beforeend", chatMessageHtml(msg));
    box.scrollTop = box.scrollHeight;
  }

  function chatMessageHtml(m) {
    const mine = m.sender_id === userId;
    return `
      <div class="chat-msg ${mine ? "mine" : "theirs"}">
        <div class="chat-bubble">
          ${mine ? "" : `<div class="chat-sender">${esc(m.sender_name)}</div>`}
          <div class="chat-text" style="white-space:pre-wrap">${esc(m.body)}</div>
          <div class="chat-time">${fmtDate(m.created_at)}</div>
        </div>
      </div>`;
  }

  $("chat-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!chatGroup) return;
    const input = $("chat-input");
    const body = input.value.trim();
    if (!body) return;
    const { error } = await client.from("group_messages").insert({
      group_id: chatGroup.id,
      sender_id: userId,
      sender_name: myName,
      body,
    });
    if (error) return toast("Could not send: " + error.message, true);
    input.value = "";
    input.focus();
  });

  $("chat-close")?.addEventListener("click", closeGroupChat);

  $("group-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { data: { user } } = await client.auth.getUser();
    const { data: group, error } = await client.from("farm_groups").insert({
      name: $("group-name").value.trim(),
      area: $("group-area").value.trim(),
      main_crop: $("group-crop").value.trim() || null,
      created_by: user.id,
    }).select().single();
    if (!error && group) {
      await client.from("group_members").insert({ group_id: group.id, farmer_id: user.id });
    }
    toast(error ? "Could not create group." : "✅ Group created — you're the first member!", !!error);
    if (!error) { e.target.reset(); loadGroups(); }
  });

  // ==========================================================================
  // RESOURCES — needs (rule-based matching) + surplus offers from farmers
  // ==========================================================================
  async function loadResources() {
    const [{ data: needs, error }, { data: offers, error: oerr }] = await Promise.all([
      client.from("resource_needs").select("*").order("created_at", { ascending: false }).limit(100),
      client.from("resource_offers").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    const box = $("resources-list");
    if (error) {
      box.innerHTML = `<div class="alert">Could not load needs: ${esc(error.message)}</div>`;
    } else if (!needs?.length) {
      box.innerHTML = `<div class="empty"><span class="icon">🚜</span>No needs posted yet.</div>`;
    } else {
      // RULE: count needs with same resource_type + area (excluding own)
      const counts = {};
      needs.forEach((n) => {
        const key = `${n.resource_type}|${(n.area ?? "").toLowerCase()}`;
        counts[key] = (counts[key] ?? 0) + 1;
      });
      // Cross-match: is someone in the same area already OFFERING this type?
      const offerCounts = {};
      (offers ?? []).forEach((o) => {
        if (o.status !== "available") return;
        const key = `${o.item_type}|${(o.area ?? "").toLowerCase()}`;
        offerCounts[key] = (offerCounts[key] ?? 0) + 1;
      });

      box.innerHTML = needs.map((n) => {
        const key = `${n.resource_type}|${(n.area ?? "").toLowerCase()}`;
        const matching = counts[key];
        const matchHint = matching >= 2
          ? `<div class="alert blue" style="margin:.6rem 0 0">
               <strong>🤝 ${matching} farmers in ${esc(n.area)} need this too!</strong>
               <span class="small">Suggested: coordinate procurement or shared use together.</span>
             </div>`
          : "";
        const off = offerCounts[key];
        const offerHint = off
          ? `<div class="alert" style="margin:.6rem 0 0;background:#eef7ee;border-color:#bcd9bc">
               <strong>🎁 ${off} farmer${off > 1 ? "s" : ""} nearby ${off > 1 ? "are" : "is"} offering this type — check below before buying new!</strong>
             </div>`
          : "";
        return `
        <div class="card" style="margin-bottom:.8rem">
          <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center">
            <div>
              <strong>${esc(n.resource_type)}</strong>
              <span class="small muted">· 📍 ${esc(n.area)} · ${fmtDate(n.created_at)}${n.farmer_id === userId ? " · you" : ""}</span>
              ${n.note ? `<p class="small" style="margin:.3rem 0 0">${esc(n.note)}</p>` : ""}
            </div>
          </div>
          ${matchHint}
          ${offerHint}
        </div>`;
      }).join("");
    }
    renderOffers(offers, oerr);
  }

  function renderOffers(offers, oerr) {
    const box = $("offers-list");
    if (!box) return;
    if (oerr) { box.innerHTML = `<div class="alert">Could not load offers: ${esc(oerr.message)}</div>`; return; }
    if (!offers?.length) {
      box.innerHTML = `<div class="empty"><span class="icon">🎁</span>Nothing shared yet. Leftover fertilizer or extra seeds? Share it above.</div>`;
      return;
    }
    box.innerHTML = offers.map((o) => {
      const mine = o.owner_id === userId;
      const free = Number(o.price) === 0;
      const priceTag = free
        ? `<span class="badge" style="background:#e3f4e3;color:#1c6b2f">🌿 Free to share</span>`
        : `<span class="badge badge-ai">₹${esc(o.price)} / ${esc(o.unit)}</span>`;
      const shared = o.status === "shared"
        ? `<span class="badge">✅ Shared</span>` : "";
      return `
      <div class="card" style="margin-bottom:.8rem;${o.status === "shared" ? "opacity:.75" : ""}">
        <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-start">
          <div>
            <strong>${esc(o.item_name)}</strong> ${priceTag} ${shared}
            <div class="small muted" style="margin-top:.2rem">
              ${esc(o.item_type)} · ${esc(o.quantity)} ${esc(o.unit)} · 📍 ${esc(o.area)} · by ${esc(o.owner_name)} · ${fmtDate(o.created_at)}
            </div>
            ${o.contact ? `<div class="small">📞 ${esc(o.contact)}</div>` : ""}
            ${o.note ? `<p class="small" style="margin:.3rem 0 0">${esc(o.note)}</p>` : ""}
          </div>
          ${mine ? `
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            ${o.status === "available" ? `<button class="btn btn-secondary" data-offer-done="${o.id}">Mark as shared</button>` : ""}
            <button class="btn btn-ghost" data-offer-del="${o.id}">Remove</button>
          </div>` : ""}
        </div>
      </div>`;
    }).join("");
  }

  // Mark shared / remove (event delegation on the offers list)
  $("offers-list")?.addEventListener("click", async (e) => {
    const doneBtn = e.target.closest("[data-offer-done]");
    const delBtn = e.target.closest("[data-offer-del]");
    if (doneBtn) {
      const { error } = await client.from("resource_offers").update({ status: "shared" }).eq("id", doneBtn.dataset.offerDone);
      toast(error ? "Could not update." : "✅ Marked as shared. Thanks for helping a neighbour!", !!error);
      if (!error) loadResources();
    } else if (delBtn) {
      const { error } = await client.from("resource_offers").delete().eq("id", delBtn.dataset.offerDel);
      toast(error ? "Could not remove." : "Offer removed.", !!error);
      if (!error) loadResources();
    }
  });

  $("offer-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await client.from("resource_offers").insert({
      owner_id: userId,
      owner_name: myName,
      item_name: $("off-name").value.trim(),
      item_type: $("off-type").value,
      quantity: Number($("off-qty").value),
      unit: $("off-unit").value,
      price: Number($("off-price").value || 0),
      area: $("off-area").value.trim(),
      contact: $("off-contact").value.trim() || null,
      note: $("off-note").value.trim() || null,
    });
    toast(error ? "Could not share item: " + (error.message || "") : "🎁 Shared! Nearby farmers can see it now.", !!error);
    if (!error) { e.target.reset(); $("off-price").value = 0; loadResources(); }
  });

  // ==========================================================================
  // KNOWLEDGE SHARING
  // ==========================================================================
  async function loadKnowledge() {
    const { data: posts, error } = await client
      .from("knowledge_posts").select("*").order("created_at", { ascending: false }).limit(50);
    const box = $("knowledge-list");
    if (error) { box.innerHTML = `<div class="alert">Could not load knowledge: ${esc(error.message)}</div>`; return; }
    if (!posts?.length) {
      box.innerHTML = `<div class="empty"><span class="icon">📚</span>No knowledge shared yet — be the first!</div>`;
      return;
    }
    box.innerHTML = posts.map((p) => `
      <div class="card" style="margin-bottom:.8rem">
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-bottom:.3rem">
          ${p.is_verified
            ? '<span class="badge badge-verified">✅ Verified guidance</span>'
            : '<span class="badge badge-unverified">🌾 Farmer experience</span>'}
          <span class="chip">🌾 ${esc(p.crop)}</span>
          <span class="chip">${esc(p.topic)}</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <p style="white-space:pre-wrap">${esc(p.body)}</p>
        <p class="small muted">— ${esc(p.author_name ?? "Farmer")} · ${esc(p.area ?? "local area")} · ${fmtDate(p.created_at)}</p>
      </div>`).join("");
  }

  $("knowledge-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { data: { user } } = await client.auth.getUser();
    const { data: profile } = await client.from("profiles").select("full_name, area, role").eq("id", user.id).maybeSingle();
    const { error } = await client.from("knowledge_posts").insert({
      author_id: user.id,
      author_name: profile?.full_name ?? "Farmer",
      area: profile?.area ?? null,
      is_verified: profile?.role === "officer" || profile?.role === "expert",
      crop: $("kn-crop").value.trim(),
      topic: $("kn-topic").value,
      title: $("kn-title").value.trim(),
      body: $("kn-body").value.trim(),
    });
    toast(error ? "Could not share." : "✅ Shared with everyone — thank you!", !!error);
    if (!error) { e.target.reset(); loadKnowledge(); }
  });

  // ==========================================================================
  // OFFICER — home page, review queue, and rule-based risk signals
  // ==========================================================================

  // Rule: same crop + similar symptom + area within 7 days, >= 3 reports.
  // Symptoms are matched by word overlap, so "brown spots on leaves" and
  // "brown spots on the leaf" (same meaning, different words) still group.
  const SYMP_SKIP = new Set(
    ["a","an","and","are","at","by","for","from","in","is","it","its","of",
     "on","or","the","to","with","as","be","been","was","were"]);

  function symStem(w) {
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 3 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("ed")) return w.slice(0, -1);
    if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
    return w;
  }

  function symWords(sym) {
    return new Set(
      String(sym || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map(symStem)
        .filter((w) => w.length >= 3 && !SYMP_SKIP.has(w)));
  }

  function symSimilar(a, b) {
    const wa = symWords(a), wb = symWords(b);
    if (!wa.size || !wb.size) return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    let inter = 0;
    wa.forEach((w) => { if (wb.has(w)) inter++; });
    return (2 * inter) / (wa.size + wb.size) >= 0.5;
  }

  async function computeSignals() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: recent }, { data: saved }] = await Promise.all([
      client.from("farmer_reports").select("*").gte("created_at", since).neq("status", "rejected"),
      client.from("risk_patterns").select("*").order("created_at", { ascending: false }).limit(30),
    ]);

    // Group by crop + area first, then cluster similar symptoms inside.
    const buckets = new Map();
    (recent ?? []).forEach((r) => {
      if (!r.crop || !r.area) return;
      const sym = (r.symptoms ?? [])[0] ?? "unspecified";
      const bkey = `${r.crop.toLowerCase()}|${r.area.toLowerCase()}`;
      if (!buckets.has(bkey)) buckets.set(bkey, []);
      buckets.get(bkey).push({ r, sym });
    });

    const clusters = [];
    buckets.forEach((items, bkey) => {
      const [crop, area] = bkey.split("|");
      const groups = [];
      items.forEach(({ r, sym }) => {
        let g = groups.find((g) => symSimilar(g.symptom, sym));
        if (!g) { g = { symptom: sym, reports: [] }; groups.push(g); }
        g.reports.push(r);
      });
      groups.forEach((g) => {
        if (g.reports.length >= 3) clusters.push({ crop, area, symptom: g.symptom, reports: g.reports });
      });
    });

    // A dismissed (rejected) signal stays hidden until NEW reports arrive.
    const rejected = (saved ?? []).filter((p) => p.status === "rejected");
    return clusters.filter((c) =>
      !rejected.some((p) =>
        p.crop.toLowerCase() === c.crop &&
        p.area.toLowerCase() === c.area &&
        symSimilar(p.symptom, c.symptom)));
  }

  // ---- Officer home page: stats + latest unverified reports
  async function loadOfficerHome() {
    const [{ count: pending }, { count: alerts }, { count: farmers }, signals] = await Promise.all([
      client.from("farmer_reports").select("*", { count: "exact", head: true }).eq("status", "unverified"),
      client.from("risk_patterns").select("*", { count: "exact", head: true }).eq("status", "verified"),
      client.from("profiles").select("*", { count: "exact", head: true }).eq("role", "farmer"),
      computeSignals(),
    ]);

    $("ostat-pending").textContent = pending ?? 0;
    $("ostat-signals").textContent = signals.length;
    $("ostat-alerts").textContent = alerts ?? 0;
    $("ostat-farmers").textContent = farmers ?? 0;

    const { data: latest } = await client
      .from("farmer_reports").select("*").eq("status", "unverified")
      .order("created_at", { ascending: false }).limit(5);

    $("officer-home-latest").innerHTML = !latest?.length
      ? `<div class="empty"><span class="icon">✅</span>All caught up — no pending reports!</div>`
      : latest.map((r) => `
        <div class="card" style="margin-bottom:.8rem">
          <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center">
            <div>
              <strong>${esc(r.crop ?? "Unknown crop")}</strong>
              <span class="small muted">· ${(r.symptoms ?? []).map(esc).join(", ") || "no symptoms listed"
                } · 📍 ${esc(r.area ?? "—")} · ${fmtDate(r.created_at)}</span>
            </div>
            ${sevBadge(r.severity)}
          </div>
        </div>`).join("");
  }

  // ---- Risk signals tab
  async function loadOfficerSignals() {
    const signals = await computeSignals();
    const riskBox = $("risk-list");
    if (!signals.length) {
      riskBox.innerHTML = `<div class="empty"><span class="icon">🌤️</span>No risk patterns detected in the last 7 days.</div>`;
    } else {
      riskBox.innerHTML = signals.map(({ crop, area, symptom, reports }) => {
        const fired = `Rule fired: ${reports.length} reports of "${symptom}" on ${crop} in ${area} within 7 days.`;
        return `
        <div class="alert">
          <strong>🚨 ${reports.length} similar reports — ${esc(crop)}, "${esc(symptom)}" in ${esc(area)}</strong>
          <span class="small">${esc(fired)} Latest: ${fmtDate(reports[reports.length - 1].created_at)}</span>
          <div style="margin-top:.6rem;display:flex;gap:.6rem;flex-wrap:wrap">
            <button class="btn btn-primary confirm-pattern" data-key="${esc(`${crop}|${symptom}|${area}`)}"
              data-crop="${esc(crop)}" data-sym="${esc(symptom)}" data-area="${esc(area)}" data-count="${reports.length}">
              ✅ Confirm & alert community
            </button>
            <button class="btn btn-ghost dismiss-pattern" data-key="${esc(`${crop}|${symptom}|${area}`)}">Dismiss</button>
          </div>
        </div>`;
      }).join("");
    }

    riskBox.querySelectorAll(".confirm-pattern").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const { error } = await client.from("risk_patterns").insert({
          crop: btn.dataset.crop, symptom: btn.dataset.sym, area: btn.dataset.area,
          report_count: Number(btn.dataset.count), status: "verified", verified_by: (await client.auth.getUser()).data.user.id,
          verified_at: new Date().toISOString(),
        });
        toast(error ? "Could not confirm." : "✅ Alert published to the community!", !!error);
        loadOfficerSignals();
        loadOfficerHome();
      }));

    riskBox.querySelectorAll(".dismiss-pattern").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await client.from("risk_patterns").insert({
          crop: btn.dataset.key.split("|")[0], symptom: btn.dataset.key.split("|")[1],
          area: btn.dataset.key.split("|")[2],
          report_count: 0, status: "rejected",
          verified_by: (await client.auth.getUser()).data.user.id, verified_at: new Date().toISOString(),
        });
        toast("Signal dismissed");
        loadOfficerSignals();
        loadOfficerHome();
      }));
  }

  // ---- Review queue tab
  async function loadOfficerReports() {
    const { data: reports } = await client
      .from("farmer_reports").select("*").order("created_at", { ascending: false }).limit(50);
    const rbox = $("officer-reports");
    if (!reports?.length) {
      rbox.innerHTML = `<div class="empty"><span class="icon">🗂️</span>No reports yet.</div>`;
      return;
    }
    rbox.innerHTML = `<div class="table-wrap"><table class="responsive">
      <thead><tr><th>Photo</th><th>Crop</th><th>Seen</th><th>Severity</th><th>Area</th><th>Status</th><th>Verify</th></tr></thead>
      <tbody>${reports.map((r) => `
        <tr>
          <td data-label="Photo">${r.photo_path
            ? `<img class="thumb photo-thumb" data-path="${esc(r.photo_path)}" alt="crop photo" title="Click to enlarge">`
            : "—"}</td>
          <td data-label="Crop"><strong>${esc(r.crop ?? "—")}</strong></td>
          <td data-label="Seen">${(r.symptoms ?? []).map(esc).join(", ") || "—"}</td>
          <td data-label="Severity">${sevBadge(r.severity)}</td>
          <td data-label="Area">${esc(r.area ?? "—")}</td>
          <td data-label="Status">${statusBadge(r.status)}</td>
          ${r.review_note ? `
            <td data-label="Officer reply" style="max-width:260px">
              <span class="small officer-note">💬 ${esc(r.review_note)}</span>
            </td>` : ""}
          <td data-label="Verify">
            ${r.status === "unverified" ? `
              <button class="btn btn-primary verify-btn" data-id="${r.id}" style="min-height:38px;padding:.3rem .8rem">✅ Verify</button>
              <button class="btn btn-ghost reject-btn" data-id="${r.id}" style="min-height:38px;padding:.3rem .8rem">Reject</button>`
            : ""}
            <button class="btn btn-secondary reply-btn" data-id="${r.id}" data-note="${esc(r.review_note ?? "")}" style="min-height:38px;padding:.3rem .8rem">💬 Reply</button>
          </td>
        </tr>`).join("")}</tbody></table></div>`;

    rbox.querySelectorAll(".verify-btn").forEach((b) => b.addEventListener("click", () => setReportStatus(b.dataset.id, "verified")));
    rbox.querySelectorAll(".reject-btn").forEach((b) => b.addEventListener("click", () => setReportStatus(b.dataset.id, "rejected")));
    rbox.querySelectorAll(".photo-thumb").forEach(async (img) => {
      const url = await window.KS.photoUrl(img.dataset.path);
      if (url) img.src = url; else img.replaceWith("—");
    });

    // ---- Officer reply form (inline, per report)
    rbox.querySelectorAll(".reply-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        rbox.querySelector(".reply-box")?.remove(); // close any other open form
        const tr = btn.closest("tr");
        const id = btn.dataset.id;
        const existing = btn.dataset.note ?? "";
        const row = document.createElement("tr");
        row.innerHTML = `
          <td colspan="7">
            <div class="reply-box">
              <label for="reply-input-${id}">Message to the farmer</label>
              <textarea id="reply-input-${id}" rows="2" maxlength="2000"
                placeholder="e.g. Confirmed early blight. Remove affected leaves, spray as advised below, and re-check in 5 days.">${esc(existing)}</textarea>
              <div style="display:flex;gap:.6rem;margin-top:.6rem;flex-wrap:wrap">
                <button class="btn btn-primary reply-send" style="min-height:40px">Send reply</button>
                <button class="btn btn-ghost reply-cancel" style="min-height:40px">Cancel</button>
              </div>
            </div>
          </td>`;
        tr.after(row);
        row.querySelector("textarea").focus();

        row.querySelector(".reply-cancel").addEventListener("click", () => row.remove());
        row.querySelector(".reply-send").addEventListener("click", async () => {
          const note = row.querySelector("textarea").value.trim();
          if (!note) return toast("Write a message first.", true);
          const { error } = await client.from("farmer_reports").update({
            review_note: note,
            reviewed_by: (await client.auth.getUser()).data.user.id,
            reviewed_at: new Date().toISOString(),
          }).eq("id", id);
          toast(error ? "Could not send reply." : "✅ Reply sent to the farmer", !!error);
          if (!error) { row.remove(); loadOfficerReports(); }
        });
      }));
  }

  // ---- Click any .photo-thumb to view the full photo (officer verification, my reports)
  document.addEventListener("click", (e) => {
    const img = e.target.closest(".photo-thumb");
    if (!img || !img.src) return;
    const ov = document.createElement("div");
    ov.className = "photo-lightbox";
    ov.innerHTML = `<img src="${img.src}" alt="crop photo enlarged">`;
    ov.addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  });

  async function setReportStatus(id, status) {
    const { error } = await client.from("farmer_reports").update({ status }).eq("id", id);
    toast(error ? "Could not update." : status === "verified" ? "✅ Report verified" : "Report rejected", !!error);
    loadOfficerReports();
    loadOfficerHome();
  }
})();
