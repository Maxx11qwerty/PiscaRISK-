import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logActivity, logMessages } from './logger';
import { useAuth } from '../contexts/AuthContext';

const escapeCsv = (val) => {
  const v = (val ?? '').toString();
  return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
};

export const exportPiscaRiskCSV = ({ farms, allPonds, farmReportsCount, farmReviewedCount, weather, summary }, filename = 'piscarisk_data.csv') => {
  try {
    const currentUser = (window.__authUser && window.__authUser()) || { username: 'Unknown' };
    try { logActivity('export', logMessages.export.exportStart(currentUser.username, 'piscarisk data'), currentUser.username); } catch (_) {}
    const now = new Date();
    const totalFarms = summary?.totalFarms ?? farms.length;
    const totalPonds = summary?.totalPonds ?? allPonds.length;
    const asOf = summary?.asOf ? new Date(summary.asOf).toLocaleString() : now.toLocaleString();

    const summaryRows = [
      ['Total Farms', String(totalFarms)],
      ['Total Ponds (with latest predictions)', String(totalPonds)],
      ['As of', asOf]
    ];

    const weatherRows = weather ? [
      ['Location', weather.locationName || '—'],
      ['Condition', (weather.weather?.[0]?.description) || '—'],
      ['Temperature (°C)', typeof weather.main?.temp === 'number' ? String(Math.round(weather.main.temp)) : '—'],
      ['Humidity (%)', typeof weather.main?.humidity === 'number' ? String(weather.main.humidity) : '—'],
      ['Wind (m/s)', typeof weather.wind?.speed === 'number' ? String(weather.wind.speed) : '—'],
      ['As of', asOf]
    ] : [];

    const farmHeaders = ['Farm','Key','Overall Risk','Ponds','Total Reports','Reviewed','High','Medium','Low','Normal'];
    const farmRows = farms.map(f => [
      f.name,
      f.key,
      f.overall_risk || '',
      String(f.ponds || 0),
      String(farmReportsCount[f.key] || 0),
      String(farmReviewedCount[f.key] || 0),
      String(f.counts?.high || 0),
      String(f.counts?.medium || 0),
      String(f.counts?.low || 0),
      String(f.counts?.normal || 0),
    ]);
    const pondHeaders = ['Farm','Pond','Risk','Timestamp'];
    const pondRows = allPonds.map(p => [
      p.farm || p.farm_name || '',
      p.fish_pond || '',
      p.risk_level || 'Normal',
      p.timestamp ? new Date(typeof p.timestamp === 'number' ? p.timestamp : (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : Date.parse(p.timestamp) || Date.now())).toLocaleString() : ''
    ]);
    const lines = [
      ['PiscaRISK Data — Summary'],
      ...summaryRows,
      [],
      ...(weatherRows.length ? [['Weather Snapshot'], ...weatherRows, []] : []),
      ['PiscaRISK Data — Farms'],
      farmHeaders,
      ...farmRows,
      [],
      ['PiscaRISK Data — Pond Predictions'],
      pondHeaders,
      ...pondRows,
    ];
    const csv = lines.map(r => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    try { logActivity('export', logMessages.export.csvDownload(currentUser.username, 'piscarisk data'), currentUser.username); } catch (_) {}
    try { logActivity('export', logMessages.export.exportComplete(currentUser.username, 'piscarisk data'), currentUser.username); } catch (_) {}
  } catch (e) {
    console.error('Failed to export CSV', e);
    const currentUser = (window.__authUser && window.__authUser()) || { username: 'Unknown' };
    try { logActivity('export', logMessages.export.exportError(currentUser.username, 'piscarisk data', e.message), currentUser.username); } catch (_) {}
  }
};

export const exportPiscaRiskPDF = ({ farms, allPonds, farmReportsCount, farmReviewedCount, weather, summary }, filename = 'piscarisk_data.pdf') => {
  try {
    const currentUser = (window.__authUser && window.__authUser()) || { username: 'Unknown' };
    try { logActivity('export', logMessages.export.exportStart(currentUser.username, 'piscarisk data'), currentUser.username); } catch (_) {}
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    // Summary
    doc.setFontSize(14);
    doc.text('PiscaRISK Data — Summary', 24, 28);
    const now = new Date();
    const totalFarms = summary?.totalFarms ?? farms.length;
    const totalPonds = summary?.totalPonds ?? allPonds.length;
    const asOf = summary?.asOf ? new Date(summary.asOf).toLocaleString() : now.toLocaleString();
    const summaryBody = [[
      String(totalFarms),
      String(totalPonds),
      asOf
    ]];
    autoTable(doc, {
      startY: 40,
      head: [['Total Farms','Total Ponds','As of']],
      body: summaryBody,
      styles: { fontSize: 9, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [26, 67, 117] }
    });

    // Weather Snapshot
    if (weather) {
      const ws = weather;
      const weatherBody = [[
        ws.locationName || '—',
        (ws.weather?.[0]?.description) || '—',
        typeof ws.main?.temp === 'number' ? String(Math.round(ws.main.temp)) : '—',
        typeof ws.main?.humidity === 'number' ? String(ws.main.humidity) : '—',
        typeof ws.wind?.speed === 'number' ? String(ws.wind.speed) : '—',
        asOf
      ]];
      autoTable(doc, {
        startY: doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 20 : 80,
        head: [['Location','Condition','Temp (°C)','Humidity (%)','Wind (m/s)','As of']],
        body: weatherBody,
        styles: { fontSize: 9, halign: 'center', valign: 'middle' },
        headStyles: { fillColor: [26, 67, 117] }
      });
    }

    // Farms
    doc.addPage('a4','landscape');
    doc.setFontSize(14);
    doc.text('PiscaRISK Data — Farms', 24, 28);
    const farmBody = farms.map(f => [
      f.name,
      f.key,
      f.overall_risk || '',
      String(f.ponds || 0),
      String(farmReportsCount[f.key] || 0),
      String(farmReviewedCount[f.key] || 0),
      String(f.counts?.high || 0),
      String(f.counts?.medium || 0),
      String(f.counts?.low || 0),
      String(f.counts?.normal || 0),
    ]);
    autoTable(doc, {
      startY: 40,
      head: [['Farm','Key','Overall Risk','Ponds','Total Reports','Reviewed','High','Medium','Low','Normal']],
      body: farmBody,
      styles: { fontSize: 9, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [26, 67, 117] },
      columnStyles: { 0:{halign:'left'}, 1:{halign:'left'} }
    });

    doc.addPage('a4','landscape');
    doc.setFontSize(14);
    doc.text('PiscaRISK Data — Pond Predictions', 24, 28);
    const pondBody = allPonds.map(p => [
      p.farm || p.farm_name || '',
      p.fish_pond || '',
      p.risk_level || 'Normal',
      p.timestamp ? new Date(typeof p.timestamp === 'number' ? p.timestamp : (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : Date.parse(p.timestamp) || Date.now())).toLocaleString() : ''
    ]);
    autoTable(doc, {
      startY: 40,
      head: [['Farm','Pond','Risk','Timestamp']],
      body: pondBody,
      styles: { fontSize: 9, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [26, 67, 117] },
      columnStyles: { 0:{halign:'left'}, 1:{halign:'left'} }
    });

    doc.save(filename);
    try { logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'piscarisk data'), currentUser.username); } catch (_) {}
    try { logActivity('export', logMessages.export.exportComplete(currentUser.username, 'piscarisk data'), currentUser.username); } catch (_) {}
  } catch (e) {
    console.error('Failed to export PDF', e);
    const currentUser = (window.__authUser && window.__authUser()) || { username: 'Unknown' };
    try { logActivity('export', logMessages.export.exportError(currentUser.username, 'piscarisk data', e.message), currentUser.username); } catch (_) {}
  }
};


