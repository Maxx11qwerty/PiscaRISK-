import React, { useMemo, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import { useTranslation } from 'react-i18next';

const RISK_COLORS = {
  High: '#FF4444',
  Medium: '#FF8800',
  Low: '#00AA00',
};

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const PondsAtRiskStackedChart = ({ onDrilldown }) => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupMode, setGroupMode] = useState('farm'); // 'farm' | 'risk'
  const [selectedFarm, setSelectedFarm] = useState('all');
  const [activeLegendKey, setActiveLegendKey] = useState(null);
  const [hoverSeriesKey, setHoverSeriesKey] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const data = (await fetchRiskReportData()) || [];
        setFarms(data);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmKey = isAssignedToFarm ? normalizeFarmName(currentUser.farm) : null;

  const farmOptions = useMemo(() => {
    const opts = [{ key: 'all', name: t('pondsAtRiskChart.allFarms') }];
    farms.forEach(f => opts.push({ key: f.key, name: f.name }));
    return opts;
  }, [farms, t]);

  const filteredFarms = useMemo(() => {
    if (isAssignedToFarm) {
      return farms.filter(f => f.key === assignedFarmKey);
    }
    if (selectedFarm && selectedFarm !== 'all') {
      return farms.filter(f => f.key === selectedFarm);
    }
    return farms;
  }, [farms, isAssignedToFarm, assignedFarmKey, selectedFarm]);

  const byFarmData = useMemo(() => {
    return filteredFarms.map(f => ({
      name: isAssignedToFarm ? t('pondsAtRiskChart.farm') : f.name,
      High: f.counts?.high || 0,
      Medium: f.counts?.medium || 0,
      Low: f.counts?.low || 0,
      farmKey: f.key,
    }));
  }, [filteredFarms, isAssignedToFarm, t]);

  const byRiskData = useMemo(() => {
    // X-axis = High/Medium/Low, stacked by farm
    const riskBuckets = { High: {}, Medium: {}, Low: {} };
    filteredFarms.forEach(f => {
      riskBuckets.High[f.name] = (f.counts?.high || 0);
      riskBuckets.Medium[f.name] = (f.counts?.medium || 0);
      riskBuckets.Low[f.name] = (f.counts?.low || 0);
    });
    return Object.keys(riskBuckets).map(level => ({
      risk: level,
      ...riskBuckets[level]
    }));
  }, [filteredFarms]);

  // Assign distinct colors to farms for risk view
  const farmColorMap = useMemo(() => {
    const palette = [
      '#94AECA', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
      '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ];
    const custom = {
      'Salmon Hatchery': '#e24a33', // darker salmon (tomato) for better contrast
    };
    const map = new Map();
    filteredFarms.forEach((f, idx) => {
      const defaultColor = palette[idx % palette.length];
      // Apply custom color only when showing All Farms and grouping by risk
      const useCustom = (selectedFarm === 'all' && groupMode === 'risk' && custom[f.name]);
      map.set(f.name, useCustom ? custom[f.name] : defaultColor);
    });
    return map;
  }, [filteredFarms, selectedFarm, groupMode]);

  // Custom tooltip that only shows the active series when hovering legend
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const highlightKey = hoverSeriesKey || activeLegendKey;
    const filtered = highlightKey
      ? payload.filter(p => p.name === highlightKey)
      : payload;
    if (filtered.length === 0) return null;
    return (
      <div className="custom-tooltip">
        <div className="tooltip-label" style={{ marginBottom: 6 }}>{label}</div>
        {filtered.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, background: item.color, display: 'inline-block', borderRadius: 2 }} />
            <span>{item.name}: {item.value}</span>
          </div>
        ))}
      </div>
    );
  };

  // Custom legend to enable hover highlighting
  const renderLegend = ({ payload }) => {
    if (!payload) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {payload.map((entry, idx) => {
          const isActive = activeLegendKey === entry.value;
          return (
            <div
              key={idx}
              onMouseEnter={() => setActiveLegendKey(entry.value)}
              onMouseLeave={() => setActiveLegendKey(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 12,
                cursor: 'pointer',
                background: isActive ? 'rgba(127, 252, 255, 0.15)' : 'transparent',
                border: isActive ? '1px solid rgba(127, 252, 255, 0.6)' : '1px solid transparent',
                color: '#ffffff'
              }}
            >
              <span style={{ width: 10, height: 10, background: entry.color, display: 'inline-block', borderRadius: 2 }} />
              <span>{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const handleBarClick = (data, index) => {
    if (!onDrilldown) return;
    if (groupMode === 'farm') {
      const item = byFarmData[index];
      onDrilldown({ type: 'farm', farmKey: item.farmKey });
    } else {
      const item = byRiskData[index];
      onDrilldown({ type: 'risk', risk: item.risk, farms: filteredFarms.map(f => f.key) });
    }
  };

  if (loading) {
    return <div className="loading-reports">{t('pondsAtRiskChart.loadingChartData')}</div>;
  }

  return (
    <div className="bar-chart-container">
      <h3 className="chart-title">{t('pondsAtRiskChart.title')}</h3>
      <div className="chart-controls">
        {!isAssignedToFarm && (
          <>
            <select
              value={selectedFarm}
              onChange={(e) => setSelectedFarm(e.target.value)}
              className="time-filter"
            >
              {farmOptions.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.name}</option>
              ))}
            </select>
            <div className="toggle-group" role="tablist" aria-label="Group by">
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === 'farm'}
                className={`toggle-segment ${groupMode === 'farm' ? 'active' : ''}`}
                onClick={() => setGroupMode('farm')}
              >
                {t('pondsAtRiskChart.viewByFarm')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === 'risk'}
                className={`toggle-segment ${groupMode === 'risk' ? 'active' : ''}`}
                onClick={() => setGroupMode('risk')}
              >
                {t('pondsAtRiskChart.viewByRisk')}
              </button>
            </div>
          </>
        )}
      </div>

      {groupMode === 'farm' ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart layout="vertical" data={byFarmData} onClick={({ activeTooltipIndex }) => { if (activeTooltipIndex != null) handleBarClick(null, activeTooltipIndex); }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="name" width={100} />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
            <Bar
              dataKey="High"
              name={t('pondsAtRiskChart.high')}
              stackId="a"
              fill={RISK_COLORS.High}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'High' ? 1 : 0.2) : 1}
              onMouseEnter={() => setHoverSeriesKey('High')}
              onMouseLeave={() => setHoverSeriesKey(null)}
            />
            <Bar
              dataKey="Medium"
              name={t('pondsAtRiskChart.medium')}
              stackId="a"
              fill={RISK_COLORS.Medium}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'Medium' ? 1 : 0.2) : 1}
              onMouseEnter={() => setHoverSeriesKey('Medium')}
              onMouseLeave={() => setHoverSeriesKey(null)}
            />
            <Bar
              dataKey="Low"
              name={t('pondsAtRiskChart.low')}
              stackId="a"
              fill={RISK_COLORS.Low}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'Low' ? 1 : 0.2) : 1}
              onMouseEnter={() => setHoverSeriesKey('Low')}
              onMouseLeave={() => setHoverSeriesKey(null)}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart layout="vertical" data={byRiskData} onClick={({ activeTooltipIndex }) => { if (activeTooltipIndex != null) handleBarClick(null, activeTooltipIndex); }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" />
            <YAxis type="category" dataKey="risk" width={110} />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
            {filteredFarms.map(f => (
              <Bar
                key={f.key}
                dataKey={f.name}
                name={f.name}
                stackId="a"
                fill={farmColorMap.get(f.name) || '#7ffcff'}
                fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === f.name ? 1 : 0.2) : 1}
                onMouseEnter={() => setHoverSeriesKey(f.name)}
                onMouseLeave={() => setHoverSeriesKey(null)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
            <div className="reports-last-updated">
        {t('pondsAtRiskChart.asOf')} {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
};

export default PondsAtRiskStackedChart;


