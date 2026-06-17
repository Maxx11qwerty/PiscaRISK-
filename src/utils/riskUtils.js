/**
 * Canonical risk level normalization for charts, reports, and counts.
 * "Normal" is treated as Low risk everywhere pond risk is grouped.
 */
export const normalizeRisk = (level) => {
  if (!level || typeof level !== 'string') return 'Low';
  const s = level.toLowerCase().trim();
  if (s.includes('high') || s.includes('critical')) return 'High';
  if (s.includes('medium')) return 'Medium';
  if (s.includes('low') || s.includes('normal')) return 'Low';
  return 'Low';
};

export const RISK_RANK = {
  High: 3,
  Medium: 2,
  Low: 1,
};

export const riskLevelKey = (level) => {
  const n = normalizeRisk(level);
  if (n === 'High') return 'high';
  if (n === 'Medium') return 'medium';
  return 'low';
};

export const riskSeverityScore = (level) => RISK_RANK[normalizeRisk(level)] ?? 1;

export const isAtRiskLevel = (level) => {
  const n = normalizeRisk(level);
  return n === 'High' || n === 'Medium';
};

export const isLowRiskLevel = (level) => normalizeRisk(level) === 'Low';
