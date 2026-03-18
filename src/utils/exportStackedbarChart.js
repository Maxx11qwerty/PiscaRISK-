export const downloadChartAsImage = (chartContainerSelector, type = 'png', filename = 'stacked_chart') => {
  const container = document.querySelector(chartContainerSelector);
  if (!container) return;

  // Prefer the Recharts SVG, not any icon SVGs in controls
  const svg = container.querySelector('.recharts-wrapper svg, svg.recharts-surface') || container.querySelector('svg');
  if (!svg) return;

  // Measure container to derive proper output dimensions
  const rect = container.getBoundingClientRect();
  const outputWidth = Math.max(1, Math.floor(rect.width || svg.clientWidth || 1200));
  const outputHeight = Math.max(1, Math.floor(rect.height || svg.clientHeight || 600));

  // Clone SVG and ensure width/height and viewBox are set for correct rasterization
  const cloned = svg.cloneNode(true);
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('width', String(outputWidth));
  cloned.setAttribute('height', String(outputHeight));
  if (!cloned.getAttribute('viewBox')) {
    cloned.setAttribute('viewBox', `0 0 ${outputWidth} ${outputHeight}`);
  }

  // Serialize cloned SVG
  const xml = new XMLSerializer().serializeToString(cloned);
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
  const image64 = `data:image/svg+xml;base64,${svg64}`;

  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(outputWidth * dpr);
    canvas.height = Math.floor(outputHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Use container background color so legend/text remain readable
    const contBg = getComputedStyle(container).backgroundColor || '#ffffff';
    ctx.fillStyle = contBg;
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    ctx.drawImage(img, 0, 0, outputWidth, outputHeight);

    // Try to include legend (often rendered as HTML) by rasterizing it via foreignObject
    const legendEl = container.querySelector('.recharts-legend-wrapper, .custom-legend');
    if (legendEl) {
      const contRect = container.getBoundingClientRect();
      const legRect = legendEl.getBoundingClientRect();
      const legendX = Math.max(0, Math.round(legRect.left - contRect.left));
      const legendY = Math.max(0, Math.round(legRect.top - contRect.top));
      const legendW = Math.round(legRect.width);
      const legendH = Math.round(legRect.height);

      // Clone and inline computed styles to ensure text renders inside foreignObject
      const clone = legendEl.cloneNode(true);
      const inlineNodeStyles = (node) => {
        if (!node || node.nodeType !== 1) return; // element nodes only
        const computed = window.getComputedStyle(node);
        const props = [
          'color','font','font-size','font-family','font-weight','font-style','line-height','letter-spacing',
          'text-transform','text-decoration','text-align','white-space','background','background-color',
          'padding','margin','border','border-radius','display','gap','align-items','justify-content'
        ];
        const styleStr = props.map(p => `${p}:${computed.getPropertyValue(p)}`).join(';');
        const existing = node.getAttribute('style') || '';
        node.setAttribute('style', existing ? `${existing};${styleStr}` : styleStr);
        Array.from(node.children).forEach(inlineNodeStyles);
      };
      inlineNodeStyles(clone);

      const wrappedHTML = `<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block;">${clone.outerHTML}</div>`;
      const svgFO = `<?xml version="1.0" standalone="no"?>\n` +
        `<svg xmlns="http://www.w3.org/2000/svg" width="${legendW}" height="${legendH}">` +
        `<foreignObject width="100%" height="100%">${wrappedHTML}</foreignObject>` +
        `</svg>`;
      const legendDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFO);
      const legendImg = new Image();
      legendImg.onload = () => {
        ctx.drawImage(legendImg, legendX, legendY, legendW, legendH);
        const mime = type === 'jpeg' ? 'image/jpeg' : 'image/png';
        const dataUrl = canvas.toDataURL(mime, 1.0);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${filename}.${type === 'jpeg' ? 'jpg' : 'png'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
      legendImg.src = legendDataUrl;
    } else {
      const mime = type === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime, 1.0);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename}.${type === 'jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };
  img.src = image64;
};

export const exportChartDataCSV = (data, filename = 'stacked_chart.csv') => {
  if (!Array.isArray(data) || data.length === 0) return;
  const keys = Object.keys(data[0]).filter(k => k !== 'farmKey');
  const header = keys;
  const rows = data.map(d => keys.map(k => d[k] ?? ''));
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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

export const exportPondsAtRiskExcelCSV = (rows, filename = 'ponds_at_risk.csv') => {
  if (!Array.isArray(rows) || rows.length === 0) return;

  const headers = [
    'Farm',
    'Pond Number',
    'Pond',
    'Risk Level',
    'Confidence (%)',
    'Reason',
    'As Of',
  ];

  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csvRows = rows.map((row) => [
    row.farm,
    row.pondNumber,
    row.pond,
    row.riskLevel,
    row.confidencePercent,
    row.reason,
    row.asOf,
  ]);

  // Add UTF-8 BOM and CRLF for cleaner opening in Excel.
  const csv = '\uFEFF' + [headers, ...csvRows].map((r) => r.map(escape).join(',')).join('\r\n');
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


