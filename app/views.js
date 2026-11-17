// views.js — the bounty board (#/): every open bounty as a card with its
// live pot, entry fee, deadline and live countdown, and entry count.
// Search, sort and a status filter run on the fetched list in memory, so
// filtering never costs another request. Countdowns tick in place (main.js).

import { listCompetitions } from './api.js';
import { bytes, count, countdown, dateTime, esc, money, openState } from './format.js';

const PAGE_SIZE = 24;

const state = {
  items: [],
  query: '',
  sort: 'pot',
  status: 'all',
  page: 1,
  loaded: false,
};

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

function cardHtml(item, now) {
  const slug = esc(item.slug);
  const title = esc(item.title || item.slug);
  const left = countdown(item.deadline, now);
  const fee = feeOf(item);
  const pot = potOf(item);
  const base = Number(item.rewardAmount) || 0;
  const potNote = pot > base ? `base ${money(base)} + fees` : 'base reward';
  return `<article class="card">
    <div class="card-top">
      <h2 class="card-title"><a href="#/bounty/${encodeURIComponent(item.slug)}">${title}</a></h2>
      ${statusPill(item, now)}
    </div>
    <p class="card-meta">${esc(item.category || 'Bounty')} · by ${esc(item.sponsor?.name || 'make.fun')}</p>
    <dl class="card-stats">
      <div><dt>Live pot</dt><dd class="big">${money(pot)}</dd><dd class="sub">${potNote}</dd></div>
      <div><dt>Entry fee</dt><dd class="big">${fee === null ? '—' : fee === 0 ? 'Free' : money(fee)}</dd><dd class="sub">${fee ? 'per account, once' : 'no fee to enter'}</dd></div>
      <div><dt>Time left</dt><dd class="big" data-countdown="${esc(item.deadline)}">${esc(left.text)}</dd><dd class="sub">${esc(dateTime(item.deadline))}</dd></div>
      <div><dt>Entries</dt><dd class="big">${count(item.submissionCount)}</dd><dd class="sub">submissions</dd></div>
    </dl>
    <p class="card-links">
      <a class="btn btn-small" href="#/bounty/${encodeURIComponent(item.slug)}">Bounty page</a>
      <a class="btn btn-small btn-ghost" href="#/bounty/${encodeURIComponent(item.slug)}/leaderboard">Leaderboard</a>
      <a class="card-ext" href="https://make.fun/bounty/${encodeURIComponent(item.slug)}" target="_blank" rel="noopener">make.fun ↗</a>
    </p>
  </article>`;
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
      const st = openState(it, now).key;
      if (state.status === 'open') return st === 'open';
      if (state.status === 'soon') return st === 'soon';
      if (state.status === 'ended') return st === 'ended';
      return true;
    });
  }
  const sorted = [...items];
  if (state.sort === 'pot') sorted.sort((a, b) => potOf(b) - potOf(a));
  else if (state.sort === 'deadline') sorted.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  else if (state.sort === 'entries') sorted.sort((a, b) => (b.submissionCount || 0) - (a.submissionCount || 0));
  else if (state.sort === 'reward') sorted.sort((a, b) => (b.rewardAmount || 0) - (a.rewardAmount || 0));
  return sorted;
}

function summaryHtml(now) {
  const open = state.items.filter((it) => openState(it, now).key !== 'ended');
  const totalPot = state.items.reduce((sum, it) => sum + potOf(it), 0);
  const totalEntries = state.items.reduce((sum, it) => sum + (it.submissionCount || 0), 0);
  return `<section class="summary" aria-label="Board totals">
    <div><span class="sum-num">${count(open.length)}</span><span class="sum-label">open now</span></div>
    <div><span class="sum-num">${count(state.items.length)}</span><span class="sum-label">bounties listed</span></div>
    <div><span class="sum-num">${money(totalPot)}</span><span class="sum-label">combined live pots</span></div>
    <div><span class="sum-num">${count(totalEntries)}</span><span class="sum-label">entries in all</span></div>
  </section>`;
}

function controlsHtml(total) {
  return `<section class="controls" aria-label="Board controls">
    <label class="ctl-search">Search
      <input type="search" id="board-q" placeholder="Search title, slug or category…" value="${esc(state.query)}" autocomplete="off">
    </label>
    <label>Sort by
      <select id="board-sort">
        <option value="pot"${state.sort === 'pot' ? ' selected' : ''}>Largest pot</option>
        <option value="deadline"${state.sort === 'deadline' ? ' selected' : ''}>Closing soonest</option>
        <option value="entries"${state.sort === 'entries' ? ' selected' : ''}>Most entries</option>
        <option value="reward"${state.sort === 'reward' ? ' selected' : ''}>Largest base reward</option>
      </select>
    </label>
    <label>Status
      <select id="board-status">
        <option value="all"${state.status === 'all' ? ' selected' : ''}>All listed</option>
        <option value="open"${state.status === 'open' ? ' selected' : ''}>Open now</option>
        <option value="soon"${state.status === 'soon' ? ' selected' : ''}>Closing within 24h</option>
        <option value="ended"${state.status === 'ended' ? ' selected' : ''}>Past deadline</option>
      </select>
    </label>
    <p class="ctl-count" id="board-count">${count(total)} shown</p>
  </section>`;
}

/** Render only the card grid + count (controls stay put while typing). */
function renderGrid(container) {
  const now = Date.now();
  const items = filteredItems(now);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const pageItems = items.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  const grid = container.querySelector('#board-grid');
  const countEl = container.querySelector('#board-count');
  if (countEl) countEl.textContent = `${count(items.length)} shown`;
  if (!grid) return;
  if (pageItems.length === 0) {
    grid.innerHTML = '<p class="empty">No bounties match that search or filter. ' +
      'Try a shorter search, or show all statuses.</p>';
  } else {
    grid.innerHTML = pageItems.map((it) => cardHtml(it, now)).join('\n');
  }
  const pager = container.querySelector('#board-pager');
  if (pager) {
    pager.innerHTML = pages <= 1 ? '' :
      `<button type="button" class="btn btn-small" id="pg-prev"${state.page <= 1 ? ' disabled' : ''}>← Newer</button>` +
      `<span class="pager-label">Page ${state.page} of ${pages}</span>` +
      `<button type="button" class="btn btn-small" id="pg-next"${state.page >= pages ? ' disabled' : ''}>Older →</button>`;
    const prev = pager.querySelector('#pg-prev');
    const next = pager.querySelector('#pg-next');
    if (prev) prev.addEventListener('click', () => { state.page -= 1; renderGrid(container); });
    if (next) next.addEventListener('click', () => { state.page += 1; renderGrid(container); });
  }
}

function wireControls(container) {
  const q = container.querySelector('#board-q');
  const sort = container.querySelector('#board-sort');
  const status = container.querySelector('#board-status');
  let typing = null;
  if (q) {
    q.addEventListener('input', () => {
      clearTimeout(typing);
      typing = setTimeout(() => {
        state.query = q.value;
        state.page = 1;
        renderGrid(container);
      }, 120);
    });
  }
  if (sort) sort.addEventListener('change', () => { state.sort = sort.value; state.page = 1; renderGrid(container); });
  if (status) status.addEventListener('change', () => { state.status = status.value; state.page = 1; renderGrid(container); });
}

/**
 * Board route: fetch on every visit — the API client serves a fresh-enough
 * answer from memory and revalidates with ETag, so a revisit costs at most
 * one cheap 304 while the pots and countdowns stay live.
 */
export async function renderBoard(container, done) {
  state.items = await listCompetitions();
  state.loaded = true;
  const now = Date.now();
  const items = filteredItems(now);
  container.innerHTML =
    '<header class="page-head">' +
    '<h1>Live bounty board</h1>' +
    '<p class="lede">Every open bounty on make.fun, with its live pot, entry fee, ' +
    'time left and entries — straight from the public API, refreshed as you watch.</p>' +
    '</header>' +
    summaryHtml(now) +
    controlsHtml(items.length) +
    '<div class="grid" id="board-grid"></div>' +
    '<nav class="pager" id="board-pager" aria-label="Board pages"></nav>';
  wireControls(container);
  renderGrid(container);
  done();
}
