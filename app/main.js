// main.js — Lumen's shell: routing, breadcrumbs, the live countdown ticker
// and the loading / error states. Views are loaded behind dynamic import(),
// so the first load is only this file, the stylesheet and index.html.
// Protocol: every route render starts with window.__shotReady = false and
// sets it true only once that route's live data has rendered.

import { apiStats } from './api.js';
import { countdown } from './format.js';

const viewEl = document.getElementById('view');
const crumbsEl = document.getElementById('crumbs');
const netstatEl = document.getElementById('netstat');

let routeToken = 0; // a newer route cancels an older render still in flight
let tickerStarted = false;

/** The netstat line in the footer: how chatty this session has been. */
export function refreshNetstat() {
  if (!netstatEl) return;
  const s = apiStats();
  const req = s.requests === 1 ? '1 request' : `${s.requests} requests`;
  netstatEl.textContent = `${req} · ${s.hits + s.revalidated} served from cache`;
}

/**
 * Every second, refresh each [data-countdown] node's text in place.
 * The node carries its deadline in data-deadline; nothing else re-renders.
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
function renderCrumbs(segments) {
  const parts = ['<a href="#/">Board</a>'];
  for (const seg of segments) {
    parts.push(seg.href
      ? `<a href="${seg.href}">${seg.label}</a>`
      : `<span aria-current="page">${seg.label}</span>`);
  }
  crumbsEl.innerHTML = parts.join('<span class="crumb-sep" aria-hidden="true">›</span>');
}

/** Skeleton shown while a route's live data is on its way. */
function skeleton(kind) {
  const cards = kind === 'board'
    ? Array.from({ length: 6 }, () =>
      '<article class="card skel-card" aria-hidden="true">' +
      '<div class="skel skel-line w60"></div><div class="skel skel-line w90"></div>' +
      '<div class="skel skel-line w40"></div></article>').join('')
    : '<div class="skel skel-line w70"></div><div class="skel skel-block"></div>' +
      '<div class="skel skel-line w90"></div><div class="skel skel-line w50"></div>';
  return `<div class="skeleton" role="status" aria-label="Loading live data from make.fun">` +
    `<p class="loading-note">Loading live data from make.fun…</p>${cards}</div>`;
}

/** Friendly error state with a retry button that re-runs the same route. */
function renderError(message, retry) {
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
function routeDone() {
  refreshNetstat();
  window.__shotReady = true;
}

function parseRoute() {
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

async function renderRoute() {
  const token = ++routeToken;
  const route = parseRoute();
  window.__shotReady = false;
  setActiveNav(route.name);
  startTicker();
  const retry = () => renderRoute();
  try {
    if (route.name === 'board') {
      renderCrumbs([]);
      viewEl.innerHTML = skeleton('board');
      const { renderBoard } = await import('./views.js');
      if (token !== routeToken) return;
      await renderBoard(viewEl, routeDone);
    } else if (route.name === 'bounty') {
      renderCrumbs([{ label: route.slug }]);
      viewEl.innerHTML = skeleton('page');
      const { renderBounty } = await import('./bounty.js');
      if (token !== routeToken) return;
      await renderBounty(viewEl, route.slug, routeDone, renderCrumbs);
    } else if (route.name === 'leaderboard') {
      renderCrumbs([
        { label: route.slug, href: '#/bounty/' + encodeURIComponent(route.slug) },
        { label: 'Leaderboard' },
      ]);
      viewEl.innerHTML = skeleton('page');
      const { renderLeaderboard } = await import('./leaderboard.js');
      if (token !== routeToken) return;
      await renderLeaderboard(viewEl, route.slug, routeDone, renderCrumbs);
    } else if (route.name === 'profile') {
      renderCrumbs([{ label: '@' + route.handle }]);
      viewEl.innerHTML = skeleton('page');
      const { renderProfile } = await import('./profile.js');
      if (token !== routeToken) return;
      await renderProfile(viewEl, route.handle, routeDone, renderCrumbs);
    } else {
      renderCrumbs([]);
      viewEl.innerHTML =
        '<section class="errorbox"><h2>No such page</h2>' +
        `<p>There is no Lumen route for <code>${route.path}</code>. ` +
        'Start from the board and follow a link.</p>' +
        '<p><a class="btn" href="#/">Back to the board</a></p></section>';
      window.__shotReady = true;
    }
  } catch (error) {
    if (token !== routeToken) return;
    renderError(error?.message || 'Something went wrong while loading.', retry);
  }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
