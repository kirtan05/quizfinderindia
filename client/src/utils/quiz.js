import { isUpcoming } from './api';

const DAY_MS = 86400_000;
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const capitalise = s => s[0].toUpperCase() + s.slice(1);

// 'YYYY-MM-DD' parsed as a local date, so it never shifts across timezones
function localDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Whole days from today: 0 today, 1 tomorrow, negative in the past
// Who can play, as the tags a quiz carries
export const ELIGIBILITY = ['Open', 'U18', 'U23', 'U25', 'U30', 'UG', 'PG', 'Research'];

export function daysAway(dateStr) {
  return Math.round((localDate(dateStr) - new Date().setHours(0, 0, 0, 0)) / DAY_MS);
}

// "Today", "Tomorrow", "In 4 days", "3 days ago"
export const relativeDay = dateStr => capitalise(rtf.format(daysAway(dateStr), 'day'));

// "5 minutes ago", "3 hours ago", "2 days ago"
export function timeAgo(iso) {
  const mins = Math.round((new Date(iso) - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  if (Math.abs(mins) < 60 * 24) return rtf.format(Math.round(mins / 60), 'hour');
  return rtf.format(Math.round(mins / 60 / 24), 'day');
}

export const formatDate = (dateStr, options) =>
  localDate(dateStr).toLocaleDateString('en-IN', options);

// Start of '19:30', '9:30 AM', '8 PM' or '9 AM (Juniors), 1 PM (Seniors)' in minutes after
// midnight, and whether the text is only that time; null when it doesn't begin with a time
function parseTime(time) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\b/i.exec(time || '');
  if (!m || !(m[2] || m[3])) return null;
  const h = m[3] ? (m[1] % 12) + (/p/i.test(m[3]) ? 12 : 0) : Number(m[1]);
  const min = Number(m[2] || 0);
  return h < 24 && min < 60 ? { minutes: h * 60 + min, whole: m[0] === time } : null;
}

// '19:30' -> '7:30 PM'; free-text times are shown as they are
export function formatTime(time) {
  const t = parseTime(time);
  if (!t?.whole) return time || '';
  const h = Math.floor(t.minutes / 60);
  return `${h % 12 || 12}:${String(t.minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Within a day: by start time, quizzes without one last
const startMinutes = quiz => parseTime(quiz.time)?.minutes ?? Infinity;

// "Sunday, 22 November, 10:00 AM"
export function whenText(quiz) {
  if (!quiz.date) return 'Date to be announced';
  const day = formatDate(quiz.date, { weekday: 'long', day: 'numeric', month: 'long' });
  return [day, formatTime(quiz.time)].filter(Boolean).join(', ');
}

// Some links are stored without a scheme ('bit.ly/abc')
export const externalUrl = link => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

export const isOnline = quiz => quiz.mode === 'online' || quiz.city === 'Online';

export const teamLabel = size => (size === 1 ? 'Solo' : `Teams of ${size}`);

const daysToSunday = () => (7 - new Date().getDay()) % 7;

const GROUPS = ['Today', 'Tomorrow', 'This week', 'Next week', 'Later', 'Date to be announced', 'Past'];

function groupOf(quiz) {
  if (!quiz.date) return isUpcoming(quiz) ? 'Date to be announced' : 'Past';
  const n = daysAway(quiz.date);
  const toSunday = daysToSunday();
  if (n < 0) return 'Past';
  if (n < 2) return GROUPS[n];
  if (n <= toSunday) return 'This week';
  return n <= toSunday + 7 ? 'Next week' : 'Later';
}

// [[heading, quizzes], ...] in schedule order; past quizzes come last, newest first
export function groupByWhen(quizzes) {
  const sorted = [...quizzes].sort((a, b) =>
    (a.date || '9').localeCompare(b.date || '9')
    || startMinutes(a) - startMinutes(b)
    || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const byGroup = {};
  for (const quiz of sorted) (byGroup[groupOf(quiz)] ||= []).push(quiz);
  byGroup.Past?.reverse();
  return GROUPS.filter(g => byGroup[g]).map(g => [g, byGroup[g]]);
}

export function matchesFilters(quiz, { search, when, eligibility, team, free, past }) {
  if (!past && !isUpcoming(quiz)) return false;
  if (when) {
    if (!quiz.date) return false;
    const n = daysAway(quiz.date);
    const toSunday = daysToSunday();
    if (n < 0 || n > toSunday) return false;
    if (when === 'weekend' && n < toSunday - 1) return false;
  }
  if (eligibility.length && !eligibility.some(e => (quiz.eligibilityCategories || []).includes(e))) return false;
  if (team && (team === 'solo' ? quiz.teamSize !== 1 : !(quiz.teamSize > 1))) return false;
  if (free && quiz.entryFee !== 'Free') return false;
  if (search) {
    const haystack = [quiz.name, quiz.description, quiz.hostingOrg, quiz.venue, quiz.city, ...(quiz.quizMasters || [])]
      .join(' ').toLowerCase();
    if (!haystack.includes(search.trim().toLowerCase())) return false;
  }
  return true;
}

export function gcalLink(quiz) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: quiz.name || 'Quiz', ctz: 'Asia/Kolkata' });
  const [y, m, d] = quiz.date.split('-').map(Number);
  // 'YYYYMMDD' or 'YYYYMMDDTHHMMSS' for `mins` after the quiz day's midnight, as wall-clock time in ctz
  const stamp = (mins, len) => new Date(Date.UTC(y, m - 1, d, 0, mins)).toISOString().replace(/[-:]/g, '').slice(0, len);
  const start = parseTime(quiz.time)?.minutes;
  // Two hours from the start time; otherwise all day (Google's end date is exclusive)
  p.set('dates', start == null ? `${stamp(0, 8)}/${stamp(1440, 8)}` : `${stamp(start, 15)}/${stamp(start + 120, 15)}`);
  if (quiz.venue) p.set('location', quiz.venue);
  const details = [
    quiz.hostingOrg && `Hosted by ${quiz.hostingOrg}`,
    quiz.regLink && `Register: ${quiz.regLink}`,
  ].filter(Boolean).join('\n');
  if (details) p.set('details', details);
  return `https://calendar.google.com/calendar/render?${p}`;
}
