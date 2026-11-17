// profile.js — a public account profile (#/profile/<handle>): the account's
// public profile (picture, bio, links, record) and their entries, newest
// first, each linking back to its bounty and leaderboard.

import { apiImage, getProfile } from './api.js';
import { count, dateShort, esc, microPct, money, shorten, timeAgo } from './format.js';

function linkRow(label, href, text) {
  if (!href) return '';
  return `<li><span class="link-label">${label}</span> ` +
    `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text || href)}</a></li>`;
}

function recordGrid(record) {
  if (!record) return '';
  const cells = [
    ['Entered', count(record.competitions_entered)],
    ['Placed', count(record.competitions_placed)],
    ['Won', count(record.competitions_won)],
    ['Podiums', count(record.podium_finishes)],
    ['Best placement', record.best_placement == null ? '—' : `#${count(record.best_placement)}`],
    ['Prize money', money(record.prize_usd)],
  ];
  return '<section class="statgrid" aria-label="Account record">' +
    cells.map(([label, value]) =>
      `<div class="stat"><span class="stat-label">${label}</span>` +
      `<span class="stat-value">${value}</span></div>`).join('') +
    '</section>';
}

function scoreText(solution) {
  const score = solution.score;
  if (!score) return '—';
  const column = score.column || {};
  if (column.key === 'judge' || column.source?.includes('win_rate')) {
    return microPct(score.value);
  }
  if (score.display != null) return esc(String(score.display));
  if (score.value != null) return count(score.value);
  return '—';
}

function entriesTable(solutions) {
  if (!solutions || solutions.length === 0) {
    return '<p class="empty">This account has no public entries yet.</p>';
  }
  const rows = solutions.map((s) => {
    const comp = s.competition || {};
    const slug = comp.slug || '';
    const place = s.placement == null ? '—' : `#${count(s.placement)}`;
    const prize = s.prize_usd == null ? '—' : money(s.prize_usd);
    return `<tr>
      <td><a href="#/bounty/${encodeURIComponent(slug)}">${esc(comp.title || slug || '—')}</a>
        <span class="entry-title">${esc(s.title || 'Untitled entry')}</span></td>
      <td class="num">${scoreText(s)}</td>
      <td class="num">${place}</td>
      <td class="num">${prize}</td>
      <td class="num">${s.entered_at ? esc(timeAgo(s.entered_at)) : '—'}</td>
      <td><a href="#/bounty/${encodeURIComponent(slug)}/leaderboard">Board</a></td>
    </tr>`;
  }).join('\n');
  return `<section class="table-wrap"><table class="entries">
    <thead><tr><th scope="col">Entry</th><th scope="col" class="num">Score</th>` +
    `<th scope="col" class="num">Place</th><th scope="col" class="num">Prize</th>` +
    `<th scope="col" class="num">Entered</th><th scope="col"></th></tr></thead>
    <tbody>${rows}</tbody></table></section>`;
}

export async function renderProfile(container, handle, done, setCrumbs) {
  const profile = await getProfile(handle);
  const name = profile.display_name || profile.handle || handle;
  setCrumbs([{ label: '@' + (profile.handle || handle) }]);
  document.title = `@${profile.handle || handle} — Lumen`;
  const avatar = apiImage(profile.avatar?.url || profile.image);
  const solutions = [...(profile.solutions || [])]
    .sort((a, b) => new Date(b.entered_at || 0) - new Date(a.entered_at || 0));
  const wallet = profile.wallet?.address;
  container.innerHTML =
    '<section class="profile-head">' +
    (avatar
      ? `<img class="profile-avatar" crossorigin="anonymous" src="${esc(avatar)}" alt="Profile picture of ${esc(name)}" width="96" height="96">`
      : '<span class="profile-avatar avatar-fallback big" aria-hidden="true">' +
        `${esc((name || '?').slice(0, 1).toUpperCase())}</span>`) +
    '<div class="profile-id">' +
    `<h1>${esc(name)}</h1>` +
    `<p class="handle">@${esc(profile.handle || handle)}</p>` +
    (profile.bio ? `<p class="bio">${esc(profile.bio)}</p>` : '') +
    `<p class="muted">Joined ${esc(dateShort(profile.joined_at))} · ` +
    `<a href="https://make.fun/u/${encodeURIComponent(profile.handle || handle)}" target="_blank" rel="noopener">make.fun profile ↗</a></p>` +
    '</div></section>' +
    '<ul class="links">' +
    linkRow('GitHub', profile.github_login ? `https://github.com/${profile.github_login}` : null, profile.github_login ? '@' + profile.github_login : null) +
    linkRow('Discord', profile.discord?.url, profile.discord?.username) +
    linkRow('X', profile.x?.url, profile.x?.username ? '@' + profile.x.username : null) +
    linkRow('Wallet', wallet ? `https://solscan.io/account/${wallet}` : null, wallet ? shorten(wallet) : null) +
    '</ul>' +
    recordGrid(profile.record) +
    `<h2 class="section-title">Entries (${count(solutions.length)})</h2>` +
    entriesTable(solutions);
  done();
}
