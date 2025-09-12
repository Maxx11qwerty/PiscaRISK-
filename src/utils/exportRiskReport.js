import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const exportRiskOverviewCSV = (farms, filename = 'risk_overview.csv') => {
  const header = ['Farm', 'Overall Risk', 'Ponds', 'Avg Confidence', 'Critical Alerts', 'Ready Count', 'Main Issue', 'Last Update'];
  const rows = farms.map(f => ([
    f.farm_name || '',
    f.overall_risk || 'Normal',
    (f.predictions?.length ?? 0).toString(),
    (typeof f.avg_confidence === 'number' ? `${f.avg_confidence.toFixed(1)}%` : ''),
    (f.summary?.critical_alerts ?? 0).toString(),
    (f.summary?.ready_count ?? 0).toString(),
    f.summary?.main_issue || '',
    f.summary?.last_update ? (typeof f.summary.last_update.toDate === 'function' ? f.summary.last_update.toDate().toLocaleString() : new Date(f.summary.last_update).toLocaleString()) : ''
  ]));
  // Build pond details section (flatten all farms)
  const pondHeader = ['Farm', 'Pond', 'Risk Level', 'Confidence', 'Fish Condition', 'Water Condition', 'Weather'];
  const pondRows = farms.flatMap(f => (f.predictions || []).map(p => ([
    f.farm_name || '',
    p.fish_pond || '—',
    p.risk_level || 'Normal',
    typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : '',
    p.fish_condition || '',
    p.water_condition || '',
    p.weather || ''
  ])));

  const csv = [header, ...rows, [], ['Pond Details'], pondHeader, ...pondRows]
    .map(r => Array.isArray(r) ? r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') : r)
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

export const exportRiskOverviewPDF = (farms, filename = 'risk_overview.pdf') => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const head = ['Farm', 'Overall Risk', 'Ponds', 'Avg Confidence', 'Critical Alerts', 'Ready Count', 'Main Issue', 'Last Update'];
  const body = farms.map(f => ([
    f.farm_name || '',
    f.overall_risk || 'Normal',
    f.predictions?.length ?? 0,
    typeof f.avg_confidence === 'number' ? `${f.avg_confidence.toFixed(1)}%` : '',
    f.summary?.critical_alerts ?? 0,
    f.summary?.ready_count ?? 0,
    f.summary?.main_issue || '',
    f.summary?.last_update ? (typeof f.summary.last_update.toDate === 'function' ? f.summary.last_update.toDate().toLocaleString() : new Date(f.summary.last_update).toLocaleString()) : ''
  ]));
  autoTable(doc, {
    head: [head],
    body,
    styles: { halign: 'center', valign: 'middle', fontSize: 10 },
    headStyles: { fillColor: [26, 67, 117], halign: 'center' },
    columnStyles: { 0:{halign:'left'}, 2:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'}, 6:{halign:'left'} },
    margin: { top: 32, left: 24, right: 24 },
    didDrawPage: (data) => {
      doc.setFontSize(14);
      doc.text('Farm Risk Overview', data.settings.margin.left, 20);
    }
  });

  // Add pond details page
  doc.addPage('a4', 'landscape');
  const pondHead = ['Farm', 'Pond', 'Risk Level', 'Confidence', 'Fish Condition', 'Water Condition', 'Weather'];
  const pondBody = farms.flatMap(f => (f.predictions || []).map(p => ([
    f.farm_name || '',
    p.fish_pond || '—',
    p.risk_level || 'Normal',
    typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : '',
    p.fish_condition || '',
    p.water_condition || '',
    p.weather || ''
  ])));
  autoTable(doc, {
    head: [pondHead],
    body: pondBody,
    styles: { halign: 'center', valign: 'middle', fontSize: 10 },
    headStyles: { fillColor: [26, 67, 117], halign: 'center' },
    columnStyles: { 0:{halign:'left'}, 1:{halign:'left'}, 3:{halign:'right'} },
    margin: { top: 32, left: 24, right: 24 },
    didDrawPage: (data) => {
      doc.setFontSize(14);
      doc.text('Pond Details', data.settings.margin.left, 20);
    }
  });
  doc.save(filename);
};

export const exportFarmPondCSV = (farmName, rows, filename) => {
  const header = ['Pond', 'Risk Level', 'Confidence'];
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename || `${farmName}_risk_reports.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportFarmPondPDF = (farmName, rows, filename) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const cols = ['Pond', 'Risk Level', 'Confidence'];
  autoTable(doc, {
    head: [cols],
    body: rows,
    styles: { halign: 'center', valign: 'middle', fontSize: 10 },
    headStyles: { fillColor: [26, 67, 117], halign: 'center' },
    columnStyles: { 0: { halign: 'left' }, 2: { halign: 'right' } },
    margin: { top: 32, left: 24, right: 24 },
    didDrawPage: (data) => {
      doc.setFontSize(14);
      doc.text(`${farmName} — Pond Risk Reports`, data.settings.margin.left, 20);
    }
  });
  doc.save(filename || `${farmName}_risk_reports.pdf`);
};


