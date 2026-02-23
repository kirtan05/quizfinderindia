const AGE_PATTERN = /[Uu](?:nder\s*)?(\d{2})/;
const OPEN_PATTERNS = [/\bopen\b/i, /\beveryone\b/i, /\ball\b/i, /\banyone\b/i];
const UG_PATTERNS = [/\bug\b/i, /\bundergrad/i, /\bbachelor/i];
const PG_PATTERNS = [/\bpg\b/i, /\bpostgrad/i, /\bmaster/i, /\bmba\b/i];
const RESEARCH_PATTERNS = [/\bresearch/i, /\bph\.?d/i, /\bdoctoral/i];
const DU_PATTERNS = [/\bdu\b/i, /\bdelhi\s*uni/i];

// Patterns to strip before normalizing (team size, cross-college)
const NOISE_PATTERNS = [
  /\bteams?\s*(of\s*)?\d+\b/i,
  /\blone\s*wolves?\b/i,
  /\blone\s*wolf\b/i,
  /\bsolo\b/i,
  /\bcross[\s-]*college\b/i,
  /\bcross[\s-]*institution\b/i,
  /\binter[\s-]*college\b/i,
];

export function normalizeEligibility(rawEligibility) {
  if (!rawEligibility || rawEligibility.length === 0) return [];

  const categories = new Set();
  let raw = Array.isArray(rawEligibility) ? rawEligibility.join(' ') : rawEligibility;

  // Strip noise before normalizing
  for (const pattern of NOISE_PATTERNS) {
    raw = raw.replace(pattern, '');
  }

  const ageMatch = raw.match(AGE_PATTERN);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    categories.add(`U${age}`);
  }

  if (OPEN_PATTERNS.some(p => p.test(raw))) categories.add('Open');
  if (UG_PATTERNS.some(p => p.test(raw))) categories.add('UG');
  if (PG_PATTERNS.some(p => p.test(raw))) categories.add('PG');
  if (RESEARCH_PATTERNS.some(p => p.test(raw))) categories.add('Research');
  if (DU_PATTERNS.some(p => p.test(raw))) categories.add('DU Only');

  if (categories.size === 0) categories.add('Custom');

  return [...categories];
}
