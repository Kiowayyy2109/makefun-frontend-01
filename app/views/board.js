// board.js — the bounty board (#/): master-detail. The bounty list
// sits on the left; the selected bounty's full page renders beside it
// on the right (stacked on narrow screens). Picking a row swaps only
// the detail pane — the list never re-renders — and the pane has its
// own URL (#/bounty/<slug>), so it is linkable and back-button safe.
//
// Search, sort and the status filter run on the fetched list in
// memory, so filtering never costs another request. Rows prefetch
// their bounty's detail on hover/focus, and the first few details are
// prefetched when the browser idles, so opening a bounty feels instant.

import { listCompetitions, prefetchCompetition, getCompetition } from '../api.js';
import { detailHtml } from './bounty.js';
import {
  count, countdown, dateTime, esc, money, openState,
} from '../format.js';

const state = {
  items: [],
  query: '',
  sort: 'pot',
  status: 'all',
  selected: null, // slug of the bounty in the detail pane
  loaded: false,
};

let listEl = null;
let detailEl = null;
let shellRef = null;

function potOf(item) {
  const pot = Number(item.potUsd);
  if (Number.isFinite(pot) && pot > 0) return pot;
  return Number(item.rewardAmount) || 0;
}

function feeOf(item) {
  const fee = Number(item.entryFeeUsd);
  return Number.isFinite(fee) ? fee : null;
}

function statusPill(item, now) {
  const st = openState(item, now);
  const cls = st.key === 'open' ? 'pill-open' : st.key === 'soon' ? 'pill-soon' : 'pill-ended';
  return `<span class="pill ${cls}">${esc(st.label)}</span>`;
}

function rowHtml(item, now) {
  const left = countdown(item.deadline, now);
  const fee = feeOf(item);
  const pot = potOf(item);
  const selected = item.slug === state.selected;
  return `<a class="board-row${selected ? ' is-selected' : ''}" href="#/bounty/${encodeURIComponent(item.slug)}" ` +
    `data-slug="${esc(item.slug)}" aria-current="${selected ? 'true' : 'false'}">` +
    '<span class="row-main">' +
    `<span class="row-title">${esc(item.title || item.slug)}</span>` +
    `<span class="row-meta">${esc(item.category || 'Bounty')} · ${count(item.submissionCount)} entries</span>` +
    '</span>' +
    '<span class="row-figures">' +
    `<span class="row-pot">${money(pot)}</span>` +
    `<span class="row-fee">${fee === null ? '—' : fee === 0 ? 'Free' : money(fee)}</span>` +
    `<span class="row-time" data-countdown="${esc(item.deadline)}">${esc(left.text)}</span>` +
    '</span>' +
    `<span class="row-pill">${statusPill(item, now)}</span>` +
    '</a>';
}

function filteredItems(now) {
  const q = state.query.trim().toLowerCase();
  let items = state.items;
  if (q) {
    items = items.filter((it) =>
      (it.title || '').toLowerCase().includes(q)
      || (it.slug || '').toLowerCase().includes(q)
      || (it.category || '').toLowerCase().includes(q)
      || (it.sponsor?.name || '').toLowerCase().includes(q));
  }
  if (state.status !== 'all') {
    items = items.filter((it) => {
      const key = openState(it, now).key;
      if (state.status === 'open') return key === 'open';
      if (state.status === 'soon') return key === 'soon';
      if (state.status === 'ended') return key === 'ended';
      return true;
    });
  }
  const sorted = [...items];
  if (state.sort === 'pot') sorted.sort((a, b) => potOf(b) - potOf(a));
  else if (state.sort === 'deadline') sorted.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  else if (state.sort === 'entries') sorted.sort((a, b) => (b.submissionCount || 0) - (a.submissionCount || 0));
  else if (state.sort === 'reward') sorted.sort((a, b) => (b.rewardAmount || 0) - (a.rewardAmount || 0));
  else if (state.sort === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  return sorted;
}

function summaryHtml(now) {
  const open = state.items.filter((it) => openState(it, now).key !== 'ended');
  const totalPot = state.items.reduce((sum, it) => sum + potOf(it), 0);
  const totalEntries = state.items.reduce((sum, it) => sum + (it.submissionCount || 0), 0);
  return '<section class="summary" aria-label="Board totals">' +
    `<div><span class="sum-num">${count(open.length)}</span><span class="sum-label">open now</span></div>` +
    `<div><span class="sum-num">${count(state.items.length)}</span><span class="sum-label">bounties listed</span></div>` +
    `<div><span class="sum-num">${money(totalPot)}</span><span class="sum-label">combined live pots</span></div>` +
    `<div><span class="sum-num">${count(totalEntries)}</span><span class="sum-label">entries in all</span></div>` +
    '</section>';
}

function controlsHtml(total) {
  return '<section class="controls" aria-label="Board controls">' +
    '<label class="ctl-search">Search' +
    `<input type="search" id="board-q" placeholder="Search title, slug or category…" value="${esc(state.query)}" autocomplete="off">` +
    '</label>' +
    '<label>Sort by' +
    '<select id="board-sort">' +
    `<option value="pot"${state.sort === 'pot' ? ' selected' : ''}>Largest pot</option>` +
    `<option value="deadline"${state.sort === 'deadline' ? ' selected' : ''}>Closing soonest</option>` +
    `<option value="entries"${state.sort === 'entries' ? ' selected' : ''}>Most entries</option>` +
    `<option value="reward"${state.sort === 'reward' ? ' selected' : ''}>Largest base reward</option>` +
    `<option value="title"${state.sort === 'title' ? ' selected' : ''}>Title A–Z</option>` +
    '</select></label>' +
    '<label>Status' +
    '<select id="board-status">' +
    `<option value="all"${state.status === 'all' ? ' selected' : ''}>All listed</option>` +
    `<option value="open"${state.status === 'open' ? ' selected' : ''}>Open now</option>` +
    `<option value="soon"${state.status === 'soon' ? ' selected' : ''}>Closing soon</option>` +
    `<option value="ended"${state.status === 'ended' ? ' selected' : ''}>Ended</option>` +
    '</select></label>' +
    `<p class="controls-count" id="board-count">${count(total)} shown</p>` +
    '</section>';
}

/** Re-render only the list column (search / sort / filter changed). */
function renderList() {
  if (!listEl) return;
  const now = Date.now();
  const items = filteredItems(now);
  listEl.innerHTML = items.length === 0
    ? '<p class="empty">No bounties match. Clear the search or pick another status.</p>'
    : items.map((it) => rowHtml(it, now)).join('\n');
  const countEl = document.getElementById('board-count');
  if (countEl) countEl.textContent = `${count(items.length)} shown`;
}

/** Swap the detail pane to one bounty, without touching the list. */
async function selectBounty(slug, { quiet = false } = {}) {
  if (!detailEl) return false;
  state.selected = slug;
  for (const row of listEl.querySelectorAll('.board-row')) {
    const on = row.dataset.slug === slug;
    row.classList.toggle('is-selected', on);
    row.setAttribute('aria-current', on ? 'true' : 'false');
  }
  const item = state.items.find((it) => it.slug === slug);
  detailEl.innerHTML =
    '<div class="detail-loading" role="status">Loading bounty…' +
    '<div class="skel-line w70"></div><div class="skel-block"></div></div>';
  let comp = null;
  try {
    comp = await getCompetition(slug);
  } catch (error) {
    detailEl.innerHTML =
      '<section class="errorbox" role="alert"><h2>Couldn’t load this bounty</h2>' +
      `<p>${esc(error?.message || 'Something went wrong.')}</p>` +
      '<button type="button" class="btn" id="detail-retry">Try again</button></section>';
    document.getElementById('detail-retry')
      .addEventListener('click', () => selectBounty(slug));
    if (!quiet && shellRef) shellRef.done();
    return false;
  }
  detailEl.innerHTML = detailHtml(comp, { compact: true });
  document.title = `${comp.title || comp.slug} — Lumen`;
  if (item) {
    const row = listEl.querySelector(`[data-slug="${CSS.escape(slug)}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }
  if (!quiet && shellRef) shellRef.done();
  return true;
}

function wireControls(container) {
  const q = container.querySelector('#board-q');
  const sort = container.querySelector('#board-sort');
  const status = container.querySelector('#board-status');
  if (q) {
    q.addEventListener('input', () => {
      state.query = q.value;
      renderList();
    });
  }
  if (sort) sort.addEventListener('change', () => { state.sort = sort.value; renderList(); });
  if (status) status.addEventListener('change', () => { state.status = status.value; renderList(); });
  // Prefetch a bounty's detail when the pointer or keyboard lands on
  // its row, so a click opens it from cache.
  listEl.addEventListener('mouseover', (event) => {
    const row = event.target.closest('.board-row');
    if (row) prefetchCompetition(row.dataset.slug);
  });
  listEl.addEventListener('focusin', (event) => {
    const row = event.target.closest('.board-row');
    if (row) prefetchCompetition(row.dataset.slug);
  });
}

/** Prefetch the first few visible details while the browser idles. */
function idlePrefetch() {
  const run = () => {
    const rows = [...(listEl?.querySelectorAll('.board-row') || [])].slice(0, 3);
    for (const row of rows) prefetchCompetition(row.dataset.slug);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

export async function render(container, _params, shell) {
  shellRef = shell;
  let items;
  try {
    items = await listCompetitions('open');
  } catch (error) {
    shell.fail(error);
    return null;
  }
  if (!shell.isCurrent()) return null;
  state.items = items;
  state.loaded = true;
  shell.setCrumbs([]);
  document.title = 'Lumen — make.fun frontend';
  const now = Date.now();
  const first = filteredItems(now)[0];
  container.innerHTML =
    '<header class="page-head">' +
    '<h1>Live bounties</h1>' +
    `<p class="lede">Every open bounty on make.fun, with its live pot, entry fee and time left. Pick one — its full page opens beside the list.</p>` +
    '</header>' +
    summaryHtml(now) +
    controlsHtml(filteredItems(now).length) +
    '<div class="board-layout">' +
    '<section class="board-list" aria-label="Bounty list"><div id="board-rows" role="list"></div></section>' +
    '<section class="board-detail" id="board-detail" aria-label="Selected bounty" aria-live="polite"></section>' +
    '</div>';
  listEl = container.querySelector('#board-rows');
  detailEl = container.querySelector('#board-detail');
  wireControls(container);
  renderList();
  // Open the first bounty in the detail pane so the board never sits
  // half empty — the route is only "ready" once the pane has rendered
  // too — and prefetch the next few while the browser idles.
  if (first) {
    await selectBounty(first.slug, { quiet: true });
    idlePrefetch();
  } else {
    detailEl.innerHTML = '<p class="empty">No open bounties right now.</p>';
  }
  shell.done();
  return {
    accepts: async (route) => {
      if (route.name === 'board') {
        shell.setCrumbs([]);
        document.title = 'Lumen — make.fun frontend';
        if (state.selected) {
          state.selected = null;
          for (const row of listEl.querySelectorAll('.board-row')) {
            row.classList.remove('is-selected');
            row.setAttribute('aria-current', 'false');
          }
          const top = filteredItems(Date.now())[0];
          if (top) await selectBounty(top.slug, { quiet: true });
        }
        return true;
      }
      if (route.name === 'bounty' && route.slug) {
        // The detail pane is already on screen: swap it in place.
        if (state.items.some((it) => it.slug === route.slug)) {
          await selectBounty(route.slug, { quiet: true });
          shell.setCrumbs([{ label: route.slug }]);
          return true;
        }
        // Unknown slug (not on this board): let the bounty page own it.
        return false;
      }
      return false;
    },
  };
}
