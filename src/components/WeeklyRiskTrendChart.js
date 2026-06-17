import React, { useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { FaSyncAlt } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useRiskData } from '../contexts/RiskDataContext';
import { useFarms } from '../contexts/FarmsContext';
import { useRefreshFeedback } from '../hooks/useRefreshFeedback';
import RefreshStatusMessage from './RefreshStatusMessage';
import { normalizeRisk, RISK_RANK } from '../utils/riskUtils';
import './WeeklyRiskTrendChart.css';

const RISK_COLORS = {
  High: '#FF4444',
  Medium: '#FF8800',
  Low: '#00AA00',
};

const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DOT_COLLISION_RADIUS = 16;
const EMPTY_PONDS_BY_RISK = { High: [], Medium: [], Low: [] };

const formatPondName = (pondName) => {
  const raw = (pondName || '').toString().trim();
  if (!raw) return 'Pond';
  const lower = raw.toLowerCase();
  if (lower.includes('unknown')) return 'Unknown Pond';
  const num = raw.match(/\d+/);
  if (num) return `Pond ${num[0]}`;
  if (/(fish)\s*(pond)/i.test(raw)) {
    return 'Pond';
  }
  return `Pond ${raw}`;
};

const sortPondNames = (names) =>
  [...names].sort((a, b) => {
    const aNum = parseInt(a.match(/\d+/)?.[0] || '9999', 10);
    const bNum = parseInt(b.match(/\d+/)?.[0] || '9999', 10);
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b);
  });

const getPondNumber = (label) => {
  const match = String(label || '').match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
};

const getPondIdentityKey = (fishPond) => {
  const raw = (fishPond || 'unknown pond').toString().trim().toLowerCase();
  const num = raw.match(/\d+/);
  if (num) return `pond-${num[0]}`;
  return raw.replace(/\s+/g, ' ');
};

const dedupePondLabelsByNumber = (labels) => {
  const seen = new Set();
  return sortPondNames(labels.filter((label) => {
    const num = getPondNumber(label);
    const key = num != null ? String(num) : label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
};

const splitPondLabelsIntoRows = (names) => {
  const oddRow = [];
  const evenRow = [];
  const unnumbered = [];

  sortPondNames(names).forEach((label) => {
    const num = getPondNumber(label);
    if (num == null) {
      unnumbered.push(label);
      return;
    }
    if (num % 2 === 1) oddRow.push(label);
    else evenRow.push(label);
  });

  if (unnumbered.length) {
    oddRow.push(...unnumbered);
  }

  return { oddRow, evenRow };
};

const getRiskLevelFromDataKey = (dataKey) => {
  const key = String(dataKey || '').toLowerCase();
  if (key.includes('high')) return 'High';
  if (key.includes('medium')) return 'Medium';
  return 'Low';
};

const getLatestPondDetailsForDay = (predictions, dayStart, dayEnd) => {
  const pondMap = new Map();
  if (!Array.isArray(predictions)) return pondMap;

  predictions
    .filter((p) => {
      const ms = getTimestampMs(p.timestamp);
      return ms >= dayStart.getTime() && ms <= dayEnd.getTime();
    })
    .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp))
    .forEach((pred) => {
      const pond = getPondIdentityKey(pred.fish_pond);
      if (!pondMap.has(pond)) {
        pondMap.set(pond, {
          risk: normalizeRisk(pred.risk_level),
          displayName: formatPondName(pred.fish_pond),
        });
      }
    });

  return pondMap;
};

const getPondsByRiskForDay = (filteredFarms, dayStart, dayEnd) => {
  const byRisk = { High: [], Medium: [], Low: [] };
  const seen = new Set();

  filteredFarms.forEach((farm) => {
    const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
    getLatestPondDetailsForDay(preds, dayStart, dayEnd).forEach((info, pondKey) => {
      const uniqueKey = `${farm.key}::${pondKey}`;
      if (seen.has(uniqueKey)) return;
      seen.add(uniqueKey);
      if (info.risk === 'High') byRisk.High.push(info.displayName);
      else if (info.risk === 'Medium') byRisk.Medium.push(info.displayName);
      else byRisk.Low.push(info.displayName);
    });
  });

  byRisk.High = dedupePondLabelsByNumber(byRisk.High);
  byRisk.Medium = dedupePondLabelsByNumber(byRisk.Medium);
  byRisk.Low = dedupePondLabelsByNumber(byRisk.Low);
  return byRisk;
};

const getPondLabelsForDot = (row, dataKey, todayIndex) => {
  if (!row) return [];
  const isForecast = String(dataKey).includes('Forecast');
  if (isForecast && row.dayIndex > todayIndex) return [];

  const riskLevel = getRiskLevelFromDataKey(dataKey);
  const source = row.pondsByRisk;
  const labels = Array.isArray(source?.[riskLevel]) ? source[riskLevel] : [];
  return dedupePondLabelsByNumber(labels);
};

const toModalPondName = (label) => {
  const num = getPondNumber(label);
  if (num != null) return `Fish Pond ${num}`;
  const raw = String(label || '').trim();
  if (!raw) return 'Fish Pond';
  if (raw.toLowerCase().includes('unknown')) return 'Unknown Pond';
  if (/(fish)\s*(pond)/i.test(raw)) {
    return raw.replace(/fish/ig, 'Fish').replace(/pond/ig, 'Pond');
  }
  return `Fish Pond ${raw}`;
};

const buildActualDotClickPayload = (dotInfo, farms, todayIndex, isAllFarmsView) => {
  if (!dotInfo?.row || String(dotInfo.dataKey || '').includes('Forecast')) return null;
  if (typeof dotInfo.value !== 'number') return null;

  if (isAllFarmsView) {
    return { openOverviewOnly: true };
  }

  if (!Array.isArray(farms) || farms.length !== 1) return null;

  const farm = farms[0];
  const riskLevel = getRiskLevelFromDataKey(dotInfo.dataKey);
  const { weekStart } = getWeekContext();
  const { start, end } = getDayBounds(weekStart, dotInfo.row.dayIndex);
  const pondLabels = getPondLabelsForDot(dotInfo.row, dotInfo.dataKey, todayIndex);
  const clickedPonds = pondLabels.map(toModalPondName);

  return {
    openOverviewOnly: false,
    riskLevel,
    clickedPonds,
    clickedFarmName: farm.name,
    clickedFarmKey: farm.key,
    rangeStart: start,
    rangeEnd: end,
    clickDateMs: end.getTime(),
  };
};

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const getTimestampMs = (ts) => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate().getTime(); } catch (_) { /* noop */ }
  }
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return ts.seconds * 1000;
  }
  return 0;
};

const getWeekContext = () => {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + diffToMonday,
    0,
    0,
    0,
    0
  );
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 6,
    23,
    59,
    59,
    999
  );
  const todayIndex = day === 0 ? 6 : day - 1;
  return { weekStart, weekEnd, todayIndex, now };
};

const getDayBounds = (weekStart, dayIndex) => {
  const start = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + dayIndex,
    0,
    0,
    0,
    0
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
    23,
    59,
    59,
    999
  );
  return { start, end };
};

const buildDayLabels = (weekStart, dayIndex) => {
  const { start } = getDayBounds(weekStart, dayIndex);
  const dayName = WEEK_DAYS[dayIndex];
  const dateShort = start.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
  });

  return {
    day: `${dayName} ${dateShort}`,
    dayTooltipTitle: start.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  };
};

const getLatestPondMapForDay = (predictions, dayStart, dayEnd) => {
  const pondMap = new Map();
  getLatestPondDetailsForDay(predictions, dayStart, dayEnd).forEach((info, pond) => {
    pondMap.set(pond, info.risk);
  });
  return pondMap;
};

const countPondsForDay = (predictions, dayStart, dayEnd) => {
  const pondMap = getLatestPondMapForDay(predictions, dayStart, dayEnd);
  let high = 0;
  let medium = 0;
  let low = 0;
  pondMap.forEach((lvl) => {
    if (lvl === 'High') high += 1;
    else if (lvl === 'Medium') medium += 1;
    else low += 1;
  });

  return { High: high, Medium: medium, Low: low, pondCount: pondMap.size };
};

const buildWeeklyPondHistory = (filteredFarms, weekStart, todayIndex) => {
  const pondHistory = new Map();

  for (let dayIndex = 0; dayIndex <= todayIndex; dayIndex += 1) {
    const { start, end } = getDayBounds(weekStart, dayIndex);

    filteredFarms.forEach((farm) => {
      const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
      const dayMap = getLatestPondMapForDay(preds, start, end);

      dayMap.forEach((risk, pond) => {
        const pondKey = `${farm.key}::${pond}`;
        const prev = pondHistory.get(pondKey);
        const firstRisk = prev?.firstRisk ?? risk;
        const firstDayIndex = prev?.firstDayIndex ?? dayIndex;
        const changes = Array.isArray(prev?.changes) ? [...prev.changes] : [];

        if (prev?.latestRisk && prev.latestRisk !== risk) {
          changes.push({ dayIndex, from: prev.latestRisk, to: risk });
        }

        pondHistory.set(pondKey, {
          firstRisk,
          firstDayIndex,
          latestRisk: risk,
          latestDayIndex: dayIndex,
          changes,
        });
      });
    });
  }

  return pondHistory;
};

const summarizeReportTrend = (pondHistory, todayIndex) => {
  let improved = 0;
  let worsened = 0;
  let improvedRecent = 0;
  let improvedHighToLower = 0;
  let improvedMediumToLow = 0;

  pondHistory.forEach((entry) => {
    const firstRank = RISK_RANK[entry.firstRisk] ?? 0;
    const latestRank = RISK_RANK[entry.latestRisk] ?? 0;

    if (latestRank < firstRank && firstRank >= RISK_RANK.Medium) {
      improved += 1;
      if (entry.latestDayIndex >= todayIndex - 1) improvedRecent += 1;
      if (entry.firstRisk === 'High' && entry.latestRisk !== 'High') improvedHighToLower += 1;
      if (entry.firstRisk === 'Medium' && entry.latestRisk === 'Low') improvedMediumToLow += 1;
    } else if (latestRank > firstRank && latestRank >= RISK_RANK.Medium) {
      worsened += 1;
    }
  });

  const reportTrendBoost = Math.min(
    0.24,
    improvedRecent * 0.07 + improved * 0.025
  );

  return {
    improved,
    worsened,
    improvedRecent,
    improvedHighToLower,
    improvedMediumToLow,
    reportTrendBoost,
    hasRecentImprovement: improvedRecent > 0,
  };
};

const countDayRiskChanges = (filteredFarms, weekStart, dayIndex) => {
  if (dayIndex <= 0) return { improved: 0, worsened: 0 };

  const prevBounds = getDayBounds(weekStart, dayIndex - 1);
  const currBounds = getDayBounds(weekStart, dayIndex);
  const prevMap = new Map();
  const currMap = new Map();

  filteredFarms.forEach((farm) => {
    const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
    getLatestPondMapForDay(preds, prevBounds.start, prevBounds.end).forEach((risk, pond) => {
      prevMap.set(`${farm.key}::${pond}`, risk);
    });
    getLatestPondMapForDay(preds, currBounds.start, currBounds.end).forEach((risk, pond) => {
      currMap.set(`${farm.key}::${pond}`, risk);
    });
  });

  let improved = 0;
  let worsened = 0;
  currMap.forEach((toRisk, pondKey) => {
    const fromRisk = prevMap.get(pondKey);
    if (!fromRisk || fromRisk === toRisk) return;
    const fromRank = RISK_RANK[fromRisk] ?? 0;
    const toRank = RISK_RANK[toRisk] ?? 0;
    if (toRank < fromRank && fromRank >= RISK_RANK.Medium) improved += 1;
    else if (toRank > fromRank && toRank >= RISK_RANK.Medium) worsened += 1;
  });

  return { improved, worsened };
};

const buildForecastDriverKeys = (checklistImpact, reportTrend) => {
  const keys = [];
  const hasChecklist = checklistImpact.total > 0;

  if (hasChecklist && checklistImpact.isFullyComplete) {
    keys.push('driverChecklistComplete');
  } else if (hasChecklist && checklistImpact.source === 'saved') {
    keys.push('driverChecklistPartial');
  } else if (hasChecklist && checklistImpact.source === 'completion') {
    keys.push('driverChecklistComplete');
  }

  if (reportTrend.hasRecentImprovement) {
    keys.push('driverReportImproved');
  } else if (reportTrend.improved > 0) {
    keys.push('driverReportTrend');
  }

  if (keys.length === 0) {
    keys.push('driverNoAction');
  }

  if (checklistImpact.pendingHigh > 0) {
    keys.push('driverPendingTasks');
  }

  return keys;
};

const projectForecastCounts = (
  baseCounts,
  dayOffset,
  checklistImpact,
  reportTrendImpact,
  forecastHorizon
) => {
  if (dayOffset <= 0) {
    return { ...baseCounts };
  }

  const {
    completionRate,
    pendingHigh,
    riskReductionPct = 0,
    preventionEffectiveness = 0,
    escalationProbability = 0.5,
    isFullyComplete = false,
    source = 'none',
  } = checklistImpact;

  const reportTrendBoost = reportTrendImpact?.reportTrendBoost || 0;
  const horizon = Math.max(1, forecastHorizon);
  const progress = Math.min(1, dayOffset / horizon);

  let targetReduction = riskReductionPct;
  if (targetReduction <= 0) {
    targetReduction = completionRate * (isFullyComplete ? 0.75 : 0.35);
  }
  if (preventionEffectiveness > 0) {
    targetReduction = Math.max(targetReduction, preventionEffectiveness * 0.75);
  }

  if (reportTrendBoost > 0) {
    targetReduction = Math.max(targetReduction, reportTrendBoost);
  }

  if (source === 'none' && reportTrendBoost > 0) {
    targetReduction = Math.max(targetReduction, reportTrendBoost * 0.85);
  }

  const cumulativeReduction = targetReduction * progress;
  const escalation =
    pendingHigh > 0 ? escalationProbability * 0.08 * dayOffset : 0;
  const reportSustain = reportTrendImpact?.hasRecentImprovement
    ? reportTrendBoost * 0.35 * progress
    : 0;

  const highFactor = Math.max(0, cumulativeReduction * 0.9 + reportSustain * 0.5 - escalation);
  const mediumFactor = Math.max(
    0,
    cumulativeReduction * 0.65 + reportSustain * 0.35 - escalation * 0.5
  );

  const highDrop = Math.round(baseCounts.High * highFactor);
  const mediumDrop = Math.round(baseCounts.Medium * mediumFactor);
  const lowGain = Math.round((highDrop + mediumDrop) * 0.4);

  return {
    High: Math.max(0, baseCounts.High - highDrop),
    Medium: Math.max(0, baseCounts.Medium - mediumDrop),
    Low: Math.max(0, baseCounts.Low + lowGain),
  };
};

const isActionableChecklistItem = (item) => {
  if (!item || typeof item !== 'object') return false;
  if (item.informational === true) return false;
  if (String(item.priority || '').toLowerCase() === 'info') return false;
  const category = String(item.category || '').toLowerCase();
  if (category === 'farm_context' || category === 'data_context') return false;
  return Boolean(item.task_id || item.task);
};

const normalizeCompletionRate = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value > 1 ? value / 100 : value;
};

const analyzeChecklistItems = (items) => {
  const actionable = (Array.isArray(items) ? items : []).filter(isActionableChecklistItem);
  if (actionable.length === 0) {
    return { completionRate: 0, pendingHigh: 0, total: 0 };
  }
  const completed = actionable.filter((i) => i.completed === true).length;
  const pendingHigh = actionable.filter(
    (i) => i.completed !== true && String(i.priority || '').toLowerCase() === 'high'
  ).length;
  return {
    completionRate: completed / actionable.length,
    pendingHigh,
    total: actionable.length,
  };
};

const buildImpactFromSavedItems = (items) => {
  const stats = analyzeChecklistItems(items);
  return {
    source: 'saved',
    completionRate: stats.completionRate,
    pendingHigh: stats.pendingHigh,
    total: stats.total,
    riskReductionPct: 0,
    preventionEffectiveness: 0,
    escalationProbability: 0.5,
    isFullyComplete: stats.total > 0 && stats.completionRate >= 0.99,
  };
};

const buildImpactFromCompletion = (data) => {
  const metrics = data.completion_metrics || {};
  const analytics = data.predictive_analytics || {};
  const benefits = analytics.completed_tasks_benefits || {};
  const riskReduction = benefits.risk_reduction || {};
  const riskTimeline = analytics.risk_timeline || {};

  const completionRate = normalizeCompletionRate(metrics.completion_rate);
  const totalHighPriority = metrics.total_high_priority_tasks || 0;
  const completedHighPriority = metrics.completed_high_priority_tasks || 0;
  const totalTasks = metrics.total_tasks || 0;
  const completedTasks = metrics.completed_tasks || 0;

  return {
    source: 'completion',
    completionRate,
    pendingHigh: Math.max(0, totalHighPriority - completedHighPriority),
    total: totalTasks,
    riskReductionPct: normalizeCompletionRate(riskReduction.risk_reduction_percentage),
    preventionEffectiveness: normalizeCompletionRate(riskReduction.prevention_effectiveness),
    escalationProbability:
      typeof riskTimeline.escalation_probability === 'number'
        ? riskTimeline.escalation_probability
        : 0.5,
    isFullyComplete:
      completionRate >= 0.99 ||
      (totalTasks > 0 && completedTasks >= totalTasks),
    overallAssessment: analytics.overall_assessment || '',
  };
};

const resolveFarmImpact = (savedEntry, completionEntry) => {
  if (completionEntry && savedEntry) {
    if (completionEntry.isFullyComplete || completionEntry.ts >= savedEntry.ts) {
      return completionEntry;
    }
    return buildImpactFromSavedItems(savedEntry.items);
  }
  if (completionEntry) return completionEntry;
  if (savedEntry) return buildImpactFromSavedItems(savedEntry.items);
  return null;
};

const findCollidedDots = (target, allDots) => {
  if (!target || !Array.isArray(allDots)) return [];
  return allDots
    .filter((dot) => {
      if (dot.dayIndex !== target.dayIndex) return false;
      return Math.hypot(dot.cx - target.cx, dot.cy - target.cy) <= DOT_COLLISION_RADIUS;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

const WeeklyRiskTrendChart = ({ onLoadingChange, onActualDotClick }) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { farmsById } = useFarms();
  const { farms: riskFarms, loading: riskDataLoading, lastFetchedAt, refreshRiskData } = useRiskData();
  const { status: refreshStatus, runRefresh, isRefreshing } = useRefreshFeedback();

  const [selectedFarm, setSelectedFarm] = useState('all');
  const [checklistsByFarm, setChecklistsByFarm] = useState({});
  const [checklistsLoading, setChecklistsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeDotGroup, setActiveDotGroup] = useState([]);
  const dotsFrameRef = useRef([]);
  const plotRef = useRef(null);
  const tooltipRef = useRef(null);
  const dismissTooltipTimerRef = useRef(null);
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1024
  );

  const legacyNameMap = useMemo(
    () => ({
      'salmon-hatchery-facility': 'Aquino Fish Farm',
      'tilapia-production-center': "Vergara's Aqua Farm",
      'blue-ocean-aquafarm': 'Maningas Fish Farm',
      'marine-species-cultivation': 'Labay Fish Farm',
    }),
    []
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth || 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isStdPhone = viewportWidth >= 360 && viewportWidth <= 480;
  const loading = riskDataLoading || checklistsLoading;

  useEffect(() => {
    if (onLoadingChange) onLoadingChange(loading);
  }, [loading, onLoadingChange]);

  useEffect(() => {
    if (lastFetchedAt) setLastUpdated(new Date(lastFetchedAt));
  }, [lastFetchedAt]);

  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarmName = isAssignedToFarm
    ? farmsById[currentUser.farm]?.name || currentUser.farm
    : null;
  const assignedFarmKey = isAssignedToFarm
    ? normalizeFarmName(assignedFarmName || currentUser.farm)
    : null;

  const canonFarm = useCallback(
    (item) => {
      const origName = item?.name || '';
      const key = item?.key || normalizeFarmName(origName);
      const legacyNew = legacyNameMap[key];
      const name = legacyNew || origName;
      return { key: normalizeFarmName(name), name };
    },
    [legacyNameMap]
  );

  const farmOptions = useMemo(() => {
    const opts = [{ key: 'all', name: t('weeklyRiskTrendChart.allFarms') }];
    (Array.isArray(riskFarms) ? riskFarms : []).forEach((f0) => {
      const f = canonFarm(f0);
      if (!opts.some((o) => o.key === f.key)) {
        opts.push({ key: f.key, name: f.name });
      }
    });
    return opts;
  }, [riskFarms, canonFarm, t]);

  const filteredFarms = useMemo(() => {
    const canon = (Array.isArray(riskFarms) ? riskFarms : []).map((f0) => ({
      ...f0,
      ...canonFarm(f0),
    }));

    if (isAssignedToFarm) {
      return canon.filter((f) => f.key === assignedFarmKey);
    }
    if (selectedFarm && selectedFarm !== 'all') {
      return canon.filter((f) => f.key === selectedFarm);
    }
    return canon;
  }, [riskFarms, isAssignedToFarm, assignedFarmKey, selectedFarm, canonFarm]);

  const fetchChecklistSources = useCallback(async () => {
    setChecklistsLoading(true);
    try {
      const [savedSnap, completionsSnap] = await Promise.all([
        getDocs(collection(db, 'saved_checklists')),
        getDocs(collection(db, 'checklist_completions')),
      ]);

      const savedByFarm = {};
      savedSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const farmName = data.farm || data.farm_name || '';
        if (!farmName) return;
        const farmKey = normalizeFarmName(farmName);
        const ts = getTimestampMs(data.timestamp);
        const prev = savedByFarm[farmKey];
        if (!prev || ts > prev.ts) {
          savedByFarm[farmKey] = { ts, items: data.items || [], farmName };
        }
      });

      const completionsByFarm = {};
      completionsSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const farmName =
          data.farm_details?.farm_name ||
          data.location_info?.farm ||
          data.farm_name ||
          '';
        if (!farmName) return;
        const farmKey = normalizeFarmName(farmName);
        const ts = getTimestampMs(data.timestamp);
        const impact = buildImpactFromCompletion(data);
        const prev = completionsByFarm[farmKey];
        if (!prev || ts > prev.ts) {
          completionsByFarm[farmKey] = { ts, ...impact };
        }
      });

      const mergedByFarm = {};
      const allFarmKeys = new Set([
        ...Object.keys(savedByFarm),
        ...Object.keys(completionsByFarm),
      ]);

      allFarmKeys.forEach((farmKey) => {
        const resolved = resolveFarmImpact(savedByFarm[farmKey], completionsByFarm[farmKey]);
        if (resolved) mergedByFarm[farmKey] = resolved;
      });

      setChecklistsByFarm(mergedByFarm);
    } catch (_) {
      setChecklistsByFarm({});
    } finally {
      setChecklistsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChecklistSources();
  }, [fetchChecklistSources]);

  const checklistImpact = useMemo(() => {
    const farmsToUse = filteredFarms;
    const emptyImpact = {
      completionRate: 0,
      pendingHigh: 0,
      total: 0,
      riskReductionPct: 0,
      preventionEffectiveness: 0,
      escalationProbability: 0.5,
      isFullyComplete: false,
      source: 'none',
    };

    if (farmsToUse.length === 0) return emptyImpact;

    let totalWeight = 0;
    let weightedCompletion = 0;
    let weightedRiskReduction = 0;
    let weightedPrevention = 0;
    let totalPendingHigh = 0;
    let totalTasks = 0;
    let hasCompletionSource = false;
    let hasSavedSource = false;
    let allFullyComplete = true;

    farmsToUse.forEach((farm) => {
      const impact = checklistsByFarm[farm.key];
      if (!impact) {
        allFullyComplete = false;
        return;
      }

      totalWeight += 1;
      weightedCompletion += impact.completionRate || 0;
      weightedRiskReduction += impact.riskReductionPct || 0;
      weightedPrevention += impact.preventionEffectiveness || 0;
      totalPendingHigh += impact.pendingHigh || 0;
      totalTasks += impact.total || 0;

      if (impact.source === 'completion') hasCompletionSource = true;
      if (impact.source === 'saved') hasSavedSource = true;
      if (!impact.isFullyComplete) allFullyComplete = false;
    });

    if (totalWeight === 0) return emptyImpact;

    return {
      completionRate: weightedCompletion / totalWeight,
      pendingHigh: totalPendingHigh,
      total: totalTasks,
      riskReductionPct: weightedRiskReduction / totalWeight,
      preventionEffectiveness: weightedPrevention / totalWeight,
      escalationProbability: 0.5,
      isFullyComplete: allFullyComplete && totalPendingHigh === 0,
      source: hasCompletionSource ? 'completion' : hasSavedSource ? 'saved' : 'none',
    };
  }, [filteredFarms, checklistsByFarm]);

  const reportTrend = useMemo(() => {
    const { weekStart, todayIndex } = getWeekContext();
    const pondHistory = buildWeeklyPondHistory(filteredFarms, weekStart, todayIndex);
    return summarizeReportTrend(pondHistory, todayIndex);
  }, [filteredFarms]);

  const chartData = useMemo(() => {
    const { weekStart, todayIndex } = getWeekContext();
    const forecastHorizon = Math.max(1, 7 - todayIndex);
    const dailyActual = [];
    let lastKnown = { High: 0, Medium: 0, Low: 0 };
    let lastKnownPonds = { ...EMPTY_PONDS_BY_RISK };

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const { start, end } = getDayBounds(weekStart, dayIndex);
      let dayHigh = 0;
      let dayMedium = 0;
      let dayLow = 0;
      let hasReportData = false;
      let pondsByRisk = getPondsByRiskForDay(filteredFarms, start, end);
      const hasPondDetails =
        pondsByRisk.High.length + pondsByRisk.Medium.length + pondsByRisk.Low.length > 0;

      filteredFarms.forEach((farm) => {
        const preds = Array.isArray(farm.predictions) ? farm.predictions : [];
        const counts = countPondsForDay(preds, start, end);
        if (counts.pondCount > 0) {
          hasReportData = true;
        }
        dayHigh += counts.High;
        dayMedium += counts.Medium;
        dayLow += counts.Low;
      });

      const isCarriedForward = !hasReportData && dayIndex <= todayIndex;
      if (hasReportData) {
        lastKnown = { High: dayHigh, Medium: dayMedium, Low: dayLow };
      } else if (dayIndex <= todayIndex) {
        dayHigh = lastKnown.High;
        dayMedium = lastKnown.Medium;
        dayLow = lastKnown.Low;
      }

      if (hasPondDetails) {
        lastKnownPonds = pondsByRisk;
      } else if (dayIndex <= todayIndex) {
        pondsByRisk = lastKnownPonds;
      } else {
        pondsByRisk = { ...EMPTY_PONDS_BY_RISK };
      }

      const dayChanges = hasReportData
        ? countDayRiskChanges(filteredFarms, weekStart, dayIndex)
        : { improved: 0, worsened: 0 };

      dailyActual.push({
        dayIndex,
        ...buildDayLabels(weekStart, dayIndex),
        High: dayHigh,
        Medium: dayMedium,
        Low: dayLow,
        hasReportData,
        isCarriedForward,
        improvedCount: dayChanges.improved,
        worsenedCount: dayChanges.worsened,
        pondsByRisk,
      });
    }

    const todayCounts = dailyActual[todayIndex] || { High: 0, Medium: 0, Low: 0 };
    const todayPondsByRisk = dailyActual[todayIndex]?.pondsByRisk || { ...EMPTY_PONDS_BY_RISK };
    const forecastDriverKeys = buildForecastDriverKeys(checklistImpact, reportTrend);

    return WEEK_DAYS.map((_, dayIndex) => {
      const actual = dailyActual[dayIndex] || {
        High: 0,
        Medium: 0,
        Low: 0,
        hasReportData: false,
        isCarriedForward: false,
        improvedCount: 0,
        worsenedCount: 0,
      };
      const { day, dayTooltipTitle } = buildDayLabels(weekStart, dayIndex);
      const isPastOrToday = dayIndex <= todayIndex;
      const isFuture = dayIndex >= todayIndex;
      const dayOffset = dayIndex - todayIndex;
      const forecast = projectForecastCounts(
        { High: todayCounts.High, Medium: todayCounts.Medium, Low: todayCounts.Low },
        dayOffset,
        checklistImpact,
        reportTrend,
        forecastHorizon
      );

      let tooltipKind = 'actual_report';
      if (dayIndex > todayIndex) tooltipKind = 'forecast';
      else if (dayIndex === todayIndex) {
        tooltipKind =
          reportTrend.improvedRecent > 0 || actual.improvedCount > 0
            ? 'today_improved'
            : 'today';
      } else if (actual.isCarriedForward) tooltipKind = 'actual_carried';
      else if (actual.improvedCount > 0) tooltipKind = 'actual_improved';
      else if (actual.worsenedCount > 0) tooltipKind = 'actual_worsened';

      return {
        day,
        dayTooltipTitle,
        dayIndex,
        highActual: isPastOrToday ? actual.High : null,
        mediumActual: isPastOrToday ? actual.Medium : null,
        lowActual: isPastOrToday ? actual.Low : null,
        highForecast: isFuture ? forecast.High : null,
        mediumForecast: isFuture ? forecast.Medium : null,
        lowForecast: isFuture ? forecast.Low : null,
        isToday: dayIndex === todayIndex,
        tooltipKind,
        improvedCount:
          dayIndex === todayIndex
            ? Math.max(actual.improvedCount, reportTrend.improvedRecent)
            : actual.improvedCount,
        worsenedCount: actual.worsenedCount,
        forecastDriverKeys: isFuture ? forecastDriverKeys : [],
        pondsByRisk: actual.pondsByRisk || { ...EMPTY_PONDS_BY_RISK },
        todayPondsByRisk,
      };
    });
  }, [filteredFarms, checklistImpact, reportTrend]);

  useEffect(() => {
    setActiveDotGroup([]);
  }, [selectedFarm, filteredFarms, checklistImpact, reportTrend]);

  const clearDismissTooltipTimer = useCallback(() => {
    if (dismissTooltipTimerRef.current) {
      clearTimeout(dismissTooltipTimerRef.current);
      dismissTooltipTimerRef.current = null;
    }
  }, []);

  const scheduleDismissTooltip = useCallback(() => {
    clearDismissTooltipTimer();
    dismissTooltipTimerRef.current = setTimeout(() => {
      setActiveDotGroup([]);
    }, 180);
  }, [clearDismissTooltipTimer]);

  useEffect(() => () => clearDismissTooltipTimer(), [clearDismissTooltipTimer]);

  const chartInsight = useMemo(() => {
    const hasChecklist = checklistImpact.total > 0;
    const hasReportImprovement = reportTrend.improvedRecent > 0 || reportTrend.improved > 0;

    if (hasChecklist && hasReportImprovement) {
      return {
        key: 'insightChecklistAndReport',
        values: {
          completed: Math.round(checklistImpact.completionRate * 100),
          reduction: Math.round(checklistImpact.riskReductionPct * 100),
          improved: reportTrend.improvedRecent || reportTrend.improved,
        },
      };
    }
    if (hasChecklist && checklistImpact.source === 'completion') {
      return {
        key: 'insightChecklistComplete',
        values: {
          completed: Math.round(checklistImpact.completionRate * 100),
          reduction: Math.round(checklistImpact.riskReductionPct * 100),
        },
      };
    }
    if (hasChecklist && checklistImpact.source === 'saved') {
      return {
        key: 'insightChecklistPartial',
        values: {
          completed: Math.round(checklistImpact.completionRate * 100),
          pending: checklistImpact.pendingHigh,
        },
      };
    }
    if (hasReportImprovement) {
      return {
        key: 'insightReportOnly',
        values: {
          improved: reportTrend.improvedRecent || reportTrend.improved,
        },
      };
    }
    if (reportTrend.worsened > 0) {
      return {
        key: 'insightReportWorsened',
        values: { worsened: reportTrend.worsened },
      };
    }
    return { key: 'insightDefault', values: {} };
  }, [checklistImpact, reportTrend]);

  const yAxisScale = useMemo(() => {
    const values = chartData.flatMap((row) => [
      row.highActual,
      row.mediumActual,
      row.lowActual,
      row.highForecast,
      row.mediumForecast,
      row.lowForecast,
    ].filter((v) => typeof v === 'number'));
    const maxVal = values.length ? Math.max(...values) : 0;

    let step = 2;
    let top = Math.max(10, Math.ceil(Math.max(maxVal * 1.1, 1) / step) * step);

    while (top / step > 7) {
      step += 2;
      top = Math.ceil(Math.max(maxVal * 1.1, 1) / step) * step;
      top = Math.max(top, step * 5);
    }

    const ticks = [];
    for (let value = 0; value <= top; value += step) {
      ticks.push(value);
    }

    return { yMax: top, ticks };
  }, [chartData]);

  const todayLabel = useMemo(() => {
    const todayRow = chartData.find((row) => row.isToday);
    return todayRow?.day ?? buildDayLabels(getWeekContext().weekStart, getWeekContext().todayIndex).day;
  }, [chartData]);

  const todayMarkerLabel = useMemo(
    () => t('weeklyRiskTrendChart.todayMarker'),
    [t, todayLabel]
  );

  const chartTitle = useMemo(() => {
    if (isAssignedToFarm) {
      return t('weeklyRiskTrendChart.titleAssigned', {
        farm: assignedFarmName || t('weeklyRiskTrendChart.unknownFarm'),
      });
    }
    if (selectedFarm !== 'all') {
      const farm = farmOptions.find((f) => f.key === selectedFarm);
      return t('weeklyRiskTrendChart.titleAssigned', {
        farm: farm?.name || t('weeklyRiskTrendChart.unknownFarm'),
      });
    }
    return t('weeklyRiskTrendChart.title');
  }, [isAssignedToFarm, assignedFarmName, selectedFarm, farmOptions, t]);

  const handleRefresh = () =>
    runRefresh(async () => {
      await Promise.all([refreshRiskData(), fetchChecklistSources()]);
      setLastUpdated(new Date());
    });

  const lineSeries = useMemo(
    () => [
      {
        dataKey: 'highActual',
        color: RISK_COLORS.High,
        name: t('weeklyRiskTrendChart.high'),
        dashed: false,
      },
      {
        dataKey: 'mediumActual',
        color: RISK_COLORS.Medium,
        name: t('weeklyRiskTrendChart.medium'),
        dashed: false,
      },
      {
        dataKey: 'lowActual',
        color: RISK_COLORS.Low,
        name: t('weeklyRiskTrendChart.low'),
        dashed: false,
      },
      {
        dataKey: 'highForecast',
        color: RISK_COLORS.High,
        name: `${t('weeklyRiskTrendChart.high')} (${t('weeklyRiskTrendChart.forecast')})`,
        dashed: true,
      },
      {
        dataKey: 'mediumForecast',
        color: RISK_COLORS.Medium,
        name: `${t('weeklyRiskTrendChart.medium')} (${t('weeklyRiskTrendChart.forecast')})`,
        dashed: true,
      },
      {
        dataKey: 'lowForecast',
        color: RISK_COLORS.Low,
        name: `${t('weeklyRiskTrendChart.low')} (${t('weeklyRiskTrendChart.forecast')})`,
        dashed: true,
      },
    ],
    [t]
  );

  const handleActualDotClick = useCallback(
    (dotInfo) => {
      if (!onActualDotClick) return;
      const isAllFarmsView = !isAssignedToFarm && selectedFarm === 'all';
      const payload = buildActualDotClickPayload(
        dotInfo,
        filteredFarms,
        getWeekContext().todayIndex,
        isAllFarmsView
      );
      if (payload) onActualDotClick(payload);
    },
    [onActualDotClick, filteredFarms, isAssignedToFarm, selectedFarm]
  );

  const renderInteractiveDot = useCallback(
    (series) => (props) => {
      const { cx, cy, payload, value } = props;
      if (typeof value !== 'number' || cx == null || cy == null) return null;

      const isActualSeries = !String(series.dataKey).includes('Forecast');

      const dotInfo = {
        dataKey: series.dataKey,
        name: series.name,
        value,
        color: series.color,
        row: payload,
        day: payload.day,
        dayIndex: payload.dayIndex,
        cx,
        cy,
      };
      dotsFrameRef.current.push(dotInfo);

      const isActive = activeDotGroup.some(
        (dot) => dot.dataKey === series.dataKey && dot.dayIndex === payload.dayIndex
      );

      return (
        <g
          pointerEvents="all"
          onMouseEnter={() => {
            clearDismissTooltipTimer();
            const collided = findCollidedDots(dotInfo, dotsFrameRef.current);
            setActiveDotGroup(collided.length > 0 ? collided : [dotInfo]);
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (!isActualSeries) return;
            handleActualDotClick(dotInfo);
          }}
          style={{ cursor: isActualSeries ? 'pointer' : 'default' }}
        >
          <circle cx={cx} cy={cy} r={12} fill="transparent" stroke="none" />
          <circle
            cx={cx}
            cy={cy}
            r={isActive ? 6 : 4}
            fill={series.color}
            stroke="#ffffff"
            strokeWidth={isActive ? 2.5 : 1.5}
          />
        </g>
      );
    },
    [activeDotGroup, clearDismissTooltipTimer, handleActualDotClick]
  );

  const tooltipCoordinate = useMemo(() => {
    if (!activeDotGroup.length) return undefined;
    const x = activeDotGroup.reduce((sum, dot) => sum + dot.cx, 0) / activeDotGroup.length;
    const y = activeDotGroup.reduce((sum, dot) => sum + dot.cy, 0) / activeDotGroup.length;
    return { x, y };
  }, [activeDotGroup]);

  const updateTooltipPosition = useCallback(() => {
    if (!activeDotGroup.length || !plotRef.current) {
      setTooltipPosition(null);
      return;
    }

    const svg = plotRef.current.querySelector('svg.recharts-surface');
    if (!svg) return;

    const plotRect = plotRef.current.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const svgWidth = Number(svg.getAttribute('width')) || svgRect.width;
    const svgHeight = Number(svg.getAttribute('height')) || svgRect.height;
    if (!svgWidth || !svgHeight) return;

    const avgCx = tooltipCoordinate?.x ?? 0;
    const avgCy = tooltipCoordinate?.y ?? 0;

    let left = (avgCx / svgWidth) * svgRect.width + (svgRect.left - plotRect.left);
    let top = (avgCy / svgHeight) * svgRect.height + (svgRect.top - plotRect.top);

    const tooltipEl = tooltipRef.current;
    const tooltipHeight = tooltipEl?.offsetHeight || 260;
    const tooltipWidth = tooltipEl?.offsetWidth || 320;
    const plotWidth = plotRef.current.clientWidth;
    const plotHeight = plotRef.current.clientHeight;
    const edgePadding = 10;

    left = Math.min(
      Math.max(left, tooltipWidth / 2 + edgePadding),
      plotWidth - tooltipWidth / 2 - edgePadding
    );

    const gap = 12;
    const maxTooltipHeight = 280;
    const effectiveHeight = Math.min(tooltipHeight, maxTooltipHeight);
    const spaceBelow = plotHeight - top;
    const spaceAbove = top;
    const fitsAbove = spaceAbove >= effectiveHeight + gap;
    const fitsBelow = spaceBelow >= effectiveHeight + gap;

    let placement = 'below';
    if (fitsAbove && !fitsBelow) {
      placement = 'above';
    } else if (!fitsAbove && fitsBelow) {
      placement = 'below';
    } else if (fitsAbove && fitsBelow) {
      placement = spaceBelow >= spaceAbove ? 'below' : 'above';
    } else {
      placement = spaceBelow >= spaceAbove ? 'below' : 'above';
    }

    const availableHeight = Math.max(
      140,
      (placement === 'above' ? spaceAbove : spaceBelow) - gap
    );
    const maxHeight = Math.min(maxTooltipHeight, availableHeight);

    setTooltipPosition({ left, top, placement, maxHeight, visible: true });
  }, [activeDotGroup, tooltipCoordinate]);

  useLayoutEffect(() => {
    if (!activeDotGroup.length) {
      setTooltipPosition(null);
      return;
    }

    setTooltipPosition((prev) => ({
      left: prev?.left ?? 0,
      top: prev?.top ?? 0,
      placement: prev?.placement ?? 'above',
      visible: false,
    }));
    updateTooltipPosition();
  }, [activeDotGroup, updateTooltipPosition, isStdPhone, chartData]);

  useEffect(() => {
    if (!activeDotGroup.length) return undefined;
    const handleResize = () => updateTooltipPosition();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeDotGroup, updateTooltipPosition]);

  const renderDotTooltip = useCallback(() => {
    if (!activeDotGroup.length) return null;

    const row = activeDotGroup[0].row;
    const dayTitle = row?.dayTooltipTitle || activeDotGroup[0].day;
    const todayIndex = getWeekContext().todayIndex;
    const contextKey = `weeklyRiskTrendChart.tooltip.${row.tooltipKind}`;
    const contextText = t(contextKey, {
      improved: row.improvedCount || 0,
      worsened: row.worsenedCount || 0,
    });
    const hasForecastEntry = activeDotGroup.some((dot) =>
      String(dot.dataKey).includes('Forecast')
    );
    const forecastDriverKeys = hasForecastEntry ? row.forecastDriverKeys || [] : [];

    return (
      <div className="weekly-trend-tooltip">
        <div className="weekly-trend-tooltip-title">{dayTitle}</div>
        {activeDotGroup.length > 1 && (
          <div className="weekly-trend-tooltip-collided">
            {t('weeklyRiskTrendChart.tooltip.collidedDots', {
              count: activeDotGroup.length,
            })}
          </div>
        )}
        {activeDotGroup.map((dot) => {
          const isForecastSeries = String(dot.dataKey).includes('Forecast');
          const isFutureForecast = isForecastSeries && row.dayIndex > todayIndex;
          const tooltipTitleKey = isForecastSeries
            ? 'weeklyRiskTrendChart.aiForecast'
            : 'weeklyRiskTrendChart.actualData';
          const pondLabels = getPondLabelsForDot(dot.row, dot.dataKey, todayIndex);
          const { oddRow, evenRow } = splitPondLabelsIntoRows(pondLabels);

          return (
            <div key={dot.dataKey} className="weekly-trend-tooltip-entry">
              <div className="weekly-trend-tooltip-series" style={{ color: dot.color }}>
                {dot.name}
              </div>
              <div className="weekly-trend-tooltip-sub">{t(tooltipTitleKey)}</div>
              <div className="weekly-trend-tooltip-value" style={{ color: dot.color }}>
                {t('weeklyRiskTrendChart.tooltip.pondCount')}: {dot.value}
              </div>
              {isFutureForecast ? (
                <div className="weekly-trend-tooltip-ponds forecast-only">
                  {t('weeklyRiskTrendChart.tooltip.forecastCountOnly')}
                </div>
              ) : pondLabels.length > 0 ? (
                <div className="weekly-trend-tooltip-ponds">
                  <span className="weekly-trend-tooltip-ponds-label">
                    {t('weeklyRiskTrendChart.tooltip.fishPonds')}:
                  </span>
                  <div className="weekly-trend-tooltip-ponds-list">
                    {oddRow.length > 0 && (
                      <div className="weekly-trend-tooltip-ponds-row">
                        {oddRow.map((label, index) => (
                          <span
                            key={`${dot.dataKey}-odd-${label}-${index}`}
                            className="weekly-trend-tooltip-pond-chip"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    {evenRow.length > 0 && (
                      <div className="weekly-trend-tooltip-ponds-row">
                        {evenRow.map((label, index) => (
                          <span
                            key={`${dot.dataKey}-even-${label}-${index}`}
                            className="weekly-trend-tooltip-pond-chip"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="weekly-trend-tooltip-ponds empty">
                  {t('weeklyRiskTrendChart.tooltip.noPondsListed')}
                </div>
              )}
            </div>
          );
        })}
        <div className="weekly-trend-tooltip-context">{contextText}</div>
        {hasForecastEntry && forecastDriverKeys.length > 0 && (
          <div className="weekly-trend-tooltip-drivers">
            <div className="weekly-trend-tooltip-drivers-title">
              {t('weeklyRiskTrendChart.tooltip.forecastBasedOn')}
            </div>
            {forecastDriverKeys.map((driverKey) => (
              <div key={driverKey} className="weekly-trend-tooltip-driver">
                • {t(`weeklyRiskTrendChart.tooltip.${driverKey}`, {
                  completed: Math.round(checklistImpact.completionRate * 100),
                  pending: checklistImpact.pendingHigh,
                  improved: reportTrend.improvedRecent || reportTrend.improved,
                  reduction: Math.round(checklistImpact.riskReductionPct * 100),
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [activeDotGroup, t, checklistImpact, reportTrend]);

  if (loading) {
    return (
      <div className="loading-reports">
        <div className="loading-spinner" />
        <p>{t('weeklyRiskTrendChart.loading')}</p>
      </div>
    );
  }

  dotsFrameRef.current = [];

  return (
    <div className="weekly-trend-chart-container" id="weekly-risk-trend-chart">
      <h3 className="chart-title">{chartTitle}</h3>
      <p className="chart-subtitle">{t('weeklyRiskTrendChart.subtitle')}</p>

      {!isAssignedToFarm && (
        <div className="weekly-trend-controls">
          <select
            className="weekly-trend-farm-select"
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            aria-label={t('weeklyRiskTrendChart.selectFarm')}
          >
            {farmOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="weekly-trend-legend-row">
        <div className="weekly-trend-legend-group">
          <span className="legend-dot high" /> {t('weeklyRiskTrendChart.high')}
          <span className="legend-dot medium" /> {t('weeklyRiskTrendChart.medium')}
          <span className="legend-dot low" /> {t('weeklyRiskTrendChart.low')}
        </div>
        <div className="weekly-trend-legend-group">
          <span className="legend-line solid" /> {t('weeklyRiskTrendChart.actualData')}
          <span className="legend-line dashed" /> {t('weeklyRiskTrendChart.aiForecast')}
        </div>
      </div>

      <div
        className="weekly-trend-chart-plot"
        ref={plotRef}
        onMouseLeave={scheduleDismissTooltip}
      >
      <ResponsiveContainer width="100%" height={isStdPhone ? 300 : 340}>
        <LineChart data={chartData} margin={{ top: 26, right: 16, left: 0, bottom: 28 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            interval={0}
            angle={-10}
            textAnchor="end"
            height={isStdPhone ? 54 : 50}
            tick={{ fill: '#ffffff', fontSize: isStdPhone ? 10 : 11, fontWeight: 600 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.35)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.35)' }}
            label={{
              value: t('weeklyRiskTrendChart.axisWeek'),
              position: 'bottom',
              offset: 6,
              style: { fill: '#ffffff', fontSize: 12, fontWeight: 500 },
            }}
          />
          <YAxis
            domain={[0, yAxisScale.yMax]}
            ticks={yAxisScale.ticks}
            allowDecimals={false}
            tick={{ fill: '#ffffff', fontSize: isStdPhone ? 11 : 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.35)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.35)' }}
            label={{
              value: t('weeklyRiskTrendChart.axisPondCount'),
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#ffffff', fontSize: 12, fontWeight: 500, textAnchor: 'middle' },
            }}
          />
          <Legend wrapperStyle={{ display: 'none' }} />

          <ReferenceLine
            x={todayLabel}
            stroke="rgba(255,255,255,0.85)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{
              value: todayMarkerLabel,
              position: 'top',
              offset: 10,
              fill: '#ffffff',
              fontSize: 10,
              fontWeight: 700,
            }}
          />

          {lineSeries.map((series) => {
            const isActualSeries = !String(series.dataKey).includes('Forecast');
            return (
            <Line
              key={series.dataKey}
              type="monotone"
              dataKey={series.dataKey}
              name={series.name}
              stroke={series.color}
              strokeWidth={2.5}
              strokeDasharray={series.dashed ? '6 4' : undefined}
              dot={renderInteractiveDot(series)}
              activeDot={false}
              connectNulls={false}
              isAnimationActive={false}
              style={{ pointerEvents: isActualSeries ? 'auto' : 'none' }}
            />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
      {activeDotGroup.length > 0 && (
        <div
          ref={tooltipRef}
          className={`weekly-trend-tooltip-floating weekly-trend-tooltip-floating--${
            tooltipPosition?.placement || 'above'
          }`}
          style={{
            left: tooltipPosition?.left ?? 0,
            top: tooltipPosition?.top ?? 0,
            maxHeight: tooltipPosition?.maxHeight
              ? `${tooltipPosition.maxHeight}px`
              : undefined,
            visibility: tooltipPosition?.visible ? 'visible' : 'hidden',
          }}
          onMouseEnter={clearDismissTooltipTimer}
          onMouseLeave={scheduleDismissTooltip}
        >
          {renderDotTooltip()}
        </div>
      )}
      </div>

      {chartInsight.key && (
        <p className="weekly-trend-checklist-note">
          {t(`weeklyRiskTrendChart.${chartInsight.key}`, chartInsight.values)}
        </p>
      )}

      <div className="weekly-trend-footer">
        <button
          type="button"
          className="weekly-trend-refresh-btn"
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          aria-label={t('weeklyRiskTrendChart.refresh')}
        >
          <FaSyncAlt className={isRefreshing ? 'chart-refresh-spin' : ''} />
        </button>
        <span className="weekly-trend-as-of">
          {t('weeklyRiskTrendChart.asOf')}{' '}
          {lastUpdated.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      <RefreshStatusMessage status={refreshStatus} />
    </div>
  );
};

export default WeeklyRiskTrendChart;
