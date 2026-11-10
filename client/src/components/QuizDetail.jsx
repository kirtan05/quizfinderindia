import { useEffect, useState } from 'react';
import DateLeaf from './DateLeaf';
import Icon from './Icon';
import Link from './Link';
import { SITE_ORIGIN } from '../utils/api';
import { daysAway, externalUrl, gcalLink, isOnline, relativeDay, teamLabel, timeAgo, whenText } from '../utils/quiz';

/* Minimal markdown-ish renderer: bold, italic, bullet lists, line breaks.
   No library needed -- just a few regex passes and basic sanitization. */
function renderMarkdown(text) {
  return text
    // escape HTML entities first (sanitize)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // bullet lists: lines starting with - or *
    .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
    // wrap consecutive <li> in <ul>
    .replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
    // line breaks
    .replace(/\n/g, '<br/>');
}

const mapsUrl = venue => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
const waLink = number => `https://wa.me/${number.replace(/[^0-9]/g, '')}`;

function Source({ quiz, groupNames }) {
  const posted = quiz.sourceTimestamp && ` · posted ${timeAgo(quiz.sourceTimestamp)}`;
  if (quiz.sourceUsername) {
    return (
      <p>
        From{' '}
        <a href={externalUrl(quiz.instagramLink || `instagram.com/${quiz.sourceUsername}`)} target="_blank" rel="noopener noreferrer">
          @{quiz.sourceUsername}
        </a>
        {' '}on Instagram{posted}
      </p>
    );
  }
  if (!quiz.sourceGroupId) return null;
  return <p>From {groupNames[quiz.sourceGroupId] || 'a WhatsApp quiz group'} on WhatsApp{posted}</p>;
}

export default function QuizDetail({ quiz, loading, groupNames, home }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!quiz) return;
    document.title = quiz.name;
    return () => { document.title = 'Quiz Finder India'; };
  }, [quiz]);

  if (!quiz) {
    return (
      <main className="state">
        {loading ? <p>Loading quiz…</p> : (
          <>
            <p>This quiz is not listed any more.</p>
            <Link className="btn" href="/">{home}</Link>
          </>
        )}
      </main>
    );
  }

  const url = `${SITE_ORIGIN}/quiz/${quiz.id}/`;
  const shareText = [quiz.name, whenText(quiz), quiz.venue].filter(Boolean).join(' — ');
  const reportUrl = 'https://github.com/kirtan05/quizfinderindia/issues/new'
    + `?title=${encodeURIComponent(`Wrong details: ${quiz.name}`)}&body=${encodeURIComponent(url)}`;
  const n = quiz.date ? daysAway(quiz.date) : null;
  const poc = quiz.poc || {};
  const quizMasters = (quiz.quizMasters || []).filter(Boolean);
  // older entries store eligibility as one string rather than a list
  const whoCanPlay = [].concat(quiz.eligibility?.length ? quiz.eligibility : quiz.eligibilityCategories || []);

  // The facts sheet: only rows we have an answer for
  const facts = [
    ['When', whenText(quiz)],
    quiz.venue && ['Where', (
      <a href={quiz.venueMapLink ? externalUrl(quiz.venueMapLink) : mapsUrl(quiz.venue)} target="_blank" rel="noopener noreferrer">
        <Icon name="pin" />{quiz.venue}
      </a>
    )],
    quiz.city && quiz.city !== 'Online' && ['City', quiz.city],
    quiz.hostingOrg && ['Host', quiz.hostingOrg],
    quizMasters.length > 0 && [quizMasters.length > 1 ? 'Quizmasters' : 'Quizmaster', quizMasters.join(', ')],
    whoCanPlay.length > 0 && ['Who can play', whoCanPlay.join('; ')],
    (quiz.teamSize || quiz.crossCollege != null) && ['Teams', [
      quiz.teamSize && teamLabel(quiz.teamSize),
      quiz.crossCollege === true && 'cross-college teams allowed',
      quiz.crossCollege === false && 'same college only',
    ].filter(Boolean).join(', ')],
    quiz.entryFee && ['Entry', quiz.entryFee],
    (poc.name || poc.phone || poc.whatsapp) && ['Contact', (
      <>
        {poc.name} {poc.phone && <a href={`tel:${poc.phone}`}>{poc.phone}</a>}
        {poc.whatsapp && <> <a href={waLink(poc.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
      </>
    )],
  ].filter(Boolean);

  return (
    <main className="detail">
      <div className="detail__main">
        <Link className="detail__back" href="/"><Icon name="back" />{home}</Link>

        <header className={`detail__head${n < 0 ? ' entry--past' : ''}`}>
          <DateLeaf date={quiz.date} />
          <div>
            <h1 className="detail__title">{quiz.name}</h1>
            <p className="detail__marks">
              {quiz.date && <span className={`hand${n === 0 || n === 1 ? ' hand--soon' : ''}`}>{relativeDay(quiz.date)}</span>}
              {n < 0 && <span className="stamp">Over</span>}
              {isOnline(quiz) && <span className="stamp stamp--online">Online</span>}
              {quiz.mode === 'hybrid' && <span className="stamp stamp--online">Also online</span>}
              {quiz.entryFee === 'Free' && <span className="stamp">Free entry</span>}
            </p>
          </div>
        </header>

        <dl className="facts">
          {facts.map(([label, value]) => (
            <div key={label} className="facts__row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="detail__actions">
          {quiz.regLink && !(n < 0) && (
            <a className="btn btn--primary" href={externalUrl(quiz.regLink)} target="_blank" rel="noopener noreferrer">Register</a>
          )}
          {n >= 0 && quiz.date && (
            <a className="btn" href={gcalLink(quiz)} target="_blank" rel="noopener noreferrer">
              <Icon name="calendar" />Add to calendar
            </a>
          )}
          <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}`} target="_blank" rel="noopener noreferrer">
            <Icon name="share" />Share on WhatsApp
          </a>
          <button type="button" className="btn" onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          {quiz.instagramLink && (
            <a className="btn" href={externalUrl(quiz.instagramLink)} target="_blank" rel="noopener noreferrer">
              <Icon name="link" />Instagram
            </a>
          )}
        </div>
      </div>

      {quiz.posterImage && (
        <a className="detail__poster" href={`/${quiz.posterImage}`} target="_blank" rel="noopener noreferrer">
          <img src={`/${quiz.posterImage}`} alt={`Poster for ${quiz.name}. Open full size.`} />
        </a>
      )}

      <div className="detail__rest">
        {quiz.description && (
          <>
            <h2>About this quiz</h2>
            <div className="detail__description" dangerouslySetInnerHTML={{ __html: renderMarkdown(quiz.description) }} />
          </>
        )}
        <footer className="detail__source">
          <Source quiz={quiz} groupNames={groupNames} />
          <p><a href={reportUrl} target="_blank" rel="noopener noreferrer">Report a problem</a> with these details</p>
        </footer>
      </div>
    </main>
  );
}
