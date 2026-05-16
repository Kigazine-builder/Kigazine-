/* Kigazine six-digit signup verification add-on.
   Sends the signup code by email when EmailJS is configured.
   IMPORTANT: Update EMAILJS_CONFIG below with your EmailJS values.
*/
(() => {
  const CODE_TTL_MS = 10 * 60 * 1000;

  const EMAILJS_CONFIG = {
    publicKey: "PASTE_EMAILJS_PUBLIC_KEY_HERE",
    serviceId: "PASTE_EMAILJS_SERVICE_ID_HERE",
    templateId: "PASTE_EMAILJS_TEMPLATE_ID_HERE"
  };

  let booted = false;
  let pendingSignup = null;
  let emailJsLoaded = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function emailSendingConfigured() {
    return Boolean(
      EMAILJS_CONFIG.publicKey &&
      EMAILJS_CONFIG.serviceId &&
      EMAILJS_CONFIG.templateId &&
      !EMAILJS_CONFIG.publicKey.includes("PASTE_") &&
      !EMAILJS_CONFIG.serviceId.includes("PASTE_") &&
      !EMAILJS_CONFIG.templateId.includes("PASTE_")
    );
  }

  function currentAuthMode() {
    return byId("signupTab")?.classList.contains("active") ? "signup" : "login";
  }

  function showAuthMessage(message, type = "") {
    const box = byId("authMessage");
    if (!box) return;
    box.textContent = message;
    box.className = `notice ${type}`.trim();
    box.classList.remove("hidden");
  }

  function hideVerificationBox() {
    byId("verificationBox")?.classList.add("hidden");
    const input = byId("verificationCodeInput");
    if (input) input.value = "";
  }

  function resetPendingSignup() {
    pendingSignup = null;
    hideVerificationBox();
  }

  function generateVerificationCode() {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return String(100000 + (values[0] % 900000));
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function normalizeEmail(email = "") {
    return email.trim().toLowerCase();
  }

  function isExpired() {
    return !pendingSignup || Date.now() - pendingSignup.createdAt > CODE_TTL_MS;
  }

  async function firebaseFunctions() {
    return await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js");
  }

  function loadEmailJsSdk() {
    if (emailJsLoaded || window.emailjs) {
      emailJsLoaded = true;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      script.async = true;
      script.onload = () => {
        emailJsLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error("Could not load the email sender."));
      document.head.appendChild(script);
    });
  }

  async function sendVerificationEmail(email, username, code) {
    if (!emailSendingConfigured()) {
      return false;
    }

    await loadEmailJsSdk();

    if (!window.emailjs?.send) {
      throw new Error("Email sender is not ready.");
    }

    window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });

    await window.emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      {
        to_email: email,
        to_name: username || "Kigazine user",
        verification_code: code,
        code,
        app_name: "Kigazine"
      }
    );

    return true;
  }

  async function createVerifiedAccount() {
    const auth = window.auth;
    const db = window.db;
    if (!auth || !db || !pendingSignup) {
      showAuthMessage("Verification is not ready. Refresh and try again.", "error");
      return;
    }

    const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js");
    const { doc, setDoc, serverTimestamp } = await firebaseFunctions();

    const cred = await createUserWithEmailAndPassword(
      auth,
      pendingSignup.email,
      pendingSignup.password
    );

    await setDoc(doc(db, "users", cred.user.uid), {
      username: pendingSignup.username,
      email: pendingSignup.email,
      role: pendingSignup.isAdminEmail ? "admin" : "writer",
      friendUids: [],
      discoverableProfile: false,
      commentsFriendsOnly: true,
      photoDataUrl: "",
      guardianPermissionConfirmed: true,
      signupVerificationPassed: true,
      signupVerifiedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    showAuthMessage("Code accepted. Account created. Logging you in...", "success");
    resetPendingSignup();
  }

  async function verifyCode() {
    const codeInput = byId("verificationCodeInput");
    const entered = codeInput?.value.trim() || "";

    if (!pendingSignup) {
      showAuthMessage("No signup is waiting for verification. Start signup again.", "error");
      return;
    }

    if (isExpired()) {
      resetPendingSignup();
      showAuthMessage("That code expired. Start signup again to get a new code.", "error");
      return;
    }

    if (!/^\d{6}$/.test(entered)) {
      showAuthMessage("Enter the full 6-digit verification code.", "error");
      return;
    }

    if (entered !== pendingSignup.code) {
      showAuthMessage("Incorrect verification code.", "error");
      return;
    }

    const verifyButton = byId("verifyCodeBtn");
    if (verifyButton) {
      verifyButton.disabled = true;
      verifyButton.textContent = "Verifying...";
    }

    try {
      await createVerifiedAccount();
    } catch (err) {
      showAuthMessage(err?.message || "Account creation failed after verification.", "error");
    } finally {
      if (verifyButton) {
        verifyButton.disabled = false;
        verifyButton.textContent = "Verify code";
      }
    }
  }

  function mountVerificationBox() {
    if (byId("verificationBox")) return;
    const submit = byId("authSubmitBtn");
    if (!submit?.parentElement) return;

    const wrapper = document.createElement("div");
    wrapper.id = "verificationBox";
    wrapper.className = "field hidden";
    wrapper.innerHTML = `
      <label class="label" for="verificationCodeInput">Verification code</label>
      <input id="verificationCodeInput" class="input" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="Enter 6-digit code" />
      <p class="field-help">Kigazine sends a 6-digit code to your email. Enter it here to finish signup.</p>
      <button id="verifyCodeBtn" class="btn btn-primary" type="button" style="width:100%; margin-top:10px;">Verify code</button>
    `;

    submit.insertAdjacentElement("beforebegin", wrapper);

    byId("verifyCodeBtn")?.addEventListener("click", verifyCode);
    byId("verificationCodeInput")?.addEventListener("keydown", event => {
      if (event.key === "Enter") verifyCode();
    });
  }

  async function checkEmailBanned(email) {
    const db = window.db;
    if (!db) return false;
    try {
      const { doc, getDoc } = await firebaseFunctions();
      const snap = await getDoc(doc(db, "bannedEmails", email));
      return snap.exists();
    } catch (_) {
      return false;
    }
  }

  function usernameLooksUnsafe(username = "") {
    if (!username) return "Please choose a username.";
    if (/\s/.test(username)) return "Use a short nickname instead of a full name.";
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(username)) return "Choose a nickname without private details.";
    if (/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/.test(username)) return "Choose a nickname without private details.";
    if (/school|address|street|phone|email|password/i.test(username)) return "Choose a nickname that does not include school, contact, or private words.";
    if ((username.match(/\d/g) || []).length > 4) return "Choose a nickname with fewer numbers so it does not look like private information.";
    return "";
  }

  async function beginSignupVerification(event) {
    if (currentAuthMode() !== "signup") return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const email = normalizeEmail(byId("emailInput")?.value || "");
    const password = byId("passwordInput")?.value.trim() || "";
    const username = byId("usernameInput")?.value.trim() || "";
    const permission = Boolean(byId("permissionInput")?.checked);

    if (!email || !password) {
      showAuthMessage("Please enter your email and password.", "error");
      return;
    }

    const usernameError = usernameLooksUnsafe(username);
    if (usernameError) {
      showAuthMessage(usernameError, "error");
      return;
    }

    if (!permission) {
      showAuthMessage("Please ask a parent or guardian for permission first.", "error");
      return;
    }

    if (password.length < 6) {
      showAuthMessage("Password should be at least 6 characters.", "error");
      return;
    }

    if (await checkEmailBanned(email)) {
      showAuthMessage("This email has been banned from Kigazine.", "error");
      return;
    }

    const code = generateVerificationCode();
    pendingSignup = {
      email,
      password,
      username,
      code,
      createdAt: Date.now(),
      isAdminEmail: email === "ethan02px2035@saschina.org"
    };

    mountVerificationBox();
    byId("verificationBox")?.classList.remove("hidden");
    byId("verificationCodeInput")?.focus();

    const submitButton = byId("authSubmitBtn");
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending code...";
    }

    try {
      const sent = await sendVerificationEmail(email, username, code);
      if (sent) {
        showAuthMessage(`Verification code sent to ${email}. Check your inbox and enter the 6-digit code.`, "success");
      } else {
        showAuthMessage(`Email sending is not configured yet. Test code: ${code}\nAdd your EmailJS public key, service ID, and template ID in signup-verification.js to send real emails.`, "error");
      }
    } catch (error) {
      showAuthMessage(`Could not send the verification email. Test code: ${code}\n${error?.message || "Email sending failed."}`, "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Sign up";
      }
    }
  }

  function bindAuthInterception() {
    const submit = byId("authSubmitBtn");
    if (!submit || submit.dataset.signupVerificationBound === "true") return;
    submit.dataset.signupVerificationBound = "true";
    submit.addEventListener("click", beginSignupVerification, true);
  }

  function watchModeChanges() {
    byId("loginTab")?.addEventListener("click", resetPendingSignup);
    byId("signupTab")?.addEventListener("click", resetPendingSignup);
  }

  function boot() {
    if (booted) return;
    if (!byId("authSubmitBtn")) {
      setTimeout(boot, 200);
      return;
    }
    booted = true;
    mountVerificationBox();
    bindAuthInterception();
    watchModeChanges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
