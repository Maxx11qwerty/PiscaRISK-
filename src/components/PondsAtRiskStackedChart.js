import React, { useMemo, useState, useEffect } from 'react';
import { downloadChartAsImage, exportChartDataCSV } from '../utils/exportStackedbarChart';
import { logActivity, logMessages } from '../utils/logger';
import { GiHamburgerMenu } from 'react-icons/gi';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import { useTranslation } from 'react-i18next';
import { useFarms } from '../contexts/FarmsContext';

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
  const { farmsById, farmsNameByKey } = useFarms();
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
  // Legacy name → new name mapping (final UI guard)
  const legacyNameMap = useMemo(() => ({
    'salmon-hatchery-facility': 'Aquino Fish Farm',
    'tilapia-production-center': "Vergara's Aqua Farm",
    'blue-ocean-aquafarm': 'Maningas Fish Farm',
    'marine-species-cultivation': 'Labay Fish Farm',
  }), []);

  const canonFromItem = (item) => {
    const origName = item?.name || '';
    const key = item?.key || normalizeFarmName(origName);
    const legacyNew = legacyNameMap[key];
    const liveFromKey = farmsNameByKey[key];
    let name = liveFromKey || legacyNew || origName;
    const newKey = normalizeFarmName(name);
    return { key: newKey, name };
  };


  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const data = (await fetchRiskReportData()) || [];
        // Additional filtering to exclude Rojo Hatchery and Freshwater Finfish Farm
        const filteredData = data.filter(f => 
          f.farm_key !== 'rojo-hatchery' && 
          f.name !== 'Rojo Hatchery' &&
          f.key !== 'rojo-hatchery' &&
          f.farm_key !== 'freshwater-finfish-farm' &&
          f.name !== 'Freshwater Finfish Farm' &&
          f.key !== 'freshwater-finfish-farm' &&
          !f.name?.toLowerCase().includes('freshwater finfish')
        );
        setFarms(filteredData);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmName = isAssignedToFarm ? (farmsById[currentUser.farm]?.name || null) : null;
  const assignedFarmKey = isAssignedToFarm
    ? (assignedFarmName ? normalizeFarmName(assignedFarmName) : normalizeFarmName(currentUser.farm))
    : null;

  const farmOptions = useMemo(() => {
    const opts = [{ key: 'all', name: t('pondsAtRiskChart.allFarms') }];
    farms.forEach(f0 => {
      const f = canonFromItem(f0);
      opts.push({ key: f.key, name: f.name });
    });
    return opts;
  }, [farms, t, farmsNameByKey, legacyNameMap]);

  const filteredFarms = useMemo(() => {
    // Canonicalize all farms first
    const canon = farms.map(f0 => ({ ...f0, ...canonFromItem(f0) }));
    if (isAssignedToFarm) {
      return canon.filter(f => f.key === assignedFarmKey);
    }
    if (selectedFarm && selectedFarm !== 'all') {
      return canon.filter(f => f.key === selectedFarm);
    }
    return canon;
  }, [farms, isAssignedToFarm, assignedFarmKey, selectedFarm, farmsNameByKey, legacyNameMap]);

  // Merge farms that now share the same canonical name (e.g., legacy + new)
  const mergedFarms = useMemo(() => {
    const map = new Map();
    filteredFarms.forEach(f => {
      const name = f.name || 'Unknown Farm';
      if (!map.has(name)) {
        map.set(name, { ...f });
      } else {
        const cur = map.get(name);
        // Merge predictions arrays if present
        const preds = [
          ...(Array.isArray(cur.predictions) ? cur.predictions : []),
          ...(Array.isArray(f.predictions) ? f.predictions : [])
        ];
        map.set(name, { ...cur, predictions: preds });
      }
    });
    return Array.from(map.values());
  }, [filteredFarms]);

  // Date range for aggregation
  const { rangeStart, rangeEnd } = useMemo(() => {
    const now = new Date();
    let start, end;
    if (timeFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeFilter === 'week') {
      // This Week: Monday (00:00) to Sunday (23:59:59.999) of the current week
      const day = now.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
      const diffToMonday = day === 0 ? -6 : (1 - day); // shift so Monday is start
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6, 23, 59, 59, 999);
      start = weekStart;
      end = weekEnd;
    } else if (timeFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    return { rangeStart: start, rangeEnd: end };
  }, [timeFilter, customStart, customEnd]);

  useEffect(() => {
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

  // Helpers mirrored from RiskReportModal for consistency
  const formatPondName = (pondName) => {
    const raw = (pondName || '').toString().trim();
    if (!raw) return 'Fish Pond';
    const lower = raw.toLowerCase();
    if (lower.includes('unknown')) return 'Unknown Pond';
    const num = raw.match(/\d+/);
    if (num) return `Fish Pond ${num[0]}`;
    if (/(fish)\s*(pond)/i.test(raw)) {
      return raw.replace(/fish/ig, 'Fish').replace(/pond/ig, 'Pond');
    }
    return `Fish Pond ${raw}`;
  };

  const cleanReasonText = (reasonText) => {
    if (!reasonText || typeof reasonText !== 'string') return reasonText;
    let cleaned = reasonText.replace(/\s*Recommended actions:.*$/i, '').trim();
    cleaned = cleaned.replace(/\s*Recommended:.*$/i, '').trim();
    cleaned = cleaned.replace(/\s*Caution:.*$/i, '').trim();
    cleaned = cleaned.replace(/\s*Regular monitoring advised.*$/i, '').trim();
    cleaned = cleaned.replace(/\s*[^.]*monitoring[^.]*recommended[^.]*\./i, '').trim();
    cleaned = cleaned.replace(/\s*[^.]*recommended[^.]*\./i, '').trim();
    return cleaned;
  };

  const buildPondReason = (p) => {
    if (!p) return '';
    // Prefer structured fields to build a concise phrase
    const toTitle = (s) => {
      if (!s) return '';
      return String(s)
        .toLowerCase()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };

    const fish = p.fish_condition ? `${toTitle(p.fish_condition)} fish` : '';
    const water = p.water_condition ? `${toTitle(p.water_condition)} water` : '';
    const parts = [];
    if (fish) parts.push(fish);
    if (water) parts.push(water);
    if (parts.length) return parts.join(', ');

    // Fallback: derive from summary by stripping alert prefixes and extra sentences
    if (typeof p.conditions_summary === 'string' && p.conditions_summary.trim().length > 0) {
      let text = p.conditions_summary.trim();
      // Remove common alert prefixes
      text = text.replace(/^\s*(CRITICAL ALERT:|ALERT:|WARNING:|NOTICE:)\s*/i, '');
      // Try to extract "<X> fish condition" and "<Y> water" phrases
      const fishMatch = text.match(/([A-Za-z][A-Za-z\s]+)\s+fish\s+condition/i);
      const waterMatch = text.match(/([A-Za-z][A-Za-z\s]+)\s+water/i);
      const extracted = [];
      if (fishMatch && fishMatch[1]) extracted.push(`${toTitle(fishMatch[1].trim())} fish`);
      if (waterMatch && waterMatch[1]) extracted.push(`${toTitle(waterMatch[1].trim())} water`);
      if (extracted.length) return extracted.join(', ');
      // As last resort, keep only the clause after "shows" up to first period and clean
      const showsIdx = text.toLowerCase().indexOf('shows ');
      if (showsIdx >= 0) {
        let clause = text.slice(showsIdx + 'shows '.length);
        const firstDot = clause.indexOf('.');
        if (firstDot > 0) clause = clause.slice(0, firstDot);
        clause = cleanReasonText(clause).trim();
        return clause;
      }
      return 'No additional details available';
    }

    return 'No additional details available';
  };

  const getConfidenceInterpretation = (confidence, riskLevel) => {
    const c = typeof confidence === 'number' ? confidence : NaN;
    if (!isFinite(c)) return null;
    const normalized = normalizeRisk(riskLevel);
    if (c >= 90) {
      return { emoji: '✅', label: 'Very Sure', color: '#16a34a', title: `The system is very sure that the risk is ${normalized} Risk.` };
    }
    if (c >= 70) {
      return { emoji: '🟡', label: 'Likely Accurate', color: '#f59e0b', title: `The system is fairly sure that the risk is ${normalized} Risk.` };
    }
    return { emoji: '⚠️', label: 'Uncertain', color: '#dc2626', title: `The system is uncertain — please recheck the pond’s actual condition.` };
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

  const getLatestDateMsForFarm = (predictions) => {
    if (!Array.isArray(predictions) || predictions.length === 0) return null;
    const inRange = predictions
      .map(p => getTimestampMs(p.timestamp))
      .filter(ms => ms > 0)
      .filter(ms => {
        if (!rangeStart || !rangeEnd) return true;
        const d = new Date(ms);
        return d >= rangeStart && d <= rangeEnd;
      });
    if (inRange.length === 0) return null;
    const latestMs = Math.max(...inRange);
    return latestMs;
  };

  // Open Risk Reports modal focused to a specific farm using current range date
  const openFarmReports = (farmName) => {
    if (!onDrilldown) return;
    const farm = mergedFarms.find(f => f.name === farmName);
    if (!farm) return;
    const clickDateMs = getLatestDateMsForFarm(farm.predictions);
    onDrilldown({
      type: 'farm',
      farmKey: farm.key,
      clickDateMs,
      timeFilter: timeFilter,
      customStart: customStart,
      customEnd: customEnd,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd
    });
  };

  const byFarmData = useMemo(() => {
    // Match RiskReportModal daily logic: pick the latest generated date within the selected range, then dedupe latest per pond on that date
    const farmsSorted = [...mergedFarms]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const getLatestBatchPerPondForRange = (predictions) => {
      if (!Array.isArray(predictions) || predictions.length === 0) return [];
      // Keep only predictions within the selected range using the same field as the modal (timestamp)
      const inRange = predictions.filter(p => withinRange(p.timestamp) && getTimestampMs(p.timestamp) > 0);
      if (inRange.length === 0) return [];
      // Find the latest timestamp in range and take that DATE
      const latestMs = Math.max(...inRange.map(p => getTimestampMs(p.timestamp)));
      const latestDateKey = new Date(latestMs).toDateString();
      const sameDay = inRange.filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === latestDateKey);
      // From that day, keep the latest per pond; first-encountered after sort wins (modal behavior)
      const pondMap = new Map();
      const sev = (lvl) => {
        const s = (lvl || '').toString().toLowerCase();
        if (s.includes('high')) return 3; if (s.includes('medium')) return 2; if (s.includes('low')) return 1; return 0;
      };
      sameDay
        .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
        .forEach(pred => {
          const pond = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
          const existing = pondMap.get(pond);
          if (!existing) { pondMap.set(pond, pred); return; }
          const a = getTimestampMs(existing.timestamp);
          const b = getTimestampMs(pred.timestamp);
          const delta = Math.abs(b - a);
          // If exact tie, or within 60s tolerance, prefer lower severity
          if ((b === a || delta <= 60000) && sev(pred.risk_level) < sev(existing.risk_level)) {
            pondMap.set(pond, pred);
          }
        });
      return Array.from(pondMap.values());
    };

    const result = farmsSorted.map(f => {
      let high = 0, medium = 0, low = 0;
      const preds = Array.isArray(f.predictions) ? f.predictions : [];
      const latestPerPond = getLatestBatchPerPondForRange(preds);
      // Force a stability tie-break identical to modal: if multiple entries share
      // the exact same timestamp for a pond, prefer the lower severity.
      const normalize = (lvl) => {
        if (!lvl || typeof lvl !== 'string') return 'Normal';
        const s = lvl.toLowerCase();
        if (s.includes('high') || s.includes('critical')) return 'High';
        if (s.includes('medium')) return 'Medium';
        if (s.includes('low')) return 'Low';
        if (s.includes('normal')) return 'Normal';
        return lvl.charAt(0).toUpperCase() + lvl.slice(1);
      };
      const sev = (lvl) => ({ Normal:0, Low:1, Medium:2, High:3 })[normalize(lvl)] ?? 0;
      const ts = (p) => getTimestampMs(p.timestamp);
      const stableMap = new Map();
      latestPerPond.sort((a,b) => ts(b) - ts(a)).forEach(p => {
        const pond = (p.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
        const cur = stableMap.get(pond);
        if (!cur) { stableMap.set(pond, p); return; }
        if (ts(p) === ts(cur) && sev(p.risk_level) < sev(cur.risk_level)) {
          stableMap.set(pond, p);
        }
      });
      const perPond = Array.from(stableMap.values());
      perPond.forEach(p => {
        const lvl = normalizeRisk(p.risk_level);
        if (lvl === 'High') high += 1;
        else if (lvl === 'Medium') medium += 1;
        else if (lvl === 'Low') low += 1;
      });
      return {
        name: f.name,
        High: high,
        Medium: medium,
        Low: low,
        farmKey: f.key,
        __total: high + medium + low,
      };
    });

    return result;
  }, [filteredFarms, rangeStart, rangeEnd]);

  const byRiskData = useMemo(() => {
    // X-axis = High/Medium/Low, stacked by farm
    const farmsSorted = [...mergedFarms]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const getLatestBatchPerPondForRange = (predictions) => {
      if (!Array.isArray(predictions) || predictions.length === 0) return [];
      const inRange = predictions.filter(p => withinRange(p.timestamp) && getTimestampMs(p.timestamp) > 0);
      if (inRange.length === 0) return [];
      const latestMs = Math.max(...inRange.map(p => getTimestampMs(p.timestamp)));
      const latestDateKey = new Date(latestMs).toDateString();
      const sameDay = inRange.filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === latestDateKey);
      const pondMap = new Map();
      sameDay
        .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
        .forEach(pred => {
          const pond = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
          if (!pondMap.has(pond)) pondMap.set(pond, pred);
        });
      return Array.from(pondMap.values());
    };

    const riskBuckets = { High: {}, Medium: {}, Low: {} };
    farmsSorted.forEach(f => {
      let high = 0, medium = 0, low = 0;
      const preds = Array.isArray(f.predictions) ? f.predictions : [];
      const latestPerPond = getLatestBatchPerPondForRange(preds);
      const normalize = (lvl) => {
        if (!lvl || typeof lvl !== 'string') return 'Normal';
        const s = lvl.toLowerCase();
        if (s.includes('high') || s.includes('critical')) return 'High';
        if (s.includes('medium')) return 'Medium';
        if (s.includes('low')) return 'Low';
        if (s.includes('normal')) return 'Normal';
        return lvl.charAt(0).toUpperCase() + lvl.slice(1);
      };
      const sev = (lvl) => ({ Normal:0, Low:1, Medium:2, High:3 })[normalize(lvl)] ?? 0;
      const ts = (p) => getTimestampMs(p.timestamp);
      const stableMap = new Map();
      latestPerPond.sort((a,b) => ts(b) - ts(a)).forEach(p => {
        const pond = (p.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
        const cur = stableMap.get(pond);
        if (!cur) { stableMap.set(pond, p); return; }
        if (ts(p) === ts(cur) && sev(p.risk_level) < sev(cur.risk_level)) {
          stableMap.set(pond, p);
        }
      });
      const perPond = Array.from(stableMap.values());
      perPond.forEach(p => {
        const lvl = normalizeRisk(p.risk_level);
        if (lvl === 'High') high += 1;
        else if (lvl === 'Medium') medium += 1;
        else if (lvl === 'Low') low += 1;
      });
      riskBuckets.High[f.name] = high;
      riskBuckets.Medium[f.name] = medium;
      riskBuckets.Low[f.name] = low;
    });

    return Object.keys(riskBuckets).map(level => ({
      risk: level,
      ...riskBuckets[level]
    }));
  }, [filteredFarms, rangeStart, rangeEnd]);

  // Build pond-level details per farm and risk level for rich tooltips
  const pondDetailsByFarm = useMemo(() => {
    const details = new Map(); // farmName -> { High:[], Medium:[], Low:[] }

    const getLatestBatchPerPondForRange = (predictions) => {
      if (!Array.isArray(predictions) || predictions.length === 0) return [];
      const inRange = predictions.filter(p => withinRange(p.timestamp) && getTimestampMs(p.timestamp) > 0);
      if (inRange.length === 0) return [];
      const latestMs = Math.max(...inRange.map(p => getTimestampMs(p.timestamp)));
      const latestDateKey = new Date(latestMs).toDateString();
      const sameDay = inRange.filter(p => new Date(getTimestampMs(p.timestamp)).toDateString() === latestDateKey);
      const pondMap = new Map();
      const sev = (lvl) => {
        const s = (lvl || '').toString().toLowerCase();
        if (s.includes('high')) return 3; if (s.includes('medium')) return 2; if (s.includes('low')) return 1; return 0;
      };
      sameDay
        .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
        .forEach(pred => {
          const pond = (pred.fish_pond || 'Unknown Pond').toString().trim().toLowerCase();
          const existing = pondMap.get(pond);
          if (!existing) { pondMap.set(pond, pred); return; }
          const a = getTimestampMs(existing.timestamp);
          const b = getTimestampMs(pred.timestamp);
          const delta = Math.abs(b - a);
          if ((b === a || delta <= 60000) && sev(pred.risk_level) < sev(existing.risk_level)) {
            pondMap.set(pond, pred);
          }
        });
      return Array.from(pondMap.values());
    };

    mergedFarms.forEach(f => {
      const latestPerPond = getLatestBatchPerPondForRange(Array.isArray(f.predictions) ? f.predictions : []);
      const bucket = { High: [], Medium: [], Low: [] };
      latestPerPond.forEach(p => {
        const level = normalizeRisk(p.risk_level);
        if (!['High','Medium','Low'].includes(level)) return;
        const pondName = formatPondName(p.fish_pond);
        const reason = buildPondReason(p);
        const confidencePct = typeof p.confidence === 'number' && !Number.isNaN(p.confidence)
          ? Math.round(p.confidence * 10) / 10
          : null;
        bucket[level].push({
          pond: pondName,
          reason,
          confidence: confidencePct,
          riskLevel: level,
        });
      });
      details.set(f.name, bucket);
    });

    return details; // Map for O(1) lookup
  }, [mergedFarms, rangeStart, rangeEnd]);

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

  // Human label for selected period
  const periodLabel = useMemo(() => {
    if (timeFilter === 'today') return 'today';
    if (timeFilter === 'week') return 'this week';
    if (timeFilter === 'month') return 'this month';
    if (timeFilter === 'custom') return 'in the selected period';
    return 'recently';
  }, [timeFilter]);

  // Insight summary based on currently displayed aggregation (byFarmData reflects the latest date within range)
  const insightSummary = useMemo(() => {
    if (!Array.isArray(byFarmData) || byFarmData.length === 0) return '';
    const totals = byFarmData.reduce((acc, f) => {
      acc.High += Number(f.High || 0);
      acc.Medium += Number(f.Medium || 0);
      acc.Low += Number(f.Low || 0);
      return acc;
    }, { High: 0, Medium: 0, Low: 0 });

    const maxVal = Math.max(totals.High, totals.Medium, totals.Low);
    let dominant = 'low';
    if (maxVal === totals.High) dominant = 'high';
    else if (maxVal === totals.Medium) dominant = 'medium';
    else dominant = 'low';

    const farmsWithHigh = byFarmData.filter(f => Number(f.High || 0) > 0).map(f => f.name);
    let highPart = '';
    if (farmsWithHigh.length === 1) highPart = `${farmsWithHigh[0]} still has high-risk ponds that need monitoring.`;
    else if (farmsWithHigh.length === 2) highPart = `${farmsWithHigh[0]} and ${farmsWithHigh[1]} still have high-risk ponds that need monitoring.`;
    else if (farmsWithHigh.length > 2) {
      const others = farmsWithHigh.length - 2;
      const othersText = others > 0 ? `, and ${others} other${others > 1 ? 's' : ''}` : '';
      highPart = `${farmsWithHigh[0]}, ${farmsWithHigh[1]}${othersText} still have high-risk ponds that need monitoring.`;
    }

    let base = '';
    if (totals.High + totals.Medium + totals.Low === 0) {
      base = `No ponds ${periodLabel}.`;
    } else {
      if (dominant === 'low') base = `Most ponds ${periodLabel} are in low risk`;
      else if (dominant === 'medium') base = `Most ponds ${periodLabel} are in medium risk`;
      else base = `Most ponds ${periodLabel} are in high risk`;
    }

    if (highPart) return `${base}, but ${highPart}`;
    return `${base}.`;
  }, [byFarmData, periodLabel]);

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
    
    // Resolve pond-level details based on grouping
    let detailHeading = null;
    let pondEntries = [];
    if (groupMode === 'farm') {
      // label is farm name; series item name is the risk level
      const seriesKey = (filtered[0] && filtered[0].name) || null; // High/Medium/Low
      const farmName = label;
      const bucket = pondDetailsByFarm.get(farmName);
      if (bucket && seriesKey && bucket[seriesKey]) {
        pondEntries = bucket[seriesKey];
        detailHeading = `${farmName} - ${seriesKey} Risk`;
      }
    } else {
      // label is risk level; series item name is farm name
      const farmName = (filtered[0] && filtered[0].name) || null;
      const riskLevel = label;
      const bucket = pondDetailsByFarm.get(farmName);
      if (bucket && riskLevel && bucket[riskLevel]) {
        pondEntries = bucket[riskLevel];
        detailHeading = `${farmName} - ${riskLevel} Risk`;
      }
    }

    // Confidence descriptor text consistent with modal
    const confidenceText = (pct, lvl) => {
      if (typeof pct !== 'number' || Number.isNaN(pct)) return null;
      const interp = getConfidenceInterpretation(pct, lvl);
      if (!interp) return `${pct.toFixed(1)}%`;
      return `${pct.toFixed(1)}% ${interp.label} about ${lvl} Risk`;
    };

    if (total === 0) {
      return (
        <div className="custom-tooltip">
          <div>No risk reported</div>
        </div>
      );
    }

    return (
      <div className="custom-tooltip">
        <div className="tooltip-label" style={{ marginBottom: 6 }}>{detailHeading || label}</div>
        {
          <>
            {filtered.map((item, idx) => {
              const tooltipColor = getTooltipColor(item);
              return (
                <div key={`sum-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, background: tooltipColor, display: 'inline-block', borderRadius: 2 }} />
                  <span>{item.name}: {item.value}</span>
                </div>
              );
            })}
            {pondEntries.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {(() => {
                  const maxShow = 3;
                  const shown = pondEntries.slice(0, maxShow);
                  const remaining = Math.max(0, pondEntries.length - shown.length);
                  return (
                    <>
                      {shown.map((p, i) => (
                        <div key={`pond-${i}`} style={{ marginTop: 4 }}>
                          <div style={{ fontWeight: 600 }}>{p.pond} - {p.riskLevel} Risk</div>
                          {p.reason && (
                            <div>Reason: {p.reason}</div>
                          )}
                          {typeof p.confidence === 'number' && (
                            <div>Confidence: {confidenceText(p.confidence, p.riskLevel)}</div>
                          )}
                        </div>
                      ))}
                      {remaining > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const farmName = groupMode === 'farm' ? label : (filtered[0]?.name || null);
                              if (farmName) openFarmReports(farmName);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#60a5fa',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            View all in Risk Reports ({remaining} more)
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </>
        }
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
      const farm = mergedFarms.find(f => f.key === item.farmKey || f.name === item.name);
      const clickDateMs = farm ? getLatestDateMsForFarm(farm.predictions) : null;
      onDrilldown({ 
        type: 'farm', 
        farmKey: item.farmKey,
        clickDateMs,
        timeFilter: timeFilter,
        customStart: customStart,
        customEnd: customEnd,
        rangeStart: rangeStart,
        rangeEnd: rangeEnd
      });
    } else {
      const item = byRiskData[index];
      let clickDateMs = null;
      if (data && data.clickedFarmName) {
        const farm = mergedFarms.find(f => f.name === data.clickedFarmName);
        if (farm) clickDateMs = getLatestDateMsForFarm(farm.predictions);
      }
      onDrilldown({ 
        type: 'risk', 
        risk: item.risk, 
        farms: filteredFarms.map(f => f.key),
        // Prefer explicit clicked farm name if provided by segment click; fallback to hovered key
        clickedFarmName: (data && data.clickedFarmName) || hoverSeriesKey || null,
        clickDateMs,
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
          ? `${assignedFarmName || filteredFarms[0]?.name || currentUser.farm} Pond Risk`
          : t('pondsAtRiskChart.title')
        }
      </h3>
      <div style={{ marginTop: -6, marginBottom: 8, fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>
        Shows the distribution of pond risk levels per farm based on recent monitoring reports.
      </div>
      <div className="chart-controls">
        {!isAssignedToFarm && (
          <>
            <select
              value={selectedFarm}
              onChange={(e) => setSelectedFarm(e.target.value)}
              className="time-filter"
              style={{ fontSize: '12px', padding: '4px 8px', height: '28px' }}
            >
              {farmOptions.map((opt, idx) => (
                <option key={`${opt.key}-${idx}`} value={opt.key}>{opt.name}</option>
              ))}
            </select>
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="time-filter"
              style={{ marginLeft: 8, fontSize: '12px', padding: '4px 8px', height: '28px' }}
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            <div className="toggle-group" role="tablist" aria-label="Group by">
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === 'farm'}
                className={`toggle-segment ${groupMode === 'farm' ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '4px 8px' }}
                onClick={() => setGroupMode('farm')}
              >
                {t('pondsAtRiskChart.viewByFarm')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={groupMode === 'risk'}
                className={`toggle-segment ${groupMode === 'risk' ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '4px 8px' }}
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
              style={{ fontSize: '12px', padding: '4px 8px', height: '28px' }}
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </>
        )}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
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
              aria-label="Export"
              title={(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? "Export unavailable for temporary accounts" : "Export"}
            >
              <GiHamburgerMenu style={{ fontSize: '20px' }} />
            </button>
            {exportOpen && !(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
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

      {!noDataInRange && insightSummary && (
        <div style={{ marginTop: 6, marginBottom: 6, fontSize: '0.9rem', color: 'rgba(255,255,255,0.9)' }}>
          {insightSummary}
        </div>
      )}

      {/* Insight line moved to below the chart as requested */}

      {groupMode === 'farm' ? (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            layout="vertical"
            data={byFarmData}
            barCategoryGap="10%"
            barSize={18}
            onClick={({ activeTooltipIndex }) => { if (activeTooltipIndex != null) handleBarClick(null, activeTooltipIndex); }}
            onMouseLeave={() => setHoverSeriesKey(null)}
            margin={{ top: 12, right: 24, left: 12, bottom: 32 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              domain={[0, Math.max(1, Math.ceil((maxFarmStackTotal || 0) * 1.1))]}
              label={{ value: 'Number of Ponds', position: 'insideBottom', offset: -10, style: { fill: '#FFFFFF', fontSize: 13, fontWeight: 500 } }}
            />
            <YAxis type="category" dataKey="name" width={100} />
            <Tooltip content={<CustomTooltip />} cursor={false} wrapperStyle={{ pointerEvents: 'none' }} />
            <Legend content={renderLegend} verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: 30 }} />
            <Bar
              dataKey="High"
              name={t('pondsAtRiskChart.high')}
              stackId="a"
              fill={isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS.High : RISK_COLORS.High}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'High' ? 1 : 0.5) : 1}
              onMouseEnter={() => setHoverSeriesKey('High')}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Medium"
              name={t('pondsAtRiskChart.medium')}
              stackId="a"
              fill={isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS.Medium : RISK_COLORS.Medium}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'Medium' ? 1 : 0.5) : 1}
              onMouseEnter={() => setHoverSeriesKey('Medium')}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Low"
              name={t('pondsAtRiskChart.low')}
              stackId="a"
              fill={isAssignedToFarm ? ASSIGNED_FARM_RISK_COLORS.Low : RISK_COLORS.Low}
              fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === 'Low' ? 1 : 0.5) : 1}
              onMouseEnter={() => setHoverSeriesKey('Low')}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            layout="vertical"
            data={byRiskData}
            barCategoryGap="10%"
            barSize={18}
            onClick={({ activeTooltipIndex }) => { if (activeTooltipIndex != null) handleBarClick(null, activeTooltipIndex); }}
            onMouseLeave={() => setHoverSeriesKey(null)}
            margin={{ top: 12, right: 24, left: 12, bottom: 32 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              domain={[0, Math.max(1, Math.ceil((maxRiskStackTotal || 0) * 1.1))]}
              label={{ value: 'Number of Ponds', position: 'insideBottom', offset: -10, style: { fill: '#FFFFFF', fontSize: 13, fontWeight: 500 } }}
            />
            <YAxis type="category" dataKey="risk" width={110} />
            <Tooltip content={<CustomTooltip />} cursor={false} wrapperStyle={{ pointerEvents: 'none' }} />
            <Legend content={renderLegend} verticalAlign="top" align="center" wrapperStyle={{ paddingTop: 4 }} />
            {mergedFarms.map((f, idx) => {
              return (
              <Bar
                key={`${f.key}-${idx}`}
                dataKey={f.name}
                name={f.name}
                stackId="a"
                fill={farmColorMap.get(f.name) || '#7ffcff'}
                fillOpacity={(hoverSeriesKey || activeLegendKey) ? ((hoverSeriesKey || activeLegendKey) === f.name ? 1 : 0.15) : 1}
                onMouseEnter={() => setHoverSeriesKey(f.name)}
                onMouseLeave={() => setHoverSeriesKey(null)}
                isAnimationActive={false}
                onClick={(_, dataIndex) => handleBarClick({ clickedFarmName: f.name }, dataIndex)}
              />
            ); })}
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


