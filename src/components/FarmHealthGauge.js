import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { useRiskData } from '../contexts/RiskDataContext';
import { useFarms } from '../contexts/FarmsContext';
import './FarmHealthGauge.css';
import { GiHamburgerMenu } from 'react-icons/gi';
import { FaSyncAlt } from 'react-icons/fa';
import { useRefreshFeedback } from '../hooks/useRefreshFeedback';
import RefreshStatusMessage from './RefreshStatusMessage';
import { downloadGaugeAsImage, exportHealthGaugeCSV } from '../utils/exportHealthGauge';
import { logActivity, logMessages } from '../utils/logger';
import { useTranslation } from 'react-i18next';

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

// Looser normalizer to handle punctuation differences like apostrophes
const normalizeLoose = (name) => {
  if (!name || typeof name !== 'string') return 'unknownfarm';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const getStatus = (pct) => {
  if (pct >= 70) return { label: 'GOOD', color: '#2ecc71' };
  if (pct >= 40) return { label: 'CAUTION', color: '#f1c40f' };
  return { label: 'CRITICAL', color: '#e74c3c' };
};

const FarmHealthGauge = ({ dropdownCoordinator, onDropdownOpen }) => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { farmsNameByKey } = useFarms();
  const { farms: riskFarms, loading: riskDataLoading, refreshRiskData } = useRiskData();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const { status: refreshStatus, runRefresh, isRefreshing: isManualRefreshBusy } = useRefreshFeedback();
  const [selectedFarm, setSelectedFarm] = useState('all');
  const [exportOpen, setExportOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmKey = isAssignedToFarm ? normalizeFarmName(farmsNameByKey[currentUser.farm] || currentUser.farm) : null;
  const isStdPhone = viewportWidth >= 360 && viewportWidth <= 480;
  const isDesktopNarrow = viewportWidth >= 1024 && viewportWidth <= 1279;

  // Track viewport width for responsive behavior
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!dropdownCoordinator?.signal) return;
    if (dropdownCoordinator.source !== 'homepageFarmHealthExport') {
      setExportOpen(false);
    }
  }, [dropdownCoordinator]);

  // Resolve assigned farm name
  useEffect(() => {
    const resolveAssignedFarmName = async () => {
      if (isAssignedToFarm && currentUser.farm) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../firebase');
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            setAssignedFarmName(farmDoc.data().name || currentUser.farm);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.error('Error resolving farm name:', error);
          }
          setAssignedFarmName(currentUser.farm);
        }
      }
    };
    resolveAssignedFarmName();
  }, [isAssignedToFarm, currentUser?.farm]);

  useEffect(() => {
    if (riskDataLoading && (!riskFarms || riskFarms.length === 0)) {
      setLoading(true);
      return;
    }

    const legacyMap = {
      'salmon-hatchery-facility': 'Aquino Fish Farm',
      'tilapia-production-center': "Vergara's Aqua Farm",
      'blue-ocean-aquafarm': 'Maningas Fish Farm',
      'marine-species-cultivation': 'Labay Fish Farm',
    };
    const canon = (Array.isArray(riskFarms) ? riskFarms : []).map((f) => {
      const live = farmsNameByKey[f.key];
      const legacy = legacyMap[f.key];
      const name = live || legacy || f.name;
      return { ...f, name, key: normalizeFarmName(name) };
    });
    const map = new Map();
    canon.forEach((f) => {
      const name = f.name || 'Unknown Farm';
      if (!map.has(name)) map.set(name, { ...f });
      else {
        const cur = map.get(name);
        const preds = [
          ...(Array.isArray(cur.predictions) ? cur.predictions : []),
          ...(Array.isArray(f.predictions) ? f.predictions : []),
        ];
        map.set(name, { ...cur, predictions: preds });
      }
    });
    setFarms(Array.from(map.values()));
    setLoading(false);
  }, [riskFarms, riskDataLoading, farmsNameByKey, isAssignedToFarm, currentUser?.farm, assignedFarmKey, selectedFarm]);

  useEffect(() => {
    if (isAssignedToFarm) {
      // For farm admins, we need to find the correct farm key from the available farms
      // instead of using the normalized assignedFarmKey
      const farmIdToKey = {
        's5zKKXTBkF3voYnV8wuh': 'labay-fish-farm',
        'NyhjBvh9N9wfsOJ2qeEa': 'aquino-fish-farm',
        'TP3p0y4iQlo2j0loELQb': "vergara's-aqua-farm",
        'egGEARKL6Qk5jNgrY3Yu': 'maningas-fish-farm'
      };
      
      const mappedKey = farmIdToKey[currentUser?.farm];
      if (mappedKey) {
        setSelectedFarm(mappedKey);
      } else {
        setSelectedFarm(assignedFarmKey);
      }
    } else {
      setSelectedFarm('all');
    }
  }, [isAssignedToFarm, assignedFarmKey, currentUser?.farm]);

  // Date range filtering helper (same as RiskReportModal and PondsAtRiskStackedChart)
  const withinRange = (ts) => {
    // For now, use all data - in the future this could be made configurable
    return true;
  };

  // Helper: get latest batch (same generated date) and dedupe per pond WITHIN DATE RANGE (match RiskReportModal)
  const getLatestBatchPerPond = (farm) => {
    if (!farm?.predictions || !Array.isArray(farm.predictions)) return [];
    
    // Filter by date range first (same as RiskReportModal and PondsAtRiskStackedChart)
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
        const pond = pred.fish_pond || 'Unknown Pond';
        if (!pondMap.has(pond)) pondMap.set(pond, pred);
      });
    return Array.from(pondMap.values());
  };

  // Helper function to convert timestamp to milliseconds (matching RiskReportModal logic)
  const getTimestampMs = (ts) => {
    if (!ts) return 0;
    let ms = 0;
    if (typeof ts === 'number') ms = ts;
    else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
    else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
    else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
    return ms;
  };

  const { percent, status, color, hasData, latestMs, rangeLabel } = useMemo(() => {
    // Risk score mapping
    const riskScoreMap = { Low: 100, Medium: 50, High: 0, Normal: 100 };
    let scoreSum = 0;
    let pondCount = 0;
    let latestTimestampMs = 0;

    const accumulateFromFarm = (f) => {
      if (!f) return;
      // Use the same logic as RiskReportModal: latest generated DATE, then latest per pond within that day
      const latestPonds = getLatestBatchPerPond(f);
      
      latestPonds.forEach(p => {
        const ts = p.timestamp;
        const ms = getTimestampMs(ts);
        if (ms > latestTimestampMs) latestTimestampMs = ms;
        
        // Use risk level for health calculation, NOT confidence score
        // Confidence score indicates how sure the system is about the risk level,
        // not the actual health condition
        const level = (p.risk_level || 'Normal');
        const score = riskScoreMap[level] ?? 0;
        scoreSum += score;
        pondCount += 1;
      });
    };

    if (selectedFarm === 'all') {
      farms.forEach(accumulateFromFarm);
    } else {
      // Robust matching of selected farm to data
      let f = farms.find(x => x.key === selectedFarm);
      if (!f) f = farms.find(x => normalizeFarmName(x.name) === normalizeFarmName(selectedFarm));
      if (!f) f = farms.find(x => normalizeFarmName(x.farm_key) === normalizeFarmName(selectedFarm));
      if (!f) f = farms.find(x => normalizeLoose(x.name) === normalizeLoose(selectedFarm));
      if (!f) f = farms.find(x => normalizeLoose(x.farm_key) === normalizeLoose(selectedFarm));
      if (!f) f = farms.find(x => x.name === selectedFarm);
      if (!f) f = farms.find(x => x.farm_key === selectedFarm);
      if (!f && isAssignedToFarm && currentUser?.farm) {
        const selectedNorm = normalizeFarmName(selectedFarm);
        f = farms.find(x => 
          normalizeFarmName(x.key) === selectedNorm || 
          normalizeFarmName(x.name) === selectedNorm || 
          normalizeFarmName(x.farm_key) === selectedNorm ||
          normalizeLoose(x.key) === normalizeLoose(selectedFarm) ||
          normalizeLoose(x.name) === normalizeLoose(selectedFarm) ||
          normalizeLoose(x.farm_key) === normalizeLoose(selectedFarm)
        );
      }
      accumulateFromFarm(f);
    }

    const pct = pondCount > 0 ? Math.round(scoreSum / pondCount) : 0;
    const s = getStatus(pct);
    
    // Show data range based on available data
    const now = new Date();
    const rangeText = latestTimestampMs > 0 
      ? `${new Date(latestTimestampMs).toLocaleDateString()} – ${now.toLocaleDateString()}`
      : 'All available data';
    
    return { percent: pct, status: s.label, color: s.color, hasData: pondCount > 0, latestMs: latestTimestampMs, rangeLabel: rangeText };
  }, [farms, selectedFarm, isAssignedToFarm, currentUser?.farm]);

  // Cache last known value and use as fallback when no fresh data
  const cacheKey = useMemo(() => `farmHealthGauge:${selectedFarm}`, [selectedFarm]);
  useEffect(() => {
    try {
      if (hasData) {
        localStorage.setItem(cacheKey, JSON.stringify({ percent, status, color, asOf: Date.now() }));
      }
    } catch (_) {}
  }, [hasData, percent, status, color, cacheKey]);

  const { displayPercent, displayStatus, displayColor, noteText, infoLabel, updateColor } = useMemo(() => {
    if (hasData) {
      const now = new Date();
      const dataDate = latestMs ? new Date(latestMs) : null;
      
      let updateStatus = '';
      let updateColor = '#4ade80'; // green for current
      
      if (dataDate) {
        const hoursDiff = (now.getTime() - dataDate.getTime()) / (1000 * 60 * 60);
        
        if (hoursDiff <= 24) {
          updateStatus = t('farmHealthGauge.notes.currentData');
          updateColor = '#4ade80'; // green
        } else if (hoursDiff <= 72) {
          updateStatus = t('farmHealthGauge.notes.recentData');
          updateColor = '#f59e0b'; // amber
        } else {
          updateStatus = t('farmHealthGauge.notes.outdatedData');
          updateColor = '#ef4444'; // red
        }
        
        const lastUpdated = `${t('farmHealthGauge.lastUpdated')} ${dataDate.toLocaleString()}`;
        return { 
          displayPercent: percent, 
          displayStatus: status, 
          displayColor: color, 
          noteText: `${updateStatus} • ${lastUpdated}`, 
          infoLabel: t('farmHealthGauge.dataFrom', { range: rangeLabel }),
          updateColor: updateColor
        };
      } else {
        return { 
          displayPercent: percent, 
          displayStatus: status, 
          displayColor: color, 
          noteText: t('farmHealthGauge.currentNoTimestamp'), 
          infoLabel: t('farmHealthGauge.dataFrom', { range: rangeLabel }),
          updateColor: '#6b7280' // gray
        };
      }
    }
    
    // Fallback to cached data
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw || '{}');
        const d = parsed?.asOf ? new Date(parsed.asOf) : null;
        const note = d
          ? t('farmHealthGauge.cachedNotLatestWithLastUpdated', { datetime: d.toLocaleString() })
          : t('farmHealthGauge.cachedNotLatestUnknown');
        const perc = typeof parsed.percent === 'number' ? parsed.percent : 100;
        const st = parsed.status || getStatus(perc).label;
        const col = parsed.color || getStatus(perc).color;
        return { 
          displayPercent: perc, 
          displayStatus: st, 
          displayColor: col, 
          noteText: note, 
          infoLabel: t('farmHealthGauge.basedOnCachedData'),
          updateColor: '#f59e0b' // amber for cached
        };
      }
    } catch (_) {}
    
    // For farm admins with no data, show a more specific message
    if (isAssignedToFarm) {
      return { 
        displayPercent: 0, 
        displayStatus: 'NO DATA', 
        displayColor: '#ef4444', 
        noteText: t('farmHealthGauge.noDataForAssignedFarm', { farm: assignedFarmName || currentUser?.farm || 'assigned farm' }), 
        infoLabel: t('farmHealthGauge.noRecentDataFound'),
        updateColor: '#ef4444' // red for no data
      };
    }
    
    const def = getStatus(100);
    return { 
      displayPercent: 100, 
      displayStatus: def.label, 
      displayColor: def.color, 
      noteText: t('farmHealthGauge.noDataAvailable'), 
      infoLabel: t('farmHealthGauge.noRecentDataFound'),
      updateColor: '#ef4444' // red for no data
    };
  }, [hasData, percent, status, color, cacheKey, latestMs, rangeLabel, t]);

  const chartData = useMemo(() => ([{ name: 'health', value: displayPercent, fill: displayColor }]), [displayPercent, displayColor]);

  const assignedFarmDisplayName = isAssignedToFarm 
    ? (assignedFarmName 
        || farmsNameByKey[currentUser.farm] 
        || farmsNameByKey[normalizeFarmName(currentUser.farm)] 
        || null)
    : null;

  return (
    <div className="health-gauge-container" id="health-gauge-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="chart-title" style={{ 
          margin: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '8px' 
        }}>
          {isStdPhone && (
            <button
              onClick={() => {
                const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
                if (!isTemporaryTechOfficer) {
                  const isOpening = !exportOpen;
                  if (isOpening && typeof onDropdownOpen === 'function') {
                    onDropdownOpen('homepageFarmHealthExport');
                  }
                  setExportOpen(v => !v);
                }
              }}
              disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
              style={{ 
                background: 'transparent', 
                border: 'none', 
                color: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? '#9ca3af' : 'white', 
                cursor: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'not-allowed' : 'pointer', 
                display: 'flex', 
                alignItems: 'center',
                opacity: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 0.5 : 1,
                padding: '4px'
              }}
              aria-label={t('farmHealthGauge.exportAriaLabel')}
              title={t('farmHealthGauge.exportAriaLabel')}
            >
              <GiHamburgerMenu style={{ fontSize: '1.2rem' }} />
            </button>
          )}
          {isAssignedToFarm 
            ? t('farmHealthGauge.titleAssigned', { farm: assignedFarmDisplayName || t('farmHealthGauge.loading', { defaultValue: 'Loading…' }) })
            : t('farmHealthGauge.title')
          }
        </h3>
        {isStdPhone && exportOpen && (
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '60px',
            transform: 'translateX(-50%)',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            minWidth: 200,
            overflow: 'hidden',
            zIndex: 5
          }}>
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadGaugeAsImage('#health-gauge-section', 'png', 'farm_health_gauge'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'health gauge PNG'), u); } catch (_) {} setExportOpen(false); }}>Download PNG</button>
            <div style={{ height: 1, background: '#e5e7eb' }} />
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadGaugeAsImage('#health-gauge-section', 'jpeg', 'farm_health_gauge'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'health gauge JPEG'), u); } catch (_) {} setExportOpen(false); }}>Download JPEG</button>
            <div style={{ height: 1, background: '#e5e7eb' }} />
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? t('farmHealthGauge.allFarms') : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm)); exportHealthGaugeCSV({ farmName, percent: displayPercent, status: displayStatus, asOf: new Date() }, 'farm_health.csv'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'farm health data'), u); } catch (_) {} setExportOpen(false); }}>Export CSV</button>
          </div>
        )}
        <div style={{ position: 'relative', display: isStdPhone ? 'none' : 'block' }}>
          <button
            onClick={() => {
              const isOpening = !exportOpen;
              if (isOpening && typeof onDropdownOpen === 'function') {
                onDropdownOpen('homepageFarmHealthExport');
              }
              setExportOpen(v => !v);
            }}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'white', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              opacity: 1
            }}
            aria-label={t('farmHealthGauge.exportAriaLabel')}
            title={t('farmHealthGauge.exportAriaLabel')}
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 26, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 200, overflow: 'hidden', zIndex: 5 }}>
              <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? t('farmHealthGauge.allFarms') : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm)); downloadGaugeAsImage('#health-gauge-section', 'png', 'farm_health', { farmName }); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'farm health PNG'), u); } catch (_) {} setExportOpen(false); }}>{t('farmHealthGauge.downloadPNG')}</button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? t('farmHealthGauge.allFarms') : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm)); downloadGaugeAsImage('#health-gauge-section', 'jpeg', 'farm_health', { farmName }); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'farm health JPEG'), u); } catch (_) {} setExportOpen(false); }}>{t('farmHealthGauge.downloadJPEG')}</button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? t('farmHealthGauge.allFarms') : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm));
                  exportHealthGaugeCSV({ farmName, percent: displayPercent, status: displayStatus, asOf: new Date() }, 'farm_health.csv');
                  try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'farm health data'), u); } catch (_) {}
                  setExportOpen(false);
                }}
              >
                {t('farmHealthGauge.exportCSV')}
              </button>
            </div>
          )}
        </div>
      </div>
      {!isAssignedToFarm && (
        <div className="chart-controls gauge-controls">
          <select
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="time-filter"
          >
            <option value="all">{t('farmHealthGauge.allFarms')}</option>
            {farms.map(f => (
              <option key={f.key} value={f.key}>{f.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="gauge-area" id="health-gauge-chart">
        {loading ? (
          <div className="loading-reports">
            <div className="loading-spinner" />
            <p>{t('farmHealthGauge.loading', { defaultValue: 'Loading farm health…' })}</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isDesktopNarrow ? "85%" : "100%"}>
              <RadialBarChart
                key={displayPercent}
                innerRadius={isDesktopNarrow ? "72%" : "65%"}
                outerRadius={isDesktopNarrow ? "90%" : "100%"}
                data={chartData}
                startAngle={180}
                endAngle={0}
                cx="50%"
                cy={isDesktopNarrow ? "38%" : "40%"}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  minAngle={0}
                  clockWise
                  dataKey="value"
                  cornerRadius={isDesktopNarrow ? 14 : 20}
                  background={{ fill: 'rgba(255,255,255,0.15)' }}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="center-overlay">
              <div className="gauge-percent" style={{ fontSize: isDesktopNarrow ? '1.8rem' : undefined }}>{displayPercent}%</div>
              <div className="gauge-status" style={{ color: displayColor, fontSize: isDesktopNarrow ? '1.1rem' : '1.35rem' }}>
                {t(`farmHealthGauge.status.${String(displayStatus || '').toLowerCase()}`, { defaultValue: displayStatus })}
              </div>
              {(() => {
                const s = String(displayStatus || '').toUpperCase();
                const isOutdated = (typeof latestMs === 'number' && latestMs > 0) && ((Date.now() - latestMs) > (24 * 60 * 60 * 1000));
                let text = '';
                if (selectedFarm === 'all') {
                  if (isOutdated) {
                    text = s === 'GOOD'
                      ? t('farmHealthGauge.summaries.all.outdated.good')
                      : s === 'CAUTION'
                      ? t('farmHealthGauge.summaries.all.outdated.caution')
                      : s === 'CRITICAL'
                      ? t('farmHealthGauge.summaries.all.outdated.critical')
                      : '';
                  } else {
                    text = s === 'GOOD'
                      ? t('farmHealthGauge.summaries.all.fresh.good')
                      : s === 'CAUTION'
                      ? t('farmHealthGauge.summaries.all.fresh.caution')
                      : s === 'CRITICAL'
                      ? t('farmHealthGauge.summaries.all.fresh.critical')
                      : '';
                  }
                } else {
                  if (isOutdated) {
                    text = s === 'GOOD'
                      ? t('farmHealthGauge.summaries.single.outdated.good')
                      : s === 'CAUTION'
                      ? t('farmHealthGauge.summaries.single.outdated.caution')
                      : s === 'CRITICAL'
                      ? t('farmHealthGauge.summaries.single.outdated.critical')
                      : '';
                  } else {
                    text = s === 'GOOD'
                      ? t('farmHealthGauge.summaries.single.fresh.good')
                      : s === 'CAUTION'
                      ? t('farmHealthGauge.summaries.single.fresh.caution')
                      : s === 'CRITICAL'
                      ? t('farmHealthGauge.summaries.single.fresh.critical')
                      : '';
                  }
                }
                return text ? (
                  <div style={{ marginTop: 22, fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', textAlign: 'center', padding: '0 8px' }}>
                    {text}
                  </div>
                ) : null;
              })()}
              {noteText ? (
                <div className="gauge-note" style={{ marginTop: 6, fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>
                  <span style={{ color: updateColor || 'rgba(255,255,255,0.8)' }}>
                    {noteText}
                  </span>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
      <div className="chart-last-updated-wrap" style={{ marginTop: 8 }}>
        <div className="chart-last-updated-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <button
            type="button"
            className="chart-refresh-btn"
            onClick={() => runRefresh(() => refreshRiskData())}
            disabled={isManualRefreshBusy || loading || riskDataLoading}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <FaSyncAlt className={isManualRefreshBusy ? 'chart-refresh-spin' : ''} />
          </button>
          <span style={{ fontSize: '0.9rem', color: '#bfc8d4' }}>{t('farmHealthGauge.summaryOverall')}</span>
        </div>
        <RefreshStatusMessage status={refreshStatus} variant="onDark" />
      </div>
        <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>{t('farmHealthGauge.legendHigh')}</span>
          <span>{t('farmHealthGauge.legendMedium')}</span>
          <span>{t('farmHealthGauge.legendLow')}</span>
        </div>
      <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>{infoLabel}</div>
    </div>
  );
};

export default FarmHealthGauge;


