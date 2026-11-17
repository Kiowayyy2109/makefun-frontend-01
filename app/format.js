// format.js — small dependency-free formatters for Lumen: money, dates,
// live countdowns, numbers, HTML escaping and a tiny Markdown renderer,
// kept here so the views stay about layout and data.

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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Escape text for insertion into HTML. Never interpolate raw API text. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** "$733" for whole dollars, "$146.64" otherwise; "—" when not a number. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? usd0.format(n) : usd2.format(n);
}

/** "$146.64" always with two decimals (reward tables). */
export function money2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? usd2.format(n) : '—';
}

/** "1,234" with thousands separators. */
export function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? intFmt.format(Math.round(n)) : '—';
}

/** "660 B" / "12.4 KB" / "1.20 MB". */
export function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** Micro-units (1e-6) as a percentage: 887766 -> "88.78%". */
export function microPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${pctFmt.format(n / 10000)}%` : '—';
}

/** Micro-US-dollars as dollars: 7805060 -> "$7.81". */
export function microUsd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? money(n / 1e6) : '—';
}

/** "17 Nov 2026, 12:30 UTC" — always UTC, so every reader sees one time. */
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

/**
 * Relative time against a reference moment: "3h ago", "in 2d".
 * Past dates get "ago"; future dates get "in …".
 */
export function timeAgo(iso, nowMs = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  let diff = Math.round((nowMs - then) / 1000);
  const future = diff < 0;
  diff = Math.abs(diff);
  const unit = diff < 60 ? `${diff}s`
    : diff < 3600 ? `${Math.floor(diff / 60)}m`
    : diff < 86400 ? `${Math.floor(diff / 3600)}h`
    : diff < 86400 * 30 ? `${Math.floor(diff / 86400)}d`
    : `${Math.floor(diff / (86400 * 30))}mo`;
  return future ? `in ${unit}` : `${unit} ago`;
}

/**
 * Time left until a deadline: { text, past }.
 * "2d 4h", "3h 12m", "45s", "ended". Ticks in place via boot.js.
 */
export function countdown(iso, nowMs = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { text: '—', past: false };
  const seconds = Math.floor((then - nowMs) / 1000);
  if (seconds <= 0) return { text: 'ended', past: true };
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return { text: `${days}d ${hours}h`, past: false };
  if (hours > 0) return { text: `${hours}h ${pad2(minutes)}m`, past: false };
  if (minutes > 0) return { text: `${minutes}m ${pad2(secs)}s`, past: false };
  return { text: `${secs}s`, past: false };
}

/**
 * Whether a bounty still takes entries, judged by its deadline —
 * never by the status text alone, which can still read "open" after
 * the deadline until results are published. Returns one of
 * "open" (>24h left), "soon" (<24h left) or "ended", with a label.
 */
export function openState(item, nowMs = Date.now()) {
  const then = new Date(item?.deadline).getTime();
  if (Number.isNaN(then)) return { key: 'open', label: 'Open' };
  if (then <= nowMs) return { key: 'ended', label: 'Ended' };
  if (then - nowMs < 24 * 3600 * 1000) return { key: 'soon', label: 'Closing soon' };
  return { key: 'open', label: 'Open' };
}

/** Shorten a long address or id: "ByrP…ZkWwf". */
export function shorten(value, head = 4, tail = 4) {
  const s = String(value ?? '');
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/**
 * A deliberately tiny Markdown renderer for bounty descriptions:
 * headings, bold, italic, inline code, links, lists, code fences and
 * paragraphs. Anything it does not recognise is escaped plain text,
 * so hostile markup in a description can never become live HTML.
 */
export function mdLite(source) {
  const lines = String(source || '').split('\n');
  const out = [];
  let list = null;
  let code = false;
  let para = [];
  function flushPara() {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  }
  function flushList() {
    if (list) out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = null;
  }
  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
      .replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`)
      .replace(/(^|[^*])\*([^*\n]+)\*/g, (_, pre, i) => `${pre}<em>${i}</em>`)
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, t, href) =>
        `<a href="${href}" target="_blank" rel="noopener">${t}</a>`);
  }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('```')) {
      if (code) out.push('</code></pre>');
      else { flushPara(); flushList(); out.push('<pre><code>'); }
      code = !code;
      continue;
    }
    if (code) { out.push(`${esc(line)}\n`); continue; }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushPara(); flushList();
      const level = heading[1].length + 1;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list) list = [];
      list.push(bullet[1]);
      continue;
    }
    if (line === '') { flushPara(); flushList(); continue; }
    para.push(line);
  }
  flushPara();
  flushList();
  if (code) out.push('</code></pre>');
  return out.join('\n');
}
