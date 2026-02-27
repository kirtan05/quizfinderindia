/**
 * Dice coefficient — bigram overlap between two strings.
 * Returns 0.0 (no match) to 1.0 (identical after normalization).
 */
export function diceCoefficient(a, b) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aN = normalize(a);
  const bN = normalize(b);

  if (aN === bN) return 1;
  if (aN.length < 2 || bN.length < 2) return 0;

  const aBigrams = new Map();
  for (let i = 0; i < aN.length - 1; i++) {
    const bi = aN.slice(i, i + 2);
    aBigrams.set(bi, (aBigrams.get(bi) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < bN.length - 1; i++) {
    const bi = bN.slice(i, i + 2);
    const count = aBigrams.get(bi);
    if (count > 0) {
      aBigrams.set(bi, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (aN.length - 1 + bN.length - 1);
}
