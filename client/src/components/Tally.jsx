// A count kept the way a scorer keeps it: four strokes and a slash for every five,
// with the figure beside it. Past twenty the strokes stop helping, so only the figure shows.
export default function Tally({ n }) {
  const marks = [];
  for (let i = 0; i < n && n <= 20; i++) {
    const gate = Math.floor(i / 5) * 27;
    // each stroke leans a little differently, as pen strokes do
    marks.push(i % 5 < 4 ? `M${gate + 3 + (i % 5) * 5} 3l${(i % 3) - 1} 14` : `M${gate} ${15 - (i % 2)}l21 -9`);
  }
  return (
    <span className="tally">
      {marks.length > 0 && (
        <svg width={Math.ceil(n / 5) * 27 - 5} height="20" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d={marks.join('')} />
        </svg>
      )}
      {n}
    </span>
  );
}
