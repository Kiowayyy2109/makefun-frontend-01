// api.js — the only place Lumen talks to the network.
// Every request is a GET to https://make.fun/api/... (CORS is open, the API is
// read-only). Answers are cached in memory and revalidated with ETag /
// If-None-Match: inside the same minute a revalidation answers 304 and costs
// no new body. A cached answer younger than FRESH_MS is served without any
// request at all, so a route that re-renders never hammers the API.

export const API_ROOT = 'https://make.fun/api';
export const SITE_ROOT = 'https://make.fun';

// Answers younger than this are served from memory with no request.
const FRESH_MS = 45_000;
// Answers older than this are refetched even if the server has nothing new.
const MAX_AGE_MS = 5 * 60_000;

const cache = new Map(); // url -> { etag, body, at }
const stats = { requests: 0, hits: 0, revalidated: 0 };

export function apiStats() {
  return { ...stats, cached: cache.size };
}

/** Read a header that may be hidden by CORS; returns null when absent. */
function headerValue(response, name) {
  try {
    return response.headers.get(name);
  } catch {
    return null;
  }
}

/**
 * GET a JSON document from the make.fun API.
 * Throws an Error with .status on HTTP failure so views can show a retry.
 */
export async function apiGet(path, { force = false } = {}) {
  const url = path.startsWith('http') ? path : API_ROOT + path;
  const now = Date.now();
  const hit = cache.get(url);
  if (hit && !force) {
    if (now - hit.at < FRESH_MS) {
      stats.hits += 1;
      return hit.body;
    }
    if (now - hit.at < MAX_AGE_MS && hit.etag) {
      const revalidated = await revalidate(url, hit);
      if (revalidated !== undefined) return revalidated;
    }
  }
  return fetchFresh(url, hit?.etag);
}

/** Revalidate a cached answer: 304 keeps it, 200 replaces it. */
async function revalidate(url, hit) {
  stats.requests += 1;
  let response;
  try {
    response = await fetch(url, { headers: { 'If-None-Match': hit.etag } });
  } catch {
    return undefined; // network failed: caller falls back to a fresh fetch
  }
  if (response.status === 304) {
    stats.revalidated += 1;
    hit.at = Date.now();
    return hit.body;
  }
  if (!response.ok) return undefined;
  const body = await response.json();
  cache.set(url, {
    etag: headerValue(response, 'ETag'),
    body,
    at: Date.now(),
  });
  return body;
}

/** Unconditional fetch (first load, or after a failed revalidation). */
async function fetchFresh(url, etag) {
  stats.requests += 1;
  const headers = etag ? { 'If-None-Match': etag } : {};
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (cause) {
    const error = new Error('The make.fun API could not be reached. Check your connection and try again.');
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
  cache.set(url, {
    etag: headerValue(response, 'ETag'),
    body,
    at: Date.now(),
  });
  return body;
}

function apiErrorText(status) {
  if (status === 404) return 'make.fun has no such bounty, leaderboard or profile (404).';
  if (status === 429) return 'make.fun asked us to slow down (429). Wait a moment and retry.';
  if (status >= 500) return 'make.fun had a problem on its side (HTTP ' + status + '). Retry in a moment.';
  return 'make.fun answered HTTP ' + status + '.';
}

/** The board: every open bounty. Follows cursor pages (usually just one). */
export async function listCompetitions() {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 4; page += 1) {
    const query = new URLSearchParams({ status: 'open', limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const doc = await apiGet('/competitions?' + query.toString());
    if (Array.isArray(doc.items)) items.push(...doc.items);
    cursor = doc.next_cursor || null;
    if (!cursor) break;
  }
  return items;
}

/** One bounty's full detail, including its live pot and rewards. */
export function getCompetition(slug) {
  return apiGet('/competitions/' + encodeURIComponent(slug));
}

/** A bounty's leaderboard: ranked entries, columns and phase info. */
export function getLeaderboard(slug) {
  return apiGet('/competitions/' + encodeURIComponent(slug) + '/leaderboard');
}

/** A public account profile, by handle (or wallet where the API accepts it). */
export function getProfile(handle) {
  return apiGet('/profiles/' + encodeURIComponent(handle));
}

/** Absolute URL for an API-served image path such as /api/avatars/…. */
export function apiImage(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return SITE_ROOT + path;
}
