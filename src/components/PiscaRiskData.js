import React, { useEffect, useMemo, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { fetchAllUsers } from '../services/accountService';
import { fetchWeatherData } from '../services/weatherService';
import { exportPiscaRiskCSV, exportPiscaRiskPDF } from '../utils/exportPiscariskData';
import { logActivity, logMessages } from '../utils/logger';
import { useTranslation } from 'react-i18next';
import './PiscaRiskData.css';
import './RiskReportModal.css';
import { IoFish } from 'react-icons/io5';
import { FaExclamationTriangle } from 'react-icons/fa';

const PAGE_SIZE = 8;

const getTimestampMs = (ts) => {
  if (!ts) return 0;
  let ms = 0;
  if (typeof ts === 'number') ms = ts;
  else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
  else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
  else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
  return ms;
};

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

// Canonicalization helpers: map legacy names to new canonical display names
const legacyNameToCanonical = {
  'salmon-hatchery-facility': 'Aquino Fish Farm',
  'tilapia-production-center': "Vergara's Aqua Farm",
  'blue-ocean-aquafarm': 'Maningas Fish Farm',
  'marine-species-cultivation': 'Labay Fish Farm',
};

const toCanonicalDisplay = (rawName) => {
  const key = normalizeFarmName(rawName);
  const canon = legacyNameToCanonical[key] || rawName || '';
  return canon;
};

const toCanonicalKey = (rawName) => normalizeFarmName(toCanonicalDisplay(rawName));

const Section = ({ title, children, description }) => (
  <div className="prd-section">
    <div className="prd-section-header">
      <h4 className="prd-section-title">{title}</h4>
      {description ? <div className="prd-section-desc">{description}</div> : null}
    </div>
    <div className="prd-section-body">{children}</div>
  </div>
);

const Pill = ({ color, children }) => (
  <span className="prd-pill" style={{ background: color }}>{children}</span>
);

const usePaginated = (items, size = PAGE_SIZE) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / size));
  const pageItems = useMemo(() => {
    const start = (page - 1) * size;
    return (items || []).slice(start, start + size);
  }, [items, size, page]);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  return { page, setPage, totalPages, pageItems };
};

const PiscaRiskData = () => {
  const { currentUser } = useContext(AuthContext);
  const { t } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [farmReportsCount, setFarmReportsCount] = useState({});
  const [farmReviewedCount, setFarmReviewedCount] = useState({});
  const [farmUserCount, setFarmUserCount] = useState({});
  const [weather, setWeather] = useState(null);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [filterFarmKey, setFilterFarmKey] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // all | week | month

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

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await fetchRiskReportData();
        let baseFarms = Array.isArray(data) ? data : [];
        
        // Additional filtering to exclude Rojo Hatchery and Freshwater Finfish Farm
        baseFarms = baseFarms.filter(f => 
          f.farm_key !== 'rojo-hatchery' && 
          f.name !== 'Rojo Hatchery' &&
          f.farm_key !== 'freshwater-finfish-farm' &&
          f.name !== 'Freshwater Finfish Farm' &&
          !f.name?.toLowerCase().includes('freshwater finfish')
        );
        // Fetch users and count per farm across users + mobileUsers
        try {
          const users = await fetchAllUsers();
          const userCounts = {};
          users.forEach(u => {
            const farmName = (u.farm || u.farm_name || '').toString().trim();
            if (!farmName) return;
            
            // Skip users assigned to Rojo Hatchery or Freshwater Finfish Farm
            if (farmName === 'Rojo Hatchery' || 
                farmName === 'Freshwater Finfish Farm' ||
                farmName?.toLowerCase().includes('freshwater finfish')) return;
                
            const key = normalizeFarmName(farmName);
            if (key === 'unknown-farm') return;
            userCounts[key] = (userCounts[key] || 0) + 1;
          });
          setFarmUserCount(userCounts);
        } catch (_) {
          setFarmUserCount({});
        }
        // Count farm reports from 'reports' collection by farm name (canonicalized)
        const counts = {};
        try {
          const reportsRef = collection(db, 'reports');
          const snap = await getDocs(reportsRef);
          const reviewed = {};
          snap.forEach(doc => {
            const d = doc.data() || {};
            const farmRaw = (d.farm || '').toString().trim();
            if (!farmRaw) return; // skip unknown/missing farm
            
            // Skip reports from Rojo Hatchery or Freshwater Finfish Farm
            if (farmRaw === 'Rojo Hatchery' || 
                farmRaw === 'Freshwater Finfish Farm' ||
                farmRaw?.toLowerCase().includes('freshwater finfish')) return;
                
            const key = toCanonicalKey(farmRaw);
            if (key === 'unknown-farm') return;
            counts[key] = (counts[key] || 0) + 1;
            const status = (d.status || '').toString().toLowerCase();
            const isReviewed = status === 'Reviewed' || !!d.reviewed_by || !!d.reviewedAt || !!d.reviewed_at;
            if (isReviewed) {
              reviewed[key] = (reviewed[key] || 0) + 1;
            }
          });
          setFarmReviewedCount(reviewed);

          // Ensure farms includes any farm appearing only in reports
          const baseKeys = new Set(baseFarms.map(f => f.key));
          const toAdd = [];
          Object.keys(counts).forEach(k => {
            if (!baseKeys.has(k)) {
              if (k === 'unknown-farm') return; // never add unknown
              
              // Skip adding farms that are Rojo Hatchery or Freshwater Finfish Farm
              if (k === 'rojo-hatchery' || 
                  k === 'freshwater-finfish-farm' ||
                  k.includes('freshwater-finfish')) return;
                  
              const displayName = toCanonicalDisplay(k.replace(/-/g, ' '));
              
              // Additional check for display name
              if (displayName === 'Rojo Hatchery' || 
                  displayName === 'Freshwater Finfish Farm' ||
                  displayName?.toLowerCase().includes('freshwater finfish')) return;
                  
              toAdd.push({
                key: k,
                name: displayName,
                risk: 'Normal',
                overall_risk: 'Normal',
                ponds: 0,
                predictions: [],
                has_reports: false,
                counts: { high: 0, medium: 0, low: 0, normal: 0 },
              });
            }
          });
          if (toAdd.length > 0) {
            baseFarms = [...baseFarms, ...toAdd].sort((a,b)=> (a.name||'').localeCompare(b.name||''));
          }
        } catch (_) {}
        setFarmReportsCount(counts);
        
        // Apply farm filtering if current user is assigned to a farm
        let filteredFarms = baseFarms;
        if (currentUser?.farm && assignedFarmName) {
          const currentUserFarm = currentUser.farm;
          filteredFarms = baseFarms.filter(farm => {
            const farmKey = farm.key;
            const farmName = farm.name;
            
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
        
        // Canonicalize farm display and merge duplicates (old name -> new canonical)
        const merged = (() => {
          const byName = new Map();
          filteredFarms.forEach(f => {
            const canonName = toCanonicalDisplay(f.name);
            const canonKey = normalizeFarmName(canonName);
            const existing = byName.get(canonName);
            if (!existing) {
              byName.set(canonName, { ...f, name: canonName, key: canonKey });
            } else {
              // merge predictions arrays
              const preds = [
                ...(Array.isArray(existing.predictions) ? existing.predictions : []),
                ...(Array.isArray(f.predictions) ? f.predictions : [])
              ];
              byName.set(canonName, { ...existing, predictions: preds });
            }
          });
          return Array.from(byName.values()).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        })();

        setFarms(merged);
        // Weather
        const w = await fetchWeatherData();
        setWeather(w);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser?.farm, assignedFarmName]);

  const allPonds = useMemo(() => {
    return farms.flatMap(f => (f.predictions || []).map(p => ({
      ...p,
      farm_name: toCanonicalDisplay(p.farm || p.farm_name || f.name),
      farm_key: normalizeFarmName(toCanonicalDisplay(p.farm || p.farm_name || f.name))
    })));
  }, [farms]);

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    const format = (d) => `${d.toLocaleDateString()}`;
    if (timeFilter === 'week') {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : (day - 1);
      const startCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
      const endCurrent = new Date(startCurrent.getFullYear(), startCurrent.getMonth(), startCurrent.getDate() + 6, 23, 59, 59, 999);
      // Check if any data falls into current week
      const hasInCurrent = (allPonds || []).some(p => {
        const ms = getTimestampMs(p.timestamp);
        if (!ms) return false;
        const d = new Date(ms);
        return d >= startCurrent && d <= endCurrent;
      });
      if (hasInCurrent) return { rangeStart: startCurrent, rangeEnd: endCurrent, rangeLabel: `${format(startCurrent)} - ${format(endCurrent)}` };
      // Fallback to week containing latest data
      let latestMs = 0;
      (allPonds || []).forEach(p => { const ms = getTimestampMs(p.timestamp); if (ms > latestMs) latestMs = ms; });
      if (latestMs > 0) {
        const d = new Date(latestMs);
        const day2 = d.getDay();
        const diff2 = day2 === 0 ? 6 : (day2 - 1);
        const startLatest = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff2, 0, 0, 0, 0);
        const endLatest = new Date(startLatest.getFullYear(), startLatest.getMonth(), startLatest.getDate() + 6, 23, 59, 59, 999);
        return { rangeStart: startLatest, rangeEnd: endLatest, rangeLabel: `${format(startLatest)} - ${format(endLatest)}` };
      }
      return { rangeStart: startCurrent, rangeEnd: endCurrent, rangeLabel: `${format(startCurrent)} - ${format(endCurrent)}` };
    }
    if (timeFilter === 'month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { rangeStart: start, rangeEnd: end, rangeLabel: `${start.toLocaleString('default', { month: 'short' })} ${start.getFullYear()}` };
    }
    return { rangeStart: null, rangeEnd: null, rangeLabel: 'All time' };
  }, [timeFilter, allPonds]);

  const withinRange = (ts) => {
    if (!rangeStart || !rangeEnd) return true;
    const ms = getTimestampMs(ts);
    if (ms === 0) return false;
    const d = new Date(ms);
    return d >= rangeStart && d <= rangeEnd;
  };

  // Get unique ponds with latest predictions (for summary stats)
  const uniquePonds = useMemo(() => {
    const pondMap = new Map();
    farms.forEach(farm => {
      const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
      // Don't filter by time range for summary stats - use all data
      const sorted = [...preds].sort((a,b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
      
      sorted.forEach(p => {
        const pondKey = `${farm.key}-${p.fish_pond || 'Unknown Pond'}`;
        if (!pondMap.has(pondKey)) {
          pondMap.set(pondKey, {
            ...p,
            farm_name: toCanonicalDisplay(p.farm || p.farm_name || farm.name),
            farm_key: normalizeFarmName(toCanonicalDisplay(p.farm || p.farm_name || farm.name))
          });
        }
      });
    });
    return Array.from(pondMap.values());
  }, [farms]);

  // Calculate farm counts with all data, deduplicated by farm + pond (latest per pond)
  const farmsWithAllDataCounts = useMemo(() => {
    return farms.map(f => {
      const preds = Array.isArray(f.predictions) ? f.predictions : [];
      
      // Deduplicate by farm + pond name - keep only latest prediction per pond
      const pondMap = new Map();
      
      preds.forEach(p => {
        const pondName = (p.fish_pond || 'Unknown Pond').toString().trim();
        const pondKey = `${f.key}-${pondName}`;
        
        // Keep only the latest prediction for each pond
        if (!pondMap.has(pondKey) || getTimestampMs(p.timestamp) > getTimestampMs(pondMap.get(pondKey).timestamp)) {
          pondMap.set(pondKey, p);
        }
      });
      
      // Get deduplicated predictions (latest per pond)
      const sorted = Array.from(pondMap.values());
      
      // Count all risk levels from deduplicated data
      const counts = { high: 0, medium: 0, low: 0, normal: 0 };
      sorted.forEach(p => {
        const r = (p.risk_level || '').toString().toLowerCase();
        if (r === 'high') counts.high += 1;
        else if (r === 'medium') counts.medium += 1;
        else if (r === 'low') counts.low += 1;
        else counts.normal += 1;
      });
      
      // Calculate overall risk based on counts
      let overallRisk = 'Low';
      if (counts.high > 0) {
        overallRisk = 'High';
      } else if (counts.medium > 0) {
        overallRisk = 'Medium';
      } else if (counts.low > 0) {
        overallRisk = 'Low';
      } else {
        overallRisk = 'Low'; // Default to Low instead of Normal
      }
      
      console.log(`${f.name} - Total preds: ${preds.length}, Unique ponds: ${sorted.length}, High: ${counts.high}, Medium: ${counts.medium}, Low: ${counts.low}`);
      
      return { 
        key: f.key, 
        name: f.name, 
        counts, 
        ponds: sorted.length, // Total unique ponds
        overall_risk: overallRisk
      };
    });
  }, [farms]);

  // Keep the filtered version for chart data section (with time filtering)
  const farmsWithFilteredCounts = useMemo(() => {
    return farms.map(f => {
      const preds = Array.isArray(f.predictions) ? f.predictions : [];
      const valid = preds.filter(p => withinRange(p.timestamp));
      const sorted = [...valid].sort((a,b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
      const pondMap = new Map();
      sorted.forEach(p => {
        const pond = p.fish_pond || 'Unknown Pond';
        if (!pondMap.has(pond)) pondMap.set(pond, p);
      });
      const latestPerPond = Array.from(pondMap.values());
      const counts = { high: 0, medium: 0, low: 0, normal: 0 };
      latestPerPond.forEach(p => {
        const r = (p.risk_level || '').toString().toLowerCase();
        if (r === 'high') counts.high += 1;
        else if (r === 'medium') counts.medium += 1;
        else if (r === 'low') counts.low += 1;
        else counts.normal += 1;
      });
      
      return { 
        key: f.key, 
        name: f.name, 
        counts, 
        ponds: latestPerPond.length
      };
    });
  }, [farms, rangeStart, rangeEnd]);

  const summaryStats = useMemo(() => {
    // Calculate total high-risk ponds from all farms - count all high-risk instances
    const totalHighRisk = (() => {
      let highRiskCount = 0;
      const farmHighRiskCounts = {};
      
      farms.forEach(farm => {
        const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
        let farmHighRisk = 0;
        
        // Count all high-risk predictions (no deduplication by date)
        preds.forEach(p => {
          const riskLevel = (p.risk_level || '').toString().toLowerCase().trim();
          const isHigh = riskLevel === 'high' || riskLevel.includes('high');
          if (isHigh) {
            farmHighRisk++;
            highRiskCount++;
          }
        });
        
        farmHighRiskCounts[farm.name] = farmHighRisk;
      });
      
      console.log('Farm high-risk counts (all instances):', farmHighRiskCounts);
      console.log('Total high-risk ponds (all instances):', highRiskCount);
      
      return highRiskCount;
    })();

    // Total Reports Reviewed (%)
    const totals = Object.keys(farmReportsCount).reduce((agg, k) => {
      agg.total += farmReportsCount[k] || 0;
      agg.reviewed += farmReviewedCount[k] || 0;
      return agg;
    }, { reviewed: 0, total: 0 });
    const reviewedPct = totals.total > 0 ? Math.round((totals.reviewed / totals.total) * 100) : 0;

    // Average Risk Level across unique ponds
    const riskToScore = (r) => {
      const s = (r || '').toString().toLowerCase();
      if (s === 'high') return 3;
      if (s === 'medium') return 2;
      if (s === 'low') return 1;
      return 0; // normal/unknown
    };
    const scoreToLabel = (v) => {
      if (v >= 2.5) return 'High';
      if (v >= 1.5) return 'Medium';
      if (v >= 0.5) return 'Low';
      return 'Low'; // Default to Low instead of Normal
    };
    const scores = (uniquePonds || []).map(p => riskToScore(p.risk_level));
    const avgScore = scores.length > 0 ? (scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
    const avgRiskLabel = scoreToLabel(avgScore);

    return { totalHighRisk, reviewedPct, avgRiskLabel };
  }, [farms, farmReportsCount, farmReviewedCount]);

  // Create deduplicated ponds for predictions table (latest per pond per farm) - ALL TIME DATA
  const deduplicatedPonds = useMemo(() => {
    const pondMap = new Map();
    farms.forEach(farm => {
      const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
      // Use all data, no time filtering
      const sorted = [...preds].sort((a,b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));
      
      sorted.forEach(p => {
        const pondKey = `${farm.key}-${p.fish_pond || 'Unknown Pond'}`;
        if (!pondMap.has(pondKey)) {
          pondMap.set(pondKey, {
            ...p,
            farm_name: toCanonicalDisplay(p.farm || p.farm_name || farm.name),
            farm_key: normalizeFarmName(toCanonicalDisplay(p.farm || p.farm_name || farm.name))
          });
        }
      });
    });
    return Array.from(pondMap.values());
  }, [farms]);

  const filteredPonds = useMemo(() => {
    const q = (searchQuery || '').toString().trim().toLowerCase();
    return (deduplicatedPonds || []).filter(p => {
      if (filterFarmKey !== 'all') {
        const pk = p.farm_key || normalizeFarmName(p.farm || p.farm_name || '');
        if (pk !== filterFarmKey) return false;
      }
      if (q.length > 0) {
        const hay = [
          (p.farm || p.farm_name || ''),
          (p.fish_pond || ''),
          (p.risk_level || '')
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [deduplicatedPonds, filterFarmKey, searchQuery]);

  const { freshnessLabel, lastUpdatedStr, updateColor } = useMemo(() => {
    let latestMs = 0;
    farms.forEach(f => {
      (f.predictions || []).forEach(p => {
        const ms = getTimestampMs(p.timestamp);
        if (ms > latestMs) latestMs = ms;
      });
    });
    if (latestMs > 0) {
      const now = Date.now();
      const hoursDiff = (now - latestMs) / (1000 * 60 * 60);
      let label = 'Current data';
      let color = '#4ade80';
      if (hoursDiff > 72) { label = 'Outdated data'; color = '#ef4444'; }
      else if (hoursDiff > 24) { label = 'Recent data'; color = '#f59e0b'; }
      return { freshnessLabel: label, lastUpdatedStr: new Date(latestMs).toLocaleDateString(), updateColor: color };
    }
    return { freshnessLabel: 'Not Latest Data (Cached)', lastUpdatedStr: 'unknown', updateColor: '#f59e0b' };
  }, [farms]);


  const { page, setPage, totalPages, pageItems } = usePaginated(filteredPonds);

  if (loading) {
    return (
      <div className="risk-report-container modal-view">
        <div className="loading-state">
          <FaExclamationTriangle className="loading-icon" />
          <h3>{t('riskReportModal.loadingFarmRiskData')}</h3>
          <p>{t('riskReportModal.fetchingLatestFarmSummaries')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="prd-container">
      <div className="prd-export-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="prd-export-label">{t('piscaRiskData.export.label')}</span>
          <div className="prd-export-menu">
          <button 
            className="prd-export-btn" 
            onClick={(e) => {
              const menu = e.currentTarget.nextSibling;
              const isOpening = menu.style.display !== 'block';
              if (menu) menu.style.display = isOpening ? 'block' : 'none';
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', `Export menu ${isOpening ? 'opened' : 'closed'} in PiscaRisk data`, u); 
              } catch (_) {}
            }}
            title={t('piscaRiskData.export.select')}
            style={{
              opacity: 1,
              cursor: 'pointer'
            }}
          >{t('piscaRiskData.export.select')}</button>
          <div className="prd-export-menu-list" style={{ display: 'none' }}>
            <button className="prd-export-menu-item" onClick={(e) => {
              e.currentTarget.parentElement.style.display = 'none';
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', logMessages.export.csvDownload(u, 'PiscaRisk data'), u); 
              } catch (_) {}
              exportPiscaRiskCSV({
                farms,
                allPonds,
                farmReportsCount,
                farmReviewedCount,
                weather,
                summary: { totalFarms: farms.length, totalPonds: uniquePonds.length, asOf: Date.now() }
              });
            }}>{t('piscaRiskData.export.csv')}</button>
            <button className="prd-export-menu-item" onClick={(e) => {
              e.currentTarget.parentElement.style.display = 'none';
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', logMessages.export.pdfDownload(u, 'PiscaRisk data'), u); 
              } catch (_) {}
              exportPiscaRiskPDF({
                farms,
                allPonds,
                farmReportsCount,
                farmReviewedCount,
                weather,
                summary: { totalFarms: farms.length, totalPonds: uniquePonds.length, asOf: Date.now() }
              });
            }}>{t('piscaRiskData.export.pdf')}</button>
          </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${updateColor}` }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: updateColor }} />
            <span style={{ color: '#111827' }}>{freshnessLabel}</span>
          </span>
          <span style={{ color: '#6b7280' }}>Last updated: <strong style={{ color: '#111827' }}>{lastUpdatedStr}</strong></span>
        </div>
      </div>
      
      <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: 6, fontSize: '0.85rem', color: '#0c4a6e' }}>
        ℹ️ This report summarizes the latest valid prediction per pond. Duplicate or outdated entries are excluded automatically.
      </div>
      
      <div className="prd-grid">
        <Section title={t('piscaRiskData.sections.farms.title')} description={t('piscaRiskData.sections.farms.description')}>
          <div className="prd-list farms-overview-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {farmsWithAllDataCounts.map((f) => (
              <div key={f.key} className="prd-card" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12 }}>
                <div className="prd-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div className="prd-card-title" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <IoFish style={{ color: '#06b6d4', fontSize: 20 }} />
                    {f.name}
                  </div>
                  <div className="prd-card-sub" style={{ fontSize: '0.75rem', color: '#6b7280' }}>{f.key}</div>
                </div>
                <div className="prd-card-body" style={{ display: 'grid', rowGap: 8 }}>
                  <div className="prd-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{t('piscaRiskData.farmData.pondsWithReports')}</span><span>{f.ponds}</span></div>
                  <div className="prd-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{t('piscaRiskData.farmData.totalReports')}</span><span>{farmReportsCount[f.key] || 0}</span></div>
                  <div className="prd-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>Total Users</span><span>{farmUserCount[f.key] || 0}</span></div>
                  <div className="prd-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('piscaRiskData.farmData.reviewedReports')}</span>
                    {(() => {
                      const reviewed = farmReviewedCount[f.key] || 0;
                      const total = farmReportsCount[f.key] || 0;
                      const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0;
                      const barColor = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ padding: '2px 6px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{reviewed} / {total}</span>
                          <span style={{ width: 90, height: 6, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden', display: 'inline-block' }}>
                            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: barColor }} />
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{pct}%</span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="prd-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{t('piscaRiskData.farmData.counts')}</span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Pill color="#ef4444">{t('piscaRiskData.farmData.high')}: {f.counts?.high || 0}</Pill>
                      <Pill color="#f59e0b">{t('piscaRiskData.farmData.medium')}: {f.counts?.medium || 0}</Pill>
                      <Pill color="#eab308">{t('piscaRiskData.farmData.low')}: {f.counts?.low || 0}</Pill>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t('piscaRiskData.sections.weather.title')} description={t('piscaRiskData.sections.weather.description')}>
          {weather ? (
            <div className="prd-weather" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              <div className="prd-weather-item" style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>📍 {t('piscaRiskData.weatherData.location')}</div>
                <div style={{ fontWeight: 600 }}>{weather.locationName || '—'}</div>
              </div>
              <div className="prd-weather-item" style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>☁️ {t('piscaRiskData.weatherData.condition')}</div>
                <div style={{ fontWeight: 600 }}>{weather.weather?.[0]?.description || '—'}</div>
              </div>
              <div className="prd-weather-item" style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>🌡️ {t('piscaRiskData.weatherData.temperature')}</div>
                <div style={{ fontWeight: 600 }}>{typeof weather.main?.temp === 'number' ? `${Math.round(weather.main.temp)}°C` : '—'}</div>
              </div>
              <div className="prd-weather-item" style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>💧 {t('piscaRiskData.weatherData.humidity')}</div>
                <div style={{ fontWeight: 600 }}>{typeof weather.main?.humidity === 'number' ? `${weather.main.humidity}%` : '—'}</div>
              </div>
              <div className="prd-weather-item" style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>💨 {t('piscaRiskData.weatherData.wind')}</div>
                <div style={{ fontWeight: 600 }}>{typeof weather.wind?.speed === 'number' ? `${weather.wind.speed} m/s` : '—'}</div>
              </div>
              <div className="prd-weather-item" style={{ padding: '8px 10px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>🕒 {t('piscaRiskData.weatherData.asOf')}</div>
                <div style={{ fontWeight: 600 }}>{new Date().toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <div className="prd-loading">{t('piscaRiskData.weatherData.noData')}</div>
          )}
        </Section>


        <Section title={t('piscaRiskData.sections.predictions.title')} description={t('piscaRiskData.sections.predictions.description')}>
          <div className="prd-filters" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#6b7280', marginRight: 6 }}>{t('piscaRiskData.predictionsTable.farm')}:</label>
              <select value={filterFarmKey} onChange={(e) => { setFilterFarmKey(e.target.value); setPage(1); }} style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                <option value="all">All Farms</option>
                {farms.map(f => (
                  <option key={f.key} value={f.key}>{f.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <input type="text" placeholder="Search pond, farm or risk..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} style={{ width: '100%', padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }} />
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#6b7280' }}>
              Showing {filteredPonds.length} of {deduplicatedPonds.length} (All Time Data)
            </div>
          </div>
          <div className="prd-table">
            <div className="prd-thead">
              <div>{t('piscaRiskData.predictionsTable.farm')}</div>
              <div>{t('piscaRiskData.predictionsTable.pond')}</div>
              <div>{t('piscaRiskData.predictionsTable.risk')}</div>
              <div>🕒 Last Updated</div>
            </div>
            <div className="prd-tbody">
              {pageItems.map((p) => (
                <div className="prd-rowline" key={`${p.farm_key}-${p.fish_pond}-${p.id}`}>
                  <div>{p.farm || p.farm_name}</div>
                  <div>{p.fish_pond || '—'}</div>
                  <div>
                    <Pill color={p.risk_level === 'High' ? '#ef4444' : p.risk_level === 'Medium' ? '#f59e0b' : '#22c55e'}>{p.risk_level || 'Normal'}</Pill>
                  </div>
                  <div>{p.timestamp ? (new Date(typeof p.timestamp === 'number' ? p.timestamp : (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : Date.parse(p.timestamp) || Date.now()))).toLocaleString() : '—'}</div>
                </div>
              ))}
            </div>
            <div className="prd-pagination">
              <button disabled={page <= 1} onClick={() => {
                const newPage = Math.max(1, page - 1);
                setPage(newPage);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('navigation', `Pagination: moved to page ${newPage} in PiscaRisk data`, u); 
                } catch (_) {}
              }}>{t('piscaRiskData.pagination.prev')}</button>
              <span>{t('piscaRiskData.pagination.page', { current: page, total: totalPages })}</span>
              <button disabled={page >= totalPages} onClick={() => {
                const newPage = Math.min(totalPages, page + 1);
                setPage(newPage);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('navigation', `Pagination: moved to page ${newPage} in PiscaRisk data`, u); 
                } catch (_) {}
              }}>{t('piscaRiskData.pagination.next')}</button>
            </div>
          </div>
        </Section>

        <Section title={t('piscaRiskData.sections.summary.title')} description={t('piscaRiskData.sections.summary.description')}>
          <div className="prd-summary">
            <div className="prd-summary-item"><span>{t('piscaRiskData.summaryData.totalFarms')}</span><strong>{farms.length}</strong></div>
            <div className="prd-summary-item"><span>{t('piscaRiskData.summaryData.totalPonds')} (latest predictions)</span><strong>{uniquePonds.length}</strong></div>
            <div className="prd-summary-item"><span>Average Risk Level</span><strong>{summaryStats.avgRiskLabel}</strong></div>
            <div className="prd-summary-item"><span>Total Reports Reviewed</span><strong>{summaryStats.reviewedPct}%</strong></div>
            <div className="prd-summary-item"><span>Total High-Risk Ponds</span><strong>{summaryStats.totalHighRisk}</strong></div>
            <div className="prd-summary-item"><span>As of</span><strong>{new Date().toLocaleString()}</strong></div>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default PiscaRiskData;


