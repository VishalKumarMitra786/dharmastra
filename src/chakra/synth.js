// Synthetic events for load tests and the ?synth=N dev switch. Never shipped as data; they only exist in memory.
const KINDS = ['History', 'Tradition', 'Invented'];
const REGIONS = ['Ganga plain', 'South India', 'North India', 'Western India', 'Tamil country'];
export function makeSynthetic(n, yuga = 'kali', startOrder = 1000) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const year = -600 + Math.floor((i * 2600) / n); // spread from 600 BCE to 2000 CE
    out.push({
      id: `syn-${yuga}-${i}`, yuga, year: year < 0 ? `c. ${-year} BCE` : `${year || 1} CE`, label: `Synthetic event ${i + 1}`, kind: KINDS[i % 3], level: null,
      order: startOrder + i, requires: null, needsObjective: false, needsReview: true, region: REGIONS[i % REGIONS.length],
      source: 'synthetic test data', intro: `Synthetic introduction text for load testing, number ${i + 1}. It is never shown to players.`,
    });
  }
  return out;
}
