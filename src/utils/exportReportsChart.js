import html2canvas from 'html2canvas';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';

export const downloadReportsChartImage = (containerSelector, type = 'png', filename = 'reports_chart') => {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  html2canvas(container, {
    backgroundColor: '#244a73',
    scale: window.devicePixelRatio > 1 ? 2 : 1.5,
    logging: false,
    useCORS: true,
    allowTaint: true,
    onclone: (clonedDoc) => {
      const toHide = clonedDoc.querySelectorAll('button, [class*="export"], [class*="download"], [aria-label="Export"]');
      toHide.forEach(el => { el.style.display = 'none'; });
    }
  }).then(canvas => {
    const mimeType = type === 'jpeg' ? 'image/jpeg' : 'image/png';
    const data = canvas.toDataURL(mimeType, 1.0);
    const a = document.createElement('a');
    a.href = data;
    a.download = `${filename}.${type === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }).catch(err => console.error('Reports chart export error:', err));
};

const withinTimeFilter = (date, timeFilter) => {
  const now = new Date();
  if (timeFilter === 'daily') {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return date >= startOfWeek && date <= endOfWeek;
  }
  if (timeFilter === 'weekly') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    return date >= startOfMonth && date <= endOfMonth;
  }
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return date >= sixMonthsAgo && date <= end;
};

const formatDate = (d) => new Date(d).toLocaleString();

const getPeriodLabel = (date, timeFilter) => {
  const now = new Date();
  if (timeFilter === 'daily') {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${fmt(startOfWeek)} - ${fmt(endOfWeek)}`;
  }
  if (timeFilter === 'weekly') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDayOfMonth = startOfMonth.getDay();
    const weekNumber = Math.floor((date.getDate() + firstDayOfMonth - 1) / 7) + 1;
    const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return `Week ${weekNumber} (${monthName})`;
  }
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const exportReportsDataCSV = async (timeFilter = 'weekly', filename = 'reports_chart_data.csv') => {
  try {
    const reportsRef = collection(db, 'reports');
    const q = query(reportsRef, orderBy('timestamp', 'desc'));
    const snap = await getDocs(q);
    const rows = [];

    snap.docs.forEach(docSnap => {
      const d = docSnap.data();
      const ts = d.timestamp?.toDate ? d.timestamp.toDate() : (d.timestamp ? new Date(d.timestamp) : null);
      if (!ts || !withinTimeFilter(ts, timeFilter)) return;
      rows.push({
        submitted_by: d.submitted_by ?? '',
        user_email: d.user_email ?? '',
        fish_pond: d.fish_pond ?? d.fish_pond_name ?? d.fish_pond_number ?? '',
        farm: d.farm ?? d.farm_name ?? '',
        date: formatDate(ts),
        period: getPeriodLabel(ts, timeFilter)
      });
    });

    const header = ['submitted_by', 'user_email', 'fish_pond', 'farm', 'date', 'period'];
    const csv = [header, ...rows.map(r => header.map(k => r[k] ?? ''))]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
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
  } catch (err) {
    console.error('Failed to export reports chart data CSV:', err);
  }
};

