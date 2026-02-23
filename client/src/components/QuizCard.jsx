import { getTagColor } from '../utils/tagColors';

const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><text x="12" y="18" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">G</text>
  </svg>
);

const IconWhatsApp = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

const IconRegister = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

const IconInstagram = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

function formatDate(dateStr) {
  if (!dateStr) return 'TBA';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

export default function QuizCard({ quiz, onClick }) {
  const raw = quiz.eligibilityCategories || quiz.eligibility || [];
  const tags = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  const pocNumber = quiz.poc?.whatsapp || quiz.poc?.phone;
  const qms = (quiz.quizMasters || []).filter(Boolean);

  return (
    <article className="quiz-card" onClick={() => onClick(quiz.id)} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onClick(quiz.id); }}
      role="button"
      aria-label={`View details for ${quiz.name}`}
    >
      <div className="quiz-card__poster">
        {quiz.posterImage ? (
          <img src={`/${quiz.posterImage}`} alt={`${quiz.name} poster`} loading="lazy" />
        ) : (
          <div className="quiz-card__placeholder">
            <span className="quiz-card__placeholder-icon">?!</span>
            <span className="quiz-card__placeholder-text">No poster yet</span>
          </div>
        )}
      </div>

      <div className="quiz-card__body">
        <h3 className="quiz-card__title">{quiz.name || 'Untitled Quiz'}</h3>

        <div className="quiz-card__meta">
          <span className="quiz-card__date">
            <span className="quiz-card__icon" aria-hidden="true">&gt;</span>
            {formatDate(quiz.date)}
          </span>
          {quiz.hostingOrg && (
            <span className="quiz-card__org">
              <span className="quiz-card__icon" aria-hidden="true">@</span>
              {quiz.hostingOrg}
            </span>
          )}
        </div>

        {quiz.venue && (
          <p className="quiz-card__venue">
            <span className="quiz-card__icon" aria-hidden="true">#</span>
            {quiz.venue}
          </p>
        )}

        {qms.length > 0 && (
          <p className="quiz-card__qms">
            <span className="quiz-card__icon" aria-hidden="true">*</span>
            QM: {qms.join(', ')}
          </p>
        )}

        {tags.length > 0 && (
          <div className="quiz-card__tags">
            {tags.map((tag, i) => (
              <span key={i} className="tag" style={{ '--tag-color': getTagColor(tag) }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="quiz-card__actions">
        {quiz.date && (
          <a href={gcalLink(quiz)} target="_blank" rel="noopener noreferrer"
            className="quiz-card__action quiz-card__action--cal"
            onClick={e => e.stopPropagation()} title="Add to Google Calendar">
            <IconCalendar /> Calendar
          </a>
        )}
        {pocNumber && (
          <a href={waLink(pocNumber)} target="_blank" rel="noopener noreferrer"
            className="quiz-card__action quiz-card__action--wa"
            onClick={e => e.stopPropagation()} title="WhatsApp">
            <IconWhatsApp /> WhatsApp
          </a>
        )}
        {quiz.regLink && (
          <a href={quiz.regLink} target="_blank" rel="noopener noreferrer"
            className="quiz-card__action quiz-card__action--reg"
            onClick={e => e.stopPropagation()} title="Register">
            <IconRegister /> Register
          </a>
        )}
        {quiz.instagramLink && (
          <a href={quiz.instagramLink} target="_blank" rel="noopener noreferrer"
            className="quiz-card__action quiz-card__action--ig"
            onClick={e => e.stopPropagation()} title="Instagram">
            <IconInstagram /> Insta
          </a>
        )}
      </div>

      <div className="quiz-card__edge" aria-hidden="true" />
    </article>
  );
}
