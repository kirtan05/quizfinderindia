const AGE_PATTERN = /[Uu](?:nder\s*)?(\d{2})/;
const OPEN_PATTERNS = [/\bopen\b/i, /\beveryone\b/i, /\ball\b/i, /\banyone\b/i];
const UG_PATTERNS = [/\bug\b/i, /\bundergrad/i, /\bbachelor/i];
const PG_PATTERNS = [/\bpg\b/i, /\bpostgrad/i, /\bmaster/i, /\bmba\b/i];
const RESEARCH_PATTERNS = [/\bresearch/i, /\bph\.?d/i, /\bdoctoral/i];
const DU_PATTERNS = [/\bdu\b/i, /\bdelhi\s*uni/i];
const JNU_PATTERNS = [/\bjnu\b/i, /\bjawaharlal/i];

export function normalizeEligibility(rawEligibility) {
  if (!rawEligibility || rawEligibility.length === 0) return [];

  const categories = new Set();
  const raw = Array.isArray(rawEligibility) ? rawEligibility.join(' ') : rawEligibility;

  const ageMatch = raw.match(AGE_PATTERN);
  if (ageMatch) {
    const age = parseInt(ageMatch[1]);
    if ([18, 23, 25, 30].includes(age)) categories.add(`U${age}`);
    else categories.add(`U${age}`);
  }

  if (OPEN_PATTERNS.some(p => p.test(raw))) categories.add('Open');
  if (UG_PATTERNS.some(p => p.test(raw))) categories.add('UG');
  if (PG_PATTERNS.some(p => p.test(raw))) categories.add('PG');
  if (RESEARCH_PATTERNS.some(p => p.test(raw))) categories.add('Research');
  if (DU_PATTERNS.some(p => p.test(raw))) categories.add('DU Only');
  if (JNU_PATTERNS.some(p => p.test(raw))) categories.add('JNU Only');

  if (categories.size === 0) categories.add('Custom');

  return [...categories];
}
