// boot.js — Lumen's shell. index.html loads only this module (behind a
// dynamic import, so the first load is index.html alone); everything
// else — the stylesheet, the API client, each view — loads after it.
// The shell owns routing, the breadcrumb trail, the one-second
// countdown ticker, loading skeletons, error states with retry, and
// the footer request counter. Views are loaded per route behind
// dynamic import() and may stay mounted to handle the next route in
// place instead of rebuilding the page.
//
// Protocol every view follows: a route render starts with
// window.__shotReady = false and sets it true only once that route's
// live data has rendered (screenshot scripts wait on it).

import { apiStats } from './api.js';
import { countdown } from './format.js';

const viewEl = document.getElementById('view');
const crumbsEl = document.getElementById('crumbs');
const netstatEl = document.getElementById('netstat');

let routeToken = 0; // a newer route cancels an older render in flight
let tickerStarted = false;
let cssLoaded = false;
// The mounted view, when it can handle a later route in place:
// { name, accepts(route) -> Promise<boolean> }.
let mounted = null;

/** The footer counter: how chatty this session has been with the API. */
export function refreshNetstat() {
  if (!netstatEl) return;
  const s = apiStats();
  const req = s.requests === 1 ? '1 request' : `${s.requests} requests`;
  const cached = s.hits + s.revalidated;
  netstatEl.textContent =
    `${req} · ${cached} from cache · ${s.cached} documents cached`;
}

/**
 * Every second, refresh each [data-countdown] node's text in place.
 * The node carries its deadline in data-countdown; nothing re-renders.
 */
function startTicker() {
  if (tickerStarted) return;
  tickerStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const node of document.querySelectorAll('[data-countdown]')) {
      const left = countdown(node.dataset.countdown, now);
      if (node.textContent !== left.text) node.textContent = left.text;
      node.classList.toggle('is-ended', left.past);
    }
  }, 1000);
}

/** Breadcrumb trail under the top bar; segments are { label, href? }. */
export function renderCrumbs(segments) {
  const parts = ['<a href="#/">Board</a>'];
  for (const seg of segments) {
    parts.push(seg.href
      ? `<a href="${seg.href}">${seg.label}</a>`
      : `<span aria-current="page">${seg.label}</span>`);
  }
  crumbsEl.innerHTML = parts.join('<span class="crumb-sep" aria-hidden="true">›</span>');
}

/** Skeleton shown while a route's live data is on its way. */
export function skeleton(kind) {
  const cards = kind === 'board'
    ? Array.from({ length: 6 }, () =>
      '<article class="card skel-card" aria-hidden="true">' +
      '<div class="skel-line w60"></div><div class="skel-line w90"></div>' +
      '<div class="skel-line w40"></div></article>').join('')
    : '<div class="skel-line w70"></div><div class="skel-block"></div>' +
      '<div class="skel-line w90"></div><div class="skel-line w50"></div>';
  return '<div class="skeleton" role="status" aria-label="Loading live data from make.fun">' +
    '<p class="loading-note">Loading live data from make.fun…</p>' + cards + '</div>';
}

/** Friendly error state with a retry button that re-runs the route. */
export function renderError(message, retry) {
  window.__shotReady = false;
  viewEl.innerHTML =
    '<section class="errorbox" role="alert">' +
    '<h2>Couldn’t load this view</h2>' +
    `<p>${message}</p>` +
    '<button type="button" class="btn" id="retry-btn">Try again</button>' +
    '</section>';
  document.getElementById('retry-btn').addEventListener('click', retry);
  refreshNetstat();
}

/** Mark a route done: its live data is on screen. */
export function routeDone() {
  refreshNetstat();
  window.__shotReady = true;
}

/** The shell object each view receives: crumbs, done, error, token. */
function shellFor(token) {
  return {
    setCrumbs: renderCrumbs,
    done: () => { if (token === routeToken) routeDone(); },
    fail: (error) => {
      if (token !== routeToken) return;
      renderError(error?.message || 'Something went wrong.', () => renderRoute());
    },
    isCurrent: () => token === routeToken,
  };
}

export function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'board' };
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') {
    return { name: 'leaderboard', slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'bounty' && parts[1]) {
    return { name: 'bounty', slug: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'profile' && parts[1]) {
    return { name: 'profile', handle: decodeURIComponent(parts.slice(1).join('/')) };
  }
  return { name: 'notfound', path: hash };
}

function setActiveNav(name) {
  for (const link of document.querySelectorAll('[data-nav]')) {
    const key = link.dataset.nav;
    const active = (name === 'board' && key === 'board')
      || (name === 'bounty' && key === 'bounty')
      || (name === 'leaderboard' && key === 'leaderboard')
      || (name === 'profile' && key === 'profile');
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

function renderNotFound(path, shell) {
  renderCrumbs([{ label: 'Not found' }]);
  document.title = 'Not found — Lumen';
  viewEl.innerHTML =
    '<section class="errorbox"><h2>No such page</h2>' +
    `<p>Lumen has no route for <code>${path}</code>.</p>` +
    '<p><a class="btn" href="#/">Back to the board</a></p></section>';
  shell.done();
}

async function renderRoute() {
  const token = ++routeToken;
  const route = parseRoute();
  window.__shotReady = false;
  setActiveNav(route.name);
  startTicker();
  // A mounted view that can take this route in place (the board
  // swapping its detail pane, a bounty page switching bounty) does so
  // without rebuilding the page.
  if (mounted) {
    try {
      if (await mounted.accepts(route)) {
        if (token === routeToken) routeDone();
        return;
      }
    } catch (error) {
      // A failed in-place switch falls through to a full render.
      void error;
    }
    mounted = null;
  }
  const shell = shellFor(token);
  const retry = () => renderRoute();
  try {
    if (route.name === 'notfound') {
      renderNotFound(route.path, shell);
      return;
    }
    viewEl.innerHTML = skeleton(route.name === 'board' ? 'board' : 'page');
    const modulePath = route.name === 'board' ? './views/board.js'
      : route.name === 'bounty' ? './views/bounty.js'
      : route.name === 'leaderboard' ? './views/leaderboard.js'
      : './views/profile.js';
    const view = await import(modulePath);
    if (token !== routeToken) return; // a newer route already won
    const params = route.slug ? { slug: route.slug }
      : route.handle ? { handle: route.handle } : {};
    const handle = await view.render(viewEl, params, shell);
    if (token !== routeToken) return;
    mounted = handle && typeof handle.accepts === 'function'
      ? { name: route.name, accepts: handle.accepts }
      : null;
  } catch (error) {
    if (token !== routeToken) return;
    mounted = null;
    renderError(error?.message || 'Something went wrong.', retry);
  }
}

/**
 * Load style.css after the shell, before the first route renders, so
 * the first paint already has the full design and screenshots never
 * catch an unstyled page. The stylesheet is a plain file of app/,
 * fetched like any same-origin asset — it is not part of the first
 * load, which stays index.html alone.
 */
async function loadCss() {
  if (cssLoaded) return;
  try {
    const response = await fetch('./style.css');
    if (!response.ok) throw new Error(`style.css: ${response.status}`);
    const css = await response.text();
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    cssLoaded = true;
  } catch {
    // Without the stylesheet the app still works on the critical CSS
    // inlined in index.html; the route renders anyway.
    cssLoaded = false;
  }
}

window.addEventListener('hashchange', renderRoute);

loadCss().then(renderRoute);
