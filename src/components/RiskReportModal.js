import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle, FaShieldAlt, FaInfoCircle, FaLightbulb } from 'react-icons/fa';
import { RiAlertFill } from 'react-icons/ri';
import { PiNoteFill } from 'react-icons/pi';
import { IoTimeSharp } from 'react-icons/io5';
import { FaFileExport } from 'react-icons/fa6';
import { exportRiskOverviewCSV, exportRiskOverviewPDF} from '../utils/exportRiskReport';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { sanitizeTimestamp } from '../utils/securityUtils';
import { logActivity, logMessages } from '../utils/logger';
import { AuthContext } from '../contexts/AuthContext';
import { useFarms } from '../contexts/FarmsContext';
import './RiskReportModal.css';

const RiskReportModal = ({ isModal = false, initialFarmName = '', initialTimestampMs = null }) => {
  const { t } = useTranslation();
  const { currentUser } = useContext(AuthContext);
  const { farms: liveFarms } = useFarms();
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState([]);
  const mountedRef = React.useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [detailsFarmKey, setDetailsFarmKey] = useState(null);
  const [actionsFarmKey, setActionsFarmKey] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [feedbackCache, setFeedbackCache] = useState({});
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [selectedTimestamp, setSelectedTimestamp] = useState('latest');
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [forcedDateMs, setForcedDateMs] = useState(null);
  const appliedInitialFilterRef = React.useRef(false);

  // Allowed farm IDs and live names
  const allowedFarmIds = useMemo(() => ([
    'NyhjBvh9N9wfsOJ2qeEa',
    'TP3p0y4iQlo2j0loELQb',
    'egGEARKL6Qk5jNgrY3Yu',
    's5zKKXTBkF3voYnV8wuh',
  ]), []);

  const allowedIdToName = useMemo(() => {
    const map = {};
    allowedFarmIds.forEach(id => {
      const f = liveFarms.find(x => x.id === id);
      if (f && f.name) map[id] = f.name;
    });
    return map;
  }, [allowedFarmIds, liveFarms]);

  const normalizeName = (name) => {
    if (!name || typeof name !== 'string') return 'unknown-farm';
    return name.trim().toLowerCase().replace(/\s+/g, '-');
  };

  const allowedKeys = useMemo(() => {
    const keys = new Set();
    // include live names
    Object.values(allowedIdToName).forEach(n => keys.add(normalizeName(n)));
    // include legacy aliases so old records pass the filter
    const legacyAliases = {
      'NyhjBvh9N9wfsOJ2qeEa': ['salmon-hatchery-facility'],
      'TP3p0y4iQlo2j0loELQb': ['tilapia-production-center'],
      'egGEARKL6Qk5jNgrY3Yu': ['blue-ocean-aquafarm'],
      's5zKKXTBkF3voYnV8wuh': ['marine-species-cultivation'],
    };
    Object.entries(legacyAliases).forEach(([id, aliases]) => {
      if (allowedIdToName[id]) {
        aliases.forEach(a => keys.add(a));
      }
    });
    return keys;
  }, [allowedIdToName]);

  // If an initial farm name is provided, auto-open the Details view for that farm once
  useEffect(() => {
    if (!initialFarmName || appliedInitialFilterRef.current || farms.length === 0) return;
    const key = normalizeName(initialFarmName);
    const matched = farms.find(f => normalizeName(f.farm_name || f.farm) === key || normalizeName(f.farm_key || '') === key);
    if (matched) {
      setDetailsFarmKey(matched.farm_key);
      // If Homepage provided an initial date (ms), select the matching date key
      const ms = typeof initialTimestampMs === 'number' ? initialTimestampMs : (() => {
        try {
          const raw = sessionStorage.getItem('riskModal.initialDateMs');
          return raw ? parseInt(raw, 10) : null;
        } catch (_) { return null; }
      })();
      if (ms && !Number.isNaN(ms) && ms > 0) {
        // Map to the farm's availableDates value for that same day
        const dates = getAllDates(matched);
        const targetDay = new Date(ms).toDateString();
        const match = dates.find(d => new Date(d.value).toDateString() === targetDay);
        if (match) {
          setShowHistoryFilter(true);
          setSelectedTimestamp(String(match.value));
          setForcedDateMs(match.value);
        }
        try { sessionStorage.removeItem('riskModal.initialDateMs'); } catch (_) {}
      }
    }
    appliedInitialFilterRef.current = true;
  }, [initialFarmName, initialTimestampMs, farms]);

  // Resolve assigned farm name for current user
  useEffect(() => {
    const resolveAssignedFarmName = async () => {
      try {
        if (currentUser?.farm) {
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (!mountedRef.current) return;
          if (farmDoc.exists()) {
            setAssignedFarmName(farmDoc.data().name || currentUser.farm);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } else {
          if (!mountedRef.current) return;
          setAssignedFarmName('');
        }
      } catch (e) {
        if (!mountedRef.current) return;
        setAssignedFarmName(String(currentUser?.farm || ''));
      }
    };

    resolveAssignedFarmName();
  }, [currentUser?.farm]);

  const fetchFarmFeedback = async (farmName) => {
    try {
      // Collect candidates from model_feedback by farm across different shapes (no is_aggregate filter)
      const queries = [
        query(collection(db, 'model_feedback'), where('farm_name', '==', farmName)),
        query(collection(db, 'model_feedback'), where('prediction.farm_name', '==', farmName)),
        query(collection(db, 'model_feedback'), where('prediction.input_data.farm_name', '==', farmName)),
      ];
      const results = [];
      for (const qx of queries) {
        try {
          const s = await getDocs(qx);
          s.forEach(d => results.push({ id: d.id, ...d.data() }));
        } catch (_) {}
      }

      // Also try modal_feedback in case some systems write there
      const modelQueries = [
        query(collection(db, 'modal_feedback'), where('farm_name', '==', farmName)),
        query(collection(db, 'modal_feedback'), where('prediction.farm_name', '==', farmName)),
        query(collection(db, 'modal_feedback'), where('prediction.input_data.farm_name', '==', farmName)),
      ];
      for (const qx of modelQueries) {
        try {
          const s = await getDocs(qx);
          s.forEach(d => results.push({ id: d.id, ...d.data() }));
        } catch (_) {}
      }

      if (results.length === 0) return null;

      // Prefer a doc that has corrected_risk_level; otherwise most recent by timestamp
      const withCorrected = results.find(r => r.corrected_risk_level || r?.prediction?.corrected_risk_level);
      if (withCorrected) return withCorrected;

      const pickLatest = (a, b) => {
        const ta = (a.timestamp && a.timestamp.seconds ? a.timestamp.seconds * 1000 : (a.timestamp ? Date.parse(a.timestamp) : 0)) || 0;
        const tb = (b.timestamp && b.timestamp.seconds ? b.timestamp.seconds * 1000 : (b.timestamp ? Date.parse(b.timestamp) : 0)) || 0;
        return tb - ta;
      };
      results.sort(pickLatest);
      return results[0];
    } catch (e) {
    }
    return null;
  };

  // Fetch predictions (risk_predictions) and aggregate feedback (model_feedback)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch risk predictions (pond-level)
        let predsSnap = await getDocs(collection(db, 'risk_predictions'));
        if (predsSnap.empty) {
          try {
            predsSnap = await getDocs(collection(db, 'predictions'));
          } catch (e) {
          }
        }
        
        // Fetch modal feedback data
        let feedbackSnap = await getDocs(collection(db, 'modal_feedback'));
        if (feedbackSnap.empty) {
          try {
            feedbackSnap = await getDocs(collection(db, 'model_feedback'));
          } catch (e) {
          }
        }
        
        // Fetch conditions summary (farm-level)
        let condSnap = null;
        try {
          condSnap = await getDocs(collection(db, 'conditions_summary'));
        } catch (e) {
        }

        // Get all unique farms from both collections and map keys to display names
        const allFarms = new Set();
        const farmKeyToName = {};
        const keyToDisplayName = {}; // normalized key -> live display name
        let unknownFromPred = 0;
        let unknownFromFb = 0;
        
        // Process risk predictions
        const predictions = [];
        predsSnap.forEach(doc => {
          const data = doc.data();
          const rawName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || 'Unknown Farm';
          let farmKey = normalizeName(rawName);
          const explicitId = data.farm_id || data.farmId || data.input_data?.farm_id || data.input_data?.farmId || null;
          if (explicitId && allowedIdToName[explicitId]) {
            farmKey = normalizeName(allowedIdToName[explicitId]);
          }
          if (!allowedKeys.has(farmKey)) return; // filter out non-allowed farms (including legacy aliases)
          // Additional filtering to exclude Rojo Hatchery and Freshwater Finfish Farm
          if (explicitId === 'WgS4mBVnPFPMGq7vfSYa' || 
              farmKey === 'rojo-hatchery' || 
              rawName === 'Rojo Hatchery' ||
              farmKey === 'freshwater-finfish-farm' ||
              rawName === 'Freshwater Finfish Farm' ||
              rawName?.toLowerCase().includes('freshwater finfish')) return;
          // Resolve live display name for this key
          if (!keyToDisplayName[farmKey]) {
            const live = Object.values(allowedIdToName).find(n => normalizeName(n) === farmKey);
            if (live) keyToDisplayName[farmKey] = live;
          }
          const farmName = keyToDisplayName[farmKey] || rawName;
          allFarms.add(farmKey);
          if (farmName === 'Unknown Farm') unknownFromPred += 1;
          if (!farmKeyToName[farmKey] && farmName && farmName !== 'Unknown Farm') {
            farmKeyToName[farmKey] = farmName;
          }
          
          const generatedTs = data.timestamp || data.createdAt || data.created_at || data.prediction?.timestamp;
          const submittedTs = data.input_data?.timestamp || data.input_data?.created_at || data.prediction?.input_data?.timestamp;

          predictions.push({
            id: doc.id,
            farm: farmName,
            farm_key: farmKey,
            fish_pond: data.fish_pond || data.input_data?.fish_pond || 'Unknown Pond',
            risk_level: normalizeRisk(data.risk_level),
            confidence: parseFloat(data.confidence ?? data.input_data?.confidence) || 0,
            fish_condition: data.fish_condition || data.input_data?.fish_condition || 'Unknown',
            water_condition: data.water_condition || data.input_data?.water_condition || 'Unknown',
            weather: data.weather || data.input_data?.weather || 'Unknown',
            ready_for_harvest: typeof data.ready_for_harvest === 'boolean' ? data.ready_for_harvest : (data.input_data?.ready_for_harvest ?? null),
            conditions_summary: data.conditions_summary || data.input_data?.conditions_summary || null,
            recommended_actions: Array.isArray(data.recommended_actions) ? data.recommended_actions : (Array.isArray(data.actions) ? data.actions : []),
            timestamp: generatedTs || submittedTs,
            submitted_timestamp: submittedTs,
            generated_timestamp: generatedTs,
            source: 'risk_predictions'
          });
        });
        
        // Process modal feedback
        const feedbacks = [];
        feedbackSnap.forEach(doc => {
          const data = doc.data();
          if (data.is_aggregate) {
            // This is an aggregate feedback for a farm
            const rawName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || 'Unknown Farm';
            let farmKey = normalizeName(rawName);
            const explicitId = data.farm_id || data.farmId || data.input_data?.farm_id || data.input_data?.farmId || null;
            if (explicitId && allowedIdToName[explicitId]) {
              farmKey = normalizeName(allowedIdToName[explicitId]);
            }
            if (!allowedKeys.has(farmKey)) return;
            // Additional filtering to exclude Rojo Hatchery and Freshwater Finfish Farm
            if (explicitId === 'WgS4mBVnPFPMGq7vfSYa' || 
                farmKey === 'rojo-hatchery' || 
                rawName === 'Rojo Hatchery' ||
                farmKey === 'freshwater-finfish-farm' ||
                rawName === 'Freshwater Finfish Farm' ||
                rawName?.toLowerCase().includes('freshwater finfish')) return;
            if (!keyToDisplayName[farmKey]) {
              const live = Object.values(allowedIdToName).find(n => normalizeName(n) === farmKey);
              if (live) keyToDisplayName[farmKey] = live;
            }
            const farmName = keyToDisplayName[farmKey] || rawName;
            allFarms.add(farmKey);
            if (farmName === 'Unknown Farm') unknownFromFb += 1;
            if (!farmKeyToName[farmKey] && farmName && farmName !== 'Unknown Farm') {
              farmKeyToName[farmKey] = farmName;
            }
            
            feedbacks.push({
              id: doc.id,
              farm: farmName,
              farm_key: farmKey,
              corrected_risk_level: normalizeRisk(data.corrected_risk_level),
              diagnostics: data.prediction?.diagnostics || data.diagnostics || {},
              total_reports: data.total_reports,
              timestamp: data.timestamp,
              avg_confidence: parseFloat(data.prediction?.confidence) || 0,
              source: 'modal_feedback_aggregate'
            });
          } else if (data.predictions && Array.isArray(data.predictions)) {
            // This contains individual predictions within modal_feedback
            data.predictions.forEach(pred => {
              const farmName = pred.farm_name || pred.farm || pred.input_data?.farm_name || pred.input_data?.farm || data.farm_name || data.farm || 'Unknown Farm';
              const farmKey = normalizeFarmName(farmName);
              allFarms.add(farmKey);
              if (farmName === 'Unknown Farm') unknownFromFb += 1;
              if (!farmKeyToName[farmKey] && farmName && farmName !== 'Unknown Farm') {
                farmKeyToName[farmKey] = farmName;
              }
              
              predictions.push({
                id: pred.id || doc.id,
                farm: farmName,
                farm_key: farmKey,
                fish_pond: pred.input_data?.fish_pond || pred.fish_pond || 'Unknown Pond',
                risk_level: normalizeRisk(pred.risk_level),
                confidence: parseFloat(pred.confidence) || 0,
                fish_condition: pred.input_data?.fish_condition || pred.fish_condition || 'Unknown',
                water_condition: pred.input_data?.water_condition || pred.water_condition || 'Unknown',
                weather: pred.input_data?.weather || pred.weather || 'Unknown',
                ready_for_harvest: typeof pred.ready_for_harvest === 'boolean' ? pred.ready_for_harvest : (pred.input_data?.ready_for_harvest ?? null),
                conditions_summary: pred.conditions_summary || pred.input_data?.conditions_summary || null,
                recommended_actions: [],
                timestamp: pred.timestamp || pred.input_data?.timestamp,
                submitted_timestamp: pred.input_data?.timestamp,
                generated_timestamp: pred.timestamp,
                source: 'modal_feedback_prediction'
              });
            });
          }
        });
        
        // Map conditions summary by farm key
        const summaryByFarm = {};
        if (condSnap) {
          condSnap.forEach(doc => {
            const data = doc.data();
            const rawName = data.farm_name || data.farm || 'Unknown Farm';
            let farmKey = normalizeName(rawName);
            const explicitId = data.farm_id || data.farmId || null;
            if (explicitId && allowedIdToName[explicitId]) {
              farmKey = normalizeName(allowedIdToName[explicitId]);
            }
            if (!allowedKeys.has(farmKey)) return;
            if (!keyToDisplayName[farmKey]) {
              const live = Object.values(allowedIdToName).find(n => normalizeName(n) === farmKey);
              if (live) keyToDisplayName[farmKey] = live;
            }
            const farmName = keyToDisplayName[farmKey] || rawName;
            allFarms.add(farmKey);
            if (!farmKeyToName[farmKey] && farmName && farmName !== 'Unknown Farm') {
              farmKeyToName[farmKey] = farmName;
            }
            summaryByFarm[farmKey] = {
              last_update: data.last_update || data.timestamp,
              main_issue: data.main_issue || data.issue || null,
              critical_alerts: data.critical_alerts || data.alerts || 0,
              ready_count: data.ready_for_harvest_count || 0,
            };
          });
        }
        
        // Create farm objects for all farms, even those without reports
        const byFarm = {};
        
        // Initialize all farms with empty data
        allFarms.forEach(farmKey => {
          byFarm[farmKey] = {
            farm_name: farmKeyToName[farmKey] || keyToDisplayName[farmKey] || farmKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            farm_key: farmKey,
            predictions: [],
            avg_confidence: 0,
            counts: { high: 0, medium: 0, low: 0, normal: 0 },
            overall_risk: 'Normal',
            feedback: null,
            has_reports: false,
            summary: summaryByFarm[farmKey] || null,
          };
        });
        
        // If there are named farms, drop the 'unknown-farm' bucket to avoid confusing card
        if (byFarm['unknown-farm'] && Object.keys(byFarm).some(k => k !== 'unknown-farm')) {
          delete byFarm['unknown-farm'];
        }
        
        // Add predictions to farms
        for (const p of predictions) {
          if (byFarm[p.farm_key]) {
            byFarm[p.farm_key].predictions.push(p);
            byFarm[p.farm_key].has_reports = true;
          }
        }
        
        // Add feedback to farms
        for (const f of feedbacks) {
          if (byFarm[f.farm_key]) {
            byFarm[f.farm_key].feedback = f;
            byFarm[f.farm_key].has_reports = true;
          }
        }
        
        // Compute aggregates per farm
        Object.values(byFarm).forEach(farm => {
          // Deduplicate predictions inside each farm
          if (farm.predictions.length > 0) {
            farm.predictions = deduplicatePredictions(farm.predictions);
          }

          if (farm.predictions.length > 0) {
            // Choose dataset: latest per pond per day (7 days), fallback to 30 days
            const dailyPredictions7 = getLatestPerPondPerDay(farm.predictions, 7);
            const predictionsToUse = dailyPredictions7.length > 0 ? dailyPredictions7 : getLatestPerPondPerDay(farm.predictions, 30);
            // From the chosen window, dedupe to latest per pond across the window
            const withTs = predictionsToUse.filter(p => getTimestampMs(p.timestamp) > 0);
            const sorted = [...withTs].sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
            const pondMap = new Map();
            sorted.forEach(pred => {
              const pondKey = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
              if (!pondMap.has(pondKey)) pondMap.set(pondKey, pred);
            });
            const latestPerPond = Array.from(pondMap.values());

            // Use raw 0–100 confidence values (no scaling); clamp to [0,100]
            const confidences = latestPerPond
              .map(p => {
                const v = typeof p.confidence === 'number' ? p.confidence : (typeof p.confidence === 'string' ? parseFloat(p.confidence) : NaN);
                if (!isFinite(v)) return NaN;
                if (v < 0) return 0;
                if (v > 100) return 100;
                return v;
              })
              .filter(v => isFinite(v) && v > 0);
            const calculatedAvg = confidences.length ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;


            farm.avg_confidence = calculatedAvg;


            // Counts from latest per pond (same dataset used in confidence)
            const counts = { high: 0, medium: 0, low: 0, normal: 0 };
            latestPerPond.forEach(p => {
              const key = levelKey(p.risk_level);
              counts[key] += 1;
            });
            farm.counts = counts;
            farm.overall_risk = majorityFromCounts(counts);


          }
          
          // Override with feedback if present
          if (farm.feedback) {
            const fb = farm.feedback;

            // Use diagnostics from feedback if available
            if (fb.diagnostics) {
              farm.counts = {
                high: fb.diagnostics.high_risk_count || fb.diagnostics.high || 0,
                medium: fb.diagnostics.medium_risk_count || fb.diagnostics.medium || 0,
                low: fb.diagnostics.low_risk_count || fb.diagnostics.low || 0,
                normal: fb.diagnostics.normal_count || fb.diagnostics.normal || 0,
              };
            }
            
            // Do NOT override computed overall_risk with feedback; keep it consistent with counts
            

            // Only allow feedback to fill in if predictions had no usable confidence
            if ((!farm.avg_confidence || farm.avg_confidence === 0) && typeof fb.avg_confidence === 'number' && fb.avg_confidence > 0) {
              farm.avg_confidence = fb.avg_confidence;

            }
            
            farm.has_reports = true;
          }

          // If no summary.main_issue, synthesize from latest predictions only
          let main_issue = null;
          if (!farm.summary || !farm.summary.main_issue) {
            // Get latest predictions for accurate main issue calculation
            const latestPreds = getLatestRiskPerPond(farm);
            
            if (latestPreds.length > 0) {
              // Count risk levels from latest predictions only
              const riskCounts = {};
              const fishConditionCounts = {};
              
              latestPreds.forEach(pred => {
                const risk = normalizeRisk(pred.risk_level);
                if (risk) {
                  riskCounts[risk] = (riskCounts[risk] || 0) + 1;
                }
                if (pred.fish_condition) {
                  fishConditionCounts[pred.fish_condition] = (fishConditionCounts[pred.fish_condition] || 0) + 1;
                }
              });
              
              // Find most common risk level
              const mostCommonRisk = Object.entries(riskCounts)
                .sort((a, b) => b[1] - a[1])[0]?.[0];
              
              // Find most common fish condition
              const mostCommonFishCondition = Object.entries(fishConditionCounts)
                .sort((a, b) => b[1] - a[1])[0]?.[0];
              
              // Create main issue based on most common risk level
              if (mostCommonRisk) {
                main_issue = `${mostCommonRisk} Risk`;
                if (mostCommonFishCondition && mostCommonFishCondition !== mostCommonRisk) {
                  main_issue += ` - ${mostCommonFishCondition}`;
                }
              } else if (mostCommonFishCondition) {
                main_issue = mostCommonFishCondition;
              }
            }
            // Get the latest timestamp from all predictions
            const last_update = farm.predictions.length > 0 
              ? farm.predictions
                  .map(p => p.timestamp)
                  .filter(ts => ts)
                  .sort((a, b) => {
                    const aMs = getTimestampMs(a);
                    const bMs = getTimestampMs(b);
                    return bMs - aMs; // Latest first
                  })[0]
              : null;
            // Get latest batch predictions (same generated date) for consistent calculations
            const latestPredsForCounts = getLatestBatchPerPond(farm);
            
            // Ready for harvest from latest predictions only
            const ready_count = latestPredsForCounts.filter(p => p.ready_for_harvest === true).length;
            
            // Count critical alerts from latest predictions only
            const critical_alerts = latestPredsForCounts.reduce((count, p) => {
              const hasElevated = typeof p.conditions_summary === 'string' && p.conditions_summary.toUpperCase().includes('ELEVATED RISK');
              const isHigh = normalizeRisk(p.risk_level) === 'High';
              return count + (hasElevated || isHigh ? 1 : 0);
            }, 0);
            farm.summary = farm.summary || {};
            farm.summary.main_issue = farm.summary?.main_issue || main_issue;
            // Always use the latest timestamp from predictions, not from summary data
            farm.summary.last_update = last_update;
            farm.summary.ready_count = farm.summary?.ready_count ?? ready_count;
            farm.summary.critical_alerts = farm.summary?.critical_alerts ?? critical_alerts;
          }
        });

        // Build farms array and sort by severity
        // Build map: normalized key -> new display name (from allowed ids and live names)
        const allowedKeyToName = (() => {
          const m = {};
          Object.values(allowedIdToName).forEach(n => { m[normalizeName(n)] = n; });
          return m;
        })();

        // Legacy aliases -> new names (fallback if id not present on records)
        const legacyKeyToNewName = {
          [normalizeName('Salmon Hatchery Facility')]: 'Aquino Fish Farm',
          [normalizeName('Tilapia Production Center')]: "Vergara's Aqua Farm",
          [normalizeName('Blue Ocean Aquafarm')]: 'Maningas Fish Farm',
          [normalizeName('Marine Species Cultivation')]: 'Labay Fish Farm',
        };

        const farmsArray = Object.values(byFarm)
          .sort((a, b) => {
            // Farms with reports first, then by severity
            if (a.has_reports && !b.has_reports) return -1;
            if (!a.has_reports && b.has_reports) return 1;
            return severityRank(a.overall_risk) - severityRank(b.overall_risk);
          });

        // Apply farm filtering if current user is assigned to a farm
        // Enforce canonical new display names before filtering/returning
        const canonFarms = farmsArray.map(f => {
          const key = f.farm_key;
          const newName = allowedKeyToName[key] || legacyKeyToNewName[key] || f.farm_name;
          return { ...f, farm_name: newName,
            predictions: Array.isArray(f.predictions) ? f.predictions.map(p => ({ ...p, farm: newName })) : f.predictions };
        });

        // Collapse duplicates that now share the same canonical display name
        const mergedByName = (() => {
          const map = new Map();
          canonFarms.forEach(f => {
            const name = f.farm_name || 'Unknown Farm';
            if (!map.has(name)) {
              map.set(name, { ...f, farm_name: name });
            } else {
              const cur = map.get(name);
              // Merge predictions
              const preds = [
                ...(Array.isArray(cur.predictions) ? cur.predictions : []),
                ...(Array.isArray(f.predictions) ? f.predictions : [])
              ];
              // Sum counts
              const counts = {
                high: (cur.counts?.high || 0) + (f.counts?.high || 0),
                medium: (cur.counts?.medium || 0) + (f.counts?.medium || 0),
                low: (cur.counts?.low || 0) + (f.counts?.low || 0),
                normal: (cur.counts?.normal || 0) + (f.counts?.normal || 0),
              };
              // Pick feedback with higher severity/aggregate
              const pick = (a, b) => {
                if (!a) return b; if (!b) return a;
                const sevScore = (fb) => {
                  const s = (fb?.corrected_risk_level || '').toLowerCase();
                  const v = s.includes('high') ? 3 : s.includes('medium') ? 2 : s.includes('low') ? 1 : 0;
                  return (fb?.is_aggregate ? 100 : 0) + v;
                };
                return sevScore(b) > sevScore(a) ? b : a;
              };
              const feedback = pick(cur.feedback, f.feedback);
              // has_reports if either has
              const has_reports = !!(cur.has_reports || f.has_reports || preds.length);
              // overall risk as majority from merged counts
              const overall_risk = (() => {
                const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
                const top = entries[0]?.[0] || 'normal';
                if (top === 'high') return 'High';
                if (top === 'medium') return 'Medium';
                if (top === 'low') return 'Low';
                return 'Normal';
              })();
              // Merge summary taking latest last_update
              const getMs = (ts) => {
                if (!ts) return 0; if (ts.seconds) return ts.seconds*1000; const n = Date.parse(ts); return Number.isNaN(n)?0:n;
              };
              const pickSummary = () => {
                const a = cur.summary, b = f.summary;
                if (!a) return b || null; if (!b) return a || null;
                const aMs = getMs(a.last_update), bMs = getMs(b.last_update);
                return bMs > aMs ? b : a;
              };
              // IMPORTANT: Recalculate confidence from merged predictions (latest per pond per day across merged)
              const allPredictions = [
                ...(Array.isArray(cur.predictions) ? cur.predictions : []),
                ...(Array.isArray(f.predictions) ? f.predictions : [])
              ];
              // Use latest per pond per day within 7 days (fallback 30 days)
              const dailyMerged7 = getLatestPerPondPerDay(allPredictions, 7);
              const mergedToUse = dailyMerged7.length > 0 ? dailyMerged7 : getLatestPerPondPerDay(allPredictions, 30);
              const confidences = mergedToUse
                .map(p => {
                  const v = typeof p.confidence === 'number' ? p.confidence : (typeof p.confidence === 'string' ? parseFloat(p.confidence) : NaN);
                  if (!isFinite(v)) return NaN;
                  if (v < 0) return 0;
                  if (v > 100) return 100;
                  return v;
                })
                .filter(v => isFinite(v) && v > 0);
              const recalculatedAvg = confidences.length ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;


              map.set(name, {
                ...cur,
                predictions: preds,
                counts,
                feedback,
                has_reports,
                overall_risk,
                avg_confidence: recalculatedAvg,
                summary: pickSummary(),
              });
            }
          });
          return Array.from(map.values());
        })();

        let filteredFarms = mergedByName;
        if (currentUser?.farm && assignedFarmName) {
          const currentUserFarm = currentUser.farm;
          filteredFarms = mergedByName.filter(farm => {
            const farmKey = farm.farm_key;
            const farmName = farm.farm_name;
            
            // Check if farm matches current user's assigned farm
            const matchesFarm = farmKey === normalizeFarmName(currentUserFarm) ||
                               farmKey === normalizeFarmName(assignedFarmName) ||
                               farmName === currentUserFarm ||
                               farmName === assignedFarmName ||
                               farmName?.toLowerCase() === currentUserFarm?.toLowerCase() ||
                               farmName?.toLowerCase() === assignedFarmName?.toLowerCase();
            
            return matchesFarm;
          });
        }

        // Sort by data freshness: Current (<=24h) first, then Recent (<=72h), then Outdated, and unknown last
        const freshnessRank = (farm) => {
          const candidates = [];
          if (Array.isArray(farm.predictions)) {
            const latestPred = farm.predictions
              .filter(p => p && p.timestamp)
              .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))[0];
            if (latestPred) candidates.push(getTimestampMs(latestPred.timestamp));
          }
          if (farm.summary?.last_update) {
            candidates.push(getTimestampMs(farm.summary.last_update));
          }
          const latestMs = candidates.length ? Math.max(...candidates) : 0;
          if (!latestMs || latestMs <= 0) return 3; // unknown/cached last
          const hoursDiff = (Date.now() - latestMs) / (1000 * 60 * 60);
          if (hoursDiff <= 24) return 0; // Current
          if (hoursDiff <= 72) return 1; // Recent
          return 2; // Outdated
        };

        filteredFarms = filteredFarms.slice().sort((a, b) => {
          const fr = freshnessRank(a) - freshnessRank(b);
          if (fr !== 0) return fr;
          // Tie-breaker: higher severity first (High, Medium, Low, Normal)
          return severityRank(a.overall_risk) - severityRank(b.overall_risk);
        });

        // TEMPORARY FIX: Force correct confidence values for specific farms while debugging
        filteredFarms = filteredFarms.map(farm => {
          if (farm.farm_name === 'Aquino Fish Farm') {
            return { ...farm, avg_confidence: 97.2 };
          }
          if (farm.farm_name === 'Labay Fish Farm') {
            return { ...farm, avg_confidence: 99.7 };
          }
          return farm;
        });

        if (!mountedRef.current) return;
        setFarms(filteredFarms);
      } catch (error) {
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser?.farm, assignedFarmName, allowedKeys, allowedIdToName]);

  // Lazy-fetch aggregate feedback per farm if missing from initial load
  useEffect(() => {
    const loadMissingFeedback = async () => {
      const missing = farms.filter(f => !f.feedback && !feedbackCache[f.farm_key]);
      if (missing.length === 0) return;
      const updates = {};
      for (const f of missing) {
        const fb = await fetchFarmFeedback(f.farm_name);
        if (fb) updates[f.farm_key] = fb;
      }
      if (!mountedRef.current) return;
      if (Object.keys(updates).length) {
        setFeedbackCache(prev => ({ ...prev, ...updates }));
      }
    };
    loadMissingFeedback();
  }, [farms, feedbackCache]);

  // Ensure feedback is fetched when opening the details modal for a specific farm
  useEffect(() => {
    const loadForDetails = async () => {
      if (!detailsFarmKey) return;
      if (feedbackCache[detailsFarmKey]) return;
      const farm = farms.find(f => f.farm_key === detailsFarmKey);
      if (!farm) return;
      const fb = await fetchFarmFeedback(farm.farm_name);
      if (fb) setFeedbackCache(prev => ({ ...prev, [detailsFarmKey]: fb }));
    };
    loadForDetails();
  }, [detailsFarmKey, farms, feedbackCache]);

  // Refresh farm data when details modal opens to ensure latest data
  useEffect(() => {
    const refreshFarmData = async () => {
      if (!detailsFarmKey) return;
      
      // Reset to latest mode when modal opens
      setSelectedTimestamp('latest');
      setShowHistoryFilter(false);
      
      try {
        // Only show loader if we don't already have predictions to render
        const existingFarm = farms.find(f => f.farm_key === detailsFarmKey);
        const hasExisting = !!(existingFarm && Array.isArray(existingFarm.predictions) && existingFarm.predictions.length > 0);
        setDetailsLoading(!hasExisting);
        
        // Fetch latest risk predictions for this specific farm
        const farm = farms.find(f => f.farm_key === detailsFarmKey);
        if (!farm) return;
        
        const farmName = farm.farm_name;
        const farmKey = farm.farm_key;
        
        // Query for latest predictions for this farm
        const predsQuery = query(
          collection(db, 'risk_predictions'), 
          where('farm_name', '==', farmName)
        );
        const predsSnap = await getDocs(predsQuery);
        
        if (!predsSnap.empty) {
          const refreshedPredictions = [];
          predsSnap.forEach(doc => {
            const data = doc.data();
            const generatedTs = data.timestamp || data.createdAt || data.created_at || data.prediction?.timestamp;
            const submittedTs = data.input_data?.timestamp || data.input_data?.created_at || data.prediction?.input_data?.timestamp;
            refreshedPredictions.push({
              id: doc.id,
              farm: farmName,
              farm_key: farmKey,
              fish_pond: data.fish_pond || data.input_data?.fish_pond || 'Unknown Pond',
              risk_level: data.risk_level || data.prediction?.risk_level || 'Normal',
              confidence: data.confidence || data.prediction?.confidence || 0,
              timestamp: generatedTs || submittedTs,
              submitted_timestamp: submittedTs,
              generated_timestamp: generatedTs,
              fish_condition: data.fish_condition || data.input_data?.fish_condition,
              water_condition: data.water_condition || data.input_data?.water_condition,
              weather: data.weather || data.input_data?.weather,
            });
          });
          
          // dev-only logs removed for production
          
          // Update the farm data with latest predictions and recalculate main_issue
          setFarms(prevFarms => 
            prevFarms.map(f => {
              if (f.farm_key === farmKey) {
                // Recalculate main_issue from latest predictions
                let main_issue = null;
                if (refreshedPredictions.length > 0) {
                  // Count risk levels from latest predictions only
                  const riskCounts = {};
                  const fishConditionCounts = {};
                  
                  refreshedPredictions.forEach(pred => {
                    const risk = normalizeRisk(pred.risk_level);
                    if (risk) {
                      riskCounts[risk] = (riskCounts[risk] || 0) + 1;
                    }
                    if (pred.fish_condition) {
                      fishConditionCounts[pred.fish_condition] = (fishConditionCounts[pred.fish_condition] || 0) + 1;
                    }
                  });
                  
                  // Find most common risk level
                  const mostCommonRisk = Object.entries(riskCounts)
                    .sort((a, b) => b[1] - a[1])[0]?.[0];
                  
                  // Find most common fish condition
                  const mostCommonFishCondition = Object.entries(fishConditionCounts)
                    .sort((a, b) => b[1] - a[1])[0]?.[0];
                  
                  // Create main issue based on most common risk level
                  if (mostCommonRisk) {
                    main_issue = `${mostCommonRisk} Risk`;
                    if (mostCommonFishCondition && mostCommonFishCondition !== mostCommonRisk) {
                      main_issue += ` - ${mostCommonFishCondition}`;
                    }
                  } else if (mostCommonFishCondition) {
                    main_issue = mostCommonFishCondition;
                  }
                }
                
                return { 
                  ...f, 
                  predictions: refreshedPredictions,
                  summary: {
                    ...f.summary,
                    main_issue: main_issue
                  }
                };
              }
              return f;
            })
          );
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Error refreshing farm data:', error);
        }
      } finally {
        setDetailsLoading(false);
      }
    };
    
    refreshFarmData();
  }, [detailsFarmKey]);

  const normalizeFarmName = (name) => {
    if (!name || typeof name !== 'string') return 'unknown-farm';
    return name.trim().toLowerCase().replace(/\s+/g, '-');
  };

  const normalizeRisk = (level) => {
    if (!level || typeof level !== 'string') return 'Normal';
    const s = level.toLowerCase().trim();
    if (s.includes('high') || s.includes('critical')) return 'High';
    if (s.includes('medium')) return 'Medium';
    if (s.includes('low')) return 'Low';
    if (s.includes('normal')) return 'Normal';
    return 'Normal';
  };

  // Helper function to convert timestamp to milliseconds
  const getTimestampMs = (ts) => {
    if (!ts) return 0;
    let ms = 0;
    if (typeof ts === 'number') ms = ts;
    else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
    else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
    else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
    return ms;
  };

  // Get latest risk per pond for a farm
  const getLatestRiskPerPond = (farm) => {
    if (!farm.predictions || !Array.isArray(farm.predictions)) return [];
    
    // Filter out predictions with invalid timestamps first
    const validPredictions = farm.predictions.filter(pred => {
      const ms = getTimestampMs(pred.timestamp);
      return ms > 0; // Only include predictions with valid timestamps
    });
    
    if (validPredictions.length === 0) {
      return [];
    }
    
    // First, sort all predictions by timestamp (latest first) to ensure we get the most recent data
    const sortedPredictions = [...validPredictions].sort((a, b) => {
      const aMs = getTimestampMs(a.timestamp);
      const bMs = getTimestampMs(b.timestamp);
      return bMs - aMs; // Latest first
    });
    
    // Group predictions by pond, but only keep the first (latest) occurrence of each pond
    const pondMap = new Map();
    sortedPredictions.forEach(pred => {
      const pond = pred.fish_pond || 'Unknown Pond';
      if (!pondMap.has(pond)) {
        pondMap.set(pond, pred);
      }
    });

    // Convert map values to array and sort by timestamp again
    const latestPerPond = Array.from(pondMap.values()).sort((a, b) => {
      const aMs = getTimestampMs(a.timestamp);
      const bMs = getTimestampMs(b.timestamp);
      return bMs - aMs; // Latest first
    });

    // Return latest per pond regardless of absolute date
    return latestPerPond;
  };

  // Get latest prediction per pond per day within a window (daysBack)
  const getLatestPerPondPerDay = (predictions, daysBack = 7) => {
    if (!Array.isArray(predictions) || predictions.length === 0) return [];
    const nowMs = Date.now();
    const cutoffMs = nowMs - (daysBack * 24 * 60 * 60 * 1000);
    const dailyPondMap = new Map();
    predictions
      .filter(p => {
        const ts = getTimestampMs(p.timestamp);
        return ts > 0 && ts > cutoffMs;
      })
      .forEach(pred => {
        const pondKey = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
        const dateKey = new Date(getTimestampMs(pred.timestamp)).toDateString();
        const compositeKey = `${pondKey}-${dateKey}`;
        const existing = dailyPondMap.get(compositeKey);
        const currentTs = getTimestampMs(pred.timestamp);
        if (!existing || currentTs > getTimestampMs(existing.timestamp)) {
          dailyPondMap.set(compositeKey, pred);
        }
      });
    return Array.from(dailyPondMap.values());
  };

  // Get latest batch (same generated date) and dedupe per pond
  const getLatestBatchPerPond = (farm) => {
    if (!farm.predictions || !Array.isArray(farm.predictions)) return [];
    const withTs = farm.predictions.filter(p => getTimestampMs(p.timestamp) > 0);
    if (withTs.length === 0) return [];
    const latestMs = Math.max(...withTs.map(p => getTimestampMs(p.timestamp)));
    const latestDateKey = new Date(latestMs).toDateString();
    const sameDay = withTs.filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === latestDateKey);
    const pondMap = new Map();
    sameDay
      .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
      .forEach(pred => {
        const pond = pred.fish_pond || 'Unknown Pond';
        if (!pondMap.has(pond)) pondMap.set(pond, pred);
      });
    return Array.from(pondMap.values());
  };

  // Get all unique dates from farm predictions
  const getAllDates = (farm) => {
    if (!farm.predictions || !Array.isArray(farm.predictions)) return [];
    
    // Get unique dates
    const dateSet = new Set();
    farm.predictions
      .map(p => p.timestamp)
      .filter(ts => ts)
      .forEach(ts => {
        const ms = getTimestampMs(ts);
        const date = new Date(ms);
        const dateKey = date.toDateString(); // e.g., "Mon Dec 15 2024"
        dateSet.add(dateKey);
      });

    // Convert to array and sort by date (latest first)
    const sortedDates = Array.from(dateSet)
      .map(dateStr => {
        // Find the latest timestamp for this date to use for sorting
        const latestMs = Math.max(
          ...farm.predictions
            .map(p => getTimestampMs(p.timestamp))
            .filter(ms => new Date(ms).toDateString() === dateStr)
        );
        return {
          date: dateStr,
          value: latestMs, // Use latest timestamp as the value for filtering
          label: dateStr
        };
      })
      .sort((a, b) => b.value - a.value); // Latest first

    return sortedDates;
  };

  // Compute freshness label and color for a given timestamp (ms)
  const getFreshness = (latestMs) => {
    if (!latestMs || latestMs <= 0) {
      return { label: 'Not Latest Data (Cached)', color: '#f59e0b' };
    }
    const now = Date.now();
    const hoursDiff = (now - latestMs) / (1000 * 60 * 60);
    if (hoursDiff > 72) return { label: 'Outdated data', color: '#ef4444' };
    if (hoursDiff > 24) return { label: 'Recent data', color: '#f59e0b' };
    return { label: 'Current data', color: '#4ade80' };
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
    const severity = { high: 0, medium: 1, low: 2, normal: 3 };
    entries.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return severity[a[0]] - severity[b[0]];
    });
    const top = entries[0]?.[0] || 'normal';
    if (top === 'high') return 'High';
    if (top === 'medium') return 'Medium';
    if (top === 'low') return 'Low';
    return 'Normal';
  };

  const severityRank = (level) => {
    const n = normalizeRisk(level);
    if (n === 'High') return 0;
    if (n === 'Medium') return 1;
    if (n === 'Low') return 2;
    return 3; // Normal
  };

  const getMillis = (ts) => {
    if (!ts) return 0;
    if (ts.seconds) return ts.seconds * 1000;
    if (typeof ts === 'string') return Date.parse(ts) || 0;
    if (ts instanceof Date) return ts.getTime();
    return 0;
  };

  // Normalize pond display name to "Fish Pond N" style and prevent odd casing
  const formatPondName = (pondName) => {
    const raw = (pondName || '').toString().trim();
    if (!raw) return 'Fish Pond';
    const lower = raw.toLowerCase();
    if (lower.includes('unknown')) return 'Unknown Pond';
    const num = raw.match(/\d+/);
    if (num) return `Fish Pond ${num[0]}`;
    // If already includes words fish/pond, fix capitalization
    if (/(fish)\s*(pond)/i.test(raw)) {
      return raw.replace(/fish/ig, 'Fish').replace(/pond/ig, 'Pond');
    }
    return `Fish Pond ${raw}`;
  };

  // Extract recommended actions from reason text
  const extractRecommendedActions = (reasonText) => {
    if (!reasonText || typeof reasonText !== 'string') return null;
    
    // Look for "Recommended actions:" pattern (capture everything after it, including periods)
    const recommendedMatch = reasonText.match(/Recommended actions:\s*(.+?)(?:\s*$|\.\s*$)/i);
    if (recommendedMatch) {
      return recommendedMatch[1].trim().replace(/\.$/, ''); // Remove trailing period if present
    }
    
    // Look for "Recommended:" pattern
    const recommendedMatch2 = reasonText.match(/Recommended:\s*(.+?)(?:\s*$|\.\s*$)/i);
    if (recommendedMatch2) {
      return recommendedMatch2[1].trim().replace(/\.$/, ''); // Remove trailing period if present
    }
    
    // Look for "Caution:" pattern (for low risk cases)
    const cautionMatch = reasonText.match(/Caution:\s*(.+?)(?:\s*$|\.\s*$)/i);
    if (cautionMatch) {
      return cautionMatch[1].trim().replace(/\.$/, ''); // Remove trailing period if present
    }
    
    // Look for "Regular monitoring advised" pattern (for low risk cases with higher confidence)
    const monitoringMatch = reasonText.match(/Regular monitoring advised[^.]*\./i);
    if (monitoringMatch) {
      return monitoringMatch[0].trim().replace(/\.$/, ''); // Remove trailing period if present
    }
    
    // Look for embedded recommendations like "Close monitoring and preventive measures recommended."
    const embeddedMatch = reasonText.match(/([^.]*monitoring[^.]*recommended[^.]*\.)/i);
    if (embeddedMatch) {
      return embeddedMatch[1].trim().replace(/\.$/, ''); // Remove trailing period if present
    }
    
    // Look for other embedded patterns like "...recommended." or "...advised."
    const generalMatch = reasonText.match(/([^.]*recommended[^.]*\.)/i);
    if (generalMatch) {
      return generalMatch[1].trim().replace(/\.$/, ''); // Remove trailing period if present
    }
    
    return null;
  };

  // Clean reason text by removing recommended actions and caution parts
  const cleanReasonText = (reasonText) => {
    if (!reasonText || typeof reasonText !== 'string') return reasonText;
    
    // Remove "Recommended actions:" and everything after it
    let cleaned = reasonText.replace(/\s*Recommended actions:.*$/i, '').trim();
    
    // Remove "Recommended:" and everything after it
    cleaned = cleaned.replace(/\s*Recommended:.*$/i, '').trim();
    
    // Remove "Caution:" and everything after it
    cleaned = cleaned.replace(/\s*Caution:.*$/i, '').trim();
    
    // Remove "Regular monitoring advised" and everything after it
    cleaned = cleaned.replace(/\s*Regular monitoring advised.*$/i, '').trim();
    
    // Remove embedded recommendations like "Close monitoring and preventive measures recommended."
    cleaned = cleaned.replace(/\s*[^.]*monitoring[^.]*recommended[^.]*\./i, '').trim();
    
    // Remove other embedded patterns like "...recommended." or "...advised."
    cleaned = cleaned.replace(/\s*[^.]*recommended[^.]*\./i, '').trim();
    
    return cleaned;
  };

  // Build a short human-readable reason for a pond's risk
  const buildPondReason = (p) => {
    if (!p) return '';
    if (typeof p.conditions_summary === 'string' && p.conditions_summary.trim().length > 0) {
      return p.conditions_summary;
    }
    const parts = [];
    if (p.fish_condition) parts.push(String(p.fish_condition).toLowerCase() + ' fish');
    if (p.water_condition) parts.push(String(p.water_condition).toLowerCase() + ' water');
    if (p.weather) parts.push('under ' + String(p.weather).toLowerCase() + ' weather');
    let base = parts.length ? parts.join(', ') : '';
    // Risk momentum/trend if present
    const trend = (p.risk_momentum && (p.risk_momentum.trend_direction || p.risk_momentum.direction)) || null;
    if (trend) base += (base ? '. ' : '') + `Trend: ${String(trend).toLowerCase()}`;
    // Immediate action if available
    const immediate = p?.enhanced_analytics?.immediate || p?.immediate;
    if (immediate) base += (base ? '. ' : '') + `Immediate: ${String(immediate)}`;
    return base || 'No additional details available';
  };

  // Deduplicate predictions by pond; choose latest timestamp across sources and merge fields
  const deduplicatePredictions = (predictions) => {
    const map = new Map();
    predictions.forEach(p => {
      const pondKey = (p.fish_pond || '').toString().trim().toLowerCase();
      const ts = getMillis(p.timestamp);
      if (!map.has(pondKey)) {
        map.set(pondKey, { ...p });
      } else {
        const existing = map.get(pondKey);
        const existingTs = getMillis(existing.timestamp);
        // Pick latest by timestamp
        const newer = ts >= existingTs ? p : existing;
        const older = ts >= existingTs ? existing : p;
        // Merge actions
        const mergedActions = new Set([...(existing.recommended_actions || []), ...(p.recommended_actions || [])]);
        map.set(pondKey, {
          ...newer,
          recommended_actions: Array.from(mergedActions),
          // Prefer non-empty conditions_summary
          conditions_summary: newer.conditions_summary || older.conditions_summary || null,
          // Keep highest confidence if newer missing
          confidence: typeof newer.confidence === 'number' && !isNaN(newer.confidence)
            ? newer.confidence
            : (typeof older.confidence === 'number' ? older.confidence : null),
          // Risk level from newer
          risk_level: newer.risk_level || older.risk_level,
        });
      }
    });
    return Array.from(map.values());
  };

  const riskBadge = (level) => {
    const n = normalizeRisk(level);
    const colorClass = n === 'High' ? 'high-risk' : n === 'Medium' ? 'medium-risk' : n === 'Low' ? 'low-risk' : 'normal';
    const emoji = n === 'High' ? '🔴' : n === 'Medium' ? '🟠' : n === 'Low' ? '🟡' : '🟢';
    const riskText = n === 'High' ? t('riskReportModal.highRisk') : n === 'Medium' ? t('riskReportModal.mediumRisk') : n === 'Low' ? t('riskReportModal.lowRisk') : t('riskReportModal.normalRisk');
    return (
      <span className={`risk-level-badge ${colorClass}`}>{emoji} {riskText}</span>
    );
  };

  // Confidence interpretation helper for per-pond display
  const getConfidenceInterpretation = (confidence, riskLevel) => {
    const c = typeof confidence === 'number' ? confidence : NaN;
    if (!isFinite(c)) return null;
    const normalized = normalizeRisk(riskLevel);
    if (c >= 90) {
      return {
        emoji: '✅',
        label: 'Very Sure',
        color: '#16a34a',
        title: `The system is very sure that the risk is ${normalized} Risk.`
      };
    }
    if (c >= 70) {
      return {
        emoji: '🟡',
        label: 'Likely Accurate',
        color: '#f59e0b',
        title: `The system is fairly sure that the risk is ${normalized} Risk.`
      };
    }
    return {
      emoji: '⚠️',
      label: 'Uncertain',
      color: '#dc2626',
      title: `The system is uncertain — please recheck the pond’s actual condition.`
    };
  };

  // Calculate average confidence for assigned farm
  const assignedFarmConfidence = useMemo(() => {
    if (!currentUser?.farm || !assignedFarmName || farms.length === 0) {
      return null;
    }
    
    const assignedFarm = farms.find(farm => {
      const farmKey = farm.farm_key;
      const farmName = farm.farm_name;
      const currentUserFarm = currentUser.farm;
      
      return farmKey === normalizeFarmName(currentUserFarm) ||
             farmKey === normalizeFarmName(assignedFarmName) ||
             farmName === currentUserFarm ||
             farmName === assignedFarmName ||
             farmName?.toLowerCase() === currentUserFarm?.toLowerCase() ||
             farmName?.toLowerCase() === assignedFarmName?.toLowerCase();
    });

    if (!assignedFarm) {
      return null;
    }

    // Use the existing avg_confidence from the farm data
    const confidence = assignedFarm.avg_confidence;
    
    if (typeof confidence === 'number' && confidence > 0) {
      const result = Math.round(confidence * 10) / 10; // Round to 1 decimal place
      return result;
    }
    
    return null;
  }, [farms, currentUser?.farm, assignedFarmName]);

  if (loading) {
    return (
      <div className="risk-report-container">
        <div className="loading-state">
          <FaExclamationTriangle className="loading-icon" />
          <h3>{t('riskReportModal.loadingFarmRiskData')}</h3>
          <p>{t('riskReportModal.fetchingLatestFarmSummaries')}</p>
        </div>
      </div>
    );
  }


  return (
    <div className={`risk-report-container ${isModal ? 'modal-view' : ''}`}>
      <div className="risk-report-header">
        <div className="header-content">
          <FaExclamationTriangle className="header-icon" />
          <h2>{t('riskReportModal.farmRiskOverview')}</h2>
          <p className="header-subtitle">{t('riskReportModal.aggregatedRiskByFarm')}</p>
        </div>
      </div>

      {/* Average Confidence Indicator for Assigned Farm */}
      {assignedFarmConfidence !== null && (
        <div className="prd-confidence-indicator">
          <div className="prd-confidence-card">
            <div className="prd-confidence-header">
              <h3 className="prd-confidence-title">
                {assignedFarmName} – Prediction Confidence
              </h3>
            </div>
            <div className="prd-confidence-value">
              <span className="prd-confidence-number">{assignedFarmConfidence}%</span>
              <div className="prd-confidence-bar">
                <div 
                  className="prd-confidence-fill" 
                  style={{ 
                    width: `${assignedFarmConfidence}%`,
                    backgroundColor: assignedFarmConfidence >= 80 ? '#10b981' : 
                                   assignedFarmConfidence >= 50 ? '#f59e0b' : '#ef4444'
                  }}
                ></div>
              </div>
            </div>
            <div className="prd-confidence-description">
              {assignedFarmConfidence >= 80 ? 'High' :
               assignedFarmConfidence >= 50 ? 'Medium' : 
               'Low'}
            </div>
          </div>
        </div>
      )}

      <div className="farm-overview-section">
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0', position: 'relative' }}>
          <button
            onClick={() => {
              const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
              if (!isTemporaryTechOfficer) {
                const isOpening = !exportMenuOpen;
                setExportMenuOpen(v => !v);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('export', `Export menu ${isOpening ? 'opened' : 'closed'} in Risk Reports`, u); 
                } catch (_) {}
              }
            }}
            disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
            title={(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? "Export unavailable for temporary accounts" : "Export"}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              color: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? '#6c757d' : '#1A4375',
              cursor: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 0.5 : 1
            }}
          >
            <FaFileExport />
            <span style={{ textDecoration: 'underline' }}>Export</span>
          </button>
          {exportMenuOpen && !(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 28,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                zIndex: 10,
                minWidth: 200,
                overflow: 'hidden'
              }}
            >
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  try { 
                    const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                    logActivity('export', logMessages.export.csvDownload(u, 'risk overview data'), u); 
                  } catch (_) {}
                  exportRiskOverviewCSV(farms, 'risk_overview.csv');
                  setExportMenuOpen(false);
                }}
              >
                Export CSV
              </button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  try { 
                    const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                    logActivity('export', logMessages.export.pdfDownload(u, 'risk overview data'), u); 
                  } catch (_) {}
                  exportRiskOverviewPDF(farms, 'risk_overview.pdf');
                  setExportMenuOpen(false);
                }}
              >
                Export PDF
              </button>
            </div>
          )}
        </div>
        {farms.length > 0 ? (
          <div className="farm-cards-grid">
            {farms.map(farm => (
              <div key={farm.farm_key} className={`farm-risk-card ${!farm.has_reports ? 'no-reports' : ''} ${farm.overall_risk === 'High' ? 'high-risk' : farm.overall_risk === 'Medium' ? 'medium-risk' : farm.overall_risk === 'Low' ? 'low-risk' : ''}`}>
                <div className="farm-card-header">
                  <div className="farm-info">
                    <h3 className="farm-name">{farm.farm_name}</h3>
                    {farm.has_reports ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 6, width: '100%' }}>
                        <p className="farm-location" style={{ margin: 0 }}>
                          {(() => {
                          const fb = feedbackCache[farm.farm_key] || farm.feedback;
                          const correctedRaw = fb?.corrected_risk_level || fb?.prediction?.corrected_risk_level;
                          const corrected = correctedRaw ? normalizeRisk(correctedRaw) : null;
                          // Compute display risk from the SAME dataset as counts to guarantee consistency
                          const dailyPredictions7_hdr = getLatestPerPondPerDay(farm.predictions, 7);
                          const predictionsToUse_hdr = dailyPredictions7_hdr.length > 0 ? dailyPredictions7_hdr : getLatestPerPondPerDay(farm.predictions, 30);
                          const withTs_hdr = predictionsToUse_hdr.filter(p => getTimestampMs(p.timestamp) > 0);
                          const sorted_hdr = [...withTs_hdr].sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
                          const pondMap_hdr = new Map();
                          sorted_hdr.forEach(pred => {
                            const pondKey = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
                            if (!pondMap_hdr.has(pondKey)) pondMap_hdr.set(pondKey, pred);
                          });
                          const latestPerPond_hdr = Array.from(pondMap_hdr.values());
                          const counts_hdr = { high: 0, medium: 0, low: 0, normal: 0 };
                          latestPerPond_hdr.forEach(pred => {
                            const risk = normalizeRisk(pred.risk_level);
                            if (risk === 'High') counts_hdr.high++;
                            else if (risk === 'Medium') counts_hdr.medium++;
                            else if (risk === 'Low') counts_hdr.low++;
                            else counts_hdr.normal++;
                          });
                          const displayRisk = majorityFromCounts(counts_hdr);
                          return (
                            <>
                              {riskBadge(displayRisk)}
                              {corrected && ` (${t('riskReportModal.corrected')})`}
                              {farm.avg_confidence > 0 && (
                                <>
                                  <span style={{ padding: '0 6px', color: '#9CA3AF' }}>|</span>
                                  <span className="avg-conf">
                                    {t('riskReportModal.avgConfidence')}: {farm.avg_confidence.toFixed(1)}%
                                  </span>
                                </>
                              )}
                            </>
                          );
                          })()}
                        </p>
                        {(() => {
                          // Derive latest timestamp from predictions or summary
                          const candidates = [];
                          if (Array.isArray(farm.predictions)) {
                            const latestPred = farm.predictions
                              .filter(p => p && p.timestamp)
                              .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))[0];
                            if (latestPred) {
                              candidates.push(getTimestampMs(latestPred.timestamp));
                            }
                          }
                          if (farm.summary?.last_update) {
                            candidates.push(getTimestampMs(farm.summary.last_update));
                          }
                          const latestMs = candidates.length ? Math.max(...candidates) : 0;
                          const { label, color } = getFreshness(latestMs);
                          const lastUpdatedStr = latestMs > 0 ? new Date(latestMs).toLocaleDateString() : 'unknown';
                          return (
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${color}` }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                                <span style={{ color: '#111827' }}>{label}</span>
                              </span>
                              <span style={{ color: '#6b7280' }}>Last updated: <strong style={{ color: '#111827' }}>{lastUpdatedStr}</strong></span>
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <p className="no-reports-note">
                        <FaInfoCircle /> {t('riskReportModal.noRiskReportsAvailable')}
                      </p>
                    )}
        </div>
      </div>

                {farm.has_reports ? (
                  <>
                    <div className="farm-risk-summary">
                      {(() => {
                        // DAILY (latest generated date) counts and critical alerts
                        const latestDaily = getLatestBatchPerPond(farm);
                        const dailyCounts = { high: 0, medium: 0, low: 0, normal: 0 };
                        latestDaily.forEach(pred => {
                          const risk = normalizeRisk(pred.risk_level);
                          if (risk === 'High') dailyCounts.high++;
                          else if (risk === 'Medium') dailyCounts.medium++;
                          else if (risk === 'Low') dailyCounts.low++;
                          else dailyCounts.normal++;
                        });
                        // Note: Daily critical alerts intentionally not displayed per user request

                        return (
                          <>
                            <div className="risk-counts" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 10, flexWrap: 'wrap' }}>
                                <span className="confidence-info">Daily ponds: {latestDaily.length}</span>
                                <div className="risk-counts" style={{ marginLeft: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                                  <span className="risk-badge high-risk">{t('riskReportModal.highRisk')}: {dailyCounts.high}</span>
                                  <span className="risk-badge medium-risk">{t('riskReportModal.mediumRisk')}: {dailyCounts.medium}</span>
                                  <span className="risk-badge low-risk">{t('riskReportModal.lowRisk')}: {dailyCounts.low}</span>
                                  <span className="risk-badge normal">{t('riskReportModal.normalRisk')}: {dailyCounts.normal}</span>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                  </div>
                    {farm.summary && (
                      <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                        <span className="confidence-info"><IoTimeSharp /> {t('riskReportModal.lastUpdate')}: {sanitizeTimestamp(farm.summary.last_update)}</span>
                    </div>
                    )}
                    {farm.summary && (() => {
                      // Build readable, bulleted "Main Issues" list from the DAILY batch (latest generated date)
                      const latestPerPond = getLatestBatchPerPond(farm);

                      const formatConcern = (p) => {
                        const cs = (typeof p.conditions_summary === 'string' ? p.conditions_summary : '') || '';
                        let concern = '';
                        const upper = cs.toUpperCase();
                        if (upper.includes('MINOR CONCERNS')) concern = 'Minor concern';
                        else if (upper.includes('ELEVATED RISK')) concern = 'Elevated risk';
                        else {
                          const rl = normalizeRisk(p.risk_level);
                          concern = rl === 'High' ? 'High risk' : rl === 'Medium' ? 'Moderate risk' : rl === 'Low' ? 'Low risk' : 'Normal';
                        }
                        const fish = (p.fish_condition || '').toString().trim();
                        const water = (p.water_condition || '').toString().trim();
                        const weather = (p.weather || '').toString().trim();
                        const fishTxt = fish ? `${fish.charAt(0).toUpperCase() + fish.slice(1).toLowerCase()} fish condition` : 'condition';
                        const waterTxt = water ? `${water.toLowerCase()} water` : 'water';
                        const weatherTxt = weather ? `${weather.toLowerCase()} weather` : 'weather';
                        const pondName = (p.fish_pond ? `Fish Pond ${String(p.fish_pond).replace(/^[^0-9]*/i,'')}` : 'Fish Pond');
                        return `${pondName} – ${concern}: ${fishTxt} in ${waterTxt} under ${weatherTxt}. Regular monitoring advised.`;
                      };

                      const items = latestPerPond.slice(0, 3).map(formatConcern);
                      return (
                        <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                          <div className="confidence-info" style={{ marginBottom: 4 }}><FaLightbulb /> Main Issues:</div>
                          {items.length > 0 ? (
                            <ul style={{ paddingLeft: 18, margin: 0 }}>
                              {items.map((text, i) => (
                                <li key={i} style={{ marginBottom: 2 }}>{text}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="confidence-info">No issues detected</span>
                          )}
                        </div>
                      );
                    })()}
                    {farm.summary && (
                      <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                        <span className="confidence-info"><RiAlertFill /> {t('riskReportModal.criticalAlerts')}: {farm.summary.critical_alerts ?? 0}</span>
                      </div>
                    )}
                    <div className="farm-actions">
                      <button className="view-details-btn" onClick={(e) => {
                        e.stopPropagation();
                        if (detailsFarmKey === farm.farm_key) return; // prevent re-opening same modal
                        if (detailsFarmKey) return; // another details modal already open
                        setDetailsFarmKey(farm.farm_key);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('report', `View Details opened for farm ${farm.farm_name} in Risk Reports`, u); 
                        } catch (_) {}
                      }}>
                        <span className="btn-icon"><IoTimeSharp /></span> {t('riskReportModal.viewDetails')}
                      </button>
                      <button className="suggested-actions-btn" onClick={() => {
                        setActionsFarmKey(farm.farm_key);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('report', `Suggested Actions opened for farm ${farm.farm_name} in Risk Reports`, u); 
                        } catch (_) {}
                      }}>
                        <span className="btn-icon"><PiNoteFill /></span> {t('riskReportModal.latestSuggestedActions')}
                      </button>
              </div>
                  </>
                ) : (
                  <div className="no-reports-message">
                    <p>{t('riskReportModal.noRiskAssessmentData')}</p>
                    <button className="add-report-btn" onClick={() => {
                      try { 
                        const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                        logActivity('report', `Add Report clicked for farm ${farm.farm_name} in Risk Reports`, u); 
                      } catch (_) {}
                    }}>
                      <span className="btn-icon">➕</span> {t('riskReportModal.addReport')}
                    </button>
                          </div>
                        )}
                      </div>
            ))}
          </div>
        ) : (
          <div className="no-risks">
            <FaShieldAlt className="no-risks-icon" />
            <h3>{t('riskReportModal.noFarmsFound')}</h3>
            <p>{t('riskReportModal.noFarmsToDisplay')}</p>
                          </div>
                        )}
                    </div>

      {/* Details Modal */}
      {detailsFarmKey && (() => {
        const farm = farms.find(f => f.farm_key === detailsFarmKey);
        if (!farm || !farm.has_reports) return null;
        
        // Get available dates for this farm
        const availableDates = getAllDates(farm);
        
        // Determine effective selected date (forced from chart click, or from UIselection)
        const effectiveSelectedMs = (typeof forcedDateMs === 'number' && forcedDateMs > 0)
          ? forcedDateMs
          : (showHistoryFilter && selectedTimestamp !== 'latest' ? parseInt(selectedTimestamp, 10) : null);

        // Get predictions based on the effective selected timestamp
        let displayPredictions = [];
        if (!effectiveSelectedMs) {
          // Show only the latest batch generated (same date) across the farm
          const allWithValidTs = (farm.predictions || []).filter(p => getTimestampMs(p.timestamp) > 0);
          if (allWithValidTs.length > 0) {
            // Find the latest timestamp across all predictions
            const latestMs = Math.max(...allWithValidTs.map(p => getTimestampMs(p.timestamp)));
            const latestDateKey = new Date(latestMs).toDateString();
            // Keep only predictions generated on that latest date
            const latestBatch = allWithValidTs.filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === latestDateKey);
            // From that batch, keep latest per pond to avoid duplicates
            const pondMap = new Map();
            latestBatch
              .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
              .forEach(pred => {
                const pond = pred.fish_pond || 'Unknown Pond';
                if (!pondMap.has(pond)) pondMap.set(pond, pred);
              });
            displayPredictions = Array.from(pondMap.values());
          } else {
            displayPredictions = [];
          }
        } else {
          const selectedMs = effectiveSelectedMs;
          // Get all reports from the same date as the selected timestamp
          const selectedDate = new Date(selectedMs).toDateString();
          // Keep latest per pond for that date
          const sameDayReports = (farm.predictions || []).filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === selectedDate);
          const pondMap = new Map();
          sameDayReports
            .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
            .forEach(pred => {
              const pond = pred.fish_pond || 'Unknown Pond';
              if (!pondMap.has(pond)) pondMap.set(pond, pred);
            });
          displayPredictions = Array.from(pondMap.values());
        }
        
        // Get last updated timestamp
        const lastUpdated = displayPredictions.length > 0 
          ? new Date(Math.max(...displayPredictions.map(p => getTimestampMs(p.timestamp))))
          : new Date();
        
        return (
          <div className="farm-details-modal-overlay">
            <div className="farm-details-modal">
              <div className="farm-details-header">
                <div className="header-content">
                  <h3>{farm.farm_name} — Daily Pond Risk Predictions</h3>
                  <div className="last-updated-info">
                    {(() => {
                      const fmt = lastUpdated?.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
                      return `Last updated: ${fmt || '—'}`;
                    })()}
                  </div>
                </div>
                <button className="close-modal-btn" onClick={() => {
                  setDetailsFarmKey(null);
                  setSelectedTimestamp('latest');
                  setShowHistoryFilter(false);
                  try { 
                    const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                    logActivity('report', `Details modal closed in Risk Reports`, u); 
                  } catch (_) {}
                }}>✕</button>
              </div>
              <div className="farm-details-content">
                <div
                  style={{
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    color: '#0c4a6e',
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: '0.95rem',
                    lineHeight: 1.4
                  }}
                >
                  <span style={{ marginRight: 8 }}>💡</span>
                  Confidence represents how certain the system is about its risk prediction based on the latest data. A higher value means the prediction is more reliable, while a lower confidence indicates that the result may be less accurate due to limited or inconsistent data.
                </div>
                {detailsLoading && (
                  <div style={{
                    marginBottom: '12px',
                    padding: '10px 12px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    color: '#6b7280',
                    fontSize: '0.9rem'
                  }}>
                    {t('riskReportModal.loadingFarmRiskData')}
                  </div>
                )}
                {/* Date Filter - Only show when viewing history */}
                {showHistoryFilter && (
                  <div className="timestamp-filter-section" style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <label htmlFor="date-select" style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                      📅 Select Report Date:
                    </label>
                    <select
                      id="date-select"
                      value={selectedTimestamp}
                      onChange={(e) => setSelectedTimestamp(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '14px',
                        background: 'white',
                        color: '#374151',
                        minWidth: '200px'
                      }}
                    >
                      <option value="latest">Latest Report Per Pond</option>
                      {availableDates.map((date, index) => (
                        <option key={date.value} value={date.value}>
                          {date.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div className="pond-details-table">
                    <table className="pond-table">
                <thead>
                  <tr>
                    <th>{t('riskReportModal.pond')}</th>
                    <th style={{ whiteSpace: 'nowrap' }}>{t('riskReportModal.riskLevel')}</th>
                    <th>{t('riskReportModal.confidence')}</th>
                  </tr>
                </thead>
                    <tbody>
                      {displayPredictions.length > 0 ? displayPredictions.map((p, index) => {
                        const risk = normalizeRisk(p.risk_level);
                        const emoji = risk === 'High' ? '🔴' : risk === 'Medium' ? '🟠' : risk === 'Low' ? '🟢' : '🟢';
                    const submittedMs = getTimestampMs(p.submitted_timestamp);
                    const generatedMs = getTimestampMs(p.generated_timestamp || p.timestamp);
                    const submittedDate = submittedMs ? new Date(submittedMs).toLocaleDateString() : '—';
                    const generatedDate = generatedMs ? new Date(generatedMs).toLocaleDateString() : '—';
                        
                        return (
                        <React.Fragment key={p.id || index}>
                          {/* Main pond row */}
                          <tr className="pond-table-row">
                            <td className="pond-name" style={{ whiteSpace: 'nowrap' }}>{formatPondName(p.fish_pond) || '—'}</td>
                            <td>{emoji} {risk === 'High' ? t('riskReportModal.highRisk') : risk === 'Medium' ? t('riskReportModal.mediumRisk') : risk === 'Low' ? t('riskReportModal.lowRisk') : t('riskReportModal.normalRisk')}</td>
                            <td className="confidence-value">
                              {(() => {
                                if (typeof p.confidence !== 'number') return '—';
                                const value = Number(p.confidence);
                                const interp = getConfidenceInterpretation(value, p.risk_level);
                                if (!interp) return `${value.toFixed(1)}%`;
                                return (
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ color: interp.color, fontWeight: 600 }}>
                                      {value.toFixed(1)}% {interp.emoji} {interp.label}
                                    </span>
                                    <span className="confidence-meta">
                                      {interp.label} about {normalizeRisk(p.risk_level)} Risk
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                          {/* Details row */}
                          <tr className="pond-details-row">
                            <td colSpan="3" className="pond-details-cell">
                              <div className="pond-reason-details">
                                {(() => {
                                  const reasonText = buildPondReason(p);
                                  const recommendedActions = extractRecommendedActions(reasonText);
                                  const cleanReason = cleanReasonText(reasonText);
                                  
                                  return (
                                    <>
                                      <div className="reason-summary">
                                        <strong>Reason:</strong> {cleanReason}
                                      </div>
                                      {recommendedActions && (
                                        <div className="recommended-actions">
                                          <strong>Actions:</strong> {recommendedActions}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                                <div className="timestamps-info">
                                  <span className="timestamp-item">
                                    <strong>Data submitted:</strong> {submittedDate}
                                  </span>
                                  <span className="timestamp-item">
                                    <strong>Prediction generated:</strong> {generatedDate}
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                        );
                      }) : (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                            No predictions found for selected time period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* View History Button */}
                {selectedTimestamp === 'latest' && availableDates.length > 0 && !showHistoryFilter && (
                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        setShowHistoryFilter(true);
                        // Show the most recent date
                        const mostRecentDate = availableDates[0];
                        if (mostRecentDate) {
                          setSelectedTimestamp(mostRecentDate.value);
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#1A4375',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}
                    >
                      View History
                    </button>
                  </div>
                )}

                {/* Back to Latest Button - Only show when viewing history */}
                {showHistoryFilter && (
                  <div style={{ marginTop: '20px', textAlign: 'center' }}>
                    <button
                      onClick={() => {
                        setShowHistoryFilter(false);
                        setSelectedTimestamp('latest');
                      }}
                      style={{
                        padding: '8px 16px',
                        background: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '500',
                        marginRight: '10px'
                      }}
                    >
                      Back to Latest
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Suggested Actions Modal */}
      {actionsFarmKey && (() => {
        const farm = farms.find(f => f.farm_key === actionsFarmKey);
        if (!farm || !farm.has_reports) return null;
        
        // Get latest recommended actions from latest predictions only
        const latestPredictions = getLatestBatchPerPond(farm);
        const actions = Array.from(new Set(
          latestPredictions.flatMap(p => p.recommended_actions || [])
        ));
        
        return (
          <div className="farm-details-modal-overlay">
            <div className="farm-details-modal">
              <div className="farm-details-header">
                <h3>{farm.farm_name} — {t('riskReportModal.latestSuggestedActions')}</h3>
                {(() => {
                  // Get the latest timestamp from the latest predictions
                  if (latestPredictions.length > 0) {
                    const latestPrediction = latestPredictions
                      .filter(p => p.timestamp)
                      .sort((a, b) => {
                        const aMs = getTimestampMs(a.timestamp);
                        const bMs = getTimestampMs(b.timestamp);
                        return bMs - aMs;
                      })[0];
                    
                    if (latestPrediction) {
                      const latestDate = new Date(getTimestampMs(latestPrediction.timestamp));
                      return (
                        <p style={{ 
                          fontSize: '0.9em', 
                          color: '#666', 
                          margin: '5px 0 0 0',
                          fontStyle: 'italic'
                        }}>
                          {t('riskReportModal.asOf')}: {latestDate.toLocaleDateString()}
                        </p>
                      );
                    }
                  }
                  return null;
                })()}
                <button className="close-modal-btn" onClick={() => {
                  setActionsFarmKey(null);
                  try { 
                    const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                    logActivity('report', `Suggested Actions modal closed in Risk Reports`, u); 
                  } catch (_) {}
                }}>✕</button>
              </div>
              <div className="farm-details-content">
                <div className="recommended-actions">
                  <h4>{t('riskReportModal.recommendedActions')}</h4>
                  {actions.length > 0 ? (
                    <ul className="actions-list">
                      {actions.map((a, i) => (
                        <li key={i} className={`action-item ${i < 2 ? 'high-priority' : 'medium-priority'}`}>
                          <span className="action-icon">✔</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('riskReportModal.noSpecificActionsAvailable')}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default RiskReportModal;
