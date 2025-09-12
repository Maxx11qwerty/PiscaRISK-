import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const buildRows = (reports) => {
  return reports.map(r => ([
    r.farm || '',
    r.pond || '',
    r.fish || '',
    r.water || '',
    r.weather || '',
    r.harvest || '',
    (r.date && (r.date.toLocaleString ? r.date.toLocaleString() : new Date(r.date).toLocaleString())) || ''
  ]));
};

export const exportFishConditionCSV = (reports, filename = 'fishpond_reports.csv') => {
  const header = ['Farm', 'Pond', 'Fish', 'Water', 'Weather', 'Harvest', 'Date'];
  const rows = buildRows(reports);
  const csv = [header, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportFishConditionPDF = (reports, filename = 'fishpond_reports.pdf') => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const columns = [
    { header: 'Farm', dataKey: 'farm' },
    { header: 'Pond', dataKey: 'pond' },
    { header: 'Fish', dataKey: 'fish' },
    { header: 'Water', dataKey: 'water' },
    { header: 'Weather', dataKey: 'weather' },
    { header: 'Harvest', dataKey: 'harvest' },
    { header: 'Date', dataKey: 'date' }
  ];
  const body = reports.map(r => ({
    farm: r.farm || '',
    pond: r.pond || '',
    fish: r.fish || '',
    water: r.water || '',
    weather: r.weather || '',
    harvest: r.harvest || '',
    date: (r.date && (r.date.toLocaleString ? r.date.toLocaleString() : new Date(r.date).toLocaleString())) || ''
  }));

  autoTable(doc, {
    head: [columns.map(c => c.header)],
    body: body.map(r => columns.map(c => r[c.dataKey])),
    styles: { halign: 'center', valign: 'middle', fontSize: 9 },
    headStyles: { fillColor: [26, 67, 117], halign: 'center' },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'left' },
      6: { halign: 'right' }
    },
    margin: { top: 32, left: 24, right: 24, bottom: 24 },
    didDrawPage: (data) => {
      doc.setFontSize(14);
      doc.text('Fishpond Condition Reports', data.settings.margin.left, 20);
    }
  });

  doc.save(filename);
};

const toDate = (ts) => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

const matchesDateFilter = (d, filter, customDate) => {
  if (!d) return false;
  const date = new Date(d);
  const today = new Date(); today.setHours(0,0,0,0);
  if (filter === 'today') return date.toDateString() === today.toDateString();
  if (filter === 'last7days') {
    const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); sevenDaysAgo.setHours(0,0,0,0);
    return date >= sevenDaysAgo;
  }
  if (filter === 'custom' && customDate) {
    const d0 = new Date(customDate); d0.setHours(0,0,0,0);
    const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
    return date >= d0 && date < d1;
  }
  return true;
};

const buildFarmerLogRows = (logs) => logs.map(l => ([
  l._farm || l.farm || l.farmId || '',
  l.fish_pond || '',
  l.fish_type || '',
  l.age ?? '',
  l.size ?? '',
  l.fish_count ?? '',
  l.feed_brand || '',
  l.feed_amount ?? '',
  l.frequency ?? '',
  l.ph_level ?? 'No Data',
  l.water_temp ?? 'No Data',
  l.submitted_by || l.username || '',
  l.user_email || l.email || '',
  (toDate(l.timestamp)?.toLocaleString() || '')
]));

const buildUserIndex = (users) => {
  const idx = new Map();
  users.forEach(u => {
    [u.email, u.user_email, u.username].filter(Boolean).map(x => String(x).toLowerCase()).forEach(k => idx.set(k, u));
  });
  return idx;
};

const attachFarm = (log, idx) => {
  const keys = [log.user_email, log.email, log.submitted_by].filter(Boolean).map(x => String(x).toLowerCase());
  for (const k of keys) {
    if (idx.has(k)) {
      const u = idx.get(k);
      return { ...log, _matchedUser: u, _farm: u?.farm || log.farmId || log.farm };
    }
  }
  return { ...log, _matchedUser: null, _farm: log.farmId || log.farm };
};

export const exportFishConditionWithLogsCSV = async (reports, opts = {}, filename = 'fishpond_combined.csv') => {
  const { farmId, farmName, reportFilter, customDate } = opts;
  const [logsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'farmerLogs')),
    getDocs(collection(db, 'mobileUsers'))
  ]);
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const idx = buildUserIndex(users);
  const rawLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const withFarm = rawLogs.map(l => attachFarm(l, idx));
  const constrained = withFarm.filter(l => {
    const f = l._farm || '';
    const nameMatch = farmName && String(f).toLowerCase() === String(farmName).toLowerCase();
    const idMatch = farmId && f === farmId;
    return farmId || farmName ? (idMatch || nameMatch) : true;
  }).filter(l => matchesDateFilter(toDate(l.timestamp), reportFilter, customDate));

  const header1 = ['Farm', 'Pond', 'Fish', 'Water', 'Weather', 'Harvest', 'Date'];
  const rows1 = buildRows(reports);
  const header2 = ['Farm', 'Pond', 'Fish Type', 'Age', 'Size', 'Count', 'Feed Brand', 'Feed Amount', 'Frequency', 'pH', 'Water Temp', 'Submitted By', 'Email', 'Date'];
  const rows2 = buildFarmerLogRows(constrained);

  const csv = [header1, ...rows1, [], ['Stock & Feed Logs'], header2, ...rows2]
    .map(row => Array.isArray(row) ? row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') : row)
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportFishConditionWithLogsPDF = async (reports, opts = {}, filename = 'fishpond_combined.pdf') => {
  const { farmId, farmName, reportFilter, customDate } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Table 1: Condition Reports
  const cols1 = ['Farm','Pond','Fish','Water','Weather','Harvest','Date'];
  autoTable(doc, {
    head: [cols1],
    body: buildRows(reports),
    styles: { halign: 'center', valign: 'middle', fontSize: 9 },
    headStyles: { fillColor: [26, 67, 117], halign: 'center' },
    columnStyles: { 0:{halign:'left'},1:{halign:'left'},6:{halign:'right'} },
    margin: { top: 32, left: 24, right: 24 },
    didDrawPage: (data) => {
      doc.setFontSize(14);
      doc.text('Fishpond Condition Reports', data.settings.margin.left, 20);
    }
  });

  // Fetch logs
  const [logsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'farmerLogs')),
    getDocs(collection(db, 'mobileUsers'))
  ]);
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const idx = buildUserIndex(users);
  const rawLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const withFarm = rawLogs.map(l => attachFarm(l, idx));
  const constrained = withFarm.filter(l => {
    const f = l._farm || '';
    const nameMatch = farmName && String(f).toLowerCase() === String(farmName).toLowerCase();
    const idMatch = farmId && f === farmId;
    return farmId || farmName ? (idMatch || nameMatch) : true;
  }).filter(l => matchesDateFilter(toDate(l.timestamp), reportFilter, customDate));

  doc.addPage('a4','landscape');
  const cols2 = ['Farm','Pond','Fish Type','Age','Size','Count','Feed Brand','Feed Amount','Frequency','pH','Water Temp','Submitted By','Email','Date'];
  autoTable(doc, {
    head: [cols2],
    body: buildFarmerLogRows(constrained),
    styles: { halign: 'center', valign: 'middle', fontSize: 9 },
    headStyles: { fillColor: [26, 67, 117], halign: 'center' },
    columnStyles: { 0:{halign:'left'},1:{halign:'left'},12:{halign:'left'},13:{halign:'right'} },
    margin: { top: 32, left: 24, right: 24 },
    didDrawPage: (data) => {
      doc.setFontSize(14);
      doc.text('Stock & Feed Logs', data.settings.margin.left, 20);
    }
  });

  doc.save(filename);
};


