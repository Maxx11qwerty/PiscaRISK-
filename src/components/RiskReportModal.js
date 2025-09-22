import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle, FaShieldAlt, FaInfoCircle, FaLightbulb } from 'react-icons/fa';
import { RiAlertFill } from 'react-icons/ri';
import { PiNoteFill } from 'react-icons/pi';
import { IoTimeSharp } from 'react-icons/io5';
import { FaFileExport } from 'react-icons/fa6';
import { exportRiskOverviewCSV, exportRiskOverviewPDF, exportFarmPondCSV, exportFarmPondPDF } from '../utils/exportRiskReport';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { sanitizeTimestamp } from '../utils/securityUtils';
import { logActivity, logMessages } from '../utils/logger';
import { AuthContext } from '../contexts/AuthContext';
import './RiskReportModal.css';

const RiskReportModal = ({ isModal = false }) => {
  const { t } = useTranslation();
  const { currentUser } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState([]);
  const [detailsFarmKey, setDetailsFarmKey] = useState(null);
  const [actionsFarmKey, setActionsFarmKey] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [feedbackCache, setFeedbackCache] = useState({});
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [selectedTimestamp, setSelectedTimestamp] = useState('latest');
  const [availableTimestamps, setAvailableTimestamps] = useState([]);
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);

  // Resolve assigned farm name for current user
  useEffect(() => {
    const resolveAssignedFarmName = async () => {
      try {
        if (currentUser?.farm) {
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            setAssignedFarmName(farmDoc.data().name || currentUser.farm);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } else {
          setAssignedFarmName('');
        }
      } catch (e) {
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
        let unknownFromPred = 0;
        let unknownFromFb = 0;
        
        // Process risk predictions
        const predictions = [];
        predsSnap.forEach(doc => {
          const data = doc.data();
          const farmName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || 'Unknown Farm';
          const farmKey = normalizeFarmName(farmName);
          allFarms.add(farmKey);
          if (farmName === 'Unknown Farm') unknownFromPred += 1;
          if (!farmKeyToName[farmKey] && farmName && farmName !== 'Unknown Farm') {
            farmKeyToName[farmKey] = farmName;
          }
          
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
            timestamp: data.timestamp || data.createdAt || data.input_data?.timestamp,
            source: 'risk_predictions'
          });
        });
        
        // Process modal feedback
        const feedbacks = [];
        feedbackSnap.forEach(doc => {
          const data = doc.data();
          if (data.is_aggregate) {
            // This is an aggregate feedback for a farm
            const farmName = data.farm_name || data.farm || data.input_data?.farm_name || data.input_data?.farm || 'Unknown Farm';
            const farmKey = normalizeFarmName(farmName);
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
            const farmName = data.farm_name || data.farm || 'Unknown Farm';
            const farmKey = normalizeFarmName(farmName);
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
            farm_name: farmKeyToName[farmKey] || farmKey.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
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
            // Average confidence
            const confidences = farm.predictions.map(p => p.confidence).filter(v => typeof v === 'number');
            farm.avg_confidence = confidences.length ? (confidences.reduce((a, b) => a + b, 0) / confidences.length) : 0;

            // Counts from predictions
            const counts = { high: 0, medium: 0, low: 0, normal: 0 };
            farm.predictions.forEach(p => {
              const key = levelKey(p.risk_level);
              counts[key] += 1;
            });
            farm.counts = counts;

            // Majority risk from predictions
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
            
            // Use corrected risk level if available
            if (fb.corrected_risk_level) {
              farm.overall_risk = fb.corrected_risk_level;
            }
            
            // If no predictions-based confidence, use feedback avg confidence if provided
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
            // Get latest predictions for consistent calculations
            const latestPredsForCounts = getLatestRiskPerPond(farm);
            
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
        const farmsArray = Object.values(byFarm)
          .sort((a, b) => {
            // Farms with reports first, then by severity
            if (a.has_reports && !b.has_reports) return -1;
            if (!a.has_reports && b.has_reports) return 1;
            return severityRank(a.overall_risk) - severityRank(b.overall_risk);
          });

        // Apply farm filtering if current user is assigned to a farm
        let filteredFarms = farmsArray;
        if (currentUser?.farm && assignedFarmName) {
          const currentUserFarm = currentUser.farm;
          filteredFarms = farmsArray.filter(farm => {
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

        setFarms(filteredFarms);
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser?.farm, assignedFarmName]);

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
            refreshedPredictions.push({
              id: doc.id,
              farm: farmName,
              farm_key: farmKey,
              fish_pond: data.fish_pond || data.input_data?.fish_pond || 'Unknown Pond',
              risk_level: data.risk_level || data.prediction?.risk_level || 'Normal',
              confidence: data.confidence || data.prediction?.confidence || 0,
              timestamp: data.timestamp || data.prediction?.timestamp || data.created_at,
              fish_condition: data.fish_condition || data.input_data?.fish_condition,
              water_condition: data.water_condition || data.input_data?.water_condition,
              weather: data.weather || data.input_data?.weather,
            });
          });
          
          console.log('Refreshed predictions from database:', refreshedPredictions.map(p => ({
            pond: p.fish_pond,
            timestamp: new Date(getTimestampMs(p.timestamp)).toLocaleString(),
            risk: p.risk_level
          })));
          
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
        console.error('Error refreshing farm data:', error);
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
    const s = level.toLowerCase();
    if (s.includes('high') || s.includes('critical')) return 'High';
    if (s.includes('medium')) return 'Medium';
    if (s.includes('low')) return 'Low';
    if (s.includes('normal')) return 'Normal';
    return level.charAt(0).toUpperCase() + level.slice(1);
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

    // Filter out ponds with old reports (only show reports from September 21st, 2025 and later)
    const cutoffDate = new Date('2025-09-21T00:00:00');
    const recentPonds = latestPerPond.filter(pred => {
      const predDate = new Date(getTimestampMs(pred.timestamp));
      return predDate >= cutoffDate;
    });

    return recentPonds;
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
              const isOpening = !exportMenuOpen;
              setExportMenuOpen(v => !v);
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', `Export menu ${isOpening ? 'opened' : 'closed'} in Risk Reports`, u); 
              } catch (_) {}
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
                      <p className="farm-location">
                        {(() => {
                          const fb = feedbackCache[farm.farm_key] || farm.feedback;
                          const correctedRaw = fb?.corrected_risk_level || fb?.prediction?.corrected_risk_level;
                          const corrected = correctedRaw ? normalizeRisk(correctedRaw) : null;
                          const displayRisk = corrected || farm.overall_risk;
                          return (
                            <>
                              {riskBadge(displayRisk)}
                              {corrected && ` (${t('riskReportModal.corrected')})`}
                              {farm.avg_confidence > 0 && (
                                <> (
                                  <span className="avg-conf">
                                    {t('riskReportModal.avgConfidence')}: {farm.avg_confidence.toFixed(1)}%
                                    {(() => {
                                      // Get the latest timestamp from predictions used for confidence calculation
                                      if (farm.predictions && farm.predictions.length > 0) {
                                        const latestPrediction = farm.predictions
                                          .filter(p => p.timestamp)
                                          .sort((a, b) => {
                                            const aMs = getTimestampMs(a.timestamp);
                                            const bMs = getTimestampMs(b.timestamp);
                                            return bMs - aMs;
                                          })[0];
                                        
                                        if (latestPrediction) {
                                          const latestDate = new Date(getTimestampMs(latestPrediction.timestamp));
                                          return ` (${t('riskReportModal.asOf')}: ${latestDate.toLocaleDateString()})`;
                                        }
                                      }
                                      return '';
                                    })()}
                                  </span>
                                )</>
                              )}
                            </>
                          );
                        })()}
                      </p>
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
                        // Get latest risk per pond for this farm
                        const latestPonds = getLatestRiskPerPond(farm);
                        
                        // Calculate counts from latest ponds only
                        const latestCounts = { high: 0, medium: 0, low: 0, normal: 0 };
                        latestPonds.forEach(pred => {
                          const risk = normalizeRisk(pred.risk_level);
                          if (risk === 'High') latestCounts.high++;
                          else if (risk === 'Medium') latestCounts.medium++;
                          else if (risk === 'Low') latestCounts.low++;
                          else latestCounts.normal++;
                        });
                        
                        return (
                          <>
                            <span className="confidence-info">{t('riskReportModal.ponds')}: {latestPonds.length}</span>
                            <div className="risk-counts">
                              <span className="risk-badge high-risk">{t('riskReportModal.highRisk')}: {latestCounts.high}</span>
                              <span className="risk-badge medium-risk">{t('riskReportModal.mediumRisk')}: {latestCounts.medium}</span>
                              <span className="risk-badge low-risk">{t('riskReportModal.lowRisk')}: {latestCounts.low}</span>
                              <span className="risk-badge normal">{t('riskReportModal.normalRisk')}: {latestCounts.normal}</span>
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
                    {farm.summary && (
                      <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                        <span className="confidence-info"><FaLightbulb /> {t('riskReportModal.mainIssue')}: {(() => {
                          // Prioritize the calculated main_issue from latest predictions
                          if (farm.summary.main_issue) {
                            return farm.summary.main_issue;
                          }
                          
                          // Fallback to overall risk if no main_issue calculated
                          const fb = feedbackCache[farm.farm_key] || farm.feedback;
                          const corrected = fb?.corrected_risk_level;
                          const riskIssues = corrected || farm.overall_risk;
                          return riskIssues ? `${riskIssues} ${!riskIssues.toLowerCase().includes('risk') ? 'Risk' : ''}` : 'No issues detected';
                        })()}</span>
                  </div>
                    )}
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
        
        // Get predictions based on selected timestamp
        let displayPredictions = [];
        if (selectedTimestamp === 'latest' || !showHistoryFilter) {
          // Always show only latest per pond when not viewing history
          displayPredictions = getLatestRiskPerPond(farm);
        } else {
          const selectedMs = parseInt(selectedTimestamp);
          // Get all reports from the same date as the selected timestamp
          const selectedDate = new Date(selectedMs).toDateString();
          displayPredictions = farm.predictions.filter(p => {
            const reportDate = new Date(getTimestampMs(p.timestamp)).toDateString();
            return reportDate === selectedDate;
          });
        }
        
        // Get last updated timestamp
        const lastUpdated = displayPredictions.length > 0 
          ? new Date(Math.max(...displayPredictions.map(p => getTimestampMs(p.timestamp))))
          : new Date();
        
        return (
          <div className="farm-details-modal-overlay">
            <div className="farm-details-modal">
              <div className="farm-details-header">
                <h3>{farm.farm_name} — {t('riskReportModal.pondPredictions')} (Last Updated: {lastUpdated.toLocaleDateString()} {lastUpdated.toLocaleTimeString()})</h3>
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
                        <th>{t('riskReportModal.riskLevel')}</th>
                        <th>{t('riskReportModal.confidence')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPredictions.length > 0 ? displayPredictions.map((p, index) => {
                        const risk = normalizeRisk(p.risk_level);
                        const emoji = risk === 'High' ? '🔴' : risk === 'Medium' ? '🟠' : risk === 'Low' ? '🟢' : '🟢';
                        
                        return (
                        <tr key={p.id || index} className="pond-table-row">
                          <td className="pond-name">{p.fish_pond || '—'}</td>
                          <td>{emoji} {risk === 'High' ? t('riskReportModal.highRisk') : risk === 'Medium' ? t('riskReportModal.mediumRisk') : risk === 'Low' ? t('riskReportModal.lowRisk') : t('riskReportModal.normalRisk')}</td>
                          <td className="confidence-value">{typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : '—'}</td>
                        </tr>
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
        const latestPredictions = getLatestRiskPerPond(farm);
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
