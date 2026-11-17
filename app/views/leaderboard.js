// leaderboard.js — a bounty's leaderboard (#/bounty/<slug>/leaderboard).
//
// The API returns the whole board in one response (hundreds of rows),
// so the win is in rendering, not fetching: this view is virtualised.
// Only the rows in view — plus a small overscan — exist in the DOM,
// inside a spacer exactly as tall as the full board, so scrolling a
// 300-row leaderboard costs the same as scrolling 30 rows. A search
// box filters by handle or title, the columns sort, and page buttons
// jump a viewport at a time.

import { apiImage, getCompetition, getLeaderboard } from '../api.js';
import { bytes, count, esc, microPct, microUsd } from '../format.js';

// One row is exactly this tall (CSS agrees); the spacer maths depends on it.
const ROW_H = 58;
const OVERSCAN = 8;

const state = {
  slug: null,
  entries: [],
  columns: [],
  query: '',
  sortKey: 'rank',
  sortDir: 1,
  scrollTop: 0,
};

let viewportEl = null;
let spacerEl = null;
let bodyEl = null;
let shellRef = null;

function avatarHtml(entry) {
  const src = apiImage(entry.image);
  const handle = entry.handle || 'unknown';
  if (!src) {
    return `<span class="avatar-fallback" aria-hidden="true">${esc(handle.slice(0, 1).toUpperCase())}</span>`;
  }
  return `<img class="avatar" crossorigin="anonymous" src="${esc(src)}" alt="" width="36" height="36" loading="lazy">`;
}

function rowHtml(entry) {
  const values = entry.values || {};
  const judge = entry.judge || {};
  const rate = microPct(values.judge);
  const low = microPct(values.judge_low);
  const high = microPct(values.judge_high);
  const size = values.bytes == null ? '—' : bytes(values.bytes);
  const cost = entry.cost?.micro_usd != null ? microUsd(entry.cost.micro_usd) : '—';
  const record = judge.matches != null
    ? `${judge.wins ?? 0}W ${judge.draws ?? 0}D ${judge.losses ?? 0}L`
    : '—';
  const status = entry.status || '';
  const statusCls = status === 'finished' ? 'st-finished'
    : status === 'rejected' ? 'st-rejected' : 'st-other';
  const house = entry.house ? ' <span class="house-tag">house</span>' : '';
  return `<div class="lb-row" role="row" style="height:${ROW_H}px">` +
    `<span class="lb-cell num" role="cell">${count(entry.rank)}</span>` +
    `<span class="lb-cell lb-entry" role="cell"><span class="entry-cell">${avatarHtml(entry)}` +
    `<span class="entry-id"><a href="#/profile/${encodeURIComponent(entry.handle || '')}">@${esc(entry.handle || 'unknown')}</a>${house}` +
    `<span class="entry-title">${esc(entry.title || 'Untitled entry')}</span></span></span></span>` +
    `<span class="lb-cell num strong" role="cell">${rate}</span>` +
    `<span class="lb-cell num" role="cell">${low} – ${high}</span>` +
    `<span class="lb-cell num" role="cell">${record}</span>` +
    `<span class="lb-cell num" role="cell">${values.valid == null ? '—' : values.valid}</span>` +
    `<span class="lb-cell num" role="cell">${size}</span>` +
    `<span class="lb-cell num" role="cell">${cost}</span>` +
    `<span class="lb-cell" role="cell"><span class="status ${statusCls}">${esc(status)}</span></span>` +
    '</div>';
}

/** The entries after search and sort, in display order. */
function visibleEntries() {
  const q = state.query.trim().toLowerCase();
  let items = state.entries;
  if (q) {
    items = items.filter((e) =>
      (e.handle || '').toLowerCase().includes(q)
      || (e.title || '').toLowerCase().includes(q));
  }
  const key = state.sortKey;
  const dir = state.sortDir;
  const sorted = [...items];
  const num = (e, k) => {
    if (k === 'rank') return e.rank ?? Infinity;
    if (k === 'rate') return e.values?.judge ?? -1;
    if (k === 'size') return e.values?.bytes ?? Infinity;
    if (k === 'cost') return e.cost?.micro_usd ?? Infinity;
    return 0;
  };
  if (key === 'handle') sorted.sort((a, b) => (a.handle || '').localeCompare(b.handle || ''));
  else sorted.sort((a, b) => (num(a, key) - num(b, key)) * dir);
  return sorted;
}

/**
 * Render only the rows in view. The spacer keeps the scrollbar the
 * full board's height; the window is positioned inside it.
 */
function renderWindow() {
  if (!viewportEl || !spacerEl || !bodyEl) return;
  const items = visibleEntries();
  const total = items.length;
  const height = viewportEl.clientHeight || 560;
  const start = Math.max(0, Math.floor(state.scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(total, Math.ceil((state.scrollTop + height) / ROW_H) + OVERSCAN);
  spacerEl.style.height = `${total * ROW_H}px`;
  bodyEl.style.transform = `translateY(${start * ROW_H}px)`;
  bodyEl.innerHTML = total === 0
    ? '<p class="empty">No entries match.</p>'
    : items.slice(start, end).map(rowHtml).join('');
  const pager = document.getElementById('lb-pager');
  if (pager) {
    const firstShown = total === 0 ? 0 : start + 1;
    const lastShown = end;
    pager.innerHTML =
      `<button type="button" class="btn btn-small" id="lb-prev" ${state.scrollTop <= 0 ? 'disabled' : ''}>← Page up</button>` +
      `<span class="pager-label">Rows ${count(firstShown)}–${count(lastShown)} of ${count(total)}</span>` +
      `<button type="button" class="btn btn-small" id="lb-next" ${state.scrollTop + height >= total * ROW_H ? 'disabled' : ''}>Next page →</button>`;
    const prev = pager.querySelector('#lb-prev');
    const next = pager.querySelector('#lb-next');
    if (prev) prev.addEventListener('click', () => {
      viewportEl.scrollTop = Math.max(0, viewportEl.scrollTop - viewportEl.clientHeight);
    });
    if (next) next.addEventListener('click', () => {
      viewportEl.scrollTop = viewportEl.scrollTop + viewportEl.clientHeight;
    });
  }
}

function headerHtml() {
  const sortBtn = (key, label) => {
    const active = state.sortKey === key;
    const arrow = active ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '';
    return `<button type="button" class="lb-sort" data-sort="${key}" aria-sort="${active ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none'}">${label}${arrow}</button>`;
  };
  return '<div class="lb-head" role="row">' +
    `<span class="lb-cell num">${sortBtn('rank', '#')}</span>` +
    `<span class="lb-cell">${sortBtn('handle', 'Entry')}</span>` +
    `<span class="lb-cell num">${sortBtn('rate', 'Win rate')}</span>` +
    '<span class="lb-cell num">90% interval</span>' +
    '<span class="lb-cell num">Games</span>' +
    '<span class="lb-cell num">Valid</span>' +
    `<span class="lb-cell num">${sortBtn('size', 'Size')}</span>` +
    `<span class="lb-cell num">${sortBtn('cost', 'Build cost')}</span>` +
    '<span class="lb-cell">Status</span>' +
    '</div>';
}

function wireSort(container) {
  container.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-sort]');
    if (!btn) return;
    const key = btn.dataset.sort;
    if (state.sortKey === key) state.sortDir *= -1;
    else { state.sortKey = key; state.sortDir = key === 'handle' ? 1 : -1; }
    if (state.sortKey === 'rank') state.sortDir = 1;
    const head = container.querySelector('.lb-head');
    if (head) head.outerHTML = headerHtml();
    renderWindow();
  });
}

export async function render(container, { slug }, shell) {
  shellRef = shell;
  let comp;
  let board;
  try {
    [comp, board] = await Promise.all([getCompetition(slug), getLeaderboard(slug)]);
  } catch (error) {
    shell.fail(error);
    return null;
  }
  if (!shell.isCurrent()) return null;
  const title = comp.title || board.competition?.title || slug;
  shell.setCrumbs([
    { label: title, href: `#/bounty/${encodeURIComponent(slug)}` },
    { label: 'Leaderboard' },
  ]);
  document.title = `${title} leaderboard — Lumen`;
  state.slug = slug;
  state.entries = Array.isArray(board.entries) ? board.entries : [];
  state.columns = Array.isArray(board.columns) ? board.columns : [];
  state.query = '';
  state.sortKey = 'rank';
  state.sortDir = 1;
  state.scrollTop = 0;
  const phase = board.phase || {};
  const ranked = state.entries.filter((e) => e.ranked !== false).length;
  container.innerHTML =
    '<header class="page-head">' +
    `<p class="kicker"><a href="#/bounty/${encodeURIComponent(slug)}">← ${esc(title)}</a></p>` +
    '<h1>Leaderboard</h1>' +
    `<p class="lede">${esc(board.title || 'Results')} · phase: ${esc(phase.title || phase.key || '—')} · ` +
    `ranked by ${esc(board.rank_key || 'judge')} · ${count(ranked)} ranked of ${count(state.entries.length)} entries` +
    `${board.metrics_withheld ? ' · some build metrics are withheld by make.fun' : ''}.</p>` +
    '</header>' +
    '<section class="controls" aria-label="Leaderboard controls">' +
    '<label class="ctl-search">Search entries' +
    '<input type="search" id="lb-q" placeholder="Search handle or entry title…" autocomplete="off">' +
    '</label>' +
    `<p class="controls-count">Virtualised: only the rows in view are in the DOM.</p>` +
    '</section>' +
    '<section class="table-wrap lb-wrap" aria-label="Leaderboard table">' +
    headerHtml() +
    '<div class="lb-viewport" id="lb-viewport" tabindex="0" role="region" aria-label="Leaderboard rows">' +
    '<div class="lb-spacer" id="lb-spacer"><div class="lb-body" id="lb-body"></div></div>' +
    '</div></section>' +
    '<nav class="pager" id="lb-pager" aria-label="Leaderboard pages"></nav>' +
    '<p class="muted">Win rate is the judge’s share of wins (micro-units ÷ 10,000). ' +
    'Ties break on dossier size — smaller wins. Build cost is the priced token ' +
    'cost of the entry’s recorded build, where make.fun publishes it.</p>';
  viewportEl = container.querySelector('#lb-viewport');
  spacerEl = container.querySelector('#lb-spacer');
  bodyEl = container.querySelector('#lb-body');
  const q = container.querySelector('#lb-q');
  if (q) {
    q.addEventListener('input', () => {
      state.query = q.value;
      viewportEl.scrollTop = 0;
      state.scrollTop = 0;
      renderWindow();
    });
  }
  wireSort(container);
  viewportEl.addEventListener('scroll', () => {
    state.scrollTop = viewportEl.scrollTop;
    // requestAnimationFrame keeps a fast scroll from re-rendering
    // every single scroll event.
    requestAnimationFrame(renderWindow);
  }, { passive: true });
  renderWindow();
  shell.done();
  return {
    accepts: async (route) => {
      if (route.name !== 'leaderboard' || route.slug === slug) return false;
      const [nextComp, nextBoard] = await Promise.all([
        getCompetition(route.slug), getLeaderboard(route.slug),
      ]).catch(() => [null, null]);
      if (!nextComp || !nextBoard) return false;
      slug = route.slug;
      state.slug = slug;
      state.entries = Array.isArray(nextBoard.entries) ? nextBoard.entries : [];
      state.query = '';
      state.sortKey = 'rank';
      state.sortDir = 1;
      const nextTitle = nextComp.title || nextBoard.competition?.title || slug;
      shell.setCrumbs([
        { label: nextTitle, href: `#/bounty/${encodeURIComponent(slug)}` },
        { label: 'Leaderboard' },
      ]);
      document.title = `${nextTitle} leaderboard — Lumen`;
      const lede = container.querySelector('.lede');
      if (lede) lede.textContent = `${nextBoard.title || 'Results'} · ${count(state.entries.length)} entries`;
      viewportEl.scrollTop = 0;
      state.scrollTop = 0;
      renderWindow();
      return true;
    },
  };
}
