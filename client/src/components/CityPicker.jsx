export default function CityPicker({ cities, onSelect }) {
  const physical = cities.filter(c => c !== 'Online');
  const hasOnline = cities.includes('Online');

  return (
    <div className="city-picker-overlay">
      <div className="city-picker">
        <h2 className="city-picker__title">Choose your city</h2>
        <p className="city-picker__subtitle">Find quizzes happening near you</p>
        <div className="city-picker__grid">
          {physical.map(city => (
            <button
              key={city}
              className="city-picker__btn"
              onClick={() => onSelect(city)}
            >
              {city}
            </button>
          ))}
        </div>
        {hasOnline && (
          <button
            className="city-picker__online"
            onClick={() => onSelect('Online')}
          >
            Online quizzes only
          </button>
        )}
      </div>
    </div>
  );
}
