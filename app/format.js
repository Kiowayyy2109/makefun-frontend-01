// format.js — small, dependency-free formatting helpers for Lumen.
// Money, dates, countdowns, numbers and a tiny Markdown renderer live here
// so the views stay about layout and data, not string wrangling.

const usd0 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const usd2 = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat('en-US');
const pctFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** Format a dollar amount; whole dollars get no cents, the rest get two. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? usd0.format(n) : usd2.format(n);
}

/** Format a dollar amount with exactly two decimals (reward tables). */
export function money2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? usd2.format(n) : '—';
}

/** Format an integer count with thousands separators. */
export function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? intFmt.format(Math.round(n)) : '—';
}

/** Format a byte size as "660 KB" / "1.2 MB". */
export function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Micro-units (1e-6) as a percentage with two decimals: 950587 -> "95.06%". */
export function microPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${pctFmt.format(n / 10000)}%` : '—';
}

/** Micro-US-dollars as dollars: "7805060" -> "$7.81". */
export function microUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? money(n / 1e6) : '—';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "17 Nov 2026, 12:30 UTC" — always UTC, so every reader sees the same time. */
export function dateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}

/** "17 Nov 2026". */
export function dateShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "2h ago" / "in 3d" style relative time against a reference moment. */
export function timeAgo(iso, nowMs = Date.now()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = nowMs - then;
  const abs = Math.abs(diff);
  const unit = abs < 60_000 ? [Math.max(1, Math.round(abs / 1000)), 's']
    : abs < 3_600_000 ? [Math.round(abs / 60_000), 'm']
    : abs < 86_400_000 ? [Math.round(abs / 3_600_000), 'h']
    : [Math.round(abs / 86_400_000), 'd'];
  return diff >= 0 ? `${unit[0]}${unit[1]} ago` : `in ${unit[0]}${unit[1]}`;
}

/**
 * Split a deadline into a short countdown and whether it has passed.
 * Returns { text, past, ms } where text is like "2d 4h", "36m", "12s" or "Ended".
 * Kept in one place so the board, the bounty page and the ticker agree.
 */
export function countdown(deadlineIso, nowMs = Date.now()) {
  const end = new Date(deadlineIso).getTime();
  if (!Number.isFinite(end)) return { text: '—', past: false, ms: NaN };
  const ms = end - nowMs;
  if (ms <= 0) return { text: 'Ended', past: true, ms };
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  let text;
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${pad2(minutes)}m`;
  else if (minutes > 0) text = `${minutes}m ${pad2(seconds)}s`;
  else text = `${seconds}s`;
  return { text, past: false, ms };
}

/** "Open now" / "Closing soon" / "Ended" — judged by the deadline, not status text. */
export function openState(item, nowMs = Date.now()) {
  const end = new Date(item.deadline).getTime();
  if (!Number.isFinite(end)) return { key: 'unknown', label: 'Unknown' };
  if (end <= nowMs) return { key: 'ended', label: 'Ended' };
  if (end - nowMs < 24 * 3600_000) return { key: 'soon', label: 'Closing soon' };
  return { key: 'open', label: 'Open' };
}

/** Escape text for safe insertion into HTML. */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Inline Markdown: bold, italic, code, links. Input must already be escaped. */
function inlineMd(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, text, href) =>
      `<a href="${href}" target="_blank" rel="noopener">${text}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

const HEADING = /^(#{1,4})\s+(.*)$/;
const LIST_ITEM = /^[-*]\s+(.*)$/;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/;

/**
 * A small Markdown renderer for bounty descriptions and rules.
 * Supports headings, paragraphs, bullet and numbered lists, bold, italic,
 * inline code, links and horizontal rules. Everything else is plain text.
 * Input is escaped before any markup is applied, so no raw HTML passes through.
 */
export function mdLite(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol' | null
  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') { closeList(); continue; }
    const heading = HEADING.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inlineMd(esc(heading[2].trim()))}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }
    const bullet = LIST_ITEM.exec(line);
    const ordered = ORDERED_ITEM.exec(line);
    if (bullet || ordered) {
      const kind = bullet ? 'ul' : 'ol';
      const text = (bullet || ordered)[1];
      if (list !== kind) { closeList(); list = kind; out.push(`<${kind}>`); }
      out.push(`<li>${inlineMd(esc(text.trim()))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMd(esc(line.trim()))}</p>`);
  }
  closeList();
  return out.join('\n');
}

/** Shorten a long handle/wallet for narrow layouts, keeping both ends. */
export function shorten(value, head = 8, tail = 6) {
  const s = String(value ?? '');
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}
