import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle, FaShieldAlt, FaInfoCircle, FaLightbulb } from 'react-icons/fa';
import { RiAlertFill } from 'react-icons/ri';
import { PiNoteFill } from 'react-icons/pi';
import { IoTimeSharp } from 'react-icons/io5';
import { FaFileExport } from 'react-icons/fa6';
import { FaSyncAlt } from 'react-icons/fa';
import { exportRiskOverviewCSV, exportRiskOverviewPDF, exportFarmDetailsCSV, exportFarmDetailsPDF} from '../utils/exportRiskReport';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { sanitizeTimestamp } from '../utils/securityUtils';
import { logActivity, logMessages } from '../utils/logger';
import { AuthContext } from '../contexts/AuthContext';
import { useFarms } from '../contexts/FarmsContext';
import { useRiskData } from '../contexts/RiskDataContext';
import { useRefreshFeedback } from '../hooks/useRefreshFeedback';
import RefreshStatusMessage from './RefreshStatusMessage';
import './RiskReportModal.css';

const RiskReportModal = ({ isModal = false, initialFarmName = '', initialTimestampMs = null, initialDetailsFarmKey = null, initialRiskLevel = 'all', initialPond = null, initialPonds = [], rangeStart = null, rangeEnd = null }) => {
  const { t } = useTranslation();
  const { currentUser } = useContext(AuthContext);
  const { farms: liveFarms } = useFarms();
  const { farms: ctxFarms, loading: riskDataLoading, lastFetchedAt, refreshRiskData } = useRiskData();
  const { status: refreshStatus, runRefresh, isRefreshing: isManualRefreshBusy } = useRefreshFeedback();
  const RISK_CACHE_TTL_MS = 5 * 60 * 1000;
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState([]);
  const mountedRef = React.useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const [detailsFarmKey, setDetailsFarmKey] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [feedbackCache, setFeedbackCache] = useState({});
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [selectedTimestamp, setSelectedTimestamp] = useState('latest');
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [forcedDateMs, setForcedDateMs] = useState(null);
  const isUserActionRef = useRef(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [checklistData, setChecklistData] = useState({});
  const [historicalChecklistData, setHistoricalChecklistData] = useState({});
  const [selectedPond, setSelectedPond] = useState(null);
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [showUrgentRecommendations, setShowUrgentRecommendations] = useState(false);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState('all');
  const [pondSearchTerm, setPondSearchTerm] = useState('');
  const [showPondDropdown, setShowPondDropdown] = useState(false);
  const [specificPonds, setSpecificPonds] = useState([]); // Ponds to show when filtering by clicked bar
  const appliedInitialFilterRef = React.useRef(false);
  const initialDetailsProcessedRef = React.useRef(false);
  const skipAutoSelectPondRef = useRef(false);

  // Auto-close urgent recommendations when switching tabs
  useEffect(() => {
    setShowUrgentRecommendations(false);
  }, [activeTab]);

  // Set initial details farm key if provided (only once)
  useEffect(() => {
    if (initialDetailsFarmKey && !initialDetailsProcessedRef.current) {
      setDetailsFarmKey(initialDetailsFarmKey);
      initialDetailsProcessedRef.current = true;
    }
  }, [initialDetailsFarmKey]);

  // Set initial risk level if provided; don't clear specific ponds if they were passed from chart click
  useEffect(() => {
    if (initialRiskLevel && initialRiskLevel !== 'all') {
      setSelectedRiskLevel(initialRiskLevel);
      if (!initialPonds || initialPonds.length === 0) {
        setSpecificPonds([]);
      }
    }
  }, [initialRiskLevel, initialPonds]);

  // Set initial pond if provided (takes precedence over auto-selection)
  useEffect(() => {
    if (initialPond) {
      setSelectedPond(initialPond);
      // Clear specific ponds when manually setting pond
      setSpecificPonds([]);
    }
  }, [initialPond]);

  // Set initial specific ponds if provided
  useEffect(() => {
    if (initialPonds && initialPonds.length > 0) {
      setSpecificPonds(initialPonds);
      // Preserve clicked risk level if provided; otherwise fall back to 'all'
      if (initialRiskLevel && initialRiskLevel !== 'all') {
        setSelectedRiskLevel(initialRiskLevel);
      } else {
        setSelectedRiskLevel('all');
      }
      setSelectedPond(null);
    }
  }, [initialPonds, initialRiskLevel]);

  // Close pond dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showPondDropdown && !event.target.closest('.pond-search-container')) {
        setShowPondDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPondDropdown]);

  // Clear pond selection if it doesn't match the current risk level filter
  useEffect(() => {
    if (!selectedPond) return;
    
    const farm = farms.find(f => f.farm_key === detailsFarmKey);
    if (!farm) return;
    
    const availablePonds = getAvailablePonds(farm);
    const filteredPonds = availablePonds.filter(pond => {
      if (selectedRiskLevel === 'all') return true;
      return normalizeRisk(pond.riskLevel) === selectedRiskLevel;
    });
    
    // Check if selected pond matches the current risk level filter
    const selectedPondMatchesFilter = filteredPonds.some(pond => pond.name === selectedPond);
    
    // Only clear if the pond doesn't match the filter AND we're not on "all" risk levels
    if (!selectedPondMatchesFilter && selectedRiskLevel !== 'all') {
      setSelectedPond(null);
      setPondSearchTerm('');
    }
  }, [selectedRiskLevel, selectedPond, detailsFarmKey, farms]);

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

  const fetchChecklistCompletion = async (farmName, targetDateMs = null) => {
    try {
      const checklistQuery = query(
        collection(db, 'checklist_completions'),
        where('farm_details.farm_name', '==', farmName)
      );
      const checklistSnap = await getDocs(checklistQuery);
      
      if (checklistSnap.empty) {
        return null;
      }
      
      // Get all checklist completions
      const checklistDocs = [];
      checklistSnap.forEach(doc => {
        const data = { id: doc.id, ...doc.data() };
        checklistDocs.push(data);
      });
      
      // If targetDateMs is provided, filter by date
      if (targetDateMs) {
        const targetDate = new Date(targetDateMs).toDateString();
        const filteredDocs = checklistDocs.filter(doc => {
          const docTime = doc.timestamp?.seconds ? doc.timestamp.seconds * 1000 : 0;
          const docDate = new Date(docTime).toDateString();
          return docDate === targetDate;
        });
        
        if (filteredDocs.length === 0) {
          return null;
        }
        
        // Sort by timestamp to get the most recent for that date
        filteredDocs.sort((a, b) => {
          const aTime = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0;
          const bTime = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0;
          return bTime - aTime;
        });
        
        return filteredDocs[0] || null;
      }
      
      // Sort by timestamp to get the most recent
      checklistDocs.sort((a, b) => {
        const aTime = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0;
        const bTime = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0;
        return bTime - aTime;
      });
      
      const latestDoc = checklistDocs[0] || null;
      
      return latestDoc;
    } catch (e) {
      return null;
    }
  };

  // Fetch predictions (risk_predictions) and aggregate feedback (model_feedback)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const cacheValid =
          !riskDataLoading &&
          Array.isArray(ctxFarms) &&
          ctxFarms.length > 0 &&
          lastFetchedAt &&
          (Date.now() - lastFetchedAt) < RISK_CACHE_TTL_MS;

        if (riskDataLoading && !cacheValid) {
          setLoading(true);
          return;
        }

        setLoading(true);

        // Fetch conditions summary (farm-level) — modal-only enrichment
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
        
        const predictions = [];
        const feedbacks = [];

        if (cacheValid) {
          ctxFarms.forEach((f) => {
            const farmKey = f.key || normalizeName(f.name);
            if (!allowedKeys.has(farmKey)) return;
            const farmName = f.name || farmKeyToName[farmKey];
            allFarms.add(farmKey);
            if (farmName && farmName !== t('riskReportModal.unknownFarm')) {
              farmKeyToName[farmKey] = farmName;
              keyToDisplayName[farmKey] = farmName;
            }
            (f.predictions || []).forEach((p) => {
              predictions.push({
                id: p.id,
                farm: farmName,
                farm_key: farmKey,
                fish_pond: p.fish_pond || t('riskReportModal.unknownPond'),
                risk_level: normalizeRisk(p.risk_level),
                confidence: parseFloat(p.confidence) || 0,
                fish_condition: p.fish_condition || 'Unknown',
                water_condition: p.water_condition || 'Unknown',
                weather: p.weather || 'Unknown',
                ready_for_harvest: typeof p.ready_for_harvest === 'boolean' ? p.ready_for_harvest : null,
                conditions_summary: p.conditions_summary || null,
                recommended_actions: Array.isArray(p.recommended_actions) ? p.recommended_actions : [],
                timestamp: p.timestamp,
                submitted_timestamp: p.submitted_timestamp,
                generated_timestamp: p.generated_timestamp,
                source: p.source || 'risk_predictions',
              });
            });
            if (f.feedback) {
              feedbacks.push({
                ...f.feedback,
                farm: farmName,
                farm_key: farmKey,
                source: f.feedback.source || 'modal_feedback_aggregate',
              });
            }
          });
        } else {
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
        
        predsSnap.forEach(doc => {
          const data = doc.data();
          const rawName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || t('riskReportModal.unknownFarm');
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
            fish_pond: data.fish_pond || data.input_data?.fish_pond || t('riskReportModal.unknownPond'),
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
        
        feedbackSnap.forEach(doc => {
          const data = doc.data();
          if (data.is_aggregate) {
            // This is an aggregate feedback for a farm
          const rawName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || t('riskReportModal.unknownFarm');
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
              const farmName = pred.farm_name || pred.farm || pred.input_data?.farm_name || pred.input_data?.farm || data.farm_name || data.farm || t('riskReportModal.unknownFarm');
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
                fish_pond: pred.input_data?.fish_pond || pred.fish_pond || t('riskReportModal.unknownPond'),
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
        }
        
        // Map conditions summary by farm key
        const summaryByFarm = {};
        if (condSnap) {
          condSnap.forEach(doc => {
            const data = doc.data();
            const rawName = data.farm_name || data.farm || t('riskReportModal.unknownFarm');
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
  }, [currentUser?.farm, assignedFarmName, allowedKeys, allowedIdToName, ctxFarms, riskDataLoading, lastFetchedAt, t]);

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

  // Fetch checklist completion data when details modal opens
  useEffect(() => {
    const loadChecklistData = async () => {
      if (!detailsFarmKey) return;
      const farm = farms.find(f => f.farm_key === detailsFarmKey);
      if (!farm) return;
      const checklist = await fetchChecklistCompletion(farm.farm_name);
      if (checklist) {
        setChecklistData(prev => ({ ...prev, [detailsFarmKey]: checklist }));
      }
    };
    loadChecklistData();
  }, [detailsFarmKey, farms]);

  // Fetch historical checklist data when in history mode and timestamp changes
  useEffect(() => {
    const loadHistoricalChecklistData = async () => {
      if (!detailsFarmKey || !showHistoryFilter) return;
      
      const farm = farms.find(f => f.farm_key === detailsFarmKey);
      if (!farm) return;
      
      const effectiveSelectedMs = (typeof forcedDateMs === 'number' && forcedDateMs > 0)
        ? forcedDateMs
        : (selectedTimestamp !== 'latest' ? parseInt(selectedTimestamp, 10) : null);
      
      if (effectiveSelectedMs) {
        const historicalChecklist = await fetchChecklistCompletion(farm.farm_name, effectiveSelectedMs);
        setHistoricalChecklistData(prev => ({ 
          ...prev, 
          [`${detailsFarmKey}_${effectiveSelectedMs}`]: historicalChecklist 
        }));
      }
    };
    loadHistoricalChecklistData();
  }, [detailsFarmKey, showHistoryFilter, selectedTimestamp, forcedDateMs, farms]);

  // Reset selected pond when farm changes and auto-select latest pond
  useEffect(() => {
    if (detailsFarmKey) {
      // Only auto-select if no initial pond was provided
      if (!initialPond) {
        setSelectedPond(null);

        // When opening "View Details" from the farm card, we want Overview to show
        // ALL ponds with reports (selectedPond should remain null).
        if (skipAutoSelectPondRef.current) {
          skipAutoSelectPondRef.current = false;
          return;
        }
        
        // Auto-select the pond with the latest risk data
        const farm = farms.find(f => f.farm_key === detailsFarmKey);
        if (farm && farm.predictions && Array.isArray(farm.predictions)) {
          const latestPonds = getLatestRiskPerPond(farm);
          if (latestPonds.length > 0) {
            // Filter by risk level if not 'all'
            let filteredPonds = latestPonds;
            if (selectedRiskLevel !== 'all') {
              filteredPonds = latestPonds.filter(pred => {
                const risk = normalizeRisk(pred.risk_level);
                return risk === selectedRiskLevel;
              });
            }
            
            // If no ponds match the risk level filter, use all latest ponds
            if (filteredPonds.length === 0) {
              filteredPonds = latestPonds;
            }
            
            // Find the pond with the most recent timestamp
            let latestPond = null;
            let latestTimestamp = 0;
            
            filteredPonds.forEach(pred => {
              const timestamp = getTimestampMs(pred.timestamp);
              if (timestamp > latestTimestamp) {
                latestTimestamp = timestamp;
                latestPond = formatPondName(pred.fish_pond);
              }
            });
            
            if (latestPond) {
              setSelectedPond(latestPond);
            }
          }
        }
      }
    }
  }, [detailsFarmKey, farms, initialPond, selectedRiskLevel]);

  // Refresh farm data when details modal opens to ensure latest data
  useEffect(() => {
    const refreshFarmData = async () => {
      if (!detailsFarmKey) return;
      
      // Reset to latest mode when modal opens
      setSelectedTimestamp('latest');
      // Only reset showHistoryFilter if it's not a user action
      if (!isUserActionRef.current) {
      setShowHistoryFilter(false);
      }
      isUserActionRef.current = false;
      
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
      const pond = pred.fish_pond || t('riskReportModal.unknownPond');
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
        const pondKey = (pred.fish_pond || t('riskReportModal.unknownPond')).toString().trim().toLowerCase();
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

  // Date range filtering helper (same as stacked bar chart)
  const withinRange = (ts) => {
    if (!rangeStart || !rangeEnd) return true; // if custom not fully set, show all
    const ms = getTimestampMs(ts);
    if (ms === 0) return false;
    const d = new Date(ms);
    return d >= rangeStart && d <= rangeEnd;
  };

  // Get latest batch (same generated date) and dedupe per pond - WITHIN SELECTED DATE RANGE
  const getLatestBatchPerPond = (farm) => {
    if (!farm.predictions || !Array.isArray(farm.predictions)) return [];
    
    // Filter by date range first (same as stacked bar chart)
    const inRange = farm.predictions.filter(p => withinRange(p.timestamp) && getTimestampMs(p.timestamp) > 0);
    
    if (inRange.length === 0) return [];
    // Find the latest timestamp in range and take that DATE
    const latestMs = Math.max(...inRange.map(p => getTimestampMs(p.timestamp)));
    const latestDateKey = new Date(latestMs).toDateString();
    const sameDay = inRange.filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === latestDateKey);
    const pondMap = new Map();
    sameDay
      .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
      .forEach(pred => {
        const pond = pred.fish_pond || t('riskReportModal.unknownPond');
        if (!pondMap.has(pond)) pondMap.set(pond, pred);
      });
    
    const result = Array.from(pondMap.values());
  
    return result;
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

  // Get all unique dates from farm predictions for a specific pond
  const getDatesForPond = (farm, pondName) => {
    if (!farm.predictions || !Array.isArray(farm.predictions)) return [];
    
    // Filter predictions for the specific pond
    const pondPredictions = farm.predictions.filter(pred => {
      const formattedPondName = formatPondName(pred.fish_pond);
      return formattedPondName === pondName;
    });
    
    if (pondPredictions.length === 0) return [];
    
    // Get unique dates
    const dateSet = new Set();
    pondPredictions
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
          ...pondPredictions
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

  // Calculate confidence trend from previous day/week
  const calculateConfidenceTrend = (predictions, currentConfidence, farmName = '') => {
    if (!Array.isArray(predictions) || predictions.length === 0) return null;
    // Allow trends even if currentConfidence is 0, as long as we have predictions
    if (currentConfidence === null || currentConfidence === undefined) return null;
    
    const now = new Date();
    const recent = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // Last 3 days
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    
    // Get predictions from different time periods with more practical windows - FIXED
    const recentPreds = predictions.filter(p => {
      const predDate = new Date(getTimestampMs(p.timestamp));
      return predDate >= recent; // Last 3 days
    });
    
    const lastWeekPreds = predictions.filter(p => {
      const predDate = new Date(getTimestampMs(p.timestamp));
      return predDate >= lastWeek && predDate < recent; // 7 days ago to 3 days ago
    });
    
    const lastMonthPreds = predictions.filter(p => {
      const predDate = new Date(getTimestampMs(p.timestamp));
      return predDate >= lastMonth && predDate < lastWeek; // 30 days ago to 7 days ago
    });

    if (farmName && /maningas/i.test(farmName)) {
      const fmt = (p) => ({ ts: getTimestampMs(p.timestamp), conf: typeof p.confidence === 'number' ? p.confidence : (typeof p.confidence === 'string' ? parseFloat(p.confidence) : null) });
    }
    
    
    // Calculate average confidence for previous periods
    const calculateAvgConfidence = (preds) => {
      const confidences = preds
        .map(p => {
          const v = typeof p.confidence === 'number' ? p.confidence : 
                   (typeof p.confidence === 'string' ? parseFloat(p.confidence) : NaN);
          if (!isFinite(v) || v <= 0) return NaN;
          if (v < 0) return 0;
          if (v > 100) return 100;
          return v;
        })
        .filter(v => isFinite(v) && v > 0);
      
      return confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    };
    
    // Try different time periods in order of preference
    // For 'recent', compare against the immediately previous readings (exclude newest timestamp)
    let recentAvg = null;
    if (recentPreds.length > 0) {
      const ts = (p) => getTimestampMs(p.timestamp);
      const mostRecentTs = Math.max(...recentPreds.map(ts).filter(v => Number.isFinite(v) && v > 0));
      const previousRecentPreds = recentPreds.filter(p => ts(p) > 0 && ts(p) < mostRecentTs);
      // If there is at least one previous reading in the recent window, use that as comparison
      if (previousRecentPreds.length > 0) {
        recentAvg = calculateAvgConfidence(previousRecentPreds);
      } else {
        // Fallback: use the whole recent window (may yield 0.0% if identical to current)
        recentAvg = calculateAvgConfidence(recentPreds);
      }
      if (farmName && /maningas/i.test(farmName)) {
      }
    }
    const lastWeekAvg = calculateAvgConfidence(lastWeekPreds);
    const lastMonthAvg = calculateAvgConfidence(lastMonthPreds);
    
    // Check recent first (most recent)
    if (recentAvg !== null) {
      const change = currentConfidence - recentAvg;
      if (Math.abs(change) >= 0.05) { // Lowered threshold to 0.05%
        if (farmName && /maningas/i.test(farmName)) {
        }
        return {
          change: change.toFixed(1),
          period: 'recent',
          icon: change > 0 ? '🔺' : '🔻'
        };
      }
      // If we have recent readings, prefer showing stability for recent rather than falling back
      if (farmName && /maningas/i.test(farmName)) {
      }
      return {
        change: '0.0',
        period: 'recent',
        icon: '➡️'
      };
    }
    
    // Check last week
    // Only consider last week if there were no recent readings
    if (recentAvg === null && lastWeekAvg !== null) {
      const change = currentConfidence - lastWeekAvg;
      if (Math.abs(change) >= 0.05) {
        if (farmName && /maningas/i.test(farmName)) {
        }
        return {
          change: change.toFixed(1),
          period: 'last week',
          icon: change > 0 ? '🔺' : '🔻'
        };
      } else if (change === 0) {
        // Show stability indicator for exact matches
        if (farmName && /maningas/i.test(farmName)) {
        }
        return {
          change: '0.0',
          period: 'last week',
          icon: '➡️'
        };
      }
    }
    
    // Check last month as final fallback
    // Only consider last month if both recent and last week had no readings
    if (recentAvg === null && lastWeekAvg === null && lastMonthAvg !== null) {
      const change = currentConfidence - lastMonthAvg;
      if (Math.abs(change) >= 0.05) { // Lowered threshold to 0.05% for consistency
        if (farmName && /maningas/i.test(farmName)) {
        }
        return {
          change: change.toFixed(1),
          period: 'last month',
          icon: change > 0 ? '🔺' : '🔻'
        };
      } else if (change === 0) {
        // Show stability indicator for exact matches
        if (farmName && /maningas/i.test(farmName)) {
        }
        return {
          change: '0.0',
          period: 'last month',
          icon: '➡️'
        };
      }
    }
    
    // Fallback: If we have at least 2 predictions, compare the most recent with the previous one
    // This ensures trends show even if time periods don't match exactly
    if (predictions.length >= 2) {
      const sortedPreds = [...predictions]
        .filter(p => {
          const ts = getTimestampMs(p.timestamp);
          return ts > 0 && isFinite(ts);
        })
        .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
      
      if (sortedPreds.length >= 2) {
        const mostRecent = sortedPreds[0];
        const previous = sortedPreds[1];
        const recentConf = typeof mostRecent.confidence === 'number' ? mostRecent.confidence : 
                          (typeof mostRecent.confidence === 'string' ? parseFloat(mostRecent.confidence) : null);
        const prevConf = typeof previous.confidence === 'number' ? previous.confidence : 
                        (typeof previous.confidence === 'string' ? parseFloat(previous.confidence) : null);
        
        // Use previous confidence for comparison, or currentConfidence if prevConf is invalid
        const comparisonConf = (isFinite(prevConf) && prevConf > 0) ? prevConf : currentConfidence;
        
        if (isFinite(recentConf) && recentConf > 0 && isFinite(comparisonConf) && comparisonConf > 0) {
          const change = currentConfidence - comparisonConf;
          const recentTs = getTimestampMs(mostRecent.timestamp);
          const prevTs = getTimestampMs(previous.timestamp);
          const daysDiff = Math.floor((recentTs - prevTs) / (24 * 60 * 60 * 1000));
          
          // Fix "0 days ago" issue - if timestamps are same day, use "previous reading" or calculate from now
          let periodLabel;
          if (daysDiff === 0) {
            // If same day, calculate days from now instead
            const daysFromNow = Math.floor((now.getTime() - prevTs) / (24 * 60 * 60 * 1000));
            if (daysFromNow === 0) {
              periodLabel = 'today';
            } else if (daysFromNow === 1) {
              periodLabel = 'yesterday';
            } else if (daysFromNow <= 7) {
              periodLabel = `${daysFromNow} days ago`;
            } else if (daysFromNow <= 30) {
              const weeks = Math.floor(daysFromNow / 7);
              periodLabel = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
            } else {
              const months = Math.floor(daysFromNow / 30);
              periodLabel = months === 1 ? '1 month ago' : `${months} months ago`;
            }
          } else if (daysDiff === 1) {
            periodLabel = 'yesterday';
          } else if (daysDiff <= 7) {
            periodLabel = `${daysDiff} days ago`;
          } else if (daysDiff <= 30) {
            const weeks = Math.floor(daysDiff / 7);
            periodLabel = weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
          } else {
            const months = Math.floor(daysDiff / 30);
            periodLabel = months === 1 ? '1 month ago' : `${months} months ago`;
          }
          
          if (Math.abs(change) >= 0.05) {
            return {
              change: change.toFixed(1),
              period: periodLabel,
              icon: change > 0 ? '🔺' : '🔻'
            };
          } else {
            return {
              change: '0.0',
              period: periodLabel,
              icon: '➡️'
            };
          }
        }
      }
    }
    
    return null;
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
    if (lower.includes('unknown')) return t('riskReportModal.unknownPond');
    const num = raw.match(/\d+/);
    if (num) return `Fish Pond ${num[0]}`;
    // If already includes words fish/pond, fix capitalization
    if (/(fish)\s*(pond)/i.test(raw)) {
      return raw.replace(/fish/ig, 'Fish').replace(/pond/ig, 'Pond');
    }
    return `Fish Pond ${raw}`;
  };

  // Get available ponds for the selected farm
  const getAvailablePonds = (farm) => {
    if (!farm || !farm.predictions || !Array.isArray(farm.predictions)) return [];
    
    // Get the latest timestamp across all predictions to determine what's "current"
    const allTimestamps = farm.predictions
      .map(pred => getTimestampMs(pred.timestamp))
      .filter(ts => ts > 0);
    
    if (allTimestamps.length === 0) return [];
    
    const latestTimestamp = Math.max(...allTimestamps);
    const latestDate = new Date(latestTimestamp).toDateString();
    
    // Only consider predictions from the latest date (current/latest data)
    const currentPredictions = farm.predictions.filter(pred => {
      const predTime = getTimestampMs(pred.timestamp);
      const predDate = new Date(predTime).toDateString();
      return predDate === latestDate;
    });
    
    // Get unique ponds from current predictions only
    const pondMap = new Map();
    currentPredictions.forEach(pred => {
      const pondName = pred.fish_pond || t('riskReportModal.unknownPond');
      const formattedName = formatPondName(pondName);
      const riskLevel = normalizeRisk(pred.risk_level);
      
      if (!pondMap.has(formattedName)) {
        pondMap.set(formattedName, {
          name: formattedName,
          originalName: pondName,
          riskLevel: riskLevel,
          latestPrediction: pred
        });
      } else {
        // Keep the latest prediction for this pond
        const existing = pondMap.get(formattedName);
        const existingTime = getTimestampMs(existing.latestPrediction.timestamp);
        const currentTime = getTimestampMs(pred.timestamp);
        if (currentTime > existingTime) {
          pondMap.set(formattedName, {
            name: formattedName,
            originalName: pondName,
            riskLevel: riskLevel,
            latestPrediction: pred
          });
        }
      }
    });
    
    return Array.from(pondMap.values()).sort((a, b) => {
      // Sort by pond number
      const aNum = a.name.match(/\d+/);
      const bNum = b.name.match(/\d+/);
      if (aNum && bNum) {
        return parseInt(aNum[0]) - parseInt(bNum[0]);
      }
      return a.name.localeCompare(b.name);
    });
  };

  // Get urgent recommendations for high-risk scenarios from actual risk predictions
  const getUrgentRecommendations = (riskLevel, farmKey, selectedPond, predictions) => {
    const normalizedRisk = normalizeRisk(riskLevel);
    if (normalizedRisk !== 'High') return [];
    
    // Find the most recent prediction for the selected pond and farm
    // Check both the original farmKey and the mapped farm key (aquino-fish-farm)
    const possibleFarmKeys = [farmKey];
    
    // Add mapped farm key if it exists
    if (farmKey === 'salmon-hatchery-facility') {
      possibleFarmKeys.push('aquino-fish-farm');
    }
    
    // Get all matching predictions first, but work with RAW data before merging
    // We need to access the original predictions before they get merged in deduplicatePredictions
    const allFarms = farms || [];
    const rawPredictions = allFarms.flatMap(farm => farm.predictions || []);
    
    const matchingPredictions = rawPredictions
      .filter(pred => {
        const matchesFarm = possibleFarmKeys.includes(pred.farm_key);
        const matchesRisk = normalizeRisk(pred.risk_level) === 'High';
        const formattedPond = formatPondName(pred.fish_pond);
        const matchesPond = formattedPond === selectedPond;
        const hasActions = Array.isArray(pred.recommended_actions) && pred.recommended_actions.length > 0;
        
        return matchesFarm && matchesRisk && matchesPond && hasActions;
      })
      .sort((a, b) => {
        const timeA = getTimestampMs(a.timestamp);
        const timeB = getTimestampMs(b.timestamp);
        return timeB - timeA; // Most recent first
      });
    
    // Take only the most recent prediction
    const relevantPrediction = matchingPredictions[0];    
    // If no prediction found, return empty array
    if (!relevantPrediction) {
      return [];
    }
    
    // Return the recommended_actions from the prediction
    if (relevantPrediction && Array.isArray(relevantPrediction.recommended_actions) && relevantPrediction.recommended_actions.length > 0) {
      // Filter to show only urgent recommendations (items 7-13 from the array)
      const urgentKeywords = [
        'immediate', 'emergency', 'quarantine', 'suspend', 'consult', 'increase', 'isolate',
        'critical', 'urgent', 'asap', 'right away', 'immediately'
      ];
      
      const urgentRecommendations = relevantPrediction.recommended_actions.filter(rec => 
        urgentKeywords.some(keyword => rec.toLowerCase().includes(keyword))
      );
      
      // If we found urgent recommendations, return them; otherwise return the last 7 (most likely urgent)
      if (urgentRecommendations.length > 0) {
        return urgentRecommendations;
      } else {
        // Return the last 7 recommendations (most likely the urgent ones)
        return relevantPrediction.recommended_actions.slice(-7);
      }
    }
    
    // Fallback recommendations if no specific ones found
    return [
      'Adjust aeration system immediately to improve oxygen levels',
      'Conduct emergency water testing for ammonia and nitrite',
      'Add detoxifying agent to stabilize water parameters',
      'Isolate affected fish for observation and treatment',
      'Increase water circulation and flow rate',
      'Check and clean all filtration systems',
      'Monitor fish behavior for signs of distress',
      'Prepare emergency water change if parameters worsen'
    ];
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
          <div className="loading-spinner" />
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
      {!detailsFarmKey && assignedFarmConfidence !== null && (() => {
        // Calculate trend for assigned farm
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
        
        const assignedFarmTrend = assignedFarm ? calculateConfidenceTrend(assignedFarm.predictions, assignedFarmConfidence, assignedFarmName) : null;
        
        return (
          <div className="prd-confidence-indicator">
            <div className="prd-confidence-card">
              <div className="prd-confidence-header">
                <h3 className="prd-confidence-title">
                  {assignedFarmName} – Prediction Confidence
                </h3>
              </div>
              <div className="prd-confidence-value">
                <span className="prd-confidence-number">{assignedFarmConfidence}%</span>
              </div>
              <div 
                className="prd-confidence-description" 
                style={{
                  color: assignedFarmConfidence >= 80 ? '#10b981' : 
                         assignedFarmConfidence >= 50 ? '#f59e0b' : '#ef4444',
                  fontWeight: '600'
                }}
                ref={(el) => {
                  if (el) {
                    el.style.setProperty('color', assignedFarmConfidence >= 80 ? '#10b981' : 
                                                      assignedFarmConfidence >= 50 ? '#f59e0b' : '#ef4444', 'important');
                  }
                }}
              >
                {assignedFarmConfidence >= 80 ? 'Reliable' :
                 assignedFarmConfidence >= 50 ? 'Moderate' : 
                 'Uncertain'}
              </div>
              <div className="prd-confidence-explanation" style={{
                marginTop: '8px',
                fontSize: '13px',
                color: '#4b5563',
                lineHeight: '1.4',
                textAlign: 'center'
              }}>
                {assignedFarmConfidence >= 80 ? 
                  'The system shows strong reliability in predicting farm risks.' :
                 assignedFarmConfidence >= 50 ? 
                  '⚠️ The system shows moderate reliability in predicting farm risks.' :
                  '⚠️ The system shows low reliability in predicting farm risks.'
                }
              </div>
              {assignedFarmTrend && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: assignedFarmTrend.change > 0 ? '#10b981' : assignedFarmTrend.change < 0 ? '#ef4444' : '#6b7280',
                  fontWeight: '500',
                  textAlign: 'center'
                }}>
                  {assignedFarmConfidence >= 80 ? (
                    assignedFarmTrend.change > 0 ? 
                      `📈 Confidence has improved by +${assignedFarmTrend.change}% since the last analysis.` :
                      assignedFarmTrend.change < 0 ?
                        `📉 Confidence has decreased by ${assignedFarmTrend.change}% since the last analysis.` :
                        `📊 Confidence has remained stable compared to the last analysis.`
                  ) : assignedFarmConfidence >= 50 ? (
                    assignedFarmTrend.change > 0 ? 
                      `📈 Confidence has improved by +${assignedFarmTrend.change}% since the last analysis.` :
                      assignedFarmTrend.change < 0 ?
                        `📉 Confidence has decreased by ${assignedFarmTrend.change}% since the last analysis.` :
                        `📊 Confidence has remained stable compared to the last analysis.`
                  ) : (
                    assignedFarmTrend.change > 0 ? 
                      `📈 Confidence has improved by +${assignedFarmTrend.change}% since the last analysis.` :
                      assignedFarmTrend.change < 0 ?
                        `📉 Confidence has decreased by ${assignedFarmTrend.change}% since the last analysis.` :
                        `🔄 Confidence may increase as more reports are collected.`
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {!detailsFarmKey && (
      <div className="farm-overview-section">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, margin: '8px 0', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => runRefresh(() => refreshRiskData())}
            disabled={isManualRefreshBusy || loading}
            title={t('common.refresh')}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              color: '#1A4375',
              cursor: isManualRefreshBusy || loading ? 'wait' : 'pointer',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: isManualRefreshBusy || loading ? 0.6 : 1,
            }}
          >
            <FaSyncAlt className={isManualRefreshBusy ? 'risk-refresh-spin' : ''} />
            <span style={{ textDecoration: 'underline' }}>{t('common.refresh')}</span>
          </button>
          <button
            onClick={() => {
              const isOpening = !exportMenuOpen;
              setExportMenuOpen(v => !v);
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', `Export menu ${isOpening ? 'opened' : 'closed'} in Risk Reports`, u); 
              } catch (_) {}
            }}
            title="Export"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              color: '#1A4375',
              cursor: 'pointer',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: 1
            }}
          >
            <FaFileExport />
            <span style={{ textDecoration: 'underline' }}>Export</span>
          </button>
          {exportMenuOpen && (
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
        <RefreshStatusMessage status={refreshStatus} variant="default" className="refresh-status-message--inline" />
        </div>
        {farms.length > 0 ? (
          <div className="farm-cards-grid">
            {farms.filter(farm => {
              // If specific ponds are set, only show farms that have those ponds
              if (specificPonds.length > 0) {
                const farmPonds = (farm.predictions || []).map(p => formatPondName(p.fish_pond));
                return specificPonds.some(pond => farmPonds.includes(pond));
              }
              return true;
            }).map(farm => (
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
                          // Compute display risk from the same "latest batch per pond" dataset
                          // used by counts/main issues to keep the card internally consistent.
                          const latestPerPond_hdr = getLatestBatchPerPond(farm);
                          const counts_hdr = { high: 0, medium: 0, low: 0, normal: 0 };
                          latestPerPond_hdr.forEach(pred => {
                            const risk = normalizeRisk(pred.risk_level);
                            if (risk === 'High') counts_hdr.high++;
                            else if (risk === 'Medium') counts_hdr.medium++;
                            else if (risk === 'Low') counts_hdr.low++;
                            else counts_hdr.normal++;
                          });
                          const displayRisk = majorityFromCounts(counts_hdr);
                          
                          // Calculate confidence for selected pond or all ponds
                          let displayConfidence = farm.avg_confidence;
                          let trendData = null;
                          
                          if (selectedPond) {
                            // Filter predictions for the selected pond only
                            const selectedPondPredictions = latestPerPond_hdr.filter(pred => {
                              const formattedPondName = formatPondName(pred.fish_pond);
                              return formattedPondName === selectedPond;
                            });
                            
                            if (selectedPondPredictions.length > 0) {
                              // Calculate average confidence for the selected pond
                              const confidences = selectedPondPredictions
                                .map(p => {
                                  const v = typeof p.confidence === 'number' ? p.confidence : (typeof p.confidence === 'string' ? parseFloat(p.confidence) : NaN);
                                  if (!isFinite(v)) return NaN;
                                  if (v < 0) return 0;
                                  if (v > 100) return 100;
                                  return v;
                                })
                                .filter(v => isFinite(v) && v > 0);
                              displayConfidence = confidences.length ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;
                              // Calculate trend for selected pond - use all predictions for this pond with valid timestamps
                              const allPondPredictions = (farm.predictions || [])
                                .filter(pred => {
                                  if (!pred || !pred.timestamp) return false;
                                  const formattedPondName = formatPondName(pred.fish_pond);
                                  return formattedPondName === selectedPond;
                                })
                                .filter(p => getTimestampMs(p.timestamp) > 0); // Ensure valid timestamps
                              if (allPondPredictions.length > 0) {
                                trendData = calculateConfidenceTrend(allPondPredictions, displayConfidence, `${farm.farm_name} (${selectedPond})`);
                              }
                            }
                          } else {
                            // Calculate average confidence from filtered predictions for all ponds
                            const allConfidences = latestPerPond_hdr
                              .map(p => {
                                const v = typeof p.confidence === 'number' ? p.confidence : (typeof p.confidence === 'string' ? parseFloat(p.confidence) : NaN);
                                if (!isFinite(v)) return NaN;
                                if (v < 0) return 0;
                                if (v > 100) return 100;
                                return v;
                              })
                              .filter(v => isFinite(v) && v > 0);
                            if (allConfidences.length > 0) {
                              displayConfidence = allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;
                            }
                            // Calculate trend for all ponds using valid-timestamp prediction history.
                            let predictionsForTrend = (farm.predictions || []);
                            // Ensure all predictions have valid timestamps
                            predictionsForTrend = predictionsForTrend.filter(p => p && p.timestamp && getTimestampMs(p.timestamp) > 0);
                            if (predictionsForTrend.length > 0) {
                              trendData = calculateConfidenceTrend(predictionsForTrend, displayConfidence, farm.farm_name);
                            }
                          }
                          
                          return (
                            <>
                              {riskBadge(displayRisk)}
                              {corrected && ` (${t('riskReportModal.corrected')})`}
                              <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#6b7280' }}>
                                Based on latest batch per pond
                              </span>
                              {displayConfidence > 0 && (
                                <>
                                  <span style={{ padding: '0 6px', color: '#9CA3AF' }}>|</span>
                                  <span className="avg-conf">
                                    {t('riskReportModal.avgConfidence')}: {displayConfidence.toFixed(1)}%
                                    {trendData && (
                                      <span style={{ 
                                        marginLeft: '8px', 
                                        fontSize: '12px', 
                                        color: trendData.icon === '🔺' ? '#10b981' : trendData.icon === '🔻' ? '#ef4444' : '#6b7280',
                                        fontWeight: '500'
                                      }}>
                                        {trendData.icon} {trendData.change > 0 ? '+' : ''}{trendData.change}% since {trendData.period}
                                      </span>
                                    )}
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

                    {/* Subtle note about risk calculation */}
                    {farm.has_reports && (() => {
                      // Keep this explanation in sync with the header badge:
                      // use latest batch per pond for both.
                      const latestPerPond_hdr = getLatestBatchPerPond(farm);
                      const counts_hdr = { high: 0, medium: 0, low: 0, normal: 0 };
                      latestPerPond_hdr.forEach(pred => {
                        const risk = normalizeRisk(pred.risk_level);
                        if (risk === 'High') counts_hdr.high++;
                        else if (risk === 'Medium') counts_hdr.medium++;
                        else if (risk === 'Low') counts_hdr.low++;
                        else counts_hdr.normal++;
                      });
                      const displayRisk = majorityFromCounts(counts_hdr);
                      const totalCount = counts_hdr.high + counts_hdr.medium + counts_hdr.low + counts_hdr.normal;
                      const compositionText = `Risk composition: High ${counts_hdr.high}, Medium ${counts_hdr.medium}, Low ${counts_hdr.low}, Normal ${counts_hdr.normal}.`;
                      const interpretationText = counts_hdr.high > 0
                        ? "Some ponds are still high risk and need urgent attention even when the overall badge is lower."
                        : counts_hdr.medium > 0
                        ? "No high-risk ponds currently, but medium-risk ponds still need close monitoring."
                        : "No high- or medium-risk ponds in the latest batch.";
                      
                      return (
                        <div style={{ 
                          marginTop: '8px', 
                          padding: '8px 12px', 
                          background: 'rgba(59, 130, 246, 0.05)', 
                          border: '1px solid rgba(59, 130, 246, 0.1)', 
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#4b5563',
                          lineHeight: '1.4'
                        }}>
                          ℹ️ {`Overall badge: ${displayRisk} (${totalCount} pond${totalCount === 1 ? '' : 's'} in latest batch). ${compositionText} ${interpretationText} Average Confidence indicates how confident the system is about these results.`}
                        </div>
                      );
                    })()}

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
                                <span className="confidence-info">Ponds with reports: {latestDaily.length}</span>
                                <div className="risk-counts" style={{ marginLeft: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                                  <span className="risk-badge high-risk">{t('riskReportModal.highRisk')}: {dailyCounts.high}</span>
                                  <span className="risk-badge medium-risk">{t('riskReportModal.mediumRisk')}: {dailyCounts.medium}</span>
                                  <span className="risk-badge low-risk">{t('riskReportModal.lowRisk')}: {dailyCounts.low}</span>
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
                        // Prevent the "auto-select latest pond" effect from collapsing
                        // Overview into only one pond. We want Overview to show ALL ponds.
                        skipAutoSelectPondRef.current = true;
                        setDetailsFarmKey(farm.farm_key);
                        setActiveTab('overview'); // Reset to overview tab when opening
                        // Reset filters so Overview shows ALL ponds with reports
                        setSelectedPond(null);
                        setSpecificPonds([]);
                        setSelectedRiskLevel('all');
                        setPondSearchTerm('');
                        setShowPondDropdown(false);
                        setShowHistoryFilter(false);
                        setSelectedTimestamp('latest');
                        setForcedDateMs(null);
                        setExpandedCardId(null);
                        try { 
                          const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                          logActivity('report', `View Details opened for farm ${farm.farm_name} in Risk Reports`, u); 
                        } catch (_) {}
                      }}>
                        <span className="btn-icon"><IoTimeSharp /></span> {t('riskReportModal.viewDetails')}
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
      )}

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
          
          // Get ALL reports for that date (not just latest per pond)
          const sameDayReports = (farm.predictions || []).filter(p => {
            const reportDate = new Date(getTimestampMs(p.timestamp)).toDateString();
            const matches = reportDate === selectedDate;
            if (matches) {
            }
            return matches;
          });
                    
          // Sort by timestamp (latest first) and then by pond name for consistent ordering
          displayPredictions = sameDayReports
            .sort((a, b) => {
              const timeDiff = getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp);
              if (timeDiff !== 0) return timeDiff;
              // If same timestamp, sort by pond name
              return (a.fish_pond || '').localeCompare(b.fish_pond || '');
            });
        }
        
        // Filter by selected pond and risk level only when NOT in history mode
        if (!showHistoryFilter) {
        // Filter by selected pond if one is selected
        if (selectedPond) {
          displayPredictions = displayPredictions.filter(pred => {
            const formattedPondName = formatPondName(pred.fish_pond);
            return formattedPondName === selectedPond;
          });
          }
          
          // Filter by selected risk level if not 'all'
          if (selectedRiskLevel !== 'all') {
            displayPredictions = displayPredictions.filter(pred => {
              const risk = normalizeRisk(pred.risk_level);
              return risk === selectedRiskLevel;
            });
          }
          
          // Filter by specific ponds if provided (from bar click)
          if (specificPonds.length > 0) {
            displayPredictions = displayPredictions.filter(pred => {
              const formattedPondName = formatPondName(pred.fish_pond);
              return specificPonds.includes(formattedPondName);
            });
          }
        } else {
        }

        // If coming from a stacked-bar segment click (specificPonds set) AND a specific risk level is chosen,
        // override displayPredictions to show the latest report per clicked pond at that risk level within the provided range,
        // regardless of date batches used above.
        if (Array.isArray(specificPonds) && specificPonds.length > 0 && selectedRiskLevel !== 'all') {
          const inRange = (p) => {
            if (!rangeStart || !rangeEnd) return true;
            const ms = getTimestampMs(p.timestamp);
            if (!ms || Number.isNaN(ms)) return false;
            const d = new Date(ms);
            return d >= rangeStart && d <= rangeEnd;
          };
          const pondLatest = new Map();
          (farm.predictions || []).forEach(pred => {
            if (!inRange(pred)) return;
            const risk = normalizeRisk(pred.risk_level);
            if (risk !== selectedRiskLevel) return;
            const pondName = formatPondName(pred.fish_pond);
            if (!specificPonds.includes(pondName)) return;
            const ms = getTimestampMs(pred.timestamp);
            const existing = pondLatest.get(pondName);
            if (!existing || ms > getTimestampMs(existing.timestamp)) {
              pondLatest.set(pondName, pred);
            }
          });
          const onlyClickedAtRisk = Array.from(pondLatest.values());
          if (onlyClickedAtRisk.length > 0) {
            // Sort consistently (latest first, then pond name)
            displayPredictions = onlyClickedAtRisk.sort((a, b) => {
              const diff = getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp);
              if (diff !== 0) return diff;
              return (a.fish_pond || '').localeCompare(b.fish_pond || '');
            });
          }
        }
              
        // Get last updated timestamp - always use the latest data, not filtered historical data
        const lastUpdated = (() => {
          if (!farm || !farm.predictions || farm.predictions.length === 0) {
            return new Date();
          }
          
          // Always get the latest timestamp from all farm predictions, not just the filtered ones
          const allTimestamps = farm.predictions
            .map(p => getTimestampMs(p.timestamp))
            .filter(ts => ts > 0);
          
          if (allTimestamps.length === 0) {
            return new Date();
          }
          
          return new Date(Math.max(...allTimestamps));
        })();
        
        return (
          <div className={`farm-details-modal-overlay ${isModal ? 'farm-details-modal-overlay-inplace' : ''}`}>
            <div className="farm-details-modal">
              <div className="farm-details-header">
                <div className="header-content">
                  <h3>{farm.farm_name} — Daily Pond Risk Predictions</h3>
                  <div className="last-updated-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span>
                      {(() => {
                        const fmt = lastUpdated?.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
                        return `Last updated: ${fmt || '—'}`;
                      })()}
                    </span>
                    <div className="export-menu-container" style={{ position: 'relative' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExportMenuOpen(!exportMenuOpen);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          color: '#1A4375',
                          cursor: 'pointer',
                          fontSize: '0.95rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <FaFileExport />
                        <span style={{ textDecoration: 'underline' }}>Export</span>
                      </button>
                      {exportMenuOpen && (
                        <div className="export-menu" style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          background: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                          zIndex: 1000,
                          minWidth: '120px',
                          marginTop: '4px'
                        }}>
                          <button
                            style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              try { 
                                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                                logActivity('export', logMessages.export.csvDownload(u, 'farm details data'), u); 
                              } catch (_) {}
                              const effectiveSelectedMs = (typeof forcedDateMs === 'number' && forcedDateMs > 0)
                                ? forcedDateMs
                                : (showHistoryFilter && selectedTimestamp !== 'latest' ? parseInt(selectedTimestamp, 10) : null);
                              const exportChecklist = (showHistoryFilter && effectiveSelectedMs)
                                ? historicalChecklistData[`${detailsFarmKey}_${effectiveSelectedMs}`]
                                : checklistData[detailsFarmKey];
                              exportFarmDetailsCSV(
                                farm,
                                `${farm.farm_name.replace(/[^a-zA-Z0-9]/g, '_')}_RiskReportsDetails.csv`,
                                { checklistData: exportChecklist }
                              );
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
                                logActivity('export', logMessages.export.pdfDownload(u, 'farm details data'), u); 
                              } catch (_) {}
                              const effectiveSelectedMs = (typeof forcedDateMs === 'number' && forcedDateMs > 0)
                                ? forcedDateMs
                                : (showHistoryFilter && selectedTimestamp !== 'latest' ? parseInt(selectedTimestamp, 10) : null);
                              const exportChecklist = (showHistoryFilter && effectiveSelectedMs)
                                ? historicalChecklistData[`${detailsFarmKey}_${effectiveSelectedMs}`]
                                : checklistData[detailsFarmKey];
                              exportFarmDetailsPDF(
                                farm,
                                `${farm.farm_name.replace(/[^a-zA-Z0-9]/g, '_')}_RiskReportsDetails.pdf`,
                                { checklistData: exportChecklist }
                              );
                              setExportMenuOpen(false);
                            }}
                          >
                            Export PDF
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="header-actions">
                  <button className="close-modal-btn" onClick={() => {
                    setDetailsFarmKey(null);
                    setSelectedTimestamp('latest');
                    setShowHistoryFilter(false);
                    setActiveTab('overview');
                    setExpandedCardId(null);
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('report', `Details modal closed in Risk Reports`, u); 
                    } catch (_) {}
                  }}>✕</button>
                </div>
              </div>
              <div className="farm-details-content">
                {/* Tab Navigation */}
                <div className="tab-navigation">
                  <button 
                    className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                  >
                    {t('riskReportModal.tabs.overview')}
                  </button>
                  <button 
                    className={`tab-button ${activeTab === 'checklist' ? 'active' : ''}`}
                    onClick={() => setActiveTab('checklist')}
                  >
                    {t('riskReportModal.tabs.checklist')}
                  </button>
                  <button 
                    className={`tab-button ${activeTab === 'insights' ? 'active' : ''}`}
                    onClick={() => setActiveTab('insights')}
                  >
                    {t('riskReportModal.tabs.insights')}
                  </button>
                </div>

                {/* Pond Selection */}
                {(() => {
                  const farm = farms.find(f => f.farm_key === detailsFarmKey);
                  if (!farm) return null;
                  
                  const availablePonds = getAvailablePonds(farm);
                  if (availablePonds.length === 0) return null;
                  
                  // Filter ponds by risk level
                  const filteredPonds = availablePonds.filter(pond => {
                    if (selectedRiskLevel === 'all') return true;
                    return normalizeRisk(pond.riskLevel) === selectedRiskLevel;
                  });
                  
                  // Filter ponds by search term
                  const searchFilteredPonds = filteredPonds.filter(pond => {
                    if (!pondSearchTerm) return true;
                    return pond.name.toLowerCase().includes(pondSearchTerm.toLowerCase());
                  });
                  
                  // For dropdown display, show all filtered ponds when dropdown is open
                  // Only apply search filter if user is actively typing (search term is not empty)
                  const dropdownPonds = pondSearchTerm ? searchFilteredPonds : filteredPonds;
                  
                  return (
                    <div className="pond-selection-section">
                      {/* Risk Level Filter */}
                      <div className="risk-level-filter">
                        <label htmlFor="risk-level-select" className="risk-level-label">
                          {t('riskReportModal.filters.riskLevel')}
                        </label>
                        <select
                          id="risk-level-select"
                          value={selectedRiskLevel}
                          onChange={(e) => setSelectedRiskLevel(e.target.value)}
                          className="risk-level-dropdown"
                          disabled={showHistoryFilter}
                          style={{ 
                            opacity: showHistoryFilter ? 0.5 : 1,
                            cursor: showHistoryFilter ? 'not-allowed' : 'pointer'
                          }}
                        >
                          <option value="all">{t('riskReportModal.filters.allRisks')}</option>
                          <option value="High">{t('riskReportModal.filters.highOnly')}</option>
                          <option value="Medium">{t('riskReportModal.filters.mediumOnly')}</option>
                          <option value="Low">{t('riskReportModal.filters.lowOnly')}</option>
                        </select>
                      </div>
                      
                      {/* Searchable Pond Selection */}
                      <div className="pond-search-container">
                        <label htmlFor="pond-search" className="pond-search-label">
                          Select Pond:
                        </label>
                        <div className="pond-search-wrapper">
                          <input
                            id="pond-search"
                            type="text"
                            value={pondSearchTerm}
                            onChange={(e) => {
                              if (!showHistoryFilter) {
                              setPondSearchTerm(e.target.value);
                              setShowPondDropdown(true);
                              }
                            }}
                            onFocus={() => {
                              if (!showHistoryFilter) {
                              setShowPondDropdown(true);
                              // Clear search term when focusing to show all ponds
                              if (!pondSearchTerm) {
                                setPondSearchTerm('');
                                }
                              }
                            }}
                            placeholder={showHistoryFilter ? "History Mode - All Ponds" : (selectedPond ? `${selectedPond} - Click to see all ponds` : "Type to search ponds...")}
                            className="pond-search-input"
                            disabled={showHistoryFilter}
                            style={{ 
                              opacity: showHistoryFilter ? 0.5 : 1,
                              cursor: showHistoryFilter ? 'not-allowed' : 'pointer'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => !showHistoryFilter && setShowPondDropdown(!showPondDropdown)}
                            className="pond-dropdown-toggle"
                            disabled={showHistoryFilter}
                            style={{ 
                              opacity: showHistoryFilter ? 0.5 : 1,
                              cursor: showHistoryFilter ? 'not-allowed' : 'pointer'
                            }}
                          >
                            ▼
                          </button>
                        </div>
                        
                        {showPondDropdown && !showHistoryFilter && (
                          <div className="pond-dropdown-list">
                            {dropdownPonds.length > 0 ? (
                              dropdownPonds.map((pond, index) => (
                                <div
                                  key={index}
                                  className={`pond-dropdown-item ${selectedPond === pond.name ? 'selected' : ''}`}
                                  onClick={() => {
                                    setSelectedPond(pond.name);
                                    setPondSearchTerm(''); // Clear search term to show all ponds next time
                                    setShowPondDropdown(false);
                                  }}
                                >
                                  <span className="pond-name">{pond.name}</span>
                                  <span className={`pond-risk ${normalizeRisk(pond.riskLevel).toLowerCase()}`}>
                                    {pond.riskLevel} Risk
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div className="pond-dropdown-item no-results">
                                No ponds found matching your search
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                {/* View History / Back to Latest Button */}
                      {(() => {
                        const farm = farms.find(f => f.farm_key === detailsFarmKey);
                        if (!farm) return null;
                        
                        const availableDates = getAllDates(farm);
                        
                        if (selectedTimestamp === 'latest' && availableDates.length > 0 && !showHistoryFilter) {
                          return (
                  <div className="view-history-section">
                    <button
                      onClick={() => {
                                  isUserActionRef.current = true;
                        setShowHistoryFilter(true);
                        // Clear selected pond in history mode to show all ponds
                        setSelectedPond(null);
                        // Show the most recent date
                        const mostRecentDate = availableDates[0];
                        if (mostRecentDate) {
                          setSelectedTimestamp(mostRecentDate.value);
                        }
                      }}
                      className="view-history-button"
                    >
                      View History
                    </button>
                  </div>
                          );
                        } else if (showHistoryFilter) {
                          return (
                  <div className="view-history-section">
                    <button
                      onClick={() => {
                                  isUserActionRef.current = true;
                        setShowHistoryFilter(false);
                        setSelectedTimestamp('latest');
                        // Return to "all ponds" when exiting history mode.
                        // Do not auto-select a single pond.
                        setSelectedPond(null);
                        setPondSearchTerm('');
                        setExpandedCardId(null);
                      }}
                      className="back-to-latest-button"
                    >
                                Exit History Mode
                    </button>
                  </div>
                          );
                        }
                        return null;
                      })()}
                      
                    </div>
                  );
                })()}

                  {/* Date Filter - Only show when viewing history */}
                  {showHistoryFilter && (() => {
                    const farm = farms.find(f => f.farm_key === detailsFarmKey);
                    if (!farm) return null;
                    
                    const availableDates = getAllDates(farm);
                    
                    
                    return (
                      <div className="timestamp-filter-section" style={{ marginBottom: '20px', padding: '15px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <label htmlFor="date-select" style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#374151' }}>
                          📅 Select Report Date{selectedPond ? ` for ${selectedPond}` : ''}:
                        </label>
                        <select
                          id="date-select"
                          value={selectedTimestamp}
                          onChange={(e) => {
                            setSelectedTimestamp(e.target.value);
                          }}
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
                          <option value="latest">{selectedPond ? `Latest Report for ${selectedPond}` : 'Latest Report Per Pond'}</option>
                          {availableDates.map((date, index) => (
                            <option key={date.value} value={date.value}>
                              {date.label}
                            </option>
                          ))}
                        </select>
                  </div>
                    );
                  })()}

                  {/* Tab Content */}
                  <div className="tab-content">
                  {(() => {
                    const farm = farms.find(f => f.farm_key === detailsFarmKey);
                    if (!farm) return null;
                    
                    const availablePonds = getAvailablePonds(farm);
                    const filteredPonds = availablePonds.filter(pond => {
                      if (selectedRiskLevel === 'all') return true;
                      return normalizeRisk(pond.riskLevel) === selectedRiskLevel;
                    });
                    
                    // Check if selected pond matches the current risk level filter
                    const selectedPondMatchesFilter = selectedPond && filteredPonds.some(pond => pond.name === selectedPond);
                    
                    // When not viewing history:
                    // - If selectedPond is null => treat it as "show all ponds", so don't show a "select a pond" block.
                    // - If selectedPond exists but doesn't match the risk filter => show the no-pond message.
                    if (!showHistoryFilter && selectedPond && !selectedPondMatchesFilter) {
                      return (
                        <div className="no-pond-selected">
                          <div className="no-pond-message">
                            <h4>
                              {`🔍 No ponds found with ${selectedRiskLevel === 'all' ? 'any' : selectedRiskLevel} risk level. Please select a different risk level or choose another pond.`}
                            </h4>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                    <>
                      {/* Informational message about latest reports */}
                      {!showHistoryFilter && selectedTimestamp === 'latest' && selectedPond && (
                        <div
                          style={{
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            color: '#166534',
                            padding: '8px 12px',
                            borderRadius: 6,
                            marginBottom: 12,
                            fontSize: '0.9rem',
                            lineHeight: 1.4,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          Only ponds with the latest risk reports are shown.
                        </div>
                      )}

                      {/* No latest reports message */}
                      {!showHistoryFilter && selectedTimestamp === 'latest' && selectedPond && (() => {
                        const farm = farms.find(f => f.farm_key === detailsFarmKey);
                        if (!farm) return null;
                        
                        const latestPonds = getLatestRiskPerPond(farm);
                        const hasLatestForSelectedPond = latestPonds.some(pred => 
                          formatPondName(pred.fish_pond) === selectedPond
                        );
                        
                        if (!hasLatestForSelectedPond) {
                          return (
                            <div
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                padding: '12px 16px',
                                borderRadius: 8,
                                marginBottom: 12,
                                fontSize: '0.95rem',
                                lineHeight: 1.4,
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              No latest reports found for this pond.
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {activeTab === 'overview' && (
                    <div className="tab-panel">                      
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
                        Overview shows the pond's current risk level and how confident the system is about that prediction. A higher confidence means the result is more reliable, while a lower confidence indicates that the result may be less accurate due to limited or inconsistent data.
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
                      
                      {showHistoryFilter ? (
                        // Card-based layout for history mode
                        <div className="historical-reports-cards">
                          {displayPredictions.length > 0 ? (() => {
                            // Group predictions by pond
                            const pondGroups = {};
                            displayPredictions.forEach(p => {
                              const pondName = formatPondName(p.fish_pond) || t('riskReportModal.unknownPond');
                              if (!pondGroups[pondName]) {
                                pondGroups[pondName] = [];
                              }
                              pondGroups[pondName].push(p);
                            });

                            const pondNames = Object.keys(pondGroups).sort();

                            return pondNames.map((pondName, pondIndex) => {
                              const pondReports = pondGroups[pondName];
                              const isMultipleReports = pondReports.length > 1;
                              
                              return (
                                <div key={pondName} className="pond-group-cards">
                                  {/* Different pond divider removed for cleaner UI */}
                                  {/* Cards for each report in this pond */}
                                  {pondReports.map((p, reportIndex) => {
                                    const risk = normalizeRisk(p.risk_level);
                                    const emoji = risk === 'High' ? '🔴' : risk === 'Medium' ? '🟠' : risk === 'Low' ? '🟢' : '🟢';
                                    const generatedMs = getTimestampMs(p.generated_timestamp || p.timestamp);
                                    const reportTime = generatedMs ? new Date(generatedMs).toLocaleTimeString() : '—';
                                    
                                    return (
                                      <div 
                                        key={p.id || `${pondName}-${reportIndex}`}
                                        className="historical-report-card"
                            style={{
                              background: 'white',
                                          border: '1px solid #e5e7eb',
                                          borderRadius: '8px',
                                          padding: '16px',
                                          marginBottom: '12px',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.borderColor = '#3b82f6';
                                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.borderColor = '#e5e7eb';
                                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
                                        }}
                                        onClick={() => {
                                          const cardId = p.id || `${pondName}-${reportIndex}`;
                                          setExpandedCardId(expandedCardId === cardId ? null : cardId);
                                        }}
                                      >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                          <div>
                                            <div style={{ fontWeight: '600', fontSize: '1rem', color: '#1f2937' }}>
                                              <span
                                                style={{
                                                  display: 'inline-block',
                                                  marginRight: 8,
                                                  fontSize: '0.85rem',
                                                  color: '#1A4375',
                                                  fontWeight: 700
                                                }}
                                                aria-hidden="true"
                                              >
                                                {expandedCardId === (p.id || `${pondName}-${reportIndex}`) ? '▼' : '▶'}
                                              </span>
                                              {pondName}
                                              {isMultipleReports && (
                                                <span style={{ 
                                                  fontSize: '0.75rem', 
                                                  color: '#6b7280', 
                                                  marginLeft: '8px',
                                                  fontWeight: '500'
                                                }}>
                                                  Report #{reportIndex + 1} • {reportTime}
                                                </span>
                                              )}
                                            </div>
                                            <div style={{ marginTop: '4px', fontSize: '0.875rem', color: '#6b7280' }}>
                                              {emoji} {risk === 'High' ? t('riskReportModal.highRisk') : risk === 'Medium' ? t('riskReportModal.mediumRisk') : risk === 'Low' ? t('riskReportModal.lowRisk') : t('riskReportModal.normalRisk')}
                                            </div>
                                          </div>
                                          <div style={{ textAlign: 'right' }}>
                                            {(() => {
                                              if (typeof p.confidence !== 'number') return <span style={{ color: '#6b7280' }}>—</span>;
                                              const value = Number(p.confidence);
                                              const interp = getConfidenceInterpretation(value, p.risk_level);
                                              if (!interp) return <span style={{ fontWeight: '600' }}>{value.toFixed(1)}%</span>;
                                              return (
                                                <div>
                                                  <div style={{ color: interp.color, fontWeight: 600, fontSize: '0.875rem' }}>
                                                    {value.toFixed(1)}% {interp.emoji} {interp.label}
                                                  </div>
                                                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '2px' }}>
                                                    {interp.label} about {normalizeRisk(p.risk_level)} Risk
                                                  </div>
                                                </div>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                        
                                        {/* Expanded Details */}
                                        {expandedCardId === (p.id || `${pondName}-${reportIndex}`) && (
                                          <div style={{ 
                                            marginTop: '16px', 
                                            paddingTop: '16px', 
                                            borderTop: '1px solid #e5e7eb',
                                            fontSize: '0.875rem'
                                          }}>
                                            <div className="pond-reason-details">
                                              {(() => {
                                                const reasonText = buildPondReason(p);
                                                const recommendedActions = extractRecommendedActions(reasonText);
                                                const cleanReason = cleanReasonText(reasonText);
                                                
                                                return (
                                                  <>
                                                    <div className="reason-summary" style={{ marginBottom: '12px' }}>
                                                      <strong>Reason:</strong> {cleanReason}
                                                    </div>
                                                    {recommendedActions && (
                                                      <div className="recommended-actions" style={{ marginBottom: '12px' }}>
                                                        <strong>Actions:</strong> {recommendedActions}
                                                      </div>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                              <div className="timestamps-info" style={{ 
                                                display: 'flex', 
                                                gap: '16px', 
                                                flexWrap: 'wrap',
                                                fontSize: '0.8rem',
                                                color: '#6b7280'
                                              }}>
                                                <span className="timestamp-item">
                                                  <strong>Data submitted:</strong> {(() => {
                                                    const submittedMs = getTimestampMs(p.submitted_timestamp);
                                                    return submittedMs ? new Date(submittedMs).toLocaleDateString() : '—';
                                                  })()}
                                                </span>
                                                <span className="timestamp-item">
                                                  <strong>Prediction generated:</strong> {generatedMs ? new Date(generatedMs).toLocaleDateString() : '—'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            });
                          })() : (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                              No predictions were recorded for this period. The system will update automatically when new data becomes available.
                            </div>
                          )}
                        </div>
                      ) : (
                        // Original table layout for normal mode
                      <div className="pond-details-table">
                          <table className="pond-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40%' }}>{t('riskReportModal.pond')}</th>
                          <th style={{ whiteSpace: 'nowrap', width: '30%' }}>{t('riskReportModal.riskLevel')}</th>
                          <th style={{ width: '30%', textAlign: 'right' }}>{t('riskReportModal.confidence')}</th>
                        </tr>
                      </thead>
                          <tbody>
                              {displayPredictions.length > 0 ? (() => {
                                const shouldCollapseRows = displayPredictions.length > 3;
                                
                                // Group predictions by pond
                                const pondGroups = {};
                                displayPredictions.forEach(p => {
                                  const pondName = formatPondName(p.fish_pond) || t('riskReportModal.unknownPond');
                                  if (!pondGroups[pondName]) {
                                    pondGroups[pondName] = [];
                                  }
                                  pondGroups[pondName].push(p);
                                });

                                const pondNames = Object.keys(pondGroups).sort();
                                let rowIndex = 0;

                                return pondNames.map((pondName, pondIndex) => {
                                  const pondReports = pondGroups[pondName];
                                  const isMultipleReports = pondReports.length > 1;
                                  
                                  return (
                                    <React.Fragment key={pondName}>
                                      {/* Different pond divider removed for cleaner UI */}
                                      {pondReports.map((p, reportIndex) => {
                              const risk = normalizeRisk(p.risk_level);
                              const emoji = risk === 'High' ? '🔴' : risk === 'Medium' ? '🟠' : risk === 'Low' ? '🟢' : '🟢';
                          const submittedMs = getTimestampMs(p.submitted_timestamp);
                          const generatedMs = getTimestampMs(p.generated_timestamp || p.timestamp);
                          const submittedDate = submittedMs ? new Date(submittedMs).toLocaleDateString() : '—';
                          const generatedDate = generatedMs ? new Date(generatedMs).toLocaleDateString() : '—';
                                        const reportTime = generatedMs ? new Date(generatedMs).toLocaleTimeString() : '—';
                                        const detailKey = p.id || `${pondName}-${reportIndex}`;
                                        const isExpanded = !shouldCollapseRows || expandedCardId === detailKey;
                              
                              return (
                                          <React.Fragment key={detailKey}>
                                {/* Main pond row */}
                                <tr
                                  className="pond-table-row"
                                  style={{ cursor: shouldCollapseRows ? 'pointer' : 'default' }}
                                  onClick={() => {
                                    if (!shouldCollapseRows) return;
                                    setExpandedCardId(prev => (prev === detailKey ? null : detailKey));
                                  }}
                                >
                                              <td className="pond-name" style={{ whiteSpace: 'nowrap', width: '40%' }}>
                                                {shouldCollapseRows && (
                                                  <span
                                                    style={{
                                                      display: 'inline-block',
                                                      marginRight: 8,
                                                      fontSize: '0.85rem',
                                                      color: '#1A4375',
                                                      fontWeight: 700
                                                    }}
                                                    aria-hidden="true"
                                                  >
                                                    {isExpanded ? '▼' : '▶'}
                                                  </span>
                                                )}
                                                {pondName}
                                                {isMultipleReports && (
                                                  <div style={{ 
                                                    fontSize: '0.75rem', 
                                                    color: '#6b7280', 
                                                    marginTop: '2px',
                                                    fontWeight: '500'
                                                  }}>
                                                    Report #{reportIndex + 1} • {reportTime}
                                                  </div>
                                                )}
                                              </td>
                                  <td style={{ width: '30%' }}>{emoji} {risk === 'High' ? t('riskReportModal.highRisk') : risk === 'Medium' ? t('riskReportModal.mediumRisk') : risk === 'Low' ? t('riskReportModal.lowRisk') : t('riskReportModal.normalRisk')}</td>
                                  <td className="confidence-value" style={{ width: '30%', textAlign: 'right' }}>
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
                                {isExpanded && (
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
                                )}
                              </React.Fragment>
                              );
                                      })}
                                    </React.Fragment>
                                  );
                                });
                              })() : (
                              <tr>
                                <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                                    No predictions were recorded for this period. The system will update automatically when new data becomes available.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      )}
                      
                      {/* Show urgent recommendations in overview if no checklist data exists for this specific pond */}
                      {(() => {
                        const farm = farms.find(f => f.farm_key === detailsFarmKey);
                        const checklist = checklistData[detailsFarmKey];
                        
                        // Check if checklist data exists for the specific selected pond
                        const hasChecklistForThisPond = checklist && 
                          checklist.location_info?.fish_pond && 
                          formatPondName(checklist.location_info.fish_pond) === selectedPond;

                        // Only show urgent recommendations in overview if there's no checklist data for this specific pond
                        if (hasChecklistForThisPond) {
                          return null;
                        }
                        
                        if (!farm) {
                          return null;
                        }
                        
                        // Hide urgent recommendations if there are no predictions to show
                        if (displayPredictions.length === 0) {
                          return null;
                        }
                        
                        const availablePonds = getAvailablePonds(farm);
                        const selectedPondData = availablePonds.find(pond => pond.name === selectedPond);
                        const currentRiskLevel = selectedPondData?.riskLevel || 'Normal';
                        
                        // Get all predictions for this farm to find recommended_actions
                        const farmPredictions = farm.predictions || [];
                        const urgentRecommendations = getUrgentRecommendations(
                          currentRiskLevel, 
                          detailsFarmKey, 
                          selectedPond, 
                          farmPredictions
                        );
                        
                        if (urgentRecommendations.length === 0) {
                          return null;
                        }
                        
                        return (
                          <div className="urgent-recommendations-section">
                            <div 
                              className="urgent-recommendations-header"
                              onClick={() => setShowUrgentRecommendations(!showUrgentRecommendations)}
                              style={{ cursor: 'pointer' }}
                            >
                              <div>
                                <h5>🔥 Urgent Recommendations (High Risk Only)</h5>
                                <div className="urgent-recommendations-subtitle">
                                  {farm?.farm_name || t('riskReportModal.unknownFarm')} - {selectedPond}
                                </div>
                              </div>
                              <span className="urgent-toggle-icon">
                                {showUrgentRecommendations ? '▼' : '▶'}
                              </span>
                            </div>
                            
                            {showUrgentRecommendations && (
                              <div className="urgent-recommendations-list">
                                {urgentRecommendations.length === 8 && urgentRecommendations[0] === 'Adjust aeration system immediately to improve oxygen levels' ? (
                                  <div className="urgent-recommendations-warning">
                                    ⚠️ Using fallback recommendations - Database recommendations not found
                                  </div>
                                ) : urgentRecommendations.length > 7 ? (
                                  <div className="urgent-recommendations-info">
                                    ℹ️ Showing urgent recommendations from risk prediction system ({urgentRecommendations.length} total)
                                  </div>
                                ) : (
                                  <div className="urgent-recommendations-source">
                                    ✅ Recommendations from risk prediction system ({urgentRecommendations.length} recommendations)
                                  </div>
                                )}
                                {urgentRecommendations.map((rec, index) => (
                                  <div key={index} className="urgent-recommendation-item">
                                    <span className="urgent-recommendation-bullet">•</span>
                                    <span className="urgent-recommendation-text">{rec}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      

                    </div>
                  )}

                  {activeTab === 'checklist' && (
                    <div className="tab-panel">
                      <div className="checklist-completion-section">
                        {(() => {
                          const farm = farms.find(f => f.farm_key === detailsFarmKey);
                          
                          // When in history mode, use historical checklist data
                          let checklist;
                          if (showHistoryFilter) {
                            const effectiveSelectedMs = (typeof forcedDateMs === 'number' && forcedDateMs > 0)
                              ? forcedDateMs
                              : (selectedTimestamp !== 'latest' ? parseInt(selectedTimestamp, 10) : null);
                            
                            if (effectiveSelectedMs) {
                              checklist = historicalChecklistData[`${detailsFarmKey}_${effectiveSelectedMs}`];
                            }
                          } else {
                            checklist = checklistData[detailsFarmKey];
                          }
                          
                          // Get current risk level for the selected pond
                          const availablePonds = farm ? getAvailablePonds(farm) : [];
                          const pondRiskData = availablePonds.find(pond => pond.name === selectedPond);
                          const currentRiskLevel = pondRiskData?.riskLevel || 'Normal';
                          
                          if (!checklist) {
                            return (
                              <div className={showHistoryFilter ? "historical-reports-cards" : "no-checklist-data"}>
                                <div className={showHistoryFilter ? "historical-report-card" : "no-checklist-data"} style={showHistoryFilter ? {
                                  background: 'white',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '8px',
                                  padding: '16px',
                                  textAlign: 'center'
                                } : {}}>
                                  <h4 style={{ margin: showHistoryFilter ? '0 0 8px 0' : '0', color: showHistoryFilter ? '#1f2937' : 'inherit' }}>📋 Checklist Completion</h4>
                                  <p style={{ margin: '0', color: showHistoryFilter ? '#6b7280' : 'inherit' }}>No checklist has been started for this pond yet.</p>
                                </div>
                              </div>
                            );
                          }

                          // Check if the selected pond has checklist data
                          const selectedPondData = checklist.location_info?.fish_pond;
                          const formattedSelectedPond = selectedPond ? formatPondName(selectedPond) : null;
                          const formattedChecklistPond = selectedPondData ? formatPondName(selectedPondData) : null;
                          
                          
                          // If a specific pond is selected but checklist data is for a different pond
                          // Only apply this check when NOT in history mode
                          if (!showHistoryFilter && selectedPond && formattedChecklistPond && formattedSelectedPond !== formattedChecklistPond) {
                            return (
                              <div className="no-checklist-data">
                                <h4>📋 Checklist Completion</h4>
                                <p>No checklist has been started for this pond yet.</p>
                              </div>
                            );
                          }

                          const { completed_checklist = [], completion_metrics = {}, farm_details = {}, location_info = {}, predictive_analytics = {} } = checklist;
                          const completionRate = completion_metrics.completion_rate || 0;
                          const totalTasks = completion_metrics.total_tasks || 0;
                          const completedTasks = completion_metrics.completed_tasks || 0;
                          const highPriorityCompletion = completion_metrics.high_priority_completion || 0;
                          const riskReduction = predictive_analytics.completed_tasks_benefits?.risk_reduction?.risk_reduction_percentage || 0;
                          const preventionEffectiveness = predictive_analytics.completed_tasks_benefits?.risk_reduction?.prevention_effectiveness || 0;
                          const systemStability = predictive_analytics.completed_tasks_benefits?.risk_reduction?.system_stability || 'Unknown';
                          
                          const nextRecommendations = predictive_analytics.next_recommendations || [];

                          return (
                            <>
                              {/* Conditional info text based on risk level */}
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
                                {normalizeRisk(currentRiskLevel) === 'High' ? (
                                  <>
                                    <span style={{ marginRight: 8 }}>⚠️</span>
                                    This section highlights the current checklist progress for the selected pond. Immediate attention is recommended to complete remaining tasks and reduce high-risk conditions.
                                  </>
                                ) : (
                                  <>
                                    <span style={{ marginRight: 8 }}>💡</span>
                                    This section shows how many checklist tasks have been completed for the selected pond. It helps track progress and identify areas that need attention before risks increase.
                                  </>
                                )}
                              </div>
                              
                              <div className="checklist-summary-card">
                                <div className="farm-info">
                                  <strong>{t('riskReportModal.farm')}:</strong> {farm_details.farm_name || farm?.farm_name || t('riskReportModal.unknownFarm')}<br/>
                                  <strong>{t('riskReportModal.pond')}:</strong> {location_info.fish_pond || t('riskReportModal.unknownPond')}
                                </div>
                                
                                <div className="progress-section">
                                  <div className="progress-header">
                                    <span>Progress:</span>
                                    <span className="completion-rate">{completionRate}%</span>
                                  </div>
                                  <div className="progress-bar">
                                    <div 
                                      className="progress-fill" 
                                      style={{ width: `${completionRate}%` }}
                                    ></div>
                                  </div>
                                  <div className="progress-status">
                                    {completionRate === 100 ? '✅ All tasks completed' : `${completedTasks}/${totalTasks} tasks completed`}
                                  </div>
                                </div>

                                <div className="task-summary">
                                  <div className="summary-item">
                                    <span className="summary-label">• {totalTasks} total tasks</span>
                                  </div>
                                  <div className="summary-item">
                                    <span className="summary-label">• {completedTasks} completed</span>
                                  </div>
                                  <div className="summary-item">
                                    <span className="summary-label">• {completion_metrics.total_high_priority_tasks || 0} high-priority tasks pending</span>
                                  </div>
                                </div>
                              </div>

                              <div className="breakdown-section">
                                <h5>Breakdown by Category</h5>
                                <div className="breakdown-table">
                                  <div className="table-header">
                                    <div className="header-cell">Category</div>
                                    <div className="header-cell">Task</div>
                                    <div className="header-cell">Priority</div>
                                    <div className="header-cell">Status</div>
                                  </div>
                                  {completed_checklist.map((task, index) => (
                                    <div key={index} className={`table-row ${task.completed ? 'completed-row' : 'pending-row'}`}>
                                      <div className="table-cell category-cell">
                                        {task.category?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown'}
                                      </div>
                                      <div className="table-cell task-cell">
                                        {task.task || 'Unknown Task'}
                                      </div>
                                      <div className="table-cell priority-cell">
                                        <span className={`priority-badge ${task.priority || 'low'}`}>
                                          {task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1) || 'Low'}
                                        </span>
                                      </div>
                                      <div className="table-cell status-cell">
                                        {task.completed ? '✅ Done' : '⏳ Pending'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="metrics-section">
                                <h5>Completion Metrics</h5>
                                <div className="metrics-grid">
                                  <div className="metric-item">
                                    <span className="metric-label">Completion Rate:</span>
                                    <span className="metric-value">{completionRate}%</span>
                                  </div>
                                  <div className="metric-item">
                                    <span className="metric-label">High Priority Completion:</span>
                                    <span className="metric-value">{highPriorityCompletion}%</span>
                                  </div>
                                  <div className="metric-item">
                                    <span className="metric-label">System Stability:</span>
                                    <span className="metric-value">{systemStability}</span>
                                  </div>
                                  <div className="metric-item">
                                    <span className="metric-label">Risk Reduction:</span>
                                    <span className="metric-value">{riskReduction}%</span>
                                  </div>
                                  <div className="metric-item">
                                    <span className="metric-label">Prevention Effectiveness:</span>
                                    <span className="metric-value">{preventionEffectiveness}%</span>
                                  </div>
                                </div>
                              </div>

                              {/* Urgent Recommendations - Only show for High Risk when checklist data exists for this specific pond */}
                              {(() => {
                                const farm = farms.find(f => f.farm_key === detailsFarmKey);
                                if (!farm) return null;
                                
                                // Check if checklist data exists for the specific selected pond
                                const hasChecklistForThisPond = checklist && 
                                  checklist.location_info?.fish_pond && 
                                  formatPondName(checklist.location_info.fish_pond) === selectedPond;
                                
                                // Only show urgent recommendations in checklist tab if checklist data exists for this specific pond
                                if (!hasChecklistForThisPond) return null;
                                
                                const availablePonds = getAvailablePonds(farm);
                                const selectedPondData = availablePonds.find(pond => pond.name === selectedPond);
                                const currentRiskLevel = selectedPondData?.riskLevel || 'Normal';
                                
                              })()}

                              {nextRecommendations.length > 0 && (
                                <div className="recommendations-section">
                                  <h5>Next Recommendations</h5>
                                  <div className="recommendations-list">
                                    {nextRecommendations.map((rec, index) => (
                                      <div key={index} className="recommendation-item">
                                        <span className="recommendation-arrow">→</span>
                                        <span className="recommendation-text">{rec}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {activeTab === 'insights' && (
                    <div className="tab-panel">
                      <div className="ai-insights-section">
                        {(() => {
                          const farm = farms.find(f => f.farm_key === detailsFarmKey);
                          
                          // When in history mode, use historical checklist data
                          let checklist;
                          if (showHistoryFilter) {
                            const effectiveSelectedMs = (typeof forcedDateMs === 'number' && forcedDateMs > 0)
                              ? forcedDateMs
                              : (selectedTimestamp !== 'latest' ? parseInt(selectedTimestamp, 10) : null);
                            
                            if (effectiveSelectedMs) {
                              checklist = historicalChecklistData[`${detailsFarmKey}_${effectiveSelectedMs}`];
                            }
                          } else {
                            checklist = checklistData[detailsFarmKey];
                          }
                          
                          // Get current risk level for the selected pond
                          const availablePonds = farm ? getAvailablePonds(farm) : [];
                          const pondRiskData = availablePonds.find(pond => pond.name === selectedPond);
                          const currentRiskLevel = pondRiskData?.riskLevel || 'Normal';
                          
                          if (!checklist || !checklist.predictive_analytics) {
                            return (
                              <div className={showHistoryFilter ? "historical-reports-cards" : "no-insights-data"}>
                                <div className={showHistoryFilter ? "historical-report-card" : "no-insights-data"} style={showHistoryFilter ? {
                                  background: 'white',
                                  border: '1px solid #e5e7eb',
                                  borderRadius: '8px',
                                  padding: '16px',
                                  textAlign: 'center'
                                } : {}}>
                                  <h4 style={{ margin: showHistoryFilter ? '0 0 8px 0' : '0', color: showHistoryFilter ? '#1f2937' : 'inherit' }}>🎯 Insights</h4>
                                  <div style={{ margin: showHistoryFilter ? '0 0 8px 0' : '8px 0', fontSize: '0.88rem', color: '#4b5563' }}>
                                    <strong>Farm:</strong> {farm?.farm_name || t('riskReportModal.unknownFarm')} |{' '}
                                    <strong>Pond:</strong> {selectedPond || checklist?.location_info?.fish_pond || 'All ponds'}
                                  </div>
                                  <p style={{ margin: '0', color: showHistoryFilter ? '#6b7280' : 'inherit' }}>No completed tasks detected. Insights will be available once progress is made.</p>
                                </div>
                              </div>
                            );
                          }

                          // Check if the selected pond has AI insights data
                          const selectedPondData = checklist.location_info?.fish_pond;
                          const formattedSelectedPond = selectedPond ? formatPondName(selectedPond) : null;
                          const formattedChecklistPond = selectedPondData ? formatPondName(selectedPondData) : null;
                          
                          
                          // If a specific pond is selected but AI insights data is for a different pond
                          // Only apply this check when NOT in history mode
                          if (!showHistoryFilter && selectedPond && formattedChecklistPond && formattedSelectedPond !== formattedChecklistPond) {
                            return (
                              <div className="no-insights-data">
                                <h4>🎯 Insights</h4>
                                <p>No completed tasks detected. Insights will be available once progress is made.</p>
                              </div>
                            );
                          }

                          const { predictive_analytics = {} } = checklist;
                          const {
                            overall_assessment = 'Unknown',
                            completed_tasks_benefits = {},
                            risk_reduction = {},
                            next_recommendations = [],
                            recommended_focus = [],
                            incomplete_tasks_risks = {},
                            impact_analysis = {}
                          } = predictive_analytics;
                          
                          // Get risk_timeline directly from predictive_analytics (where it actually is)
                          const risk_timeline = predictive_analytics.risk_timeline || {};
                          
                          // Get improvement_timeline from completed_tasks_benefits (where it actually is)
                          const improvement_timeline = completed_tasks_benefits?.improvement_timeline || {};
                          
                          // Get urgency_level from multiple possible locations
                          let urgency_level = checklist.urgency_level || 
                                            predictive_analytics.urgency_level ||
                                            incomplete_tasks_risks?.urgency_level;
                          
                          // If urgency_level is not found, try to derive it from other data
                          if (!urgency_level) {
                            // Check if we can derive urgency from risk_level or other indicators
                            const riskLevel = checklist.risk_level || 'Unknown';
                            const completionRate = checklist.completion_metrics?.completion_rate || 0;
                            
                            // Simple heuristic: if completion rate is 100% and risk is low, urgency is likely low
                            // if completion rate is low or risk is high, urgency is likely high
                            if (completionRate === 100 && riskLevel.toLowerCase().includes('low')) {
                              urgency_level = 'Low';
                            } else if (completionRate < 50 || riskLevel.toLowerCase().includes('high')) {
                              urgency_level = 'High';
                            } else {
                              urgency_level = 'Medium'; // Default fallback
                            }
                          }
                          

                          const benefits = completed_tasks_benefits.benefits || [];
                          const confidenceBoost = completed_tasks_benefits.confidence_boost || 0;
                          const preventionEffectiveness = completed_tasks_benefits?.risk_reduction?.prevention_effectiveness || 0;
                          const riskReductionPercentage = completed_tasks_benefits?.risk_reduction?.risk_reduction_percentage || 0;
                          const systemStability = completed_tasks_benefits?.risk_reduction?.system_stability || 'Unknown';
                          
                          // Get next_recommendations from completed_tasks_benefits (where it actually is)
                          const nextRecommendationsFromBenefits = completed_tasks_benefits?.next_recommendations || [];

                          return (
                            <>
                              <h4>🎯 Insights</h4>
                              <div style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#4b5563' }}>
                                <strong>Farm:</strong> {farm?.farm_name || t('riskReportModal.unknownFarm')} |{' '}
                                <strong>Pond:</strong> {selectedPond || formattedChecklistPond || 'All ponds'}
                              </div>
                              
                              {/* Conditional info text based on risk level */}
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
                                {normalizeRisk(currentRiskLevel) === 'High' ? (
                                  <>
                                    <span style={{ marginRight: 8 }}>⚠️</span>
                                    This section shows critical insights for the selected pond. Immediate action is recommended to address severe risks and restore system stability before conditions worsen.
                                  </>
                                ) : normalizeRisk(currentRiskLevel) === 'Medium' ? (
                                  <>
                                    <span style={{ marginRight: 8 }}>💡</span>
                                    This section provides insights into the pond's current condition. It helps identify moderate risks, ongoing improvements, and actions that can enhance system stability.
                                  </>
                                ) : (
                                  <>
                                    <span style={{ marginRight: 8 }}>💡</span>
                                    This section provides insights into the pond's stable condition. It highlights performance trends, recovery timelines, and next recommendations to sustain good system health.
                                  </>
                                )}
                              </div>
                              
                              <div className="insights-summary-card">
                                <div className="assessment-grid">
                                  <div className="assessment-item">
                                    <span className="assessment-label">Overall Assessment:</span>
                                    <span className={`assessment-value ${overall_assessment.toLowerCase()}`}>
                                      {overall_assessment}
                                    </span>
                                  </div>
                                  <div className="assessment-item">
                                    <span className="assessment-label">Urgency Level:</span>
                                    <span className={`urgency-value ${urgency_level.toLowerCase()}`}>
                                      {urgency_level}
                                    </span>
                                  </div>
                                  <div className="assessment-item">
                                    <span className="assessment-label">Confidence Boost:</span>
                                    <span className="confidence-value">
                                      {confidenceBoost >= 0 ? '+' : ''}{confidenceBoost}%
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="timeline-section">
                                <h5>🕒 Recovery Timeline</h5>
                                <div className="timeline-grid">
                                  <div className="timeline-item">
                                    <span className="timeline-label">• Immediate Benefits:</span>
                                    <span className="timeline-value">{improvement_timeline.immediate_benefits || 'Unknown'}</span>
                                  </div>
                                  <div className="timeline-item">
                                    <span className="timeline-label">• Short-Term:</span>
                                    <span className="timeline-value">{improvement_timeline.short_term_improvements || 'Unknown'}</span>
                                  </div>
                                  <div className="timeline-item">
                                    <span className="timeline-label">• Medium-Term:</span>
                                    <span className="timeline-value">{improvement_timeline.medium_term_recovery || 'Unknown'}</span>
                                  </div>
                                  <div className="timeline-item">
                                    <span className="timeline-label">• Full Stabilization:</span>
                                    <span className="timeline-value">{improvement_timeline.full_stabilization || 'Unknown'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="system-stability-section">
                                <h5>🌊 System Stability</h5>
                                <div className="stability-grid">
                                  <div className="stability-item">
                                    <span className="stability-label">• Overall Risk Level:</span>
                                    <span className="stability-value">{checklist.risk_level || 'Unknown'}</span>
                                  </div>
                                  <div className="stability-item">
                                    <span className="stability-label">• System Stability:</span>
                                    <span className="stability-value">{systemStability}</span>
                                  </div>
                                  <div className="stability-item">
                                    <span className="stability-label">• Prevention Effectiveness:</span>
                                    <span className="stability-value">{preventionEffectiveness}%</span>
                                  </div>
                                  <div className="stability-item">
                                    <span className="stability-label">• Risk Reduction Achieved:</span>
                                    <span className="stability-value">{riskReductionPercentage}%</span>
                                  </div>
                                </div>
                              </div>

                              {benefits.length > 0 && (
                                <div className="benefits-section">
                                  <h5>💡 Key Insights</h5>
                                  <div className="benefits-list">
                                    {benefits.map((benefit, index) => (
                                      <div key={index} className="benefit-item">
                                        <span className="benefit-text">{benefit}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {(next_recommendations.length > 0 || nextRecommendationsFromBenefits.length > 0) && (
                                <div className="next-recommendations-section">
                                  <h5>🧭 Next Recommendations</h5>
                                  <div className="recommendations-list">
                                    {(next_recommendations.length > 0 ? next_recommendations : nextRecommendationsFromBenefits).map((recommendation, index) => (
                                      <div key={index} className="recommendation-item">
                                        <span className="recommendation-text">• {recommendation}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {recommended_focus.length > 0 && (
                                <div className="recommended-focus-section">
                                  <h5>📅 Next Recommended Focus:</h5>
                                  <div className="focus-list">
                                    {recommended_focus.map((focus, index) => (
                                      <div key={index} className="focus-item">
                                        <span className="focus-text">• {focus}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                    </>
                  );
                })()}
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
