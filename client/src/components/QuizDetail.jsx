import { useState, useEffect } from 'react';
import { fetchQuiz } from '../utils/api';
import { getTagColor } from '../utils/tagColors';

const IconCalendar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-0.15em' }}>
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><text x="12" y="18" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">G</text>
  </svg>
);

/* Minimal markdown-ish renderer: bold, italic, bullet lists, line breaks.
   No library needed -- just a few regex passes and basic sanitization. */
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    // escape HTML entities first (sanitize)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // bullet lists: lines starting with - or *
    .replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>')
    // wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // line breaks
    .replace(/\n/g, '<br/>');
  return html;
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return { date: 'TBA', time: '' };
  // Parse date string manually to avoid timezone issues
  const parts = dateStr.split('-');
  if (parts.length !== 3) return { date: dateStr, time: '' };
  const [year, month, day] = parts.map(Number);
  const d = new Date(year, month - 1, day);
  if (isNaN(d)) return { date: dateStr, time: '' };
  const formattedDate = d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  let formattedTime = '';
  if (timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const t = new Date(2000, 0, 1, h, m);
    formattedTime = t.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  return { date: formattedDate, time: formattedTime };
}

function mapsUrl(venue) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
}

function waLink(number) {
  const clean = (number || '').replace(/[^0-9]/g, '');
  return `https://wa.me/${clean}`;
}

function parseTo24h(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]), min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

function gcalLink(quiz) {
  const p = new URLSearchParams();
  p.set('action', 'TEMPLATE');
  p.set('text', quiz.name || 'Quiz Event');
  if (quiz.date) {
    const d = quiz.date.replace(/-/g, '');
    const t24 = parseTo24h(quiz.time);
    if (t24) {
      const startStr = `${d}T${t24.replace(':', '')}00`;
      const endDate = new Date(`${quiz.date}T${t24}:00`);
      if (!isNaN(endDate)) {
        endDate.setHours(endDate.getHours() + 2);
        const pad = n => String(n).padStart(2, '0');
        const endStr = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
        p.set('dates', `${startStr}/${endStr}`);
      } else {
        p.set('dates', `${d}/${d}`);
      }
    } else {
      p.set('dates', `${d}/${d}`);
    }
  }
  if (quiz.venue) p.set('location', quiz.venue);
  const details = [
    quiz.hostingOrg ? `Hosted by ${quiz.hostingOrg}` : '',
    quiz.regLink ? `Register: ${quiz.regLink}` : '',
  ].filter(Boolean).join('\n');
  if (details) p.set('details', details);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export default function QuizDetail({ quizId, onBack }) {
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchQuiz(quizId)
      .then(data => { if (!cancelled) setQuiz(data); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [quizId]);

  if (loading) {
    return (
      <div className="quiz-detail quiz-detail--loading">
        <div className="loader">
          <span className="loader__bar" />
          <span className="loader__bar" />
          <span className="loader__bar" />
        </div>
        <p>Loading quiz data...</p>
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="quiz-detail quiz-detail--error">
        <p className="quiz-detail__error-text">
          {error || 'Quiz not found. It may have been abducted by aliens.'}
        </p>
        <button className="btn btn--back" onClick={onBack}>&lt;-- Back to quizzes</button>
      </div>
    );
  }

  const { date, time } = formatDateTime(quiz.date, quiz.time);
  const raw = quiz.eligibilityCategories || quiz.eligibility || [];
  const tags = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  const quizMasters = (quiz.quizMasters || []).filter(Boolean);
  const poc = quiz.poc || {};

  return (
    <div className="quiz-detail">
      <button className="btn btn--back" onClick={onBack}>
        &lt;-- Back to quizzes
      </button>

      <div className="quiz-detail__hero">
        {quiz.posterImage ? (
          <img
            className="quiz-detail__poster"
            src={`/${quiz.posterImage}`}
            alt={`${quiz.name} poster`}
          />
        ) : (
          <div className="quiz-detail__poster-placeholder">
            <span>?!</span>
            <span>No poster available</span>
          </div>
        )}
      </div>

      <h1 className="quiz-detail__title">{quiz.name}</h1>

      {quiz.hostingOrg && (
        <p className="quiz-detail__org">
          Hosted by <strong>{quiz.hostingOrg}</strong>
        </p>
      )}

      <div className="quiz-detail__datetime">
        <div className="quiz-detail__date-block">
          <span className="quiz-detail__date-label">When</span>
          <span className="quiz-detail__date-value">{date}</span>
          {time && <span className="quiz-detail__time-value">{time}</span>}
        </div>
      </div>

      {quiz.venue && (
        <div className="quiz-detail__venue">
          <span className="quiz-detail__venue-label">Where</span>
          <a
            href={quiz.venueMapLink || mapsUrl(quiz.venue)}
            target="_blank"
            rel="noopener noreferrer"
            className="quiz-detail__venue-link"
          >
            {quiz.venue} ^
          </a>
        </div>
      )}

      {tags.length > 0 && (
        <div className="quiz-detail__tags">
          {tags.map((tag, i) => (
            <span key={i} className="tag tag--lg" style={{ '--tag-color': getTagColor(tag) }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {(quiz.teamSize || quiz.crossCollege != null) && (
        <div className="quiz-detail__team-info">
          {quiz.teamSize && (
            <span className="tag tag--lg" style={{ '--tag-color': 'var(--accent-gold)' }}>
              {quiz.teamSize === 1 ? 'Solo' : `Teams of ${quiz.teamSize}`}
            </span>
          )}
          {quiz.crossCollege === true && (
            <span className="tag tag--lg" style={{ '--tag-color': 'var(--accent-lime)' }}>
              Cross-college OK
            </span>
          )}
          {quiz.crossCollege === false && (
            <span className="tag tag--lg" style={{ '--tag-color': 'var(--accent-red)' }}>
              Same college only
            </span>
          )}
        </div>
      )}

      {quiz.description && (
        <div className="quiz-detail__section">
          <h2 className="quiz-detail__section-title">// About</h2>
          <div
            className="quiz-detail__description"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(quiz.description) }}
          />
        </div>
      )}

      {quizMasters.length > 0 && (
        <div className="quiz-detail__section">
          <h2 className="quiz-detail__section-title">// Quiz Masters</h2>
          <ul className="quiz-detail__qm-list">
            {quizMasters.map((qm, i) => (
              <li key={i} className="quiz-detail__qm">{qm}</li>
            ))}
          </ul>
        </div>
      )}

      {(poc.name || poc.phone || poc.whatsapp) && (
        <div className="quiz-detail__section">
          <h2 className="quiz-detail__section-title">// Point of Contact</h2>
          <div className="quiz-detail__poc">
            {poc.name && <p className="quiz-detail__poc-name">{poc.name}</p>}
            {poc.phone && (
              <p>
                <a href={`tel:${poc.phone}`} className="quiz-detail__poc-link">
                  {poc.phone}
                </a>
              </p>
            )}
            {poc.whatsapp && (
              <p>
                <a
                  href={waLink(poc.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="quiz-detail__poc-link quiz-detail__poc-link--wa"
                >
                  WhatsApp: {poc.whatsapp}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="quiz-detail__actions">
        {quiz.date && (
          <a
            href={gcalLink(quiz)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary"
          >
            <IconCalendar /> Add to Calendar
          </a>
        )}
        {quiz.regLink && (
          <a
            href={quiz.regLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--primary btn--lg"
          >
            Register Now &gt;&gt;
          </a>
        )}
        {quiz.instagramLink && (
          <a
            href={quiz.instagramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary"
          >
            Instagram
          </a>
        )}
      </div>
    </div>
  );
}
