import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper function to get latest predictions per pond
const getLatestPerPond = (farm) => {
  if (!farm.predictions || !Array.isArray(farm.predictions)) return [];
  
  // Filter out predictions with invalid timestamps
  const validPredictions = farm.predictions.filter(pred => {
    const ms = getTimestampMs(pred.timestamp);
    return ms > 0;
  });
  
  if (validPredictions.length === 0) return [];
  
  // Sort by timestamp (latest first)
  const sortedPredictions = [...validPredictions].sort((a, b) => {
    const aMs = getTimestampMs(a.timestamp);
    const bMs = getTimestampMs(b.timestamp);
    return bMs - aMs; // Latest first
  });
  
  // Group predictions by pond, but only keep the first (latest) occurrence of each pond
  const pondMap = new Map();
  sortedPredictions.forEach(pred => {
    const pond = pred.fish_pond || 'Unknown Pond';
    if (!pondMap.has(pond)) {
      pondMap.set(pond, pred);
    }
  });
  
  return Array.from(pondMap.values());
};

// Helper function to convert timestamp to milliseconds
const getTimestampMs = (ts) => {
  if (!ts) return 0;
  let ms = 0;
  if (typeof ts === 'number') ms = ts;
  else if (typeof ts === 'string') { const m = Date.parse(ts); ms = Number.isNaN(m) ? 0 : m; }
  else if (ts && typeof ts.toDate === 'function') { try { ms = ts.toDate().getTime(); } catch (_) {} }
  else if (ts && typeof ts.seconds === 'number') { ms = ts.seconds * 1000; }
  return ms;
};

// Helper function to normalize risk levels
const normalizeRisk = (level) => {
  if (!level || typeof level !== 'string') return 'Normal';
  const s = level.toLowerCase().trim();
  if (s.includes('high') || s.includes('critical')) return 'High';
  if (s.includes('medium')) return 'Medium';
  if (s.includes('low')) return 'Low';
  if (s.includes('normal')) return 'Normal';
  return 'Normal';
};

const normalizePondKey = (pond) => {
  return String(pond || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
};

const pondsMatch = (a, b) => normalizePondKey(a) === normalizePondKey(b);

const buildPondOverview = (prediction) => {
  const summary = String(prediction?.conditions_summary || '').trim();
  if (summary) return summary;

  const fish = prediction?.fish_condition ? `${prediction.fish_condition} fish` : '';
  const water = prediction?.water_condition ? `${prediction.water_condition} water` : '';
  const weather = prediction?.weather ? `weather: ${prediction.weather}` : '';
  const parts = [fish, water, weather].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'N/A';
};

const buildChecklistCompletionForPond = (checklist, pondName) => {
  const source = checklist || {};
  const checklistPond = source?.location_info?.fish_pond;
  if (!checklistPond || !pondsMatch(checklistPond, pondName)) return 'N/A';

  const metrics = source?.completion_metrics || {};
  const completed = Number(metrics.completed_tasks || 0);
  const total = Number(metrics.total_tasks || 0);
  const rate = Number(metrics.completion_rate || 0);
  if (total <= 0) return 'Started';
  return `${completed}/${total} (${rate}%)`;
};

const buildInsightsForPond = (checklist, pondName) => {
  const source = checklist || {};
  const checklistPond = source?.location_info?.fish_pond;
  if (!checklistPond || !pondsMatch(checklistPond, pondName)) return 'N/A';

  const predictive = source?.predictive_analytics || {};
  const assessment = predictive?.overall_assessment || '';
  const focus = Array.isArray(predictive?.recommended_focus) && predictive.recommended_focus.length > 0
    ? `Focus: ${predictive.recommended_focus.join('; ')}`
    : '';
  const next = Array.isArray(predictive?.next_recommendations) && predictive.next_recommendations.length > 0
    ? `Next: ${predictive.next_recommendations.slice(0, 2).join('; ')}`
    : '';

  const parts = [assessment, focus, next].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : 'N/A';
};

export const exportRiskOverviewCSV = (farms, filename = 'risk_overview.csv') => {
  const header = ['Farm', 'Overall Risk', 'Ponds', 'Avg Confidence', 'Critical Alerts', 'Main Issue', 'Last Update'];
  const rows = farms.map(f => {
    // Get latest predictions per pond for accurate counts
    const latestPerPond = getLatestPerPond(f);
    
    // Calculate accurate pond count
    const pondCount = latestPerPond.length;
    
    // Use the farm's pre-calculated average confidence (same as modal)
    const avgConfidence = f.avg_confidence || 0;
    
    // Use the farm's pre-calculated overall risk (same as modal)
    const overallRisk = f.overall_risk || 'Normal';
    
    return [
      f.farm_name || '',
      overallRisk,
      pondCount.toString(),
      avgConfidence > 0 ? `${avgConfidence.toFixed(1)}%` : '',
      (f.summary?.critical_alerts ?? 0).toString(),
      f.summary?.main_issue || '',
      f.summary?.last_update ? (typeof f.summary.last_update.toDate === 'function' ? f.summary.last_update.toDate().toLocaleString() : new Date(f.summary.last_update).toLocaleString()) : ''
    ];
  });
  
  // Build pond details section organized per farm
  const pondHeader = ['Farm', 'Pond', 'Risk Level', 'Confidence', 'Fish Condition', 'Water Condition', 'Weather'];
  const pondRows = [];
  
  farms.forEach(f => {
    const latestPerPond = getLatestPerPond(f);
    if (latestPerPond.length > 0) {
      // Add farm header
      pondRows.push([`${f.farm_name} - Pond Details`, '', '', '', '', '', '']);
      // Add pond data
      latestPerPond.forEach(p => {
        pondRows.push([
          '', // Empty farm name since it's in the header
          p.fish_pond || '—',
          p.risk_level || 'Normal',
          typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : '',
          p.fish_condition || '',
          p.water_condition || '',
          p.weather || ''
        ]);
      });
      // Add empty row between farms
      pondRows.push(['', '', '', '', '', '', '']);
    }
  });

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
  const head = ['Farm', 'Overall Risk', 'Ponds', 'Avg Confidence', 'Critical Alerts', 'Main Issue', 'Last Update'];
  const body = farms.map(f => {
    // Get latest predictions per pond for accurate counts
    const latestPerPond = getLatestPerPond(f);
    
    // Calculate accurate pond count
    const pondCount = latestPerPond.length;
    
    // Use the farm's pre-calculated average confidence (same as modal)
    const avgConfidence = f.avg_confidence || 0;
    
    // Use the farm's pre-calculated overall risk (same as modal)
    const overallRisk = f.overall_risk || 'Normal';
    
    return [
      f.farm_name || '',
      overallRisk,
      pondCount,
      avgConfidence > 0 ? `${avgConfidence.toFixed(1)}%` : '',
      f.summary?.critical_alerts ?? 0,
      f.summary?.main_issue || '',
      f.summary?.last_update ? (typeof f.summary.last_update.toDate === 'function' ? f.summary.last_update.toDate().toLocaleString() : new Date(f.summary.last_update).toLocaleString()) : ''
    ];
  });
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

  // Add pond details page organized per farm
  doc.addPage('a4', 'landscape');
  const pondHead = ['Farm', 'Pond', 'Risk Level', 'Confidence', 'Fish Condition', 'Water Condition', 'Weather'];
  const pondBody = [];
  
  farms.forEach(f => {
    const latestPerPond = getLatestPerPond(f);
    if (latestPerPond.length > 0) {
      // Add farm header row
      pondBody.push([f.farm_name || '', '', '', '', '', '', '']);
      // Add pond data
      latestPerPond.forEach(p => {
        pondBody.push([
          '', // Empty farm name since it's in the header
          p.fish_pond || '—',
          p.risk_level || 'Normal',
          typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : '',
          p.fish_condition || '',
          p.water_condition || '',
          p.weather || ''
        ]);
      });
      // Add empty row between farms
      pondBody.push(['', '', '', '', '', '', '']);
    }
  });
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

// Export individual farm details with all pond risk reports, checklist, and insights
export const exportFarmDetailsCSV = (farm, filename, options = {}) => {
  const farmName = farm.farm_name || 'Unknown Farm';
  const latestPerPond = getLatestPerPond(farm);
  const checklistSource = options.checklistData || farm.checklist || {};
  
  // Farm overview section
  const farmOverview = [
    ['Farm Details'],
    ['Farm Name', farmName],
    ['Overall Risk', farm.overall_risk || 'Normal'],
    ['Total Ponds', latestPerPond.length.toString()],
    ['Average Confidence', farm.avg_confidence ? `${farm.avg_confidence.toFixed(1)}%` : 'N/A'],
    ['Critical Alerts', farm.summary?.critical_alerts || 0],
    ['Main Issue', farm.summary?.main_issue || 'N/A'],
    ['Last Updated', farm.summary?.last_update ? 
      (typeof farm.summary.last_update.toDate === 'function' ? 
        farm.summary.last_update.toDate().toLocaleString() : 
        new Date(farm.summary.last_update).toLocaleString()) : 'N/A'],
    [''] // Empty row
  ];

  // Pond risk reports section
  const pondReports = [
    ['Pond Risk Reports'],
    ['Pond Name', 'Risk Level', 'Confidence', 'Overview', 'Checklist Completion', 'Insights', 'Fish Condition', 'Water Condition', 'Weather', 'Timestamp'],
    ...latestPerPond.map(p => [
      p.fish_pond || '—',
      p.risk_level || 'Normal',
      typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : 'N/A',
      buildPondOverview(p),
      buildChecklistCompletionForPond(checklistSource, p.fish_pond),
      buildInsightsForPond(checklistSource, p.fish_pond),
      p.fish_condition || 'N/A',
      p.water_condition || 'N/A',
      p.weather || 'N/A',
      p.timestamp ? new Date(getTimestampMs(p.timestamp)).toLocaleString() : 'N/A'
    ]),
    [''] // Empty row
  ];

  // Checklist section (if available)
  const checklistData = checklistSource;
  const checklistSection = [
    ['Checklist Completion'],
    ['Location', checklistData.location_info?.fish_pond || 'N/A'],
    ['Completion Date', checklistData.timestamp ? 
      (typeof checklistData.timestamp.toDate === 'function' ? 
        checklistData.timestamp.toDate().toLocaleString() : 
        new Date(checklistData.timestamp).toLocaleString()) : 'N/A'],
    ['Overall Score', checklistData.overall_score ? `${checklistData.overall_score}%` : 'N/A'],
    [''] // Empty row
  ];

  // AI Insights section (if available)
  const insightsData = checklistSource?.predictive_analytics || farm.insights || {};
  const insightsSection = [
    ['AI Insights'],
    ['Risk Assessment', insightsData.risk_assessment || 'N/A'],
    ['Recommendations', insightsData.recommendations || 'N/A'],
    ['Confidence Boost', insightsData.confidence_boost ? `+${insightsData.confidence_boost}%` : 'N/A'],
    [''] // Empty row
  ];

  // Combine all sections
  const allData = [
    ...farmOverview,
    ...pondReports,
    ...checklistSection,
    ...insightsSection
  ];

  // Convert to CSV
  const csv = allData
    .map(row => Array.isArray(row) ? 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',') : 
      `"${String(row).replace(/"/g, '""')}"`)
    .join('\n');

  // Download
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

export const exportFarmDetailsPDF = (farm, filename, options = {}) => {
  const farmName = farm.farm_name || 'Unknown Farm';
  const latestPerPond = getLatestPerPond(farm);
  const checklistSource = options.checklistData || farm.checklist || {};
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // Farm Overview Page
  doc.setFontSize(16);
  doc.text(`${farmName} - Risk Reports Details`, 40, 40);
  
  doc.setFontSize(12);
  doc.text('Farm Overview', 40, 70);
  
  const farmData = [
    ['Farm Name', farmName],
    ['Overall Risk', farm.overall_risk || 'Normal'],
    ['Total Ponds', latestPerPond.length.toString()],
    ['Average Confidence', farm.avg_confidence ? `${farm.avg_confidence.toFixed(1)}%` : 'N/A'],
    ['Critical Alerts', farm.summary?.critical_alerts || 0],
    ['Main Issue', farm.summary?.main_issue || 'N/A'],
    ['Last Updated', farm.summary?.last_update ? 
      (typeof farm.summary.last_update.toDate === 'function' ? 
        farm.summary.last_update.toDate().toLocaleString() : 
        new Date(farm.summary.last_update).toLocaleString()) : 'N/A']
  ];

  autoTable(doc, {
    body: farmData,
    startY: 90,
    styles: { fontSize: 10 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' }, 1: { halign: 'left' } },
    margin: { left: 40, right: 40 }
  });

  // Pond Risk Reports Page (per-pond detail layout to avoid overly wide columns)
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Pond Risk Reports', 40, 40);

  let currentY = 60;
  latestPerPond.forEach((p, index) => {
    const rows = [
      ['Pond Name', p.fish_pond || '—'],
      ['Risk Level', p.risk_level || 'Normal'],
      ['Confidence', typeof p.confidence === 'number' ? `${Number(p.confidence).toFixed(1)}%` : 'N/A'],
      ['Overview', buildPondOverview(p)],
      ['Checklist Completion', buildChecklistCompletionForPond(checklistSource, p.fish_pond)],
      ['Insights', buildInsightsForPond(checklistSource, p.fish_pond)],
      ['Fish Condition', p.fish_condition || 'N/A'],
      ['Water Condition', p.water_condition || 'N/A'],
      ['Weather', p.weather || 'N/A'],
      ['Timestamp', p.timestamp ? new Date(getTimestampMs(p.timestamp)).toLocaleString() : 'N/A']
    ];

    autoTable(doc, {
      body: rows,
      startY: currentY,
      styles: { fontSize: 9, overflow: 'linebreak', cellPadding: 4, valign: 'top' },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 160 },
        1: { halign: 'left', cellWidth: 355 }
      },
      margin: { left: 40, right: 40 },
      didDrawPage: (data) => {
        doc.setFontSize(14);
        doc.text('Pond Risk Reports', 40, 40);
      }
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 12;
    if (index < latestPerPond.length - 1 && currentY > 700) {
      doc.addPage();
      currentY = 60;
    }
  });

  doc.save(filename);
};


