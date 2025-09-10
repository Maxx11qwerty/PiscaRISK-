import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaExclamationTriangle, FaShieldAlt, FaInfoCircle, FaLightbulb } from 'react-icons/fa';
import { RiAlertFill } from 'react-icons/ri';
import { PiNoteFill } from 'react-icons/pi';
import { IoTimeSharp } from 'react-icons/io5';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { sanitizeTimestamp } from '../utils/securityUtils';
import './RiskReportModal.css';

const RiskReportModal = ({ isModal = false }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState([]);
  const [detailsFarmKey, setDetailsFarmKey] = useState(null);
  const [actionsFarmKey, setActionsFarmKey] = useState(null);
  const [feedbackCache, setFeedbackCache] = useState({});

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
      console.info('fetchFarmFeedback failed for', farmName);
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
          console.warn('risk_predictions empty, falling back to predictions');
          try {
            predsSnap = await getDocs(collection(db, 'predictions'));
          } catch (e) {
            console.warn('fallback predictions collection not accessible');
          }
        }
        console.log('Risk predictions docs count:', predsSnap.size);
        
        // Fetch modal feedback data
        let feedbackSnap = await getDocs(collection(db, 'modal_feedback'));
        if (feedbackSnap.empty) {
          console.info('modal_feedback empty, falling back to model_feedback');
          try {
            feedbackSnap = await getDocs(collection(db, 'model_feedback'));
          } catch (e) {
            console.warn('fallback model_feedback collection not accessible');
          }
        }
        console.log('Modal feedback docs count:', feedbackSnap.size);
        
        // Fetch conditions summary (farm-level)
        let condSnap = null;
        try {
          condSnap = await getDocs(collection(db, 'conditions_summary'));
        } catch (e) {
          console.info('conditions_summary collection not accessible, skipping');
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

        console.log('All unique farms:', Array.from(allFarms));
        console.log('Unknown farm counts -> predictions:', unknownFromPred, 'feedback:', unknownFromFb);
        
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
          console.info('Dropping unknown-farm group since named farms exist');
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

          // If no summary.main_issue, synthesize from most frequent conditions
          if (!farm.summary || !farm.summary.main_issue) {
            const fishIssues = farm.predictions.map(p => p.fish_condition).filter(Boolean);
            const riskIssues = farm.predictions.map(p => normalizeRisk(p.risk_level)).filter(Boolean);
            const top = (arr) => {
              const c = {};
              arr.forEach(v => { const k = v.toString(); c[k] = (c[k] || 0) + 1; });
              return Object.entries(c).sort((a,b) => b[1]-a[1])[0]?.[0] || null;
            };
            const fishTop = top(fishIssues);
            const riskTop = top(riskIssues);
            const riskLabel = riskTop ? `${riskTop} Risk` : null;
            const main_issue = riskLabel || fishTop ? [riskLabel, fishTop].filter(Boolean).join(' + ') : null;
            const last_update = farm.predictions.reduce((acc, p) => acc || p.timestamp, null);
            // Ready for harvest and critical alerts approximation
            const ready_count = farm.predictions.filter(p => p.ready_for_harvest === true).length;
            // Count critical alerts: explicit ELEVATED RISK in conditions_summary or High risk predictions
            const critical_alerts = farm.predictions.reduce((count, p) => {
              const hasElevated = typeof p.conditions_summary === 'string' && p.conditions_summary.toUpperCase().includes('ELEVATED RISK');
              const isHigh = normalizeRisk(p.risk_level) === 'High';
              return count + (hasElevated || isHigh ? 1 : 0);
            }, 0);
            farm.summary = farm.summary || {};
            farm.summary.main_issue = farm.summary?.main_issue || main_issue;
            farm.summary.last_update = farm.summary?.last_update || last_update;
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

        console.log('Farms prepared:', farmsArray.map(f => ({ 
          key: f.farm_key, 
          name: f.farm_name, 
          risk: f.overall_risk, 
          ponds: f.predictions.length,
          has_reports: f.has_reports 
        })));
        setFarms(farmsArray);
      } catch (error) {
        console.error('Error loading farm risk data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

      <div className="farm-overview-section">
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
                                  <span className="avg-conf">{t('riskReportModal.avgConfidence')}: {farm.avg_confidence.toFixed(1)}%</span>
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
                      <span className="confidence-info">{t('riskReportModal.ponds')}: {farm.predictions.length}</span>
                      <div className="risk-counts">
                        {(() => {
                          const fb = feedbackCache[farm.farm_key] || farm.feedback;
                          const diag = fb?.prediction?.diagnostics || fb?.diagnostics;
                          const high = diag ? (diag.high_risk_count ?? diag.high ?? farm.counts.high) : farm.counts.high;
                          const med = diag ? (diag.medium_risk_count ?? diag.medium ?? farm.counts.medium) : farm.counts.medium;
                          const low = diag ? (diag.low_risk_count ?? diag.low ?? farm.counts.low) : farm.counts.low;
                          const norm = diag ? (diag.normal_count ?? diag.normal ?? farm.counts.normal) : farm.counts.normal;
            return (
                            <>
                              <span className="risk-badge high-risk">{t('riskReportModal.highRisk')}: {high}</span>
                              <span className="risk-badge medium-risk">{t('riskReportModal.mediumRisk')}: {med}</span>
                              <span className="risk-badge low-risk">{t('riskReportModal.lowRisk')}: {low}</span>
                              <span className="risk-badge normal">{t('riskReportModal.normalRisk')}: {norm}</span>
                            </>
                          );
                        })()}
                      </div>
                  </div>
                    {farm.summary && (
                      <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                        <span className="confidence-info"><IoTimeSharp /> {t('riskReportModal.lastUpdate')}: {sanitizeTimestamp(farm.summary.last_update)}</span>
                    </div>
                    )}
                    {farm.summary && (
                      <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                        <span className="confidence-info"><FaLightbulb /> {t('riskReportModal.mainIssue')}: {(() => {
                          const fb = feedbackCache[farm.farm_key] || farm.feedback;
                          const corrected = fb?.corrected_risk_level;
                          const riskIssues = corrected || farm.overall_risk;
                          return farm.summary.main_issue || `${riskIssues} ${riskIssues && !riskIssues.toLowerCase().includes('risk') ? 'Risk' : ''}`;
                        })()}</span>
                  </div>
                    )}
                    {farm.summary && (
                      <div className="farm-risk-summary" style={{ marginTop: 8 }}>
                        <span className="confidence-info"><RiAlertFill /> {t('riskReportModal.criticalAlerts')}: {farm.summary.critical_alerts ?? 0}</span>
                      </div>
                    )}
                    <div className="farm-actions">
                      <button className="view-details-btn" onClick={() => setDetailsFarmKey(farm.farm_key)}>
                        <span className="btn-icon"><IoTimeSharp /></span> {t('riskReportModal.viewDetails')}
                      </button>
                      <button className="suggested-actions-btn" onClick={() => setActionsFarmKey(farm.farm_key)}>
                        <span className="btn-icon"><PiNoteFill /></span> {t('riskReportModal.suggestedActions')}
                      </button>
              </div>
                  </>
                ) : (
                  <div className="no-reports-message">
                    <p>{t('riskReportModal.noRiskAssessmentData')}</p>
                    <button className="add-report-btn">
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
        const fb = feedbackCache[farm.farm_key] || farm.feedback || null;
        const diag = fb?.prediction?.diagnostics || fb?.diagnostics || {};
        const corrected = fb?.corrected_risk_level || fb?.prediction?.corrected_risk_level;
        const fbPredsRaw = Array.isArray(fb?.predictions) ? fb.predictions : [];
        const fbPreds = fbPredsRaw.map(p => ({
          id: p.id,
          fish_pond: p.fish_pond || p.input_data?.fish_pond,
          risk_level: normalizeRisk(p.risk_level),
          confidence: parseFloat(p.confidence),
          fish_condition: p.fish_condition || p.input_data?.fish_condition,
          water_condition: p.water_condition || p.input_data?.water_condition,
          weather: p.weather || p.input_data?.weather,
        }));
        const avgFromFeedback = (() => {
          const vals = fbPreds.map(p => p.confidence).filter(v => !isNaN(v));
          return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : null;
        })();
        return (
          <div className="farm-details-modal-overlay">
            <div className="farm-details-modal">
              <div className="farm-details-header">
                <h3>{farm.farm_name} — {t('riskReportModal.pondPredictions')}</h3>
                <button className="close-modal-btn" onClick={() => setDetailsFarmKey(null)}>✕</button>
              </div>
              <div className="farm-details-content">
                <div className="farm-risk-summary" style={{ marginBottom: 12 }}>
                  <span className="confidence-info">{corrected ? `${t('riskReportModal.correctedRiskLevel')}: ${corrected}` : `${t('riskReportModal.overallRisk')}: ${farm.overall_risk}`}</span>
                  {avgFromFeedback && <span className="confidence-info avg-conf">{t('riskReportModal.avgConfidence')}: {avgFromFeedback}%</span>}
                </div>
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
                      {(fbPreds.length > 0 ? fbPreds : farm.predictions).map(p => {
                        const risk = normalizeRisk(p.risk_level);
                        const emoji = risk === 'High' ? '🔴' : risk === 'Medium' ? '🟠' : risk === 'Low' ? '🟢' : '🟢';
                        return (
                        <tr key={p.id} className="pond-table-row">
                          <td className="pond-name">{p.fish_pond || '—'}</td>
                          <td>{emoji} {risk === 'High' ? t('riskReportModal.highRisk') : risk === 'Medium' ? t('riskReportModal.mediumRisk') : risk === 'Low' ? t('riskReportModal.lowRisk') : t('riskReportModal.normalRisk')}</td>
                          <td className="confidence-value">{typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : '—'}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                    </div>
                  </div>
                </div>
            </div>
            );
      })()}

      {/* Suggested Actions Modal */}
      {actionsFarmKey && (() => {
        const farm = farms.find(f => f.farm_key === actionsFarmKey);
        if (!farm || !farm.has_reports) return null;
        
        // Get all recommended actions from predictions
        const actions = Array.from(new Set(
          farm.predictions.flatMap(p => p.recommended_actions || [])
        ));
        
        return (
          <div className="farm-details-modal-overlay">
            <div className="farm-details-modal">
              <div className="farm-details-header">
                <h3>{farm.farm_name} — {t('riskReportModal.suggestedActions')}</h3>
                <button className="close-modal-btn" onClick={() => setActionsFarmKey(null)}>✕</button>
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
