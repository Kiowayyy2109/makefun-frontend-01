// bounty.js — one bounty's page (#/bounty/<slug>): summary, description
// and rules, a rewards table computed against the LIVE pot, key dates,
// status, recent entries and a link to its leaderboard.
//
// The detail pane of the board reuses detailHtml() from this module, so
// a bounty looks the same beside the list as it does on its own page.

import { getCompetition } from '../api.js';
import {
  count, countdown, dateTime, esc, mdLite, money, money2, openState,
} from '../format.js';

/** Group per-place rewards into ranges: 1, 2, 3, 4–10, 11–20. */
export function rewardRanges(rewards) {
  const places = Object.keys(rewards || {})
    .map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const ranges = [];
  for (const place of places) {
    const amount = Number(rewards[place]);
    const last = ranges[ranges.length - 1];
    if (last && last.amount === amount && last.end === place - 1) last.end = place;
    else ranges.push({ start: place, end: place, amount });
  }
  return ranges;
}

function placeLabel(range) {
  if (range.start === range.end) return `#${range.start}`;
  return `#${range.start}–${range.end}`;
}

/**
 * Rewards table: each place range shows its base prize, its share of
 * the entry fees paid so far, and what it would pay right now (the
 * live pot). rewardsNow comes from the API; when it is missing we
 * scale the base rewards by pot / base total instead, and say so.
 */
export function rewardsTable(comp) {
  const pot = Number(comp.potUsd);
  const baseTotal = Number(comp.rewardAmount) || 0;
  const nowByPlace = new Map();
  for (const row of comp.rewardsNow || []) {
    nowByPlace.set(Number(row.place), row);
  }
  const ranges = rewardRanges(comp.rewards);
  if (ranges.length === 0) {
    return '<p class="empty">This bounty lists no reward table yet.</p>';
  }
  const rows = ranges.map((range) => {
    const nowRow = nowByPlace.get(range.start);
    let base;
    let feeShare;
    let total;
    if (nowRow) {
      base = Number(nowRow.baseUsd);
      feeShare = Number(nowRow.feeShareUsd);
      total = Number(nowRow.amountUsd);
    } else if (Number.isFinite(pot) && baseTotal > 0) {
      base = range.amount;
      total = (range.amount / baseTotal) * pot;
      feeShare = total - base;
    } else {
      base = range.amount;
      feeShare = 0;
      total = range.amount;
    }
    return `<tr><td>${placeLabel(range)}</td>` +
      `<td class="num">${money2(base)}</td>` +
      `<td class="num">${money2(feeShare)}</td>` +
      `<td class="num strong">${money2(total)}</td></tr>`;
  }).join('\n');
  const scaledNote = nowByPlace.size === 0 && Number.isFinite(pot) && baseTotal > 0
    ? '<p class="table-note">Fee shares estimated by scaling base rewards to the live pot.</p>'
    : '';
  return `<table class="rewards">
    <caption>Rewards against the live pot of ${money(pot)} — base prize plus its share of entry fees paid so far.</caption>
    <thead><tr><th scope="col">Place</th><th scope="col" class="num">Base</th>` +
    `<th scope="col" class="num">Fee share</th><th scope="col" class="num">Pays now</th></tr></thead>
    <tbody>${rows}</tbody></table>${scaledNote}`;
}

/** The four facts every bounty surface leads with. */
export function statGrid(comp, now) {
  const st = openState(comp, now);
  const left = countdown(comp.deadline, now);
  const pot = Number(comp.potUsd);
  const base = Number(comp.rewardAmount) || 0;
  const fee = Number(comp.entryFeeUsd);
  const pill = st.key === 'ended' ? '<span class="pill pill-ended">Ended</span>'
    : st.key === 'soon' ? '<span class="pill pill-soon">Closing soon</span>'
    : '<span class="pill pill-open">Open</span>';
  return '<section class="statgrid" aria-label="Bounty facts">' +
    `<div class="stat"><span class="stat-label">Live pot</span><span class="stat-value">${money(pot)}</span>` +
    `<span class="stat-sub">base ${money(base)} + ${money(pot - base)} in fees from ${count(comp.entryFeePayers)} payers</span></div>` +
    `<div class="stat"><span class="stat-label">Entry fee</span><span class="stat-value">${Number.isFinite(fee) ? (fee === 0 ? 'Free' : money(fee)) : '—'}</span>` +
    `<span class="stat-sub">paid once per account</span></div>` +
    `<div class="stat"><span class="stat-label">Time left</span><span class="stat-value" data-countdown="${esc(comp.deadline)}">${esc(left.text)}</span>` +
    `<span class="stat-sub">${esc(dateTime(comp.deadline))}</span></div>` +
    `<div class="stat"><span class="stat-label">Entries</span><span class="stat-value">${count(comp.submissionCount)}</span>` +
    `<span class="stat-sub">submissions so far</span></div>` +
    `</section><p class="status-line">${pill} ` +
    `<span class="muted">${comp.acceptingSubmissions && st.key !== 'ended'
      ? 'Taking entries now' : 'Not taking entries'}</span></p>`;
}

function datesList(comp) {
  const rows = [];
  if (comp.publishedAt) rows.push(['Published', dateTime(comp.publishedAt)]);
  if (comp.deadline) rows.push(['Entries close', dateTime(comp.deadline)]);
  for (const phase of comp.phases || []) {
    if (phase.endsAt && phase.key !== 'dev') {
      rows.push([`${phase.title || phase.key} ends`, dateTime(phase.endsAt)]);
    }
  }
  if (comp.resolvedAt) rows.push(['Resolved', dateTime(comp.resolvedAt)]);
  if (rows.length === 0) return '';
  return '<section class="dates"><h2>Key dates</h2><dl>' +
    rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') +
    '</dl></section>';
}

function submissionsList(comp) {
  const subs = Array.isArray(comp.submissions) ? comp.submissions.slice(0, 8) : [];
  if (subs.length === 0) return '';
  const rows = subs.map((s) => {
    const handle = s.hunter || s.handle || 'unknown';
    return `<li><a href="#/profile/${encodeURIComponent(handle)}">@${esc(handle)}</a> — ` +
      `<span class="entry-title">${esc(s.title || 'Untitled entry')}</span> ` +
      `<span class="muted">${esc(s.status || '')}</span></li>`;
  }).join('\n');
  return `<section class="subs"><h2>Recent entries</h2><ul>${rows}</ul>` +
    `<p class="muted">Showing ${subs.length} of ${count(comp.submissionCount)} entries — ` +
    `see them all ranked on the <a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">leaderboard</a>.</p></section>`;
}

/**
 * The bounty's full page body, shared by the standalone page and the
 * board's detail pane. `compact` trims the description for the pane.
 */
export function detailHtml(comp, { compact = false } = {}) {
  const now = Date.now();
  const title = comp.title || comp.slug;
  const description = comp.description || '';
  const body = compact && description.length > 1400
    ? `${description.slice(0, 1400)}…`
    : description;
  const skills = (comp.skills || []).map((s) =>
    `<li>${esc(s)}</li>`).join('');
  return '<header class="page-head">' +
    `<p class="kicker">${esc(comp.category || 'Bounty')} · by ${esc(comp.sponsor?.name || 'make.fun')}</p>` +
    `<h1>${esc(title)}</h1>` +
    (comp.summary ? `<p class="lede">${esc(comp.summary)}</p>` : '') +
    '</header>' +
    statGrid(comp, now) +
    '<div class="bounty-cols">' +
    '<div class="bounty-main">' +
    `<section class="prose"><h2>About this bounty</h2>${mdLite(body)}</section>` +
    (compact && description.length > 1400
      ? `<p><a class="btn btn-small" href="#/bounty/${encodeURIComponent(comp.slug)}">Read the full brief →</a></p>` : '') +
    (comp.rules
      ? `<section class="prose"><h2>Rules</h2><details class="rules"><summary>Read the full rules (${count(comp.rules.length)} characters)</summary>${mdLite(comp.rules)}</details></section>`
      : '') +
    (skills ? `<section><h2>Skills</h2><ul class="chips">${skills}</ul></section>` : '') +
    '</div>' +
    '<aside class="bounty-side">' +
    `<section><h2>Rewards</h2>${rewardsTable(comp)}</section>` +
    datesList(comp) +
    `<p><a class="btn" href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">View leaderboard →</a></p>` +
    `<p><a class="btn btn-ghost" href="https://make.fun/bounty/${encodeURIComponent(comp.slug)}" target="_blank" rel="noopener">Open on make.fun ↗</a></p>` +
    '</aside></div>' +
    submissionsList(comp);
}

export async function render(container, { slug }, shell) {
  let comp;
  try {
    comp = await getCompetition(slug);
  } catch (error) {
    shell.fail(error);
    return null;
  }
  if (!shell.isCurrent()) return null;
  const title = comp.title || comp.slug;
  shell.setCrumbs([{ label: title }]);
  document.title = `${title} — Lumen`;
  container.innerHTML = detailHtml(comp);
  shell.done();
  // A bounty page can switch to another bounty in place.
  return {
    accepts: async (route) => {
      if (route.name !== 'bounty' || route.slug === slug) return false;
      const next = await getCompetition(route.slug).catch(() => null);
      if (!next) return false;
      slug = route.slug;
      shell.setCrumbs([{ label: next.title || next.slug }]);
      document.title = `${next.title || next.slug} — Lumen`;
      container.innerHTML = detailHtml(next);
      return true;
    },
  };
}
