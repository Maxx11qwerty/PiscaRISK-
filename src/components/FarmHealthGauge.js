import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import './FarmHealthGauge.css';

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
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmKey = isAssignedToFarm ? normalizeFarmName(currentUser.farm) : null;

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

  const { percent, status, color, hasData } = useMemo(() => {
    // Risk score mapping
    const riskScoreMap = { Low: 100, Medium: 50, High: 0, Normal: 100 };
    let scoreSum = 0;
    let pondCount = 0;

    const accumulateFromFarm = (f) => {
      if (!f) return;
      // Prefer predictions (already deduplicated to latest per pond), fallback to counts
      if (Array.isArray(f.predictions) && f.predictions.length > 0) {
        f.predictions.forEach(p => {
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
        scoreSum += (c.low || 0) * 100 + (c.medium || 0) * 50 + (c.high || 0) * 0 + (c.normal || 0) * 100;
        pondCount += (c.low || 0) + (c.medium || 0) + (c.high || 0) + (c.normal || 0);
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
    return { percent: pct, status: s.label, color: s.color, hasData: pondCount > 0 };
  }, [farms, selectedFarm]);

  const chartData = useMemo(() => ([{ name: 'health', value: percent, fill: color }]), [percent, color]);

  return (
    <div className="health-gauge-container">
      <h3 className="chart-title">Farm Health Score</h3>
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
      <div className="gauge-area">
        <ResponsiveContainer width="100%" aspect={1}>
          <RadialBarChart
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
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="center-overlay">
          <div className="gauge-percent">{percent}%</div>
          <div className="gauge-status" style={{ color: hasData ? color : 'rgba(255,255,255,0.7)' }}>
            {hasData ? status : 'NO DATA'}
          </div>
        </div>
      </div>
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
    </div>
  );
};

export default FarmHealthGauge;


