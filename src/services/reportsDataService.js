import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';

const idToCanonical = {
  NyhjBvh9N9wfsOJ2qeEa: 'Aquino Fish Farm',
  TP3p0y4iQlo2j0loELQb: "Vergara's Aqua Farm",
  egGEARKL6Qk5jNgrY3Yu: 'Maningas Fish Farm',
  s5zKKXTBkF3voYnV8wuh: 'Labay Fish Farm',
};

const legacyNameToCanonical = {
  'salmon-hatchery-facility': 'Aquino Fish Farm',
  'tilapia-production-center': "Vergara's Aqua Farm",
  'blue-ocean-aquafarm': 'Maningas Fish Farm',
  'marine-species-cultivation': 'Labay Fish Farm',
};

const normalizeNameKey = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

export const toCanonicalDisplay = (rawName, farmId) => {
  if (farmId && idToCanonical[farmId]) return idToCanonical[farmId];
  const key = normalizeNameKey(rawName);
  return legacyNameToCanonical[key] || rawName || '';
};

const normalizeReportDate = (data) => {
  if (data.timestamp?.toDate) return data.timestamp.toDate();
  if (typeof data.timestamp === 'number') return new Date(data.timestamp);
  if (typeof data.timestamp === 'string') {
    const tryDate = new Date(data.timestamp);
    return Number.isNaN(tryDate.getTime()) ? new Date() : tryDate;
  }
  if (data.timestamp?.seconds) return new Date(data.timestamp.seconds * 1000);
  return new Date();
};

const mapReportDoc = (data, farmHint, farmIdHint) => {
  const canonicalName = toCanonicalDisplay(
    data.farm || data.farm_name || farmHint,
    farmIdHint
  );
  return {
    id: data.id,
    date: normalizeReportDate(data),
    farm: canonicalName,
    pond: data.fish_pond,
    fish: data.fish_condition,
    water: data.water_condition,
    weather: data.weather,
    harvest: data.ready_for_harvest ? 'Ready' : 'Not Ready',
    notes: data.additional_notes,
    uid: data.uid,
    submittedBy: data.submitted_by,
    userRole: data.user_role,
    contact: data.user_contact,
    email: data.user_email,
    status: data.status,
    reviewedBy: data.reviewed_by || data.reviewedBy,
    reviewedByRole: data.reviewed_by_role || data.reviewedByRole,
    reviewedAt: data.reviewed_at || data.reviewedAt,
    source: data.source || 'web',
    originalTimestamp: data.timestamp,
    __collection: 'reports',
    __hadFarmField: Object.prototype.hasOwnProperty.call(data, 'farm'),
  };
};

const buildDedupeKey = (report) => {
  const farmName = report.farm || '';
  const pondName = report.pond || '';
  let ms = 0;
  const ts = report.originalTimestamp || report.date;
  try {
    if (ts && typeof ts.toDate === 'function') ms = ts.toDate().getTime();
    else if (ts && typeof ts.seconds === 'number') {
      ms = ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0);
    } else if (ts instanceof Date) ms = ts.getTime();
    else if (typeof ts === 'number') ms = ts;
    else if (typeof ts === 'string') ms = Date.parse(ts) || 0;
  } catch (_) {
    ms = 0;
  }
  return `${farmName}::${pondName}::${ms}`;
};

const dedupeReports = (reportsList) => {
  const seen = new Set();
  const out = [];
  for (const r of reportsList) {
    const k = buildDedupeKey(r);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
};

export const fetchReportsBundle = async (farmsList = []) => {
  const snap = await getDocs(query(collection(db, 'reports'), orderBy('timestamp', 'desc')));
  const rawReports = snap.docs
    .map((d) => {
      const data = d.data();
      const farmField = data.farm || data.farm_name || '';
      const matchedFarm = (farmsList || []).find((f) => {
        const n = (f.name || '').toLowerCase();
        return n && String(farmField).toLowerCase() === n;
      });
      return mapReportDoc({ ...data, id: d.id }, farmField, matchedFarm?.id);
    })
    .filter((r) => {
      const lower = String(r.farm || '').toLowerCase();
      return (
        r.farm !== 'Rojo Hatchery' &&
        r.farm !== 'Freshwater Finfish Farm' &&
        !lower.includes('freshwater finfish')
      );
    });

  const reportsByFarm = {};
  rawReports.forEach((report) => {
    const farmKey = normalizeNameKey(report.farm);
    const farmMeta = (farmsList || []).find((f) => normalizeNameKey(f.name) === farmKey);
    const farmId = farmMeta?.id || farmKey;
    if (!reportsByFarm[farmId]) {
      reportsByFarm[farmId] = {
        farm: {
          id: farmId,
          name: toCanonicalDisplay(report.farm, farmMeta?.id),
        },
        reports: [],
      };
    }
    reportsByFarm[farmId].reports.push({ ...report, __farmId: farmId });
  });

  Object.values(reportsByFarm).forEach((entry) => {
    entry.reports = dedupeReports(entry.reports);
  });

  const reports = dedupeReports(
    Object.values(reportsByFarm).flatMap((entry) =>
      entry.reports.map((r) => ({ ...r, __farmId: entry.farm.id }))
    )
  );

  return { reports, reportsByFarm };
};
