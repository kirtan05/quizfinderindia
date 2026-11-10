import { formatDate } from '../utils/quiz';

// The date as a wall calendar prints it, Sundays in red, with room for a pen note under it
export default function DateLeaf({ date, note }) {
  if (!date) return <div className="leaf"><span>Date</span><span className="leaf__day">TBA</span></div>;
  const weekday = formatDate(date, { weekday: 'short' });
  return (
    <div className={`leaf${weekday === 'Sun' ? ' leaf--sunday' : ''}`}>
      <span>{weekday}</span>
      <span className="leaf__day">{formatDate(date, { day: 'numeric' })}</span>
      <span>{formatDate(date, { month: 'short' })}</span>
      {note && <span className="hand">{note}</span>}
    </div>
  );
}
