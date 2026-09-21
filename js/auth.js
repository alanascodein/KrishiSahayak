// KrishiSahayak AI — authentication: sign in, sign up with role, password reset.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const statusEl = $("auth-status");

  // ---- Show setup warning if config not filled in -------------------------
  if (!window.KS || !window.KS.configured) {
    $("setup-warning").classList.remove("hidden");
    $("login-btn").disabled = true;
    $("signup-btn").disabled = true;
  }

  const client = window.KS?.client;

  // ---- Tab switching ------------------------------------------------------
  function showTab(which) {
    const isLogin = which === "login";
    $("login-form").classList.toggle("hidden", !isLogin);
    $("signup-form").classList.toggle("hidden", isLogin);
    $("tab-login").classList.toggle("btn-primary", isLogin);
    $("tab-login").classList.toggle("btn-ghost", !isLogin);
    $("tab-login").setAttribute("aria-selected", isLogin);
    $("tab-signup").classList.toggle("btn-primary", !isLogin);
    $("tab-signup").classList.toggle("btn-ghost", isLogin);
    $("tab-signup").setAttribute("aria-selected", !isLogin);
    $("switch-text").textContent = isLogin ? "New here?" : "Already have an account?";
    $("switch-link").textContent = isLogin ? "Create an account" : "Sign in instead";
    statusEl.classList.add("hidden");
  }
  $("tab-login").addEventListener("click", () => showTab("login"));
  $("tab-signup").addEventListener("click", () => showTab("signup"));
  $("switch-link").addEventListener("click", (e) => {
    e.preventDefault();
    showTab($("login-form").classList.contains("hidden") ? "login" : "signup");
  });

  // ---- Role picker --------------------------------------------------------
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".role-btn").forEach((b) => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-ghost");
      });
      btn.classList.remove("btn-ghost");
      btn.classList.add("btn-primary");
      $("signup-role").value = btn.dataset.role;
    });
  });

  // ---- Status helpers -----------------------------------------------------
  function setStatus(message, kind = "info") {
    statusEl.textContent = message;
    statusEl.className = `status ${kind}`;
  }
  function setBusy(btn, busy, labelBusy, labelIdle) {
    btn.disabled = busy;
    btn.textContent = busy ? labelBusy : labelIdle;
  }

  // Where to go after sign in ("?next=" support).
  function nextUrl() {
    const params = new URLSearchParams(location.search);
    const next = params.get("next");
    return next && next.startsWith("/") ? next : "dashboard.html";
  }

  const reason = new URLSearchParams(location.search).get("reason");
  if (reason) setStatus(reason, "warn");

  // Already signed in? Go straight to the dashboard.
  if (client) {
    client.auth.getUser().then(({ data: { user } }) => {
      if (user && !location.search.includes("switch=1")) location.replace(nextUrl());
    });
  }

  // ---- Help the browser offer to save the login ----------------------------
  // Because sign-in is async (no real form submission), Chrome sometimes misses
  // the "Save password?" moment. The Credential Management API makes the bubble
  // reliable where supported (Chrome/Edge); Firefox/Safari simply skip it.
  function offerSavePassword(email, password) {
    try {
      if (!window.PasswordCredential || !navigator.credentials?.store) return;
      const stored = navigator.credentials
        .store(new PasswordCredential({ id: email, password }))
        .catch(() => {});
      // Never let the save bubble delay the dashboard for more than 2.5 s.
      return Promise.race([stored, new Promise((r) => setTimeout(r, 2500))]);
    } catch {
      /* unsupported — the browser falls back to its own heuristics */
    }
  }

  // ---- Sign in ------------------------------------------------------------
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!client) return;
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    if (!email || !password) return setStatus("Please enter your email and password.", "warn");

    setBusy($("login-btn"), true, "Signing in…", "Sign in");
    try {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setStatus("Signed in! Opening your dashboard…", "success");
      await offerSavePassword(email, password);
      location.href = nextUrl();
    } catch (err) {
      setBusy($("login-btn"), false, "", "Sign in");
      const msg = err.message === "Invalid login credentials"
        ? "Wrong email or password. Please try again."
        : err.message;
      setStatus(msg, "error");
    }
  });

  // ---- Sign up ------------------------------------------------------------
  $("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!client) return;
    const name = $("signup-name").value.trim();
    const email = $("signup-email").value.trim();
    const password = $("signup-password").value;
    const role = $("signup-role").value;
    const area = $("signup-area").value.trim();

    if (!name) return setStatus("Please enter your name.", "warn");
    if (password.length < 6) return setStatus("Password needs at least 6 characters.", "warn");

    setBusy($("signup-btn"), true, "Creating account…", "Create account");
    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, role, area } },
      });
      if (error) throw error;

      // If email confirmation is ON, tell the farmer clearly what to do next.
      if (!data.session) {
        setStatus("✅ Account created! Check your email for a confirmation link, then sign in here.", "success");
        showTab("login");
        $("login-email").value = email;
      } else {
        location.href = nextUrl();
      }
    } catch (err) {
      setBusy($("signup-btn"), false, "", "Create account");
      const msg = /already registered/i.test(err.message)
        ? "That email already has an account. Try signing in instead."
        : err.message;
      setStatus(msg, "error");
    }
  });

  // ---- Forgot password ----------------------------------------------------
  $("forgot-link").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!client) return;
    const email = $("login-email").value.trim();
    if (!email) return setStatus("Type your email above first, then tap 'Forgot password'.", "warn");
    try {
      await client.auth.resetPasswordForEmail(email);
      setStatus("📧 Reset link sent! Check your email inbox.", "success");
    } catch (err) {
      setStatus(err.message, "error");
    }
  });
})();
