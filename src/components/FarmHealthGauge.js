import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import './FarmHealthGauge.css';
import { GiHamburgerMenu } from 'react-icons/gi';
import { downloadGaugeAsImage, exportHealthGaugeCSV } from '../utils/exportHealthGauge';
import { logActivity, logMessages } from '../utils/logger';

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const getStatus = (pct) => {
  if (pct >= 70) return { label: 'GOOD', color: '#2ecc71' };
  if (pct >= 40) return { label: 'CAUTION', color: '#f1c40f' };
  return { label: 'CRITICAL', color: '#e74c3c' };
};

const FarmHealthGauge = () => {
  const { currentUser } = useAuth();
  const [farms, setFarms] = useState([]);
  const [selectedFarm, setSelectedFarm] = useState('all');
  const [exportOpen, setExportOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmKey = isAssignedToFarm ? normalizeFarmName(currentUser.farm) : null;

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
          console.error('Error resolving farm name:', error);
          setAssignedFarmName(currentUser.farm);
        }
      }
    };
    resolveAssignedFarmName();
  }, [isAssignedToFarm, currentUser?.farm]);

  useEffect(() => {
    (async () => {
      const data = await fetchRiskReportData();
      setFarms(Array.isArray(data) ? data : []);
    })();
  }, []);

  useEffect(() => {
    if (isAssignedToFarm) {
      setSelectedFarm(assignedFarmKey);
    } else {
      setSelectedFarm('all');
    }
  }, [isAssignedToFarm, assignedFarmKey]);

  const { percent, status, color, hasData, latestMs, rangeLabel } = useMemo(() => {
    // Risk score mapping
    const riskScoreMap = { Low: 100, Medium: 50, High: 0, Normal: 100 };
    let scoreSum = 0;
    let pondCount = 0;
    let latestTimestampMs = 0;

    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6); // inclusive 7-day window

    const accumulateFromFarm = (f) => {
      if (!f) return;
      // Prefer predictions (already deduplicated to latest per pond), fallback to counts
      if (Array.isArray(f.predictions) && f.predictions.length > 0) {
        f.predictions.forEach(p => {
          // Only include within last 7 days
          const ts = p.timestamp;
          let ms = 0;
          if (typeof ts === 'number') ms = ts;
          else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
          else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
          else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
          if (ms > 0) {
            const d = new Date(ms);
            if (d < start || d > end) return; // outside window
            if (ms > latestTimestampMs) latestTimestampMs = ms;
          } else {
            return; // skip if no timestamp
          }
          // Prefer explicit prediction confidence when available to align with Risk Report Modal
          const conf = typeof p.confidence === 'number' ? p.confidence : undefined;
          if (typeof conf === 'number') {
            scoreSum += conf; // already 0-100 range expected
          } else {
            const level = (p.risk_level || 'Normal');
            const score = riskScoreMap[level] ?? 0;
            scoreSum += score;
          }
          pondCount += 1;
        });
      } else if (f.counts) {
        const c = f.counts;
        // Counts have no time dimension; include only if we still have no predictions
        if (pondCount === 0 && scoreSum === 0) {
          scoreSum += (c.low || 0) * 100 + (c.medium || 0) * 50 + (c.high || 0) * 0 + (c.normal || 0) * 100;
          pondCount += (c.low || 0) + (c.medium || 0) + (c.high || 0) + (c.normal || 0);
        }
      }
    };

    if (selectedFarm === 'all') {
      farms.forEach(accumulateFromFarm);
    } else {
      const f = farms.find(x => x.key === selectedFarm);
      accumulateFromFarm(f);
    }

    const pct = pondCount > 0 ? Math.round(scoreSum / pondCount) : 0;
    const s = getStatus(pct);
    const rangeText = `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
    return { percent: pct, status: s.label, color: s.color, hasData: pondCount > 0, latestMs: latestTimestampMs, rangeLabel: rangeText };
  }, [farms, selectedFarm]);

  // Cache last known value and use as fallback when no fresh data
  const cacheKey = useMemo(() => `farmHealthGauge:${selectedFarm}`, [selectedFarm]);
  useEffect(() => {
    try {
      if (hasData) {
        localStorage.setItem(cacheKey, JSON.stringify({ percent, status, color, asOf: Date.now() }));
      }
    } catch (_) {}
  }, [hasData, percent, status, color, cacheKey]);

  const { displayPercent, displayStatus, displayColor, noteText, infoLabel } = useMemo(() => {
    if (hasData) {
      const updated = latestMs ? ` • Last updated: ${new Date(latestMs).toLocaleString()}` : '';
      return { displayPercent: percent, displayStatus: status, displayColor: color, noteText: `Up to date${updated}`, infoLabel: `Data from ${rangeLabel}` };
    }
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw || '{}');
        const d = parsed?.asOf ? new Date(parsed.asOf) : null;
        const note = d ? `Last updated: ${d.toLocaleString()}` : 'Last updated: unknown';
        const perc = typeof parsed.percent === 'number' ? parsed.percent : 100;
        const st = parsed.status || getStatus(perc).label;
        const col = parsed.color || getStatus(perc).color;
        return { displayPercent: perc, displayStatus: st, displayColor: col, noteText: note, infoLabel: 'Based on the last 7 days' };
      }
    } catch (_) {}
    const def = getStatus(100);
    return { displayPercent: 100, displayStatus: def.label, displayColor: def.color, noteText: 'Last updated: no recent data', infoLabel: 'Based on the last 7 days' };
  }, [hasData, percent, status, color, cacheKey, latestMs, rangeLabel]);

  const chartData = useMemo(() => ([{ name: 'health', value: displayPercent, fill: displayColor }]), [displayPercent, displayColor]);

  return (
    <div className="health-gauge-container" id="health-gauge-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="chart-title" style={{ margin: 0 }}>
          {isAssignedToFarm 
            ? `${assignedFarmName || currentUser.farm} Health`
            : 'Farm Health'
          }
        </h3>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setExportOpen(v => !v)}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            aria-label="Export"
            title="Export"
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 26, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 200, overflow: 'hidden', zIndex: 5 }}>
              <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? 'All Farms' : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm)); downloadGaugeAsImage('#health-gauge-section', 'png', 'farm_health', { farmName }); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'farm health PNG'), u); } catch (_) {} setExportOpen(false); }}>Download PNG</button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? 'All Farms' : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm)); downloadGaugeAsImage('#health-gauge-section', 'jpeg', 'farm_health', { farmName }); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'farm health JPEG'), u); } catch (_) {} setExportOpen(false); }}>Download JPEG</button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  const farmName = isAssignedToFarm ? (assignedFarmName || currentUser.farm) : (selectedFarm === 'all' ? 'All Farms' : (farms.find(f => f.key === selectedFarm)?.name || selectedFarm));
                  exportHealthGaugeCSV({ farmName, percent: displayPercent, status: displayStatus, asOf: new Date() }, 'farm_health.csv');
                  try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'farm health data'), u); } catch (_) {}
                  setExportOpen(false);
                }}
              >
                Export CSV
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
            <option value="all">All Farms</option>
            {farms.map(f => (
              <option key={f.key} value={f.key}>{f.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="gauge-area" id="health-gauge-chart">
        <ResponsiveContainer width="100%" aspect={1}>
          <RadialBarChart
            key={displayPercent}
            innerRadius="70%"
            outerRadius="100%"
            data={chartData}
            startAngle={180}
            endAngle={0}
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
          <div className="gauge-status" style={{ color: displayColor }}>
            {displayStatus}
          </div>
          {noteText ? (
            <div className="gauge-note" style={{ marginTop: 6, fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>{noteText}</div>
          ) : null}
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)' }}>{infoLabel}</div>
      {/* Old legend  
      <div className="health-legend">
        <div className="health-legend-item legend-good">
          <span className="health-legend-dot" />
          <span className="health-legend-text">Good (≥ 70%)</span>
        </div>
        <div className="health-legend-item legend-caution">
          <span className="health-legend-dot" />
          <span className="health-legend-text">Caution (40–69%)</span>
        </div>
        <div className="health-legend-item legend-critical">
          <span className="health-legend-dot" />
          <span className="health-legend-text">Critical ({'<'} 40%)</span>
        </div>
      </div>
      */}
    </div>
  );
};

export default FarmHealthGauge;


