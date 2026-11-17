// leaderboard.js — a bounty's leaderboard (#/bounty/<slug>/leaderboard):
// ranked entries with judge win rate, interval, validity, dossier size and
// build cost. The API returns the whole board in one response, so paging
// happens here in memory (25 rows a page) with no extra requests.

import { apiImage, getCompetition, getLeaderboard } from './api.js';
import { bytes, count, esc, microPct, microUsd } from './format.js';

const PAGE_SIZE = 25;

const state = { slug: null, entries: [], page: 1, columns: [] };

function avatarHtml(entry) {
  const src = apiImage(entry.image);
  const handle = entry.handle || 'unknown';
  if (!src) return `<span class="avatar-fallback" aria-hidden="true">${esc(handle.slice(0, 1).toUpperCase())}</span>`;
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
  return `<tr>
    <td class="num rank-cell">${count(entry.rank)}</td>
    <td><div class="entry-cell">${avatarHtml(entry)}
      <span class="entry-id">
        <a href="#/profile/${encodeURIComponent(entry.handle || '')}">@${esc(entry.handle || 'unknown')}</a>
        <span class="entry-title">${esc(entry.title || 'Untitled entry')}</span>
      </span></div></td>
    <td class="num strong">${rate}</td>
    <td class="num">${low} – ${high}</td>
    <td class="num">${record}</td>
    <td class="num">${values.valid == null ? '—' : values.valid}</td>
    <td class="num">${size}</td>
    <td class="num">${cost}</td>
    <td><span class="status ${statusCls}">${esc(status)}</span></td>
  </tr>`;
}

function renderTable(container) {
  const pages = Math.max(1, Math.ceil(state.entries.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const rows = state.entries
    .slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE)
    .map(rowHtml).join('\n');
  const table = container.querySelector('#lb-table');
  if (table) {
    table.querySelector('tbody').innerHTML = rows || '<tr><td colspan="9" class="empty">No ranked entries yet.</td></tr>';
  }
  const pager = container.querySelector('#lb-pager');
  if (pager) {
    pager.innerHTML = pages <= 1 ? '' :
      `<button type="button" class="btn btn-small" id="lb-prev"${state.page <= 1 ? ' disabled' : ''}>← Previous</button>` +
      `<span class="pager-label">Page ${state.page} of ${pages} · ${count(state.entries.length)} entries</span>` +
      `<button type="button" class="btn btn-small" id="lb-next"${state.page >= pages ? ' disabled' : ''}>Next →</button>`;
    const prev = pager.querySelector('#lb-prev');
    const next = pager.querySelector('#lb-next');
    if (prev) prev.addEventListener('click', () => { state.page -= 1; renderTable(container); });
    if (next) next.addEventListener('click', () => { state.page += 1; renderTable(container); });
  }
}

export async function renderLeaderboard(container, slug, done, setCrumbs) {
  const [comp, board] = await Promise.all([getCompetition(slug), getLeaderboard(slug)]);
  const title = comp.title || board.competition?.title || slug;
  setCrumbs([
    { label: title, href: '#/bounty/' + encodeURIComponent(slug) },
    { label: 'Leaderboard' },
  ]);
  document.title = `${title} leaderboard — Lumen`;
  state.slug = slug;
  state.entries = Array.isArray(board.entries) ? board.entries : [];
  state.page = 1;
  state.columns = Array.isArray(board.columns) ? board.columns : [];
  const phase = board.phase || {};
  const rankKey = board.rank_key || 'judge';
  const ranked = state.entries.filter((e) => e.ranked !== false).length;
  container.innerHTML =
    '<header class="page-head">' +
    `<p class="kicker"><a href="#/bounty/${encodeURIComponent(slug)}">← ${esc(title)}</a></p>` +
    `<h1>Leaderboard</h1>` +
    `<p class="lede">${esc(board.title || 'Results')} · phase: ${esc(phase.title || phase.key || '—')} · ` +
    `ranked by ${esc(rankKey)} · ${count(ranked)} ranked of ${count(state.entries.length)} entries` +
    `${board.metrics_withheld ? ' · some build metrics are withheld by make.fun' : ''}.</p>` +
    '</header>' +
    '<section class="table-wrap"><table class="leaderboard" id="lb-table">' +
    '<thead><tr><th scope="col" class="num">#</th><th scope="col">Entry</th>' +
    '<th scope="col" class="num">Win rate</th><th scope="col" class="num">90% interval</th>' +
    '<th scope="col" class="num">Games</th><th scope="col" class="num">Valid</th>' +
    '<th scope="col" class="num">Size</th><th scope="col" class="num">Build cost</th>' +
    '<th scope="col">Status</th></tr></thead><tbody></tbody></table></section>' +
    '<nav class="pager" id="lb-pager" aria-label="Leaderboard pages"></nav>' +
    '<p class="muted">Win rate is the judge’s share of wins (micro-units ÷ 10,000). ' +
    'Ties break on dossier size — smaller wins. Build cost is the priced token ' +
    'cost of the entry’s recorded build, where make.fun publishes it.</p>';
  renderTable(container);
  done();
}
