import DateLeaf from './DateLeaf';
import Icon from './Icon';
import Link from './Link';
import { daysAway, formatTime, isOnline, relativeDay, teamLabel } from '../utils/quiz';

// One line of the fixture list: date in the margin, then quiz, start, place and who can play.
// sameDay marks an entry whose date is already printed on the entry above.
export default function QuizCard({ quiz, showCity, sameDay }) {
  const { date } = quiz;
  const n = date ? daysAway(date) : null;
  const online = isOnline(quiz);
  const tags = [...(quiz.eligibilityCategories || []), quiz.teamSize && teamLabel(quiz.teamSize)].filter(Boolean);

  return (
    <li className={`entry${n < 0 ? ' entry--past' : ''}${sameDay ? ' entry--same-day' : ''}`}>
      {/* today and tomorrow have a heading of their own */}
      <DateLeaf date={date} note={!sameDay && (n < 0 || n > 1) && relativeDay(date)} />

      <div className="entry__main">
        <h3 className="entry__title">
          <Link href={`/quiz/${quiz.id}/`}>{quiz.name || 'Untitled quiz'}</Link>
        </h3>
        {quiz.hostingOrg && <p className="entry__host">{quiz.hostingOrg}</p>}
      </div>

      {/* one flowing line on a phone, two ruled columns on a wide screen */}
      <div className="entry__facts">
        <p className="entry__when">
          {date ? formatTime(quiz.time) || 'Time to be announced' : 'Date to be announced'}
        </p>
        <p className="entry__who">
          {tags.map(tag => <span key={tag}>{tag}</span>)}
          {quiz.entryFee === 'Free' && <span className="stamp">Free entry</span>}
        </p>
      </div>

      <p className="entry__where">
        {online && <span className="stamp stamp--online">Online</span>}
        {!online && (quiz.venue || showCity) && <Icon name="pin" />}
        {showCity && !online && quiz.city && <b>{quiz.city}</b>}
        {quiz.venue}
        {quiz.mode === 'hybrid' && <span className="stamp stamp--online">Also online</span>}
      </p>

      {quiz.posterImage && (
        <img
          className="entry__thumb"
          src={`/posters/thumbs/${quiz.posterImage.split('/').pop()}`}
          onError={e => {
            // Thumbnails only exist in production builds; fall back to the full poster once
            if (!e.target.src.endsWith(`/${quiz.posterImage}`)) e.target.src = `/${quiz.posterImage}`;
          }}
          alt=""
          loading="lazy"
        />
      )}
    </li>
  );
}
