import { useState, useEffect } from 'react';
import { fetchQuiz } from '../utils/api';
import { getTagColor } from '../utils/tagColors';

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
  // strip non-digits, ensure country code
  const clean = (number || '').replace(/[^0-9]/g, '');
  return `https://wa.me/${clean}`;
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
  const tags = (quiz.eligibility || []).filter(Boolean);
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
