import html2canvas from 'html2canvas';

export const downloadGaugeAsImage = (containerSelector, type = 'png', filename = 'health_gauge', options = {}) => {
  const container = document.querySelector(containerSelector);
  if (!container) {
    console.error('Container not found:', containerSelector);
    return;
  }

  // Measure live sizes to pin into the cloned DOM (prevents reflow and off-centering)
  const gaugeAreaLive = container.querySelector('.gauge-area');
  const rechartsWrapperLive = container.querySelector('.recharts-wrapper');
  const overlayLive = container.querySelector('.center-overlay');
  const gaRect = gaugeAreaLive ? gaugeAreaLive.getBoundingClientRect() : null;
  const rwRect = rechartsWrapperLive ? rechartsWrapperLive.getBoundingClientRect() : null;
  const ovRect = overlayLive ? overlayLive.getBoundingClientRect() : null;

  html2canvas(container, {
    backgroundColor: '#244a73',
    scale: window.devicePixelRatio > 1 ? 2 : 1.5,
    logging: false,
    useCORS: true,
    allowTaint: true,
    onclone: (clonedDoc) => {
      // Hide export/hamburger dropdowns and buttons in clone
      const toHide = clonedDoc.querySelectorAll('button, [class*="export"], [class*="download"], [aria-label="Export"]');
      toHide.forEach(el => { el.style.display = 'none'; });

      // Replace native select with static pill to avoid outlines/UA rendering lines
      try {
        const sel = clonedDoc.querySelector(`${containerSelector} select`);
        if (sel) {
          const selectedText = sel.options && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : sel.value || '';
          const pill = clonedDoc.createElement('div');
          pill.setAttribute('style', [
            'display:inline-flex','align-items:center','justify-content:space-between','gap:8px',
            'border:1px solid #e5e7eb','border-radius:22px','padding:10px 14px','min-width:160px',
            'color:#374151','font:600 14px Inter, sans-serif','line-height:1','background:#ffffff',
            'box-shadow:none','outline:none','appearance:none'
          ].join(';'));
          const textSpan = clonedDoc.createElement('span');
          textSpan.textContent = selectedText;
          textSpan.setAttribute('style', 'color:#374151;font:600 14px Inter, sans-serif');
          const caret = clonedDoc.createElement('span');
          caret.textContent = '▾';
          caret.setAttribute('style', 'margin-left:auto;color:#374151');
          pill.appendChild(textSpan);
          pill.appendChild(caret);
          sel.parentNode && sel.parentNode.replaceChild(pill, sel);
        }
      } catch {}

      // Pin measured sizes to avoid layout shifts
      const clonedContainer = clonedDoc.querySelector(containerSelector);
      if (clonedContainer) {
        clonedContainer.style.padding = '16px';
        clonedContainer.style.boxSizing = 'border-box';
      }
      try {
        const gaugeAreaClone = clonedDoc.querySelector(`${containerSelector} .gauge-area`);
        if (gaugeAreaClone && gaRect) {
          gaugeAreaClone.style.width = `${Math.round(gaRect.width)}px`;
          gaugeAreaClone.style.height = `${Math.round(gaRect.height)}px`;
        }
        const rwClone = clonedDoc.querySelector(`${containerSelector} .recharts-wrapper`);
        if (rwClone && rwRect) {
          rwClone.style.width = `${Math.round(rwRect.width)}px`;
          rwClone.style.height = `${Math.round(rwRect.height)}px`;
        }
        const overlayClone = clonedDoc.querySelector(`${containerSelector} .center-overlay`);
        if (overlayClone && ovRect) {
          overlayClone.style.inset = '0px';
          overlayClone.style.display = 'flex';
          overlayClone.style.alignItems = 'center';
          overlayClone.style.justifyContent = 'center';
        }
      } catch {}

      // Remove any potential focus outlines/lines globally in clone
      const style = clonedDoc.createElement('style');
      style.textContent = `* { outline: none !important; box-shadow: none !important; }`;
      clonedDoc.head.appendChild(style);
    }
  }).then(canvas => {
    const mimeType = type === 'jpeg' ? 'image/jpeg' : 'image/png';
    const imageData = canvas.toDataURL(mimeType, 1.0);

    const link = document.createElement('a');
    link.href = imageData;
    link.download = `${filename}.${type === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }).catch(error => {
    console.error('Error exporting Farm Health image:', error);
  });
};

export const exportHealthGaugeCSV = (payload, filename = 'health_gauge.csv') => {
  const { farmName, percent, status, asOf } = payload || {};
  const rows = [
    ['Farm', 'Percent', 'Status', 'As Of'],
    [farmName ?? '', String(percent ?? ''), status ?? '', (asOf ? new Date(asOf) : new Date()).toLocaleString()]
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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


