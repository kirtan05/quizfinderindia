import { getTagColor } from '../utils/tagColors';

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

export default function QuizCard({ quiz, onClick }) {
  const tags = (quiz.eligibility || []).filter(Boolean);
  const pocNumber = quiz.poc?.whatsapp || quiz.poc?.phone;

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

      {(pocNumber || quiz.regLink || quiz.instagramLink) && (
        <div className="quiz-card__actions">
          {pocNumber && (
            <a href={waLink(pocNumber)} target="_blank" rel="noopener noreferrer"
              className="quiz-card__action quiz-card__action--wa"
              onClick={e => e.stopPropagation()} title="WhatsApp">
              WhatsApp
            </a>
          )}
          {quiz.regLink && (
            <a href={quiz.regLink} target="_blank" rel="noopener noreferrer"
              className="quiz-card__action quiz-card__action--reg"
              onClick={e => e.stopPropagation()} title="Register">
              Register
            </a>
          )}
          {quiz.instagramLink && (
            <a href={quiz.instagramLink} target="_blank" rel="noopener noreferrer"
              className="quiz-card__action quiz-card__action--ig"
              onClick={e => e.stopPropagation()} title="Instagram">
              Insta
            </a>
          )}
        </div>
      )}

      <div className="quiz-card__edge" aria-hidden="true" />
    </article>
  );
}
