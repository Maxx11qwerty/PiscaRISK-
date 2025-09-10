import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const normalizeRisk = (level) => {
  if (!level || typeof level !== 'string') return 'Normal';
  const s = level.toLowerCase();
  if (s.includes('high') || s.includes('critical')) return 'High';
  if (s.includes('medium')) return 'Medium';
  if (s.includes('low')) return 'Low';
  if (s.includes('normal')) return 'Normal';
  return level.charAt(0).toUpperCase() + level.slice(1);
};

const levelKey = (level) => {
  const n = normalizeRisk(level);
  if (n === 'High') return 'high';
  if (n === 'Medium') return 'medium';
  if (n === 'Low') return 'low';
  return 'normal';
};

const majorityFromCounts = (counts) => {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'Normal';
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0][0];
  if (top === 'high') return 'High';
  if (top === 'medium') return 'Medium';
  if (top === 'low') return 'Low';
  return 'Normal';
};

const getTimestampMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof ts === 'object') {
    if (typeof ts.toDate === 'function') {
      try { return ts.toDate().getTime(); } catch (_) { /* noop */ }
    }
    if (typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number') {
      return ts.seconds * 1000 + Math.floor(ts.nanoseconds / 1e6);
    }
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  }
  return 0;
};

const deduplicatePredictions = (predictions) => {
  // Keep only the newest record per farm_key + fish_pond
  const bestByPond = new Map();
  predictions.forEach((p) => {
    const pond = p.fish_pond || '';
    const key = `${p.farm_key}::${pond}`;
    const currentBest = bestByPond.get(key);
    if (!currentBest) {
      bestByPond.set(key, p);
    } else {
      const curMs = getTimestampMs(currentBest.timestamp);
      const newMs = getTimestampMs(p.timestamp);
      if (newMs >= curMs) {
        bestByPond.set(key, p);
      }
    }
  });
  return Array.from(bestByPond.values());
};

export const fetchRiskReportData = async () => {
  // Predictions
  let predsSnap = await getDocs(collection(db, 'risk_predictions'));
  if (predsSnap.empty) {
    try { predsSnap = await getDocs(collection(db, 'predictions')); } catch (_) {}
  }

  // Feedback (prefer modal_feedback, fallback model_feedback) — to match RiskReportModal
  let feedbackSnap = await getDocs(collection(db, 'modal_feedback'));
  if (feedbackSnap.empty) {
    try { feedbackSnap = await getDocs(collection(db, 'model_feedback')); } catch (_) {}
  }

  const allFarms = new Set();
  const farmKeyToName = {};
  const predictions = [];
  const feedbacks = [];

  predsSnap.forEach(doc => {
    const data = doc.data();
    const farmName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || 'Unknown Farm';
    const farmKey = normalizeFarmName(farmName);
    allFarms.add(farmKey);
    if (farmName && farmName !== 'Unknown Farm') farmKeyToName[farmKey] = farmName;
    predictions.push({
      id: doc.id,
      farm: farmName,
      farm_key: farmKey,
      fish_pond: data.fish_pond || data.input_data?.fish_pond,
      risk_level: normalizeRisk(data.risk_level),
      confidence: typeof data.confidence === 'number' ? data.confidence : (typeof data.input_data?.confidence === 'number' ? data.input_data.confidence : undefined),
      timestamp: data.timestamp || data.createdAt || data.input_data?.timestamp,
    });
  });

  // Process feedback to mirror RiskReportModal behavior
  feedbackSnap.forEach(doc => {
    const data = doc.data();
    const farmName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || data.prediction?.farm_name || data.prediction?.input_data?.farm_name || null;
    if (!farmName) return;
    const farmKey = normalizeFarmName(farmName);
    allFarms.add(farmKey);
    if (farmName && farmName !== 'Unknown Farm') farmKeyToName[farmKey] = farmName;
    const corrected = data.corrected_risk_level || data.correctedFinalRisk || data.final_risk || data.overall_risk || data.risk_level || data.prediction?.corrected_risk_level || data.prediction?.final_risk || data.prediction?.overall_risk || data.prediction?.risk_level || null;
    feedbacks.push({
      id: doc.id,
      farm: farmName,
      farm_key: farmKey,
      corrected_risk_level: corrected ? normalizeRisk(corrected) : null,
      diagnostics: data.prediction?.diagnostics || data.diagnostics || undefined,
      is_aggregate: !!data.is_aggregate,
    });
  });

  // Ensure transparency by including certain farms even if no reports exist
  const requiredFarms = [
    'Freshwater FinFish'
  ];
  requiredFarms.forEach((farmName) => {
    const farmKey = normalizeFarmName(farmName);
    allFarms.add(farmKey);
    if (!farmKeyToName[farmKey]) {
      farmKeyToName[farmKey] = farmName;
    }
  });

  const byFarm = {};
  allFarms.forEach(farmKey => {
    byFarm[farmKey] = {
      farm_name: farmKeyToName[farmKey] || farmKey.replace(/-/g, ' '),
      farm_key: farmKey,
      predictions: [],
      counts: { high: 0, medium: 0, low: 0, normal: 0 },
      overall_risk: 'Normal',
      feedback: null,
      has_reports: false,
    };
  });

  if (byFarm['unknown-farm'] && Object.keys(byFarm).some(k => k !== 'unknown-farm')) delete byFarm['unknown-farm'];

  predictions.forEach(p => {
    if (byFarm[p.farm_key]) {
      byFarm[p.farm_key].predictions.push(p);
      byFarm[p.farm_key].has_reports = true;
    }
  });

  // Prefer aggregate feedback, highest severity; then apply corrected_risk_level and diagnostics
  const sev = (lvl) => {
    if (!lvl) return 0;
    const l = lvl.toLowerCase();
    if (l.includes('high')) return 3;
    if (l.includes('medium')) return 2;
    if (l.includes('low')) return 1;
    if (l.includes('normal')) return 0;
    return 0;
  };
  feedbacks.forEach(f => {
    const farm = byFarm[f.farm_key];
    if (!farm) return;
    const cur = farm.feedback;
    const curScore = cur ? (cur.is_aggregate ? 100 : 0) + sev(cur.corrected_risk_level) : -1;
    const newScore = (f.is_aggregate ? 100 : 0) + sev(f.corrected_risk_level);
    if (!cur || newScore > curScore) {
      farm.feedback = f;
      farm.has_reports = true;
    }
  });

  Object.values(byFarm).forEach(farm => {
    if (farm.predictions.length > 0) {
      farm.predictions = deduplicatePredictions(farm.predictions);
      farm.predictions.forEach(p => { farm.counts[levelKey(p.risk_level)] += 1; });
      farm.overall_risk = majorityFromCounts(farm.counts);
    }
    if (farm.feedback) {
      const fb = farm.feedback;
      if (fb.diagnostics) {
        const d = fb.diagnostics;
        farm.counts = {
          high: d.high_risk_count || d.high || farm.counts.high,
          medium: d.medium_risk_count || d.medium || farm.counts.medium,
          low: d.low_risk_count || d.low || farm.counts.low,
          normal: d.normal_count || d.normal || farm.counts.normal,
        };
      }
      if (fb.corrected_risk_level) farm.overall_risk = fb.corrected_risk_level;
    }
  });


  const farmsArray = Object.values(byFarm).map(f => ({
    key: f.farm_key,
    name: f.farm_name,
    risk: f.overall_risk,
    overall_risk: f.overall_risk,
    ponds: f.predictions.length,
    predictions: f.predictions.map(p => ({
      id: p.id,
      fish_pond: p.fish_pond,
      risk_level: p.risk_level,
      timestamp: p.timestamp,
      farm_key: p.farm_key,
      farm: f.farm_name,
    })),
    has_reports: f.has_reports,
    counts: f.counts,
    feedback: f.feedback,
  }));

  return farmsArray;
};


// Alias to match consumer naming
export const fetchFarmRiskData = fetchRiskReportData;


