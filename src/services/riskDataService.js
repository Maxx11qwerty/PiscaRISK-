import { db } from '../firebase';
import { collection, getDocs, query } from 'firebase/firestore';
import { normalizeRisk, riskLevelKey, riskSeverityScore } from '../utils/riskUtils';

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const levelKey = riskLevelKey;

const mergeRiskCounts = (counts = {}) => ({
  high: counts.high || 0,
  medium: counts.medium || 0,
  low: (counts.low || 0) + (counts.normal || 0),
});

const majorityFromCounts = (counts) => {
  const merged = mergeRiskCounts(counts);
  const entries = Object.entries(merged).filter(([, value]) => value > 0);
  if (entries.length === 0) return 'Low';
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0][0];
  if (top === 'high') return 'High';
  if (top === 'medium') return 'Medium';
  return 'Low';
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
  // Keep only one record per farm_key + fish_pond
  // Preference order:
  // 1) Newer timestamp wins
  // 2) If timestamps tie, prefer lower severity (Normal < Low < Medium < High)
  // 3) If still tied, prefer risk_predictions source
  const bestByPond = new Map();
  const sevScore = (lvl) => riskSeverityScore(lvl);
  predictions.forEach((p) => {
    const pondRaw = (p.fish_pond || '').toString();
    const pondKey = pondRaw.trim().toLowerCase();
    const key = `${p.farm_key}::${pondKey}`;
    const cur = bestByPond.get(key);
    if (!cur) {
      bestByPond.set(key, p);
      return;
    }
    const curMs = getTimestampMs(cur.timestamp);
    const newMs = getTimestampMs(p.timestamp);
    // Prefer risk_predictions source regardless of minor timestamp differences to mirror modal focus
    const pSrc = p.source || '';
    const cSrc = cur.source || '';
    if (pSrc === 'risk_predictions' && cSrc !== 'risk_predictions') {
      bestByPond.set(key, p);
      return;
    }
    if (cSrc === 'risk_predictions' && pSrc !== 'risk_predictions') {
      return;
    }
    // Otherwise, newer timestamp wins
    if (newMs > curMs) {
      bestByPond.set(key, p);
      return;
    }
    if (newMs < curMs) return;
    // Tie on timestamp -> pick lower severity
    const pSev = sevScore(p.risk_level);
    const cSev = sevScore(cur.risk_level);
    if (pSev < cSev) {
      bestByPond.set(key, p);
      return;
    }
    if (pSev > cSev) return;
    // Final tie: keep current
  });
  return Array.from(bestByPond.values());
};

export const fetchRiskReportData = async () => {
  // Predictions
  let predsSnap = await getDocs(collection(db, 'risk_predictions'));
  if (predsSnap.empty) {
    try { 
      predsSnap = await getDocs(collection(db, 'predictions')); 
    } catch (e) {
      // Silently handle errors
    }
  }

  // Feedback (prefer modal_feedback, fallback model_feedback) — to match RiskReportModal
  let feedbackSnap = await getDocs(collection(db, 'modal_feedback'));
  if (feedbackSnap.empty) {
    try { 
      feedbackSnap = await getDocs(collection(db, 'model_feedback')); 
    } catch (e) {
      // Silently handle errors
    }
  }

  const allFarms = new Set();
  const farmKeyToName = {};
  const predictions = [];
  const feedbacks = [];

  // Mapping legacy names/ids to new canonical names
  const legacyMap = {
    'salmon-hatchery-facility': 'Aquino Fish Farm',
    'tilapia-production-center': "Vergara's Aqua Farm",
    'blue-ocean-aquafarm': 'Maningas Fish Farm',
    'marine-species-cultivation': 'Labay Fish Farm',
  };
  const idToNewName = {
    'NyhjBvh9N9wfsOJ2qeEa': 'Aquino Fish Farm',
    'TP3p0y4iQlo2j0loELQb': "Vergara's Aqua Farm",
    'egGEARKL6Qk5jNgrY3Yu': 'Maningas Fish Farm',
    's5zKKXTBkF3voYnV8wuh': 'Labay Fish Farm',
  };

  predsSnap.forEach(doc => {
    const data = doc.data();
    const rawName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || 'Unknown Farm';
    let farmKey = normalizeFarmName(rawName);
    // If record contains an explicit id field, prefer mapping by id to new name
    const explicitId = data.farm_id || data.farmId || data.input_data?.farm_id || data.input_data?.farmId || null;
    
    // Skip Rojo Hatchery and Freshwater Finfish Farm data
    if (explicitId === 'WgS4mBVnPFPMGq7vfSYa' || 
        rawName === 'Rojo Hatchery' ||
        rawName === 'Freshwater Finfish Farm' ||
        rawName?.toLowerCase().includes('freshwater finfish')) return;
    
    let canonName = null;
    if (explicitId && idToNewName[explicitId]) {
      canonName = idToNewName[explicitId];
      farmKey = normalizeFarmName(canonName);
    } else if (legacyMap[farmKey]) {
      canonName = legacyMap[farmKey];
      farmKey = normalizeFarmName(canonName);
    }
    const farmName = canonName || rawName;
    allFarms.add(farmKey);
    if (farmName && farmName !== 'Unknown Farm') farmKeyToName[farmKey] = farmName;
    const generatedTs = data.timestamp || data.createdAt || data.created_at || data.prediction?.timestamp;
    const submittedTs = data.input_data?.timestamp || data.input_data?.created_at || data.prediction?.input_data?.timestamp;
    predictions.push({
      id: doc.id,
      farm: farmName,
      farm_key: farmKey,
      fish_pond: data.fish_pond || data.input_data?.fish_pond,
      risk_level: normalizeRisk(data.risk_level),
      confidence: (function(){
        const c = data.confidence ?? data.input_data?.confidence;
        const n = Number(c);
        return Number.isFinite(n) ? n : undefined;
      })(),
      // Optional fields used by tooltips/details
      fish_condition: data.fish_condition || data.input_data?.fish_condition,
      water_condition: data.water_condition || data.input_data?.water_condition,
      weather: data.weather || data.input_data?.weather,
      ready_for_harvest: typeof data.ready_for_harvest === 'boolean' ? data.ready_for_harvest : (typeof data.input_data?.ready_for_harvest === 'boolean' ? data.input_data.ready_for_harvest : undefined),
      conditions_summary: data.conditions_summary || data.input_data?.conditions_summary,
      timestamp: generatedTs || submittedTs,
      submitted_timestamp: submittedTs,
      generated_timestamp: generatedTs,
      source: 'risk_predictions',
    });
  });

  // Process feedback to mirror RiskReportModal behavior
  feedbackSnap.forEach(doc => {
    const data = doc.data();
    const rawName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || data.prediction?.farm_name || data.prediction?.input_data?.farm_name || null;
    if (!rawName) return;
    let farmKey = normalizeFarmName(rawName);
    let canonName = legacyMap[farmKey] || null;
    const explicitId = data.farm_id || data.farmId || data.input_data?.farm_id || data.input_data?.farmId || data.prediction?.farm_id || data.prediction?.input_data?.farm_id || null;
    
    // Skip Rojo Hatchery and Freshwater Finfish Farm data
    if (explicitId === 'WgS4mBVnPFPMGq7vfSYa' || 
        rawName === 'Rojo Hatchery' ||
        rawName === 'Freshwater Finfish Farm' ||
        rawName?.toLowerCase().includes('freshwater finfish')) return;
    
    if (explicitId && idToNewName[explicitId]) {
      canonName = idToNewName[explicitId];
      farmKey = normalizeFarmName(canonName);
    }
    const farmName = canonName || rawName;
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

    // Also include individual predictions inside modal_feedback if present (to match RiskReportModal)
    if (Array.isArray(data.predictions)) {
      data.predictions.forEach(pred => {
        const pFarmName = pred.farm_name || pred.farm || pred.input_data?.farm_name || pred.input_data?.farm || farmName;
        const pFarmKey = normalizeFarmName(pFarmName);
        // Skip excluded farms by name
        if (
          pFarmKey === 'rojo-hatchery' || pFarmName === 'Rojo Hatchery' ||
          pFarmKey === 'freshwater-finfish-farm' || pFarmName === 'Freshwater Finfish Farm' ||
          String(pFarmName || '').toLowerCase().includes('freshwater finfish')
        ) return;
        predictions.push({
          id: pred.id || doc.id,
          farm: pFarmName,
          farm_key: pFarmKey,
          fish_pond: pred.input_data?.fish_pond || pred.fish_pond,
          risk_level: normalizeRisk(pred.risk_level),
          confidence: (function(){
            const c = pred.confidence ?? pred.input_data?.confidence;
            const n = Number(c);
            return Number.isFinite(n) ? n : undefined;
          })(),
          // Optional fields used by tooltips/details
          fish_condition: pred.input_data?.fish_condition || pred.fish_condition,
          water_condition: pred.input_data?.water_condition || pred.water_condition,
          weather: pred.input_data?.weather || pred.weather,
          ready_for_harvest: typeof pred.ready_for_harvest === 'boolean' ? pred.ready_for_harvest : (typeof pred.input_data?.ready_for_harvest === 'boolean' ? pred.input_data.ready_for_harvest : undefined),
          conditions_summary: pred.conditions_summary || pred.input_data?.conditions_summary,
          timestamp: pred.timestamp || pred.input_data?.timestamp,
          submitted_timestamp: pred.input_data?.timestamp,
          generated_timestamp: pred.timestamp,
          source: 'modal_feedback_prediction',
        });
      });
    }
  });

  // Ensure transparency by including certain farms even if no reports exist
  // Only add if not already present from prediction data
  const requiredFarms = [
    // No required farms to add
  ];
  requiredFarms.forEach((farmName) => {
    const farmKey = normalizeFarmName(farmName);
    // Check if we already have a similar farm
    const existingFarm = Array.from(allFarms).find(key => 
      key.includes(farmName.toLowerCase().replace(/\s+/g, '-'))
    );
    
    if (!existingFarm) {
      allFarms.add(farmKey);
      if (!farmKeyToName[farmKey]) {
        farmKeyToName[farmKey] = farmName;
      }
    }
  });

  const byFarm = {};
  allFarms.forEach(farmKey => {
    byFarm[farmKey] = {
      farm_name: farmKeyToName[farmKey] || farmKey.replace(/-/g, ' '),
      farm_key: farmKey,
      predictions: [],
      counts: { high: 0, medium: 0, low: 0, normal: 0 },
      overall_risk: 'Low',
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
  const sev = (lvl) => riskSeverityScore(lvl);
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
      // Do not pre-deduplicate here; let UI components (modal/chart) perform
      // per-day, per-pond selection consistently to avoid mismatches.
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
          low:
            (d.low_risk_count || d.low || farm.counts.low) +
            (d.normal_count || d.normal || farm.counts.normal),
          normal: 0,
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
      confidence: p.confidence,
      fish_condition: p.fish_condition,
      water_condition: p.water_condition,
      weather: p.weather,
      ready_for_harvest: p.ready_for_harvest,
      conditions_summary: p.conditions_summary,
      risk_momentum: p.risk_momentum,
      enhanced_analytics: p.enhanced_analytics,
      timestamp: p.timestamp,
      submitted_timestamp: p.submitted_timestamp,
      generated_timestamp: p.generated_timestamp,
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


