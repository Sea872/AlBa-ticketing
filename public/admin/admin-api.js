/**
 * Shared admin UI helpers: JWT in sessionStorage, fetch wrapper for /api/admin/*.
 */
(function (global) {
  const TOKEN_KEY = "alba_admin_jwt";

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(t) {
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  function clearToken() {
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function redirectLogin() {
    window.location.href = "/admin/login.html";
  }

  /**
   * @param {string} path - e.g. /api/admin/concerts
   * @param {RequestInit} [options]
   */
  async function api(path, options) {
    const opts = options || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const t = getToken();
    if (t) {
      headers.Authorization = "Bearer " + t;
    }
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Invalid response from server");
    }
    if (res.status === 401) {
      clearToken();
      redirectLogin();
      const err = new Error("Session expired — sign in again");
      err.unauthorized = true;
      throw err;
    }
    if (!res.ok) {
      const msg =
        (data && data.detail) || (data && data.error) || res.statusText || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  async function requireAuth() {
    const t = getToken();
    if (!t) {
      redirectLogin();
      return false;
    }
    try {
      await api("/api/admin/me");
      return true;
    } catch (e) {
      if (e.unauthorized) {
        return false;
      }
      clearToken();
      redirectLogin();
      return false;
    }
  }

  function logout() {
    clearToken();
    redirectLogin();
  }

  global.AdminApi = {
    getToken,
    setToken,
    clearToken,
    api,
    requireAuth,
    redirectLogin,
    logout,
  };
})(typeof window !== "undefined" ? window : globalThis);
