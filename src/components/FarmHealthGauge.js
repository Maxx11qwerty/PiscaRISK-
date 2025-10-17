import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import { useFarms } from '../contexts/FarmsContext';
import './FarmHealthGauge.css';
import { GiHamburgerMenu } from 'react-icons/gi';
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

const FarmHealthGauge = () => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const { farmsNameByKey } = useFarms();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFarm, setSelectedFarm] = useState('all');
  const [exportOpen, setExportOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmKey = isAssignedToFarm ? normalizeFarmName(farmsNameByKey[currentUser.farm] || currentUser.farm) : null;

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
    (async () => {
      try {
        setLoading(true);
        const data = await fetchRiskReportData();
        
        // Canonicalize farm display names with live map and legacy aliases
        const legacyMap = {
          'salmon-hatchery-facility': 'Aquino Fish Farm',
          'tilapia-production-center': "Vergara's Aqua Farm",
          'blue-ocean-aquafarm': 'Maningas Fish Farm',
          'marine-species-cultivation': 'Labay Fish Farm',
        };
        const canon = (Array.isArray(data) ? data : [])
          .filter(f => 
            f.farm_key !== 'rojo-hatchery' && 
            f.name !== 'Rojo Hatchery' &&
            f.farm_key !== 'freshwater-finfish-farm' &&
            f.name !== 'Freshwater Finfish Farm' &&
            !f.name?.toLowerCase().includes('freshwater finfish')
          ) // Additional filtering
          .map(f => {
            const live = farmsNameByKey[f.key];
            const legacy = legacyMap[f.key];
            const name = live || legacy || f.name;
            return { ...f, name, key: normalizeFarmName(name) };
          });
        // Merge duplicates by name
        const map = new Map();
        canon.forEach(f => {
          const name = f.name || 'Unknown Farm';
          if (!map.has(name)) map.set(name, { ...f });
          else {
            const cur = map.get(name);
            const preds = [
              ...(Array.isArray(cur.predictions) ? cur.predictions : []),
              ...(Array.isArray(f.predictions) ? f.predictions : [])
            ];
            map.set(name, { ...cur, predictions: preds });
          }
        });
        const processedFarms = Array.from(map.values());
        setFarms(processedFarms);
      } catch (error) {
        // Silently handle errors
      }
      finally {
        setLoading(false);
      }
    })();
  }, [farmsNameByKey, isAssignedToFarm, currentUser?.farm, assignedFarmKey, selectedFarm]);

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

  // Helper: get latest batch (same generated date) and dedupe per pond (match RiskReportModal)
  const getLatestBatchPerPond = (farm) => {
    if (!farm?.predictions || !Array.isArray(farm.predictions)) return [];
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
        
        // Prefer explicit prediction confidence (accept number-like strings)
        const numConf = (p.confidence != null && !Number.isNaN(Number(p.confidence))) ? Number(p.confidence) : null;
        if (typeof numConf === 'number' && Number.isFinite(numConf)) {
          const bounded = Math.max(0, Math.min(100, numConf));
          scoreSum += bounded; // 0–100
        } else {
          const level = (p.risk_level || 'Normal');
          const score = riskScoreMap[level] ?? 0;
          scoreSum += score;
        }
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
        <h3 className="chart-title" style={{ margin: 0 }}>
          {isAssignedToFarm 
            ? t('farmHealthGauge.titleAssigned', { farm: assignedFarmDisplayName || t('farmHealthGauge.loading', { defaultValue: 'Loading…' }) })
            : t('farmHealthGauge.title')
          }
        </h3>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
              if (!isTemporaryTechOfficer) {
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
              opacity: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 0.5 : 1
            }}
            aria-label={t('farmHealthGauge.exportAriaLabel')}
            title={(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? "Export unavailable for temporary accounts" : t('farmHealthGauge.exportAriaLabel')}
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && !(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
              {t('farmHealthGauge.loading', { defaultValue: 'Loading farm health…' })}
            </div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                key={displayPercent}
                innerRadius="70%"
                outerRadius="100%"
                data={chartData}
                startAngle={180}
                endAngle={0}
                cx="50%"
                cy="40%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  minAngle={0}
                  clockWise
                  dataKey="value"
                  cornerRadius={20}
                  background={{ fill: 'rgba(255,255,255,0.15)' }}
                  isAnimationActive
                  animationDuration={900}
                  animationEasing="ease-out"
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="center-overlay">
              <div className="gauge-percent">{displayPercent}%</div>
              <div className="gauge-status" style={{ color: displayColor, fontSize: '1.35rem' }}>
                {t(`farmHealthGauge.status.${String(displayStatus || '').toLowerCase()}`, { defaultValue: displayStatus })}
              </div>
              {(() => {
                const s = String(displayStatus || '').toUpperCase();
                let text = '';
                if (selectedFarm === 'all') {
                  text = s === 'GOOD'
                    ? 'Stable conditions across all farms.'
                    : s === 'CAUTION'
                    ? 'Some farms show early signs of risk.'
                    : s === 'CRITICAL'
                    ? 'Multiple farms require urgent attention.'
                    : '';
                } else {
                  text = s === 'GOOD'
                    ? 'Stable farm conditions based on recent monitoring data.'
                    : s === 'CAUTION'
                    ? 'Moderate conditions, potential risks emerging.'
                    : s === 'CRITICAL'
                    ? 'Unstable conditions; immediate attention required.'
                    : '';
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
      <div style={{ marginTop: 8, fontSize: '0.9rem', color: '#bfc8d4' }}>
        Overall farm health score based on recent pond risk predictions.
      </div>
      <div style={{ marginTop: 4, fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>{infoLabel}</div>
    </div>
  );
};

export default FarmHealthGauge;


