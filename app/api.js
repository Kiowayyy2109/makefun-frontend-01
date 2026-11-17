// api.js — Lumen's only network layer. Every request is a GET to
// https://make.fun/api/... (the API answers any origin, read-only).
// Answers live in a small in-memory cache and are revalidated with
// ETag / If-None-Match: inside the same minute the server answers 304
// and no body crosses the wire. A fresh answer (under FRESH_MS) is
// served with no request at all, so re-rendering a route, hovering a
// row, or coming back to the board never hammers the API.

export const API_ROOT = 'https://make.fun/api';
export const SITE_ROOT = 'https://make.fun';

// Serve a cached answer with no request while it is this fresh.
const FRESH_MS = 45_000;
// Revalidate (never blindly refetch) while the answer is this young.
const MAX_AGE_MS = 5 * 60_000;
// Never keep more than this many documents; the board plus a few
// details and leaderboards is all a session ever needs.
const MAX_ENTRIES = 64;

const cache = new Map(); // url -> { etag, body, at }
const inflight = new Map(); // url -> Promise<body>, so two views asking
// for the same document at once share one request.
const stats = { requests: 0, hits: 0, revalidated: 0, bytes: 0 };

export function apiStats() {
  return { ...stats, cached: cache.size };
}

/** Remember a fresh answer, dropping the oldest when the cache is full. */
function store(url, etag, body) {
  if (cache.size >= MAX_ENTRIES && !cache.has(url)) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(url, { etag, body, at: Date.now() });
}

/** Read one response header; CORS may hide it, and that is fine. */
function headerValue(response, name) {
  try {
    return response.headers.get(name);
  } catch {
    return null;
  }
}

/**
 * GET one JSON document from the make.fun API, cached and revalidated.
 * Throws an Error with .status (0 when the network itself failed) so
 * views can show a retry instead of a blank page.
 */
export async function apiGet(path, { force = false } = {}) {
  const url = path.startsWith('http') ? path : API_ROOT + path;
  const hit = cache.get(url);
  const now = Date.now();
  if (hit && !force) {
    if (now - hit.at < FRESH_MS) {
      stats.hits += 1;
      return hit.body;
    }
    if (now - hit.at < MAX_AGE_MS && hit.etag) {
      const kept = await revalidate(url, hit);
      if (kept !== undefined) return kept;
    }
  }
  const shared = inflight.get(url);
  if (shared) return shared;
  const job = fetchFresh(url, hit?.etag).finally(() => inflight.delete(url));
  inflight.set(url, job);
  return job;
}

/** Ask the server whether a cached answer is still current (304 = yes). */
async function revalidate(url, hit) {
  stats.requests += 1;
  let response;
  try {
    response = await fetch(url, { headers: { 'If-None-Match': hit.etag } });
  } catch {
    return undefined; // network failed: the caller falls back to a fetch
  }
  if (response.status === 304) {
    stats.revalidated += 1;
    hit.at = Date.now();
    return hit.body;
  }
  if (!response.ok) return undefined;
  const body = await response.json();
  stats.bytes += approxBytes(body);
  store(url, headerValue(response, 'ETag'), body);
  return body;
}

/** Unconditional fetch: first load, or after a failed revalidation. */
async function fetchFresh(url, etag) {
  stats.requests += 1;
  const headers = etag ? { 'If-None-Match': etag } : {};
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (cause) {
    const error = new Error(
      'The make.fun API could not be reached. Check the connection and try again.',
    );
    error.status = 0;
    error.cause = cause;
    throw error;
  }
  if (response.status === 304) {
    const hit = cache.get(url);
    if (hit) {
      stats.revalidated += 1;
      hit.at = Date.now();
      return hit.body;
    }
  }
  if (!response.ok) {
    const error = new Error(apiErrorText(response.status));
    error.status = response.status;
    throw error;
  }
  const body = await response.json();
  stats.bytes += approxBytes(body);
  store(url, headerValue(response, 'ETag'), body);
  return body;
}

function apiErrorText(status) {
  if (status === 404) return 'make.fun has no such bounty, leaderboard or profile (404).';
  if (status === 429) return 'make.fun asked us to slow down (429). Wait a moment and retry.';
  if (status >= 500) return `make.fun had a problem on its side (HTTP ${status}). Retry in a moment.`;
  return `make.fun answered HTTP ${status}.`;
}

/** Rough size of a parsed body, for the footer counter only. */
function approxBytes(body) {
  try {
    return JSON.stringify(body).length;
  } catch {
    return 0;
  }
}

/**
 * The board: bounties, newest pages first, following cursor pages
 * (usually one). `status` is only a first cut — the views judge
 * "open" by each bounty's deadline, not by this flag alone.
 */
export async function listCompetitions(status = 'open') {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ status, limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const doc = await apiGet(`/competitions?${query}`);
    if (Array.isArray(doc.items)) items.push(...doc.items);
    cursor = doc.next_cursor || null;
    if (!cursor) break;
  }
  return items;
}

/** One bounty's full detail, live pot and rewards included. */
export function getCompetition(slug) {
  return apiGet(`/competitions/${encodeURIComponent(slug)}`);
}

/** A bounty's leaderboard: ranked entries, columns, phase info. */
export function getLeaderboard(slug, view = 'performance') {
  const query = new URLSearchParams({ view, rows: 'all' });
  return apiGet(`/competitions/${encodeURIComponent(slug)}/leaderboard?${query}`);
}

/** A public account profile, by handle. */
export function getProfile(handle) {
  return apiGet(`/profiles/${encodeURIComponent(handle)}`);
}

/**
 * Warm the cache for one bounty without waiting: board rows call this
 * on hover/focus so the detail pane opens instantly when clicked.
 */
export function prefetchCompetition(slug) {
  getCompetition(slug).catch(() => {});
}

/** Absolute URL for an API-served image path such as /api/avatars/…. */
export function apiImage(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return SITE_ROOT + path;
}
