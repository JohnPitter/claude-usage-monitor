#!/usr/bin/env node

/**
 * Claude Usage Monitor — Cache Refresh (Stop Hook)
 *
 * Lightweight script that re-fetches usage data and updates
 * the cache file for the status line. Only calls the API if
 * the cache is stale (older than 2 minutes).
 *
 * Uses Node.js native https to avoid AbortController/fetch
 * UV_HANDLE_CLOSING assertion on Windows.
 */

const { readFile, writeFile, readFileSync } = require("fs");
const { homedir } = require("os");
const { join } = require("path");
const https = require("https");

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CACHE_PATH = join(homedir(), ".claude", ".usage-cache.json");
const CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const STALE_MS = 2 * 60 * 1000; // 2 minutes
const REQUEST_TIMEOUT = 4000;

// ─── Check if refresh is needed ─────────────────────────────

function isCacheStale() {
  try {
    const raw = readFileSync(CACHE_PATH, "utf-8");
    const cache = JSON.parse(raw);
    return !cache.ts || (Date.now() - cache.ts > STALE_MS);
  } catch {
    return true;
  }
}

// ─── HTTP helper (native https, no AbortController) ─────────

function httpsRequest(url, options, body) {
  return new Promise((resolve) => {
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        } else {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(REQUEST_TIMEOUT, () => { req.destroy(); resolve(null); });
    if (body) req.write(body);
    req.end();
  });
}

// ─── Credentials ────────────────────────────────────────────

function readCredentials() {
  return new Promise((resolve) => {
    readFile(CREDENTIALS_PATH, "utf-8", (err, data) => {
      if (err) return resolve(null);
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  });
}

function refreshOAuthToken(creds) {
  const oauth = creds.claudeAiOauth;
  if (!oauth?.refreshToken) return Promise.resolve(null);

  const body = JSON.stringify({
    grant_type: "refresh_token",
    refresh_token: oauth.refreshToken,
    client_id: CLAUDE_OAUTH_CLIENT_ID,
  });

  return httpsRequest("https://console.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
  }, body).then((data) => {
    if (!data) return null;
    const newOauth = {
      ...oauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? oauth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    const updated = { ...creds, claudeAiOauth: newOauth };
    return new Promise((resolve) => {
      writeFile(CREDENTIALS_PATH, JSON.stringify(updated, null, 2), "utf-8", () => {
        resolve(data.access_token);
      });
    });
  });
}

async function getToken() {
  const creds = await readCredentials();
  const oauth = creds?.claudeAiOauth;
  if (!oauth?.accessToken) return null;

  const margin = 10 * 60 * 1000;
  if (oauth.expiresAt && (oauth.expiresAt - Date.now() < margin) && oauth.refreshToken) {
    const newToken = await refreshOAuthToken(creds);
    return newToken ?? oauth.accessToken;
  }
  return oauth.accessToken;
}

// ─── API ────────────────────────────────────────────────────

function fetchUsage(token) {
  return httpsRequest("https://api.anthropic.com/api/oauth/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "User-Agent": "claude-usage-monitor/1.0.0",
    },
  });
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  if (!isCacheStale()) return;

  const token = await getToken();
  if (!token) return;

  const usage = await fetchUsage(token);
  if (!usage) return;

  await new Promise((resolve) => {
    writeFile(CACHE_PATH, JSON.stringify({ usage, ts: Date.now() }), "utf-8", resolve);
  });
}

// Global timeout — never hang
const globalTimeout = setTimeout(() => process.exit(0), REQUEST_TIMEOUT + 1000);
globalTimeout.unref();

main()
  .catch(() => {})
  .finally(() => {
    clearTimeout(globalTimeout);
    process.exit(0);
  });
