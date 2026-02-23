export default function CityPicker({ cities, onSelect }) {
  return (
    <div className="city-picker-overlay">
      <div className="city-picker">
        <h2 className="city-picker__title">Choose your city</h2>
        <p className="city-picker__subtitle">Find quizzes happening near you</p>
        <div className="city-picker__grid">
          {cities.map(city => (
            <button
              key={city}
              className="city-picker__btn"
              onClick={() => onSelect(city)}
            >
              {city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
