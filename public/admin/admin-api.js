/**
 * Shared admin UI helpers: JWT in sessionStorage, fetch wrapper, iziToast notifications.
 */
(function (global) {
  const TOKEN_KEY = "alba_admin_jwt";

  function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); }
  function clearToken() { sessionStorage.removeItem(TOKEN_KEY); }
  function redirectLogin() { window.location.href = "/admin/login.html"; }

  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const t = getToken();
    if (t) headers.Authorization = "Bearer " + t;
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { throw new Error("Invalid response from server"); }
    if (res.status === 401) {
      clearToken(); redirectLogin();
      const err = new Error("Session expired — sign in again");
      err.unauthorized = true; throw err;
    }
    if (!res.ok) {
      const msg = (data && data.detail) || (data && data.error) || res.statusText || "Request failed";
      const err = new Error(msg); err.status = res.status; err.body = data; throw err;
    }
    return data;
  }

  async function requireAuth() {
    const t = getToken();
    if (!t) { redirectLogin(); return false; }
    try { await api("/api/admin/me"); return true; }
    catch (e) { if (e.unauthorized) return false; clearToken(); redirectLogin(); return false; }
  }

  function logout() { clearToken(); redirectLogin(); }

  /**
   * Toast notification via iziToast. Falls back to console if library not loaded.
   * @param {string} message
   * @param {"ok"|"error"|"info"} [type]
   */
  function notify(message, type) {
    const msg = String(message || "");
    if (typeof window.iziToast === "undefined") {
      console.warn("[notify]", type, msg);
      return;
    }
    const base = {
      message: msg,
      position: "topRight",
      timeout: type === "error" ? 6000 : 3500,
      progressBar: true,
      closeOnClick: true,
      transitionIn: "fadeInDown",
      transitionOut: "fadeOutUp",
    };
    if (type === "error") {
      iziToast.error(Object.assign({}, base, { title: "Error" }));
    } else if (type === "info") {
      iziToast.info(Object.assign({}, base, { title: "" }));
    } else {
      iziToast.success(Object.assign({}, base, { title: "" }));
    }
  }

  /**
   * Confirm dialog via iziToast.question. Falls back to window.confirm if not loaded.
   * @param {string} message
   * @param {function} onConfirm
   * @param {function} [onCancel]
   */
  function confirm(message, onConfirm, onCancel) {
    if (typeof window.iziToast === "undefined") {
      if (window.confirm(message)) onConfirm();
      else if (onCancel) onCancel();
      return;
    }
    iziToast.question({
      timeout: 0,
      close: false,
      overlay: true,
      displayMode: "once",
      zindex: 999,
      title: "",
      message: String(message),
      position: "center",
      buttons: [
        ['<button style="font-weight:600">Confirm</button>', function (instance, toast) {
          instance.hide({ transitionOut: "fadeOut" }, toast, "button");
          onConfirm();
        }, true],
        ['<button>Cancel</button>', function (instance, toast) {
          instance.hide({ transitionOut: "fadeOut" }, toast, "button");
          if (onCancel) onCancel();
        }],
      ],
    });
  }

  global.AdminApi = { getToken, setToken, clearToken, api, requireAuth, redirectLogin, logout, notify, confirm };
})(typeof window !== "undefined" ? window : globalThis);
