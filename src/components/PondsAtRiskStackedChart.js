import React, { useMemo, useState, useEffect } from 'react';
import { downloadChartAsImage, exportChartDataCSV } from '../utils/exportStackedbarChart';
import { logActivity, logMessages } from '../utils/logger';
import { GiHamburgerMenu } from 'react-icons/gi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import { useTranslation } from 'react-i18next';

const RISK_COLORS = {
  High: '#FF4444',
  Medium: '#FF8800',
  Low: '#00AA00',
};

const ASSIGNED_FARM_RISK_COLORS = {
  High: '#FF6B6B',  // Softer red
  Medium: '#FFB347', // Softer orange
  Low: '#4ECDC4',   // Teal/cyan
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
  const [exportOpen, setExportOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState('today'); // today | week | month | custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const data = (await fetchRiskReportData()) || [];
        console.log('PondsAtRiskStackedChart - Fetched data:', data.length, 'farms');
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

  // Date range for aggregation
  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    let start, end;
    if (timeFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeFilter === 'week') {
      // For "this week", we want to include the most recent week with data
      // Since most data is from Sep 21st, we'll include the week that contains Sep 21st
      // Sep 21st is a Sunday, so the week is Sep 15-21, 2025
      start = new Date(2025, 8, 15, 0, 0, 0, 0); // Sep 15, 2025 (Monday)
      end = new Date(2025, 8, 21, 23, 59, 59, 999); // Sep 21, 2025 (Sunday)
      
    } else if (timeFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (timeFilter === 'custom') {
      const s = customStart ? new Date(customStart) : null;
      const e = customEnd ? new Date(customEnd) : null;
      start = s ? new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0) : null;
      end = e ? new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999) : null;
    }
    return { rangeStart: start, rangeEnd: end };
  }, [timeFilter, customStart, customEnd]);

  useEffect(() => {
    console.log('PondsAtRiskStackedChart - Time filter changed to:', timeFilter);
    setLastUpdated(new Date());
  }, [timeFilter, customStart, customEnd, selectedFarm, groupMode]);

  // Keep assigned users in 'farm' mode since they only have one farm to view
  // This ensures they see the High/Medium/Low bars with the correct colors
  useEffect(() => {
    if (isAssignedToFarm && groupMode === 'risk') {
      setGroupMode('farm');
    }
  }, [isAssignedToFarm, groupMode]);


  const normalizeRisk = (level) => {
    if (!level || typeof level !== 'string') return 'Normal';
    const s = level.toLowerCase();
    if (s.includes('high') || s.includes('critical')) return 'High';
    if (s.includes('medium')) return 'Medium';
    if (s.includes('low')) return 'Low';
    if (s.includes('normal')) return 'Normal';
    return level.charAt(0).toUpperCase() + level.slice(1);
  };

  // Helper function to convert timestamp to milliseconds (consistent with other components)
  const getTimestampMs = (ts) => {
    if (!ts) return 0;
    let ms = 0;
    if (typeof ts === 'number') ms = ts;
    else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
    else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
    else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
    return ms;
  };

  const withinRange = (ts) => {
    if (!rangeStart || !rangeEnd) return true; // if custom not fully set, show all
    const ms = getTimestampMs(ts);
    if (ms === 0) return false;
    const d = new Date(ms);
    return d >= rangeStart && d <= rangeEnd;
  };

  const byFarmData = useMemo(() => {
    
    const farmsSorted = [...filteredFarms].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const result = farmsSorted.map(f => {
      let high = 0, medium = 0, low = 0;
      let totalPredictions = 0;
      let inRangePredictions = 0;
      
      if (Array.isArray(f.predictions)) {
        totalPredictions = f.predictions.length;
        f.predictions.forEach((p) => {
          const isInRange = withinRange(p.timestamp);
          if (isInRange) inRangePredictions++;
          
          if (!isInRange) return;
          const lvl = normalizeRisk(p.risk_level);
          if (lvl === 'High') high += 1;
          else if (lvl === 'Medium') medium += 1;
          else if (lvl === 'Low') low += 1;
        });
      }
      
      return {
        name: f.name, // Always show the actual farm name
        High: high,
        Medium: medium,
        Low: low,
        farmKey: f.key,
        __total: high + medium + low,
      };
    });
    
    return result;
  }, [filteredFarms, rangeStart, rangeEnd, timeFilter]);

  const byRiskData = useMemo(() => {
    // X-axis = High/Medium/Low, stacked by farm
    const farmsSorted = [...filteredFarms].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const riskBuckets = { High: {}, Medium: {}, Low: {} };
    farmsSorted.forEach(f => {
      let high = 0, medium = 0, low = 0;
      if (Array.isArray(f.predictions)) {
        f.predictions.forEach(p => {
          if (!withinRange(p.timestamp)) return;
          const lvl = normalizeRisk(p.risk_level);
          if (lvl === 'High') high += 1;
          else if (lvl === 'Medium') medium += 1;
          else if (lvl === 'Low') low += 1;
        });
      }
      riskBuckets.High[f.name] = high;
      riskBuckets.Medium[f.name] = medium;
      riskBuckets.Low[f.name] = low;
    });
    return Object.keys(riskBuckets).map(level => ({
      risk: level,
      ...riskBuckets[level]
    }));
  }, [filteredFarms, rangeStart, rangeEnd]);

  // Compute max stacked totals to size the X-axis domain to avoid clipping
  const maxFarmStackTotal = useMemo(() => {
    const totals = byFarmData.map(d => Number(d.__total || 0));
    return totals.length ? Math.max(...totals) : 0;
  }, [byFarmData]);

  const maxRiskStackTotal = useMemo(() => {
    if (!byRiskData.length) return 0;
    return byRiskData.reduce((maxSoFar, row) => {
      const rowTotal = filteredFarms.reduce((sum, f) => sum + (Number(row[f.name]) || 0), 0);
      return Math.max(maxSoFar, rowTotal);
    }, 0);
  }, [byRiskData, filteredFarms]);

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
    const total = filtered.reduce((sum, it) => sum + (Number(it.value) || 0), 0);
    
    // Get the correct colors based on user assignment and group mode
    const getTooltipColor = (item) => {
      // If it's a risk level (High, Medium, Low), use risk colors
      if (['High', 'Medium', 'Low'].includes(item.name)) {
        const colors = isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS : RISK_COLORS;
        return colors[item.name] || '#000000';
      }
      // If it's a farm name (in risk group mode), use farm colors
      return item.color || farmColorMap.get(item.name) || '#7ffcff';
    };
    
    return (
      <div className="custom-tooltip">
        <div className="tooltip-label" style={{ marginBottom: 6 }}>{label}</div>
        {total === 0 ? (
          <div>No risk reported</div>
        ) : (
          filtered.map((item, idx) => {
            const tooltipColor = getTooltipColor(item);
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, background: tooltipColor, display: 'inline-block', borderRadius: 2 }} />
                <span>{item.name}: {item.value}</span>
              </div>
            );
          })
        )}
      </div>
    );
  };

  // Custom legend to enable hover highlighting
  const renderLegend = ({ payload }) => {
    if (!payload) return null;
    
    // Get the correct colors based on user assignment and group mode
    const getLegendColor = (entry) => {
      // If it's a risk level (High, Medium, Low), use risk colors
      if (['High', 'Medium', 'Low'].includes(entry.value)) {
        const colors = isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS : RISK_COLORS;
        return colors[entry.value] || '#000000';
      }
      // If it's a farm name (in risk group mode), use farm colors
      return entry.color || farmColorMap.get(entry.value) || '#7ffcff';
    };
    
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {payload.map((entry, idx) => {
          const isActive = activeLegendKey === entry.value;
          const legendColor = getLegendColor(entry);
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
              <span style={{ width: 10, height: 10, background: legendColor, display: 'inline-block', borderRadius: 2 }} />
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
      onDrilldown({ 
        type: 'farm', 
        farmKey: item.farmKey,
        timeFilter: timeFilter,
        customStart: customStart,
        customEnd: customEnd,
        rangeStart: rangeStart,
        rangeEnd: rangeEnd
      });
    } else {
      const item = byRiskData[index];
      onDrilldown({ 
        type: 'risk', 
        risk: item.risk, 
        farms: filteredFarms.map(f => f.key),
        timeFilter: timeFilter,
        customStart: customStart,
        customEnd: customEnd,
        rangeStart: rangeStart,
        rangeEnd: rangeEnd
      });
    }
  };

  const noDataInRange = useMemo(() => byFarmData.every(d => (d.__total || 0) === 0), [byFarmData]);

  if (loading) {
    return <div className="loading-reports">{t('pondsAtRiskChart.loadingChartData')}</div>;
  }

  return (
    <div className="bar-chart-container" id="stacked-risk-chart">
      <h3 className="chart-title">
        {isAssignedToFarm 
          ? `${filteredFarms[0]?.name || currentUser.farm} Pond Risk`
          : t('pondsAtRiskChart.title')
        }
      </h3>
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
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="time-filter"
              style={{ marginLeft: 8 }}
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
            {timeFilter === 'custom' && (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="time-filter" style={{ marginLeft: 8 }} />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="time-filter" style={{ marginLeft: 8 }} />
              </>
            )}
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
        {/* Time filter for assigned users */}
        {isAssignedToFarm && (
          <>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="time-filter"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
            {timeFilter === 'custom' && (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="time-filter" style={{ marginLeft: 8 }} />
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="time-filter" style={{ marginLeft: 8 }} />
              </>
            )}
          </>
        )}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { e.stopPropagation(); setExportOpen(v => !v); }}
              style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              aria-label="Export"
              title="Export"
            >
              <GiHamburgerMenu style={{ fontSize: '20px' }} />
            </button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: 26, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 200, overflow: 'hidden', zIndex: 5 }}>
                <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadChartAsImage('#stacked-risk-chart', 'png', 'ponds_at_risk'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'stacked chart PNG'), u); } catch (_) {} setExportOpen(false); }}>Download PNG</button>
                <div style={{ height: 1, background: '#e5e7eb' }} />
                <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadChartAsImage('#stacked-risk-chart', 'jpeg', 'ponds_at_risk'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'stacked chart JPEG'), u); } catch (_) {} setExportOpen(false); }}>Download JPEG</button>
                <div style={{ height: 1, background: '#e5e7eb' }} />
                <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { const data = groupMode === 'farm' ? byFarmData : byRiskData; exportChartDataCSV(data, 'ponds_at_risk.csv'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'stacked chart data'), u); } catch (_) {} setExportOpen(false); }}>Export CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {noDataInRange && (
        <div style={{ textAlign: 'center', color: '#cbd5e1', padding: '8px 0' }}>No risks reported for this period</div>
      )}

      {groupMode === 'farm' ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart layout="vertical" data={byFarmData} onClick={({ activeTooltipIndex }) => { if (activeTooltipIndex != null) handleBarClick(null, activeTooltipIndex); }} margin={{ top: 12, right: 24, left: 12, bottom: 12 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} domain={[0, Math.max(1, Math.ceil((maxFarmStackTotal || 0) * 1.1))]} />
            <YAxis type="category" dataKey="name" width={100} />
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
            <Bar
              dataKey="High"
              name={t('pondsAtRiskChart.high')}
              stackId="a"
              fill={isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS.High : RISK_COLORS.High}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'High' ? 1 : 0.15) : 1}
              onMouseEnter={() => setHoverSeriesKey('High')}
              onMouseLeave={() => setHoverSeriesKey(null)}
            />
            <Bar
              dataKey="Medium"
              name={t('pondsAtRiskChart.medium')}
              stackId="a"
              fill={isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS.Medium : RISK_COLORS.Medium}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'Medium' ? 1 : 0.15) : 1}
              onMouseEnter={() => setHoverSeriesKey('Medium')}
              onMouseLeave={() => setHoverSeriesKey(null)}
            />
            <Bar
              dataKey="Low"
              name={t('pondsAtRiskChart.low')}
              stackId="a"
              fill={isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS.Low : RISK_COLORS.Low}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'Low' ? 1 : 0.15) : 1}
              onMouseEnter={() => setHoverSeriesKey('Low')}
              onMouseLeave={() => setHoverSeriesKey(null)}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart layout="vertical" data={byRiskData} onClick={({ activeTooltipIndex }) => { if (activeTooltipIndex != null) handleBarClick(null, activeTooltipIndex); }} margin={{ top: 12, right: 24, left: 12, bottom: 12 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" allowDecimals={false} domain={[0, Math.max(1, Math.ceil((maxRiskStackTotal || 0) * 1.1))]} />
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
                fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === f.name ? 1 : 0.15) : 1}
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


