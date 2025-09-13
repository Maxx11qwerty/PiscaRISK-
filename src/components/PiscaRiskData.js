import React, { useEffect, useMemo, useState, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { fetchRiskReportData } from '../services/riskDataService';
import { exportHealthGaugeCSV } from '../utils/exportHealthGauge';
import { exportConditionInsightsCSV } from '../utils/exportConditionInsights';
import { exportRiskOverviewCSV } from '../utils/exportRiskReport';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { fetchWeatherData } from '../services/weatherService';
import { exportPiscaRiskCSV, exportPiscaRiskPDF } from '../utils/exportPiscariskData';
import { logActivity, logMessages } from '../utils/logger';
import { useTranslation } from 'react-i18next';
import './PiscaRiskData.css';

const PAGE_SIZE = 8;

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const Section = ({ title, children, description }) => (
  <div className="prd-section">
    <div className="prd-section-header">
      <h4 className="prd-section-title">{title}</h4>
      {description ? <div className="prd-section-desc">{description}</div> : null}
    </div>
    <div className="prd-section-body">{children}</div>
  </div>
);

const Pill = ({ color, children }) => (
  <span className="prd-pill" style={{ background: color }}>{children}</span>
);

const usePaginated = (items, size = PAGE_SIZE) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / size));
  const pageItems = useMemo(() => {
    const start = (page - 1) * size;
    return (items || []).slice(start, start + size);
  }, [items, size, page]);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  return { page, setPage, totalPages, pageItems };
};

const PiscaRiskData = () => {
  const { currentUser } = useContext(AuthContext);
  const { t } = useTranslation();
  const [farms, setFarms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [farmReportsCount, setFarmReportsCount] = useState({});
  const [farmReviewedCount, setFarmReviewedCount] = useState({});
  const [weather, setWeather] = useState(null);
  const [assignedFarmName, setAssignedFarmName] = useState('');

  // Resolve assigned farm name for current user
  useEffect(() => {
    const resolveAssignedFarmName = async () => {
      try {
        if (currentUser?.farm) {
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            setAssignedFarmName(farmDoc.data().name || currentUser.farm);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } else {
          setAssignedFarmName('');
        }
      } catch (e) {
        setAssignedFarmName(String(currentUser?.farm || ''));
      }
    };

    resolveAssignedFarmName();
  }, [currentUser?.farm]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await fetchRiskReportData();
        let baseFarms = Array.isArray(data) ? data : [];
        // Count farm reports from 'reports' collection by farm name
        const counts = {};
        try {
          const reportsRef = collection(db, 'reports');
          const snap = await getDocs(reportsRef);
          const reviewed = {};
          snap.forEach(doc => {
            const d = doc.data() || {};
            const farmRaw = (d.farm || '').toString().trim();
            if (!farmRaw) return; // skip unknown/missing farm
            const key = normalizeFarmName(farmRaw);
            if (key === 'unknown-farm') return;
            counts[key] = (counts[key] || 0) + 1;
            const status = (d.status || '').toString().toLowerCase();
            const isReviewed = status === 'Reviewed' || !!d.reviewed_by || !!d.reviewedAt || !!d.reviewed_at;
            if (isReviewed) {
              reviewed[key] = (reviewed[key] || 0) + 1;
            }
          });
          setFarmReviewedCount(reviewed);

          // Ensure farms includes any farm appearing only in reports
          const baseKeys = new Set(baseFarms.map(f => f.key));
          const toAdd = [];
          Object.keys(counts).forEach(k => {
            if (!baseKeys.has(k)) {
              if (k === 'unknown-farm') return; // never add unknown
              const displayName = (Object.keys(reviewed).includes(k)) ? k.replace(/-/g, ' ') : k.replace(/-/g, ' ');
              toAdd.push({
                key: k,
                name: displayName,
                risk: 'Normal',
                overall_risk: 'Normal',
                ponds: 0,
                predictions: [],
                has_reports: false,
                counts: { high: 0, medium: 0, low: 0, normal: 0 },
              });
            }
          });
          if (toAdd.length > 0) {
            baseFarms = [...baseFarms, ...toAdd].sort((a,b)=> (a.name||'').localeCompare(b.name||''));
          }
        } catch (_) {}
        setFarmReportsCount(counts);
        
        // Apply farm filtering if current user is assigned to a farm
        let filteredFarms = baseFarms;
        if (currentUser?.farm && assignedFarmName) {
          const currentUserFarm = currentUser.farm;
          filteredFarms = baseFarms.filter(farm => {
            const farmKey = farm.key;
            const farmName = farm.name;
            
            // Check if farm matches current user's assigned farm
            const matchesFarm = farmKey === normalizeFarmName(currentUserFarm) ||
                               farmKey === normalizeFarmName(assignedFarmName) ||
                               farmName === currentUserFarm ||
                               farmName === assignedFarmName ||
                               farmName?.toLowerCase() === currentUserFarm?.toLowerCase() ||
                               farmName?.toLowerCase() === assignedFarmName?.toLowerCase();
            
            return matchesFarm;
          });
        }
        
        setFarms(filteredFarms);
        // Weather
        const w = await fetchWeatherData();
        setWeather(w);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser?.farm, assignedFarmName]);

  const allPonds = useMemo(() => {
    return farms.flatMap(f => (f.predictions || []).map(p => ({ ...p, farm_name: f.name })));
  }, [farms]);


  const { page, setPage, totalPages, pageItems } = usePaginated(allPonds);

  if (loading) {
    return (
      <div className="prd-container">
        <div className="prd-loading">{t('piscaRiskData.loading')}</div>
      </div>
    );
  }

  return (
    <div className="prd-container">
      <div className="prd-export-bar">
        <span className="prd-export-label">{t('piscaRiskData.export.label')}</span>
        <div className="prd-export-menu">
          <button className="prd-export-btn" onClick={(e) => {
            const menu = e.currentTarget.nextSibling;
            const isOpening = menu.style.display !== 'block';
            if (menu) menu.style.display = isOpening ? 'block' : 'none';
            try { 
              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
              logActivity('export', `Export menu ${isOpening ? 'opened' : 'closed'} in PiscaRisk data`, u); 
            } catch (_) {}
          }}>{t('piscaRiskData.export.select')}</button>
          <div className="prd-export-menu-list" style={{ display: 'none' }}>
            <button className="prd-export-menu-item" onClick={(e) => {
              e.currentTarget.parentElement.style.display = 'none';
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', logMessages.export.csvDownload(u, 'PiscaRisk data'), u); 
              } catch (_) {}
              exportPiscaRiskCSV({
                farms,
                allPonds,
                farmReportsCount,
                farmReviewedCount,
                weather,
                summary: { totalFarms: farms.length, totalPonds: allPonds.length, asOf: Date.now() }
              });
            }}>{t('piscaRiskData.export.csv')}</button>
            <button className="prd-export-menu-item" onClick={(e) => {
              e.currentTarget.parentElement.style.display = 'none';
              try { 
                const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                logActivity('export', logMessages.export.pdfDownload(u, 'PiscaRisk data'), u); 
              } catch (_) {}
              exportPiscaRiskPDF({
                farms,
                allPonds,
                farmReportsCount,
                farmReviewedCount,
                weather,
                summary: { totalFarms: farms.length, totalPonds: allPonds.length, asOf: Date.now() }
              });
            }}>{t('piscaRiskData.export.pdf')}</button>
          </div>
        </div>
      </div>
      

      
      <div className="prd-grid">
        <Section title={t('piscaRiskData.sections.farms.title')} description={t('piscaRiskData.sections.farms.description')}>
          <div className="prd-list">
            {farms.map((f) => (
              <div key={f.key} className="prd-card">
                <div className="prd-card-header">
                  <div className="prd-card-title">{f.name}</div>
                  <div className="prd-card-sub">{f.key}</div>
                </div>
                <div className="prd-card-body">
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.overallRisk')}</span><Pill color={f.overall_risk === 'High' ? '#ef4444' : f.overall_risk === 'Medium' ? '#f59e0b' : '#22c55e'}>{f.overall_risk}</Pill></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.pondsWithReports')}</span><span>{f.ponds}</span></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.totalReports')}</span><span>{farmReportsCount[f.key] || 0}</span></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.reviewedReports')}</span><span>{farmReviewedCount[f.key] || 0} / {(farmReportsCount[f.key] || 0)}</span></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.counts')}</span><span>
                    <Pill color="#ef4444">{t('piscaRiskData.farmData.high')}: {f.counts?.high || 0}</Pill>
                    <Pill color="#f59e0b">{t('piscaRiskData.farmData.medium')}: {f.counts?.medium || 0}</Pill>
                    <Pill color="#eab308">{t('piscaRiskData.farmData.low')}: {f.counts?.low || 0}</Pill>
                    <Pill color="#86efac">{t('piscaRiskData.farmData.normal')}: {f.counts?.normal || 0}</Pill>
                  </span></div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t('piscaRiskData.sections.weather.title')} description={t('piscaRiskData.sections.weather.description')}>
          {weather ? (
            <div className="prd-weather">
              <div className="prd-row"><span>{t('piscaRiskData.weatherData.location')}</span><strong>{weather.locationName || '—'}</strong></div>
              <div className="prd-row"><span>{t('piscaRiskData.weatherData.condition')}</span><strong>{weather.weather?.[0]?.description || '—'}</strong></div>
              <div className="prd-row"><span>{t('piscaRiskData.weatherData.temperature')}</span><strong>{typeof weather.main?.temp === 'number' ? `${Math.round(weather.main.temp)}°C` : '—'}</strong></div>
              <div className="prd-row"><span>{t('piscaRiskData.weatherData.humidity')}</span><strong>{typeof weather.main?.humidity === 'number' ? `${weather.main.humidity}%` : '—'}</strong></div>
              <div className="prd-row"><span>{t('piscaRiskData.weatherData.wind')}</span><strong>{typeof weather.wind?.speed === 'number' ? `${weather.wind.speed} m/s` : '—'}</strong></div>
              <div className="prd-row"><span>{t('piscaRiskData.weatherData.asOf')}</span><strong>{new Date().toLocaleString()}</strong></div>
            </div>
          ) : (
            <div className="prd-loading">{t('piscaRiskData.weatherData.noData')}</div>
          )}
        </Section>

        <Section title={t('piscaRiskData.sections.chartData.title')} description={t('piscaRiskData.sections.chartData.description')}>
          <div className="prd-aggregates">
            {farms.map(f => (
              <div key={f.key} className="prd-card">
                <div className="prd-card-header">
                  <div className="prd-card-title">{f.name}</div>
                </div>
                <div className="prd-card-body">
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.high')}</span><strong>{f.counts?.high || 0}</strong></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.medium')}</span><strong>{f.counts?.medium || 0}</strong></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.low')}</span><strong>{f.counts?.low || 0}</strong></div>
                  <div className="prd-row"><span>{t('piscaRiskData.farmData.normal')}</span><strong>{f.counts?.normal || 0}</strong></div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t('piscaRiskData.sections.predictions.title')} description={t('piscaRiskData.sections.predictions.description')}>
          <div className="prd-table">
            <div className="prd-thead">
              <div>{t('piscaRiskData.predictionsTable.farm')}</div>
              <div>{t('piscaRiskData.predictionsTable.pond')}</div>
              <div>{t('piscaRiskData.predictionsTable.risk')}</div>
              <div>{t('piscaRiskData.predictionsTable.timestamp')}</div>
            </div>
            <div className="prd-tbody">
              {pageItems.map((p) => (
                <div className="prd-rowline" key={`${p.farm_key}-${p.fish_pond}-${p.id}`}>
                  <div>{p.farm || p.farm_name}</div>
                  <div>{p.fish_pond || '—'}</div>
                  <div>
                    <Pill color={p.risk_level === 'High' ? '#ef4444' : p.risk_level === 'Medium' ? '#f59e0b' : '#22c55e'}>{p.risk_level || 'Normal'}</Pill>
                  </div>
                  <div>{p.timestamp ? (new Date(typeof p.timestamp === 'number' ? p.timestamp : (p.timestamp?.seconds ? p.timestamp.seconds * 1000 : Date.parse(p.timestamp) || Date.now()))).toLocaleString() : '—'}</div>
                </div>
              ))}
            </div>
            <div className="prd-pagination">
              <button disabled={page <= 1} onClick={() => {
                const newPage = Math.max(1, page - 1);
                setPage(newPage);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('navigation', `Pagination: moved to page ${newPage} in PiscaRisk data`, u); 
                } catch (_) {}
              }}>{t('piscaRiskData.pagination.prev')}</button>
              <span>{t('piscaRiskData.pagination.page', { current: page, total: totalPages })}</span>
              <button disabled={page >= totalPages} onClick={() => {
                const newPage = Math.min(totalPages, page + 1);
                setPage(newPage);
                try { 
                  const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                  logActivity('navigation', `Pagination: moved to page ${newPage} in PiscaRisk data`, u); 
                } catch (_) {}
              }}>{t('piscaRiskData.pagination.next')}</button>
            </div>
          </div>
        </Section>

        <Section title={t('piscaRiskData.sections.summary.title')} description={t('piscaRiskData.sections.summary.description')}>
          <div className="prd-summary">
            <div className="prd-summary-item"><span>{t('piscaRiskData.summaryData.totalFarms')}</span><strong>{farms.length}</strong></div>
            <div className="prd-summary-item"><span>{t('piscaRiskData.summaryData.totalPonds')}</span><strong>{allPonds.length}</strong></div>
            <div className="prd-summary-item"><span>{t('piscaRiskData.summaryData.asOf')}</span><strong>{new Date().toLocaleString()}</strong></div>
          </div>
        </Section>
      </div>
    </div>
  );
};

export default PiscaRiskData;


