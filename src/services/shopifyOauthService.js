import { loadConfig } from "../config.js";
import { logDebug, logInfo } from "../utils/logger.js";

/**
 * Shopify Dev Dashboard custom apps (created after Jan 2026) use the
 * OAuth 2.0 client_credentials grant instead of a static access token.
 * Tokens expire every 24 hours (86,399 seconds).
 *
 * This module caches the token in memory and refreshes it automatically
 * 5 minutes before expiry. No static SHOPIFY_ACCESS_TOKEN is needed.
 */

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

let _cachedToken = null; // string | null
let _expiresAt = null;   // Date | null
let _refreshPromise = null; // deduplicate concurrent refresh calls

/**
 * Calls Shopify's token endpoint using the client_credentials grant.
 * Sets _cachedToken and _expiresAt on success.
 */
async function fetchNewToken() {
  const { shopifyClientId, shopifyClientSecret, shopifyShopDomain } = loadConfig();

  if (!shopifyClientId || !shopifyClientSecret || !shopifyShopDomain) {
    throw new Error(
      "SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_SHOP_DOMAIN must all be set"
    );
  }

  const url = `https://${shopifyShopDomain}/admin/oauth/access_token`;

  logDebug("shopify oauth: requesting new access token", { shopDomain: shopifyShopDomain });

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: shopifyClientId,
        client_secret: shopifyClientSecret,
        grant_type: "client_credentials",
      }),
    });
  } catch (networkErr) {
    throw new Error(
      `Shopify token request network error: ${networkErr?.message ?? String(networkErr)}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Shopify token request failed: ${res.status} ${res.statusText} — ${text}`
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Shopify token response was not valid JSON");
  }

  if (!data.access_token || typeof data.access_token !== "string") {
    throw new Error("Shopify token response missing access_token");
  }

  const expiresInSeconds =
    typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 86399;

  _cachedToken = data.access_token;
  _expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  logInfo("shopify oauth: access token refreshed", {
    shopDomain: shopifyShopDomain,
    expiresAt: _expiresAt.toISOString(),
    expiresInSeconds,
  });
}

/**
 * Returns a valid Shopify access token.
 * Refreshes automatically if the token is missing or within 5 minutes of expiry.
 * Concurrent calls during a refresh share the same promise (no duplicate requests).
 */
export async function getShopifyAccessToken() {
  const needsRefresh =
    !_cachedToken ||
    !_expiresAt ||
    _expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

  if (needsRefresh) {
    if (!_refreshPromise) {
      _refreshPromise = fetchNewToken().finally(() => {
        _refreshPromise = null;
      });
    }
    await _refreshPromise;
  }

  return _cachedToken;
}

/**
 * Force-clears the cached token.
 * Call this after receiving a 401 from Shopify so the next request triggers a fresh fetch.
 */
export function clearCachedToken() {
  _cachedToken = null;
  _expiresAt = null;
}

/**
 * Returns token status for admin health checks.
 * Never exposes the token value itself.
 */
export function getTokenStatus() {
  if (!_cachedToken || !_expiresAt) {
    return { cached: false };
  }
  return {
    cached: true,
    expiresAt: _expiresAt.toISOString(),
    expiresInSeconds: Math.max(0, Math.floor((_expiresAt.getTime() - Date.now()) / 1000)),
  };
}
