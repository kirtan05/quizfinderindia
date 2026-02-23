const AGE_TAGS = ['u18', 'u23', 'u25', 'u30', 'under 18', 'under 23', 'under 25', 'under 30'];
const OPEN_TAGS = ['open', 'open to all'];
const UNI_TAGS = ['du only', 'du', 'university', 'college'];
const DEGREE_TAGS = ['ug', 'pg', 'undergraduate', 'postgraduate'];

export function getTagColor(tag) {
  const t = tag.toLowerCase().trim();
  if (AGE_TAGS.some(a => t.includes(a))) return 'var(--tag-age)';
  if (OPEN_TAGS.some(a => t === a)) return 'var(--tag-open)';
  if (UNI_TAGS.some(a => t.includes(a))) return 'var(--tag-university)';
  if (DEGREE_TAGS.some(a => t.includes(a))) return 'var(--tag-degree)';
  return 'var(--tag-custom)';
}
