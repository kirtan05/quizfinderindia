/**
 * City normalization, detection, and resolution.
 *
 * The pipeline assigns cities in three layers:
 *   1. GPT extraction (reads poster + caption)
 *   2. City name detected in quiz title
 *   3. Source fallback (page/group's configured city)
 */

const CITY_ALIASES = {
  'bengaluru': 'Bangalore',
  'bombay': 'Mumbai',
  'madras': 'Chennai',
  'calcutta': 'Kolkata',
  'new delhi': 'Delhi',
  'ncr': 'Delhi',
  'noida': 'Delhi',
  'gurgaon': 'Delhi',
  'gurugram': 'Delhi',
  'greater noida': 'Delhi',
  'faridabad': 'Delhi',
  'ghaziabad': 'Delhi',
};

// Cities we can detect when mentioned in quiz names/descriptions.
// Order matters: longer names first to avoid partial matches.
const DETECTABLE_CITIES = [
  'Bhubaneswar', 'Thiruvananthapuram', 'Visakhapatnam',
  'Ahmedabad', 'Bangalore', 'Bengaluru', 'Chandigarh', 'Coimbatore',
  'Hyderabad', 'Jamshedpur', 'Mangalore', 'Trivandrum',
  'Chennai', 'Dharwad', 'Guwahati', 'Indore', 'Jalandhar',
  'Jodhpur', 'Kanpur', 'Kharagpur', 'Kolkata', 'Lucknow',
  'Manipal', 'Mumbai', 'Bombay', 'Mysore', 'Nagpur',
  'Palakkad', 'Raipur', 'Roorkee', 'Silchar', 'Surat',
  'Tirupati', 'Trichy', 'Vellore', 'Warangal',
  'Bhopal', 'Calicut', 'Delhi', 'Dhanbad', 'Durgapur',
  'Jaipur', 'Kochi', 'Patna', 'Pune', 'Ranchi',
  'Goa',
];

/**
 * Normalize a city name to its canonical form.
 * "Bengaluru" → "Bangalore", "Noida" → "Delhi", etc.
 */
export function normalizeCity(city) {
  if (!city) return null;
  const trimmed = city.trim();
  return CITY_ALIASES[trimmed.toLowerCase()] || trimmed;
}

/**
 * Detect a city name mentioned in text (quiz name, description).
 * Uses word-boundary matching to avoid false positives like "Puneeth" → "Pune".
 */
export function detectCityInText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  for (const city of DETECTABLE_CITIES) {
    if (new RegExp(`\\b${city.toLowerCase()}\\b`).test(lower)) {
      return normalizeCity(city);
    }
  }
  return null;
}

/**
 * Resolve the final city for a quiz.
 *
 * Priority:
 *   1. GPT extraction (saw full context: image + text)
 *   2. City detected in quiz name (catches what GPT missed)
 *   3. Source city (page/group's configured city)
 *
 * Online-mode quizzes get "Online" when no city is determined.
 */
export function resolveCity(extractedCity, sourceCity, quizName, mode) {
  const gptCity = normalizeCity(extractedCity);
  const nameCity = detectCityInText(quizName);
  const fallback = normalizeCity(sourceCity);

  if (mode === 'online' && !gptCity && !nameCity) return 'Online';

  return gptCity || nameCity || fallback;
}
