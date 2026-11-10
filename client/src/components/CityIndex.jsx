import Tally from './Tally';

// The almanac's index of cities: [[name, upcomingCount], ...], then the whole country
export default function CityIndex({ cities, total, current, onPick }) {
  const row = (value, name, count) => (
    <li key={value}>
      <button type="button" aria-current={current === value || undefined} onClick={() => onPick(value)}>
        <span className="cities__name">{name}</span>
        <span className="cities__leader" />
        <Tally n={count} />
      </button>
    </li>
  );
  return (
    <ul className="cities">
      {cities.map(([name, count]) => row(name, name, count))}
      {row('all', 'All India', total)}
    </ul>
  );
}
