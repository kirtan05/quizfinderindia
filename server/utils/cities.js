/**
 * City normalization, detection, and resolution.
 *
 * The pipeline assigns cities in three layers:
 *   1. GPT extraction (reads poster + caption)
 *   2. City name detected in quiz title or venue
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
  'ernakulam': 'Kochi',
  'kozhikode': 'Calicut',
  'thiruvananthapuram': 'Trivandrum',
  'tiruchirappalli': 'Trichy',
};

// Cities we can detect when mentioned in quiz names, venues, or descriptions.
// Longer names first to avoid partial matches.
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
  // Kerala
  'Thrissur', 'Kottayam', 'Kollam', 'Ernakulam', 'Kozhikode',
  // Additional
  'Agra', 'Allahabad', 'Amritsar', 'Aurangabad', 'Dehradun',
  'Hubli', 'Madurai', 'Meerut', 'Rourkela', 'Salem',
  'Shimla', 'Surathkal', 'Tiruchirappalli', 'Vadodara', 'Varanasi',
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
 * Detect a city name mentioned in text (quiz name, venue, description).
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
 *   2. City detected in quiz name or venue (catches what GPT missed)
 *   3. Source city (page/group's configured city)
 *
 * Online-mode quizzes get "Online" when no city is determined.
 */
export function resolveCity(extractedCity, sourceCity, quizName, mode, venue) {
  const gptCity = normalizeCity(extractedCity);
  const nameCity = detectCityInText(quizName);
  const venueCity = detectCityInText(venue);
  const fallback = normalizeCity(sourceCity);

  if (mode === 'online' && !gptCity && !nameCity && !venueCity) return 'Online';

  return gptCity || nameCity || venueCity || fallback;
}
