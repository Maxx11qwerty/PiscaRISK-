import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const normalizeTimestamp = (ts) => {
  if (!ts) return '';
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  }
  if (ts instanceof Date) return ts.toLocaleString();
  return '';
};

export const exportConditionInsightsCSV = (items, filename = 'condition_insights.csv') => {
  try {
    const header = ['Farm', 'Pond', 'Severity', 'Summary', 'Timestamp'];
    const rows = (items || []).map((it) => {
      const summary = (it.summary || '').toString().replace(/\s+/g, ' ').trim();
      const sev = summary.toLowerCase().includes('critical') || summary.toLowerCase().includes('high')
        ? 'Critical'
        : summary.toLowerCase().includes('elevated') || summary.toLowerCase().includes('medium')
        ? 'Elevated'
        : 'Normal';
      return [it.farm || '', it.pond || '', sev, summary, normalizeTimestamp(it.timestamp)];
    });
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
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
  } catch (e) {
  }
};

export const exportConditionInsightsPDF = (items, filename = 'condition_insights.pdf') => {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(12);
    doc.text('Condition Insights', 40, 40);
    autoTable(doc, {
      head: [['Farm', 'Pond', 'Severity', 'Summary', 'Timestamp']],
      body: (items || []).map((it) => {
        const summary = (it.summary || '').toString().replace(/\s+/g, ' ').trim();
        const sev = summary.toLowerCase().includes('critical') || summary.toLowerCase().includes('high')
          ? 'Critical'
          : summary.toLowerCase().includes('elevated') || summary.toLowerCase().includes('medium')
          ? 'Elevated'
          : 'Normal';
        return [it.farm || '', it.pond || '', sev, summary, normalizeTimestamp(it.timestamp)];
      }),
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [26, 67, 117], halign: 'left' },
      margin: { top: 72, left: 24, right: 24, bottom: 30 },
      columnStyles: {
        0: { cellWidth: 110 },
        1: { cellWidth: 110 },
        2: { cellWidth: 80, halign: 'center' },
        3: { cellWidth: 360 },
        4: { cellWidth: 130 }
      },
      didDrawPage: (data) => {
        doc.setFontSize(14);
        doc.text('Condition Insights', data.settings.margin.left, 40);
        doc.setFontSize(10);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, data.settings.margin.left, 56);
      }
    });

    // Prefer manual blob download to avoid browser quirks
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
  }
};


