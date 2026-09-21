// KrishiSahayak AI — Global Community Chat (no AI, just people).
// Boards → posts → threaded comments, votes, flairs. Realtime via Supabase.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const { toast, esc, fmtDate, configured } = window.KS;
  const client = window.KS.client;

  if (!configured) {
    toast("Connect Supabase in js/config.js first.", true);
    setTimeout(() => (location.href = "login.html"), 1200);
    return;
  }

  const FLAIRS = {
    question:   { label: "❓ Question",          cls: "flair-question" },
    experience: { label: "🌾 Farmer Experience", cls: "flair-experience" },
    problem:    { label: "🍂 Crop Problem",      cls: "flair-problem" },
    resource:   { label: "🚜 Resource",          cls: "flair-resource" },
    discussion: { label: "💬 Discussion",        cls: "flair-discussion" },
    verified:   { label: "✅ Verified Guidance",  cls: "flair-verified" },
    official:   { label: "📢 Official",          cls: "flair-official" },
  };
  const BOARDS = [
    { slug: "general",  name: "🌾 General" },
    { slug: "paddy",    name: "🌾 Paddy" },
    { slug: "coconut",  name: "🌴 Coconut" },
    { slug: "banana",   name: "🍌 Banana" },
    { slug: "pepper",   name: "🌶️ Pepper" },
    { slug: "pests",    name: "🐛 Pests & Disease" },
    { slug: "irrigation", name: "💧 Irrigation" },
    { slug: "machinery", name: "🚜 Machinery" },
    { slug: "subsidies", name: "💰 Subsidies" },
  ];

  let me = null;
  let myRole = "farmer";
  let activeBoard = "general";
  let sort = "new";
  let posts = [];

  // ==========================================================================
  async function boot() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return window.KS.requireLogin("Sign in to join the community.");

    const { data: profile } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
    me = user;
    myRole = profile?.role ?? "farmer";

    renderBoards();
    await loadPosts();

    // Realtime: new posts appear live
    client.channel("community-posts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_posts" }, loadPosts)
      .subscribe();

    $("post-form").addEventListener("submit", createPost);
    $("sort").addEventListener("change", () => { sort = $("sort").value; renderPosts(); });
    $("search").addEventListener("input", renderPosts);
  }

  // ==========================================================================
  function renderBoards() {
    const select = $("post-board");
    $("boards").innerHTML = BOARDS.map((b) =>
      `<button type="button" class="board-pill ${b.slug === activeBoard ? "active" : ""}" data-board="${b.slug}">${b.name}</button>`).join("");
    select.innerHTML = BOARDS.map((b) => `<option value="${b.slug}">${b.name}</option>`).join("");

    // Officers/experts can post with verified/official flairs
    if (myRole === "officer" || myRole === "expert") {
      $("post-flair").insertAdjacentHTML("beforeend",
        `<option value="verified">✅ Verified Guidance (officer/expert)</option>
         <option value="official">📢 Official Announcement (officer)</option>`);
    }

    document.querySelectorAll("[data-board]").forEach((b) =>
      b.addEventListener("click", () => {
        activeBoard = b.dataset.board;
        document.querySelectorAll("[data-board]").forEach((x) =>
          x.classList.toggle("active", x.dataset.board === activeBoard));
        renderPosts();
      }));
  }

  // ==========================================================================
  async function loadPosts() {
    const { data, error } = await client
      .from("community_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      $("posts").innerHTML = `<div class="empty"><span class="icon">⚠️</span>Could not load posts: ${esc(error.message)}</div>`;
      return;
    }
    posts = data ?? [];
    renderPosts();
  }

  function renderPosts() {
    const q = $("search").value.trim().toLowerCase();
    let list = posts.filter((p) =>
      (activeBoard === "general" || p.board === activeBoard) &&
      (!q || (p.title + " " + (p.body ?? "")).toLowerCase().includes(q)));

    if (sort === "new") {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === "top") {
      list.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else { // hot: score decayed by age
      const hours = (iso) => (Date.now() - new Date(iso)) / 3.6e6;
      list.sort((a, b) =>
        ((b.score ?? 0) + 1) / Math.pow(hours(b.created_at) + 2, 1.5) -
        ((a.score ?? 0) + 1) / Math.pow(hours(a.created_at) + 2, 1.5));
    }

    const box = $("posts");
    if (!list.length) {
      box.innerHTML = `<div class="empty"><span class="icon">💬</span>No posts here yet. Be the first to start the conversation!</div>`;
      return;
    }
    box.innerHTML = list.map((p) => `
      <div class="post">
        <div class="post-head">
          <span class="flair ${FLAIRS[p.flair]?.cls ?? "flair-discussion"}">${FLAIRS[p.flair]?.label ?? p.flair}</span>
          <span>in <strong>${esc(boardName(p.board))}</strong></span>
          <span>· by <strong>${esc(p.author_name)}</strong></span>
          <span>· ${fmtDate(p.created_at)}</span>
        </div>
        <h3 class="post-title">${esc(p.title)}</h3>
        ${p.body ? `<p style="white-space:pre-wrap">${esc(p.body)}</p>` : ""}
        <div class="post-actions">
          <button class="vote-btn up" data-id="${p.id}">▲ ${p.score ?? 0}</button>
          <button class="btn btn-ghost" style="min-height:38px;padding:.3rem .9rem" data-open="${p.id}">💬 Replies (<span class="rcount" data-id="${p.id}">${p.reply_count ?? 0}</span>)</button>
          ${p.author_id === me.id ? `<button class="btn btn-ghost" style="min-height:38px;padding:.3rem .9rem" data-del="${p.id}">🗑️ Delete</button>` : ""}
        </div>
      </div>`).join("");

    box.querySelectorAll(".vote-btn").forEach((b) => b.addEventListener("click", () => vote("community_posts", b.dataset.id, b)));
    box.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openThread(b.dataset.open)));
    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deletePost(b.dataset.del)));
  }

  const boardName = (slug) => BOARDS.find((b) => b.slug === slug)?.name ?? slug;

  // ==========================================================================
  async function createPost(e) {
    e.preventDefault();
    const { data: profile } = await client.from("profiles").select("full_name").eq("id", me.id).maybeSingle();
    const { error } = await client.from("community_posts").insert({
      author_id: me.id,
      author_name: profile?.full_name ?? "Farmer",
      board: $("post-board").value,
      flair: $("post-flair").value,
      title: $("post-title").value.trim(),
      body: $("post-body").value.trim() || null,
    });
    if (error) return toast("Could not post: " + error.message, true);
    e.target.reset();
    toast("✅ Posted!");
    loadPosts();
  }

  async function deletePost(id) {
    if (!confirm("Delete this post?")) return;
    await client.from("community_posts").delete().eq("id", id).eq("author_id", me.id);
    toast("Post deleted");
    loadPosts();
  }

  // ==========================================================================
  // THREAD (comments) — verified officer/expert replies pinned on top
  // ==========================================================================
  async function openThread(postId) {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    $("thread").classList.remove("hidden");
    $("thread").scrollIntoView({ behavior: "smooth", block: "start" });
    $("thread").innerHTML = `<div class="status info"><span class="spinner"></span> Loading replies…</div>`;

    const { data: comments, error } = await client
      .from("post_comments").select("*").eq("post_id", postId).order("created_at");

    const verified = (comments ?? []).filter((c) => c.author_role === "officer" || c.author_role === "expert");
    const community = (comments ?? []).filter((c) => c.author_role !== "officer" && c.author_role !== "expert");

    $("thread").innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">${esc(post.title)}</h3>
        <button class="btn btn-ghost" id="close-thread" style="min-height:38px">✕ Close</button>
      </div>
      ${post.body ? `<p style="white-space:pre-wrap">${esc(post.body)}</p>` : ""}
      <hr style="border:none;border-top:1px solid var(--line)">

      ${verified.length ? `<h4>✅ Verified replies</h4>${verified.map(commentHtml).join("")}` : ""}
      <h4>💬 Community replies</h4>
      ${community.length ? community.map(commentHtml).join("")
        : `<p class="muted small">No replies yet — help this farmer out!</p>`}

      <form id="comment-form">
        <label for="comment-input">Add your reply</label>
        <textarea id="comment-input" rows="2" required placeholder="Share what you know…"></textarea>
        <button class="btn btn-primary" style="margin-top:.6rem">Reply</button>
      </form>`;

    $("close-thread").addEventListener("click", () => $("thread").classList.add("hidden"));
    $("comment-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("comment-input");
      const { data: profile } = await client.from("profiles").select("full_name").eq("id", me.id).maybeSingle();
      const { error } = await client.from("post_comments").insert({
        post_id: postId,
        author_id: me.id,
        author_name: profile?.full_name ?? "Farmer",
        author_role: myRole,
        body: input.value.trim(),
      });
      if (error) return toast("Could not reply.", true);
      input.value = "";
      openThread(postId); // re-render
    });
  }

  function commentHtml(c) {
    const verified = c.author_role === "officer" || c.author_role === "expert";
    const badge = verified
      ? `<span class="badge badge-verified">✅ ${c.author_role}</span>` : "";
    return `
      <div class="comment ${verified ? "verified-reply" : ""}">
        <div class="comment-head">
          <strong>${esc(c.author_name)}</strong>${badge}<span>· ${fmtDate(c.created_at)}</span>
        </div>
        <div style="white-space:pre-wrap">${esc(c.body)}</div>
      </div>`;
  }

  // ==========================================================================
  // VOTING — one vote per user, up/down on posts
  // ==========================================================================
  async function vote(table, rowId, btn) {
    const { data: existing } = await client
      .from("post_votes").select("*").eq("user_id", me.id).eq("post_id", rowId).maybeSingle();

    if (existing) {
      await client.from("post_votes").delete().eq("id", existing.id);
      await client.rpc("ks_post_vote", { p_post: rowId, p_delta: -1 });
      btn.classList.remove("voted");
    } else {
      await client.from("post_votes").insert({ user_id: me.id, post_id: rowId });
      await client.rpc("ks_post_vote", { p_post: rowId, p_delta: 1 });
      btn.classList.add("voted");
    }
  }

  boot();
})();
