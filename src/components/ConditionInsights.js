import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaBell } from 'react-icons/fa';
import { GiHamburgerMenu } from 'react-icons/gi';
import { exportConditionInsightsCSV, exportConditionInsightsPDF } from '../utils/exportConditionInsights';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import './ConditionInsights.css';
import { useAuth } from '../contexts/AuthContext';
import { useFarms } from '../contexts/FarmsContext';
import { logActivity, logMessages } from '../utils/logger';
import { useTranslation } from 'react-i18next';

// Map severity label to gauge-style colors
const severityColor = (level) => {
  const l = (level || '').toLowerCase();
  if (l.includes('critical') || l.includes('high')) return '#e74c3c'; // CRITICAL
  if (l.includes('elevated') || l.includes('medium')) return '#f1c40f'; // CAUTION
  return '#2ecc71'; // GOOD / Normal
};

// Severity helpers
const getSeverity = (text) => {
  if (!text || typeof text !== 'string') return { level: 'Normal', emoji: '🟢' };
  const s = text.toLowerCase();
  if (s.includes('critical') || s.includes('high')) return { level: 'Critical', emoji: '🔴' };
  if (s.includes('elevated') || s.includes('medium')) return { level: 'Elevated', emoji: '🟠' };
  return { level: 'Normal', emoji: '🟢' };
};

const severityRank = (level) => {
  const l = (level || '').toLowerCase();
  if (l.includes('critical') || l.includes('high')) return 2;
  if (l.includes('elevated') || l.includes('medium')) return 1;
  return 0; // Normal / Low / Healthy
};

const getMillis = (ts) => {
  if (!ts) return 0;
  if (ts.seconds) return ts.seconds * 1000;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  if (ts instanceof Date) return ts.getTime();
  return 0;
};

const ConditionInsights = ({ userRole, assignedFarm = null, autoRotateMs = 6000, enableRotate = true, onCountChange }) => {
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const { farmsNameByKey } = useFarms();
  const [index, setIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const timerRef = useRef(null);
  const isSuperAdmin = (userRole || '').toLowerCase() === 'superadmin' || (userRole || '').toLowerCase() === 'super admin';
  const [showHistory, setShowHistory] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [isCompactView, setIsCompactView] = useState(false);
  
  // History filter states
  const [historyFilter, setHistoryFilter] = useState({
    severity: 'all', // 'all', 'critical', 'elevated', 'normal'
    dateRange: 'all', // 'all', 'today', 'week', 'month'
    farm: 'all', // 'all' or specific farm name
    searchTerm: ''
  });
  
  // Check if user is assigned to a farm
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const effectiveAssignedFarm = isAssignedToFarm ? currentUser.farm : assignedFarm;

  // Detect screen size for compact view
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      const shouldBeCompact = width < 1600; // Lowered threshold for easier testing
      setIsCompactView(shouldBeCompact);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Resolve assigned farm name
  useEffect(() => {
    const resolveAssignedFarmName = async () => {
      if (isAssignedToFarm && currentUser.farm) {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          if (farmDoc.exists()) {
            setAssignedFarmName(farmDoc.data().name || currentUser.farm);
          } else {
            setAssignedFarmName(currentUser.farm);
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.error('Error resolving farm name:', error);
          }
          setAssignedFarmName(currentUser.farm);
        }
      }
    };
    resolveAssignedFarmName();
  }, [isAssignedToFarm, currentUser?.farm]);

  // Clear items and reset state when component mounts or user changes
  useEffect(() => {
    setItems([]);
    setIndex(0);
    setIsLoading(true);
    setLastFetchTime(0);
  }, [effectiveAssignedFarm, currentUser?.farm]);

  // Fetch condition summaries from risk_predictions
  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        setIndex(0); // Reset index when starting to load
        const col = collection(db, 'risk_predictions');
        
        // Always fetch all data first, then filter client-side for debugging
        const snap = await getDocs(query(col));
        
        const list = [];
        const legacyMap = {
          'salmon-hatchery-facility': 'Aquino Fish Farm',
          'tilapia-production-center': "Vergara's Aqua Farm",
          'blue-ocean-aquafarm': 'Maningas Fish Farm',
          'marine-species-cultivation': 'Labay Fish Farm',
        };
        const canonName = (raw) => {
          const key = (raw || '').toString().trim().toLowerCase().replace(/\s+/g, '-');
          const live = farmsNameByKey[key];
          const legacy = legacyMap[key];
          let name = live || legacy || raw || '';
          return name;
        };
        snap.forEach((doc) => {
          const data = doc.data();
          const summary = data.conditions_summary || data.input_data?.conditions_summary;
          if (!summary) {
            return;
          }
          const rawFarm = data.farm_name || data.farm || data.input_data?.farm_name || 'Unknown Farm';
          const farm = canonName(rawFarm);
          
          // Skip Rojo Hatchery and Freshwater Finfish Farm data
          if (farm === 'Rojo Hatchery' || 
              rawFarm === 'Rojo Hatchery' ||
              farm === 'Freshwater Finfish Farm' ||
              rawFarm === 'Freshwater Finfish Farm' ||
              rawFarm?.toLowerCase().includes('freshwater finfish')) return;
          
          const pond = data.fish_pond || data.input_data?.fish_pond || 'Unknown Pond';
          const ts = data.createdAt || data.timestamp || data.input_data?.timestamp;
          list.push({
            id: doc.id,
            farm,
            pond,
            summary: typeof summary === 'string' ? summary : JSON.stringify(summary),
            timestamp: ts,
          });
        });
        

        // Deduplicate entries with same farm+pond+summary, keep latest timestamp
        const normalize = (v) => (v || '').toString().trim().toLowerCase();
        const bestByKey = new Map();
        list.forEach((it) => {
          const key = `${normalize(it.farm)}|${normalize(it.pond)}|${normalize(it.summary)}`;
          const cur = bestByKey.get(key);
          if (!cur) {
            bestByKey.set(key, it);
          } else {
            const curMs = getMillis(cur.timestamp);
            const newMs = getMillis(it.timestamp);
            if (newMs >= curMs) bestByKey.set(key, it);
          }
        });
        const deduped = Array.from(bestByKey.values());

        // Sort: newest first, then severity Critical > Elevated > Normal
        deduped.sort((a, b) => {
          const t = getMillis(b.timestamp) - getMillis(a.timestamp);
          if (t !== 0) return t;
          return severityRank(getSeverity(b.summary).level) - severityRank(getSeverity(a.summary).level);
        });

        // If user is assigned to a farm, filter client-side (regardless of admin status)
        let finalItems = deduped;
        
        if (isAssignedToFarm && effectiveAssignedFarm) {
          // Filter by assigned farm for assigned users
          finalItems = deduped.filter(item => {
            const farmMatch = item.farm === effectiveAssignedFarm || 
                            item.farm === assignedFarmName ||
                            item.farm === currentUser.farm ||
                            item.farm?.toLowerCase() === effectiveAssignedFarm?.toLowerCase() ||
                            item.farm?.toLowerCase() === assignedFarmName?.toLowerCase() ||
                            item.farm?.toLowerCase() === currentUser.farm?.toLowerCase();
            
            const isRisk = item.summary?.toLowerCase().includes('risk') || 
                          item.summary?.toLowerCase().includes('alert') ||
                          item.summary?.toLowerCase().includes('warning') ||
                          item.summary?.toLowerCase().includes('critical') ||
                          item.summary?.toLowerCase().includes('danger') ||
                          item.summary?.toLowerCase().includes('problem') ||
                          item.summary?.toLowerCase().includes('issue') ||
                          item.summary?.toLowerCase().includes('concern');
            
            return farmMatch && isRisk;
          });
        } else {
          // Show all farms for tech officer
          finalItems = deduped.filter(item => {
            const isRisk = item.summary?.toLowerCase().includes('risk') || 
                          item.summary?.toLowerCase().includes('alert') ||
                          item.summary?.toLowerCase().includes('warning') ||
                          item.summary?.toLowerCase().includes('critical') ||
                          item.summary?.toLowerCase().includes('danger') ||
                          item.summary?.toLowerCase().includes('problem') ||
                          item.summary?.toLowerCase().includes('issue') ||
                          item.summary?.toLowerCase().includes('concern');
            
            return isRisk;
          });
        }
        

        // final items prepared
        setItems(finalItems.map(it => ({ ...it, farm: canonName(it.farm) })));
        // onCountChange will be triggered by separate effect using active list
        setIndex(0);
        setLastFetchTime(Date.now());
        setIsLoading(false);
        // data fetch complete
      } catch (e) {
        // silent error in production
        setItems([]);
        setLastFetchTime(0);
        setIsLoading(false);
      }
    })();
  }, [effectiveAssignedFarm, isSuperAdmin, onCountChange, isAssignedToFarm, assignedFarmName, currentUser?.farm]);

  // Show only recent items (within 24 hours) that have risk-related content
  const displayItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    return items.filter(item => {
      // Check if item is recent (within 24 hours)
      const ageMs = Math.max(0, now - getMillis(item.timestamp));
      const isRecent = ageMs <= dayMs;
      
      // Check if item has risk-related content
      const isRisk = item.summary?.toLowerCase().includes('risk') || 
                    item.summary?.toLowerCase().includes('alert') ||
                    item.summary?.toLowerCase().includes('warning') ||
                    item.summary?.toLowerCase().includes('critical') ||
                    item.summary?.toLowerCase().includes('danger') ||
                    item.summary?.toLowerCase().includes('problem') ||
                    item.summary?.toLowerCase().includes('issue') ||
                    item.summary?.toLowerCase().includes('concern');
      
      return isRecent && isRisk;
    });
  }, [items]);

  // Auto-rotate
  useEffect(() => {
    if (!enableRotate || displayItems.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % displayItems.length);
    }, autoRotateMs);
    return () => clearInterval(timerRef.current);
  }, [displayItems.length, autoRotateMs, enableRotate]);

  const [exportOpen, setExportOpen] = useState(false);

  // Get available farms for history filter (for all users)
  const historyFarmOptions = useMemo(() => {
    const setFarms = new Set(items.map(it => it.farm).filter(Boolean));
    return ['all', ...Array.from(setFarms).sort()];
  }, [items]);

  // Define active items: within 24h and severity > Normal
  const activeItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    return displayItems.filter(item => {
      const ageMs = Math.max(0, now - getMillis(item.timestamp));
      const isRecent = ageMs <= dayMs;
      const severity = getSeverity(item.summary).level;
      const isHighSeverity = severityRank(severity) > 0; // Critical or Elevated
      
      return isRecent && isHighSeverity;
    });
  }, [displayItems]);

  // Push active count up when it changes
  useEffect(() => {
    if (typeof onCountChange === 'function') onCountChange(activeItems.length);
  }, [activeItems.length, onCountChange]);

  // Use activeItems directly without farm filtering
  const filtered = activeItems;


  // If no active items found, show resolved items (older than 24h)
  const resolvedItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    return displayItems.filter(item => {
      const ageMs = Math.max(0, now - getMillis(item.timestamp));
      const isOld = ageMs > dayMs;
      const severity = getSeverity(item.summary).level;
      const isHighSeverity = severityRank(severity) > 0; // Critical or Elevated
      
      return isOld && isHighSeverity;
    });
  }, [displayItems]);
  
  const current = displayItems.length > 0 ? displayItems[index] : null;
  
  const total = displayItems.length;

  // Reset index when displayItems changes to ensure continuous cycling
  useEffect(() => {
    if (displayItems.length > 0 && index >= displayItems.length) {
      setIndex(0);
    }
  }, [displayItems.length, index]);

  
 

  const handlePrev = () => {
    if (total <= 1) return;
    setIndex((prev) => (prev - 1 + total) % total);
  };
  const handleNext = () => {
    if (total <= 1) return;
    setIndex((prev) => (prev + 1) % total);
  };

  const handleCardClick = (item) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedItem(null);
  };

  return (
    <div className="condition-insights">
      <div className="ci-header">
        <div className="ci-header-left">
          <FaBell className="ci-icon" />
          <span className="ci-title">
            {t('conditionInsights.title')}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => {
              const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
              if (!isTemporaryTechOfficer) {
                setExportOpen(v => !v);
              }
            }}
            disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? '#9ca3af' : 'white', 
              cursor: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'not-allowed' : 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              opacity: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 0.5 : 1
            }}
            aria-label={t('conditionInsights.export')}
            title={(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? "Export unavailable for temporary accounts" : t('conditionInsights.export')}
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && !(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
            <div style={{ position: 'absolute', right: 0, top: 26, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 240, overflow: 'hidden', zIndex: 5 }}>
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => { setShowHistory(true); setExportOpen(false); }}
              >
                {t('conditionInsights.viewHistory')}
              </button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  exportConditionInsightsCSV(filtered, 'condition_insights.csv');
                  try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'condition insights data'), u); } catch (_) {}
                  setExportOpen(false);
                }}
              >
                {t('conditionInsights.exportCSV')}
              </button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  exportConditionInsightsPDF(filtered, 'condition_insights.pdf');
                  try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.pdfDownload(u, 'condition insights data'), u); } catch (_) {}
                  setExportOpen(false);
                }}
              >
                {t('conditionInsights.exportPDF')}
              </button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.7)', 
          fontSize: '0.9rem',
          padding: '20px',
          fontStyle: 'italic'
        }}>
          {t('conditionInsights.loading')}
        </div>
      ) : current ? (
        <div 
          className={`ci-card ci-${getSeverity(current.summary).level.toLowerCase()} ci-clickable ${isCompactView ? 'ci-compact' : ''}`}
          onClick={() => handleCardClick(current)}
        >
          <div className="ci-severity">
            <span className="ci-sev-emoji">{getSeverity(current.summary).emoji}</span>
            <span className="ci-sev-chip" style={{ color: severityColor(getSeverity(current.summary).level) }}>
              {t(`conditionInsights.severity.${getSeverity(current.summary).level.toLowerCase()}`)} {t('conditionInsights.risk')}
              {(() => {
                const now = Date.now();
                const dayMs = 24 * 60 * 60 * 1000;
                const ageMs = Math.max(0, now - getMillis(current.timestamp));
                const isOld = ageMs > dayMs;
                return isOld ? ` (${t('conditionInsights.resolved')})` : '';
              })()}
            </span>
          </div>
          <div className="ci-meta">{current.pond} @ {current.farm}</div>
          {isCompactView ? (
            <div className="ci-time-meta">
              {current.timestamp ? new Date(getMillis(current.timestamp)).toLocaleString() : t('conditionInsights.unknownTime')}
            </div>
          ) : (
            <div className="ci-message" title={current.summary}>{current.summary}</div>
          )}

          <div className="ci-pagination">
            <button className="ci-nav ci-nav-prev" onClick={(e) => { e.stopPropagation(); handlePrev(); }} disabled={total <= 1}>◀ {t('conditionInsights.prev')}</button>
            <span className="ci-index">{Math.min(index + 1, total)}/{total || 0}</span>
            <button className="ci-nav ci-nav-next" onClick={(e) => { e.stopPropagation(); handleNext(); }} disabled={total <= 1}>{t('conditionInsights.next')} ▶</button>
          </div>
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.7)', 
          fontSize: '0.9rem',
          padding: '20px',
          fontStyle: 'italic'
        }}>
          {isAssignedToFarm 
            ? t('conditionInsights.noRecentAssigned', { farm: assignedFarmName || currentUser.farm })
            : t('conditionInsights.noRecentGlobal')
          }
          <div style={{ marginTop: '8px', fontSize: '0.8rem' }}>
            {t('conditionInsights.clickMenuToViewHistory')}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedItem && (
        <div className="ci-modal-overlay" onClick={closeModal}>
          <div className="ci-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ci-modal-header">
              <h3>{t('conditionInsights.detailsTitle')}</h3>
              <button className="ci-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="ci-modal-content">
              <div className="ci-modal-severity">
                <span className="ci-modal-emoji">{getSeverity(selectedItem.summary).emoji}</span>
                <span className="ci-modal-chip" style={{ color: severityColor(getSeverity(selectedItem.summary).level) }}>
                  {t(`conditionInsights.severity.${getSeverity(selectedItem.summary).level.toLowerCase()}`)} {t('conditionInsights.risk')}
                </span>
              </div>
              <div className="ci-modal-meta">
                <div><strong>{t('conditionInsights.farm')}:</strong> {selectedItem.farm}</div>
                <div><strong>{t('conditionInsights.pond')}:</strong> {selectedItem.pond}</div>
                <div><strong>{t('conditionInsights.timestamp')}:</strong> {selectedItem.timestamp ? new Date(getMillis(selectedItem.timestamp)).toLocaleString() : t('conditionInsights.unknown')}</div>
              </div>
              <div className="ci-modal-message">
                <strong>{t('conditionInsights.summary')}:</strong>
                <div className="ci-modal-summary">{selectedItem.summary}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="ci-modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="ci-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ci-modal-header">
              <h3>{t('conditionInsights.historyTitle')}</h3>
              <button className="ci-modal-close" onClick={() => setShowHistory(false)}>✕</button>
            </div>
            
            {/* Filter Controls */}
            <div className="ci-history-filters">
              <div className="ci-filter-row">
                <div className="ci-filter-group">
                  <label>{t('conditionInsights.filters.severity')}:</label>
                  <select 
                    value={historyFilter.severity} 
                    onChange={(e) => setHistoryFilter(prev => ({ ...prev, severity: e.target.value }))}
                    className="ci-filter-select"
                  >
                    <option value="all">{t('conditionInsights.filters.allSeverities')}</option>
                    <option value="critical">{t('conditionInsights.severity.critical')}</option>
                    <option value="elevated">{t('conditionInsights.severity.elevated')}</option>
                    <option value="normal">{t('conditionInsights.severity.normal')}</option>
                  </select>
                </div>
                
                <div className="ci-filter-group">
                  <label>{t('conditionInsights.filters.dateRange')}:</label>
                  <select 
                    value={historyFilter.dateRange} 
                    onChange={(e) => setHistoryFilter(prev => ({ ...prev, dateRange: e.target.value }))}
                    className="ci-filter-select"
                  >
                    <option value="all">{t('conditionInsights.filters.allTime')}</option>
                    <option value="today">{t('conditionInsights.filters.today')}</option>
                    <option value="week">{t('conditionInsights.filters.thisWeek')}</option>
                    <option value="month">{t('conditionInsights.filters.thisMonth')}</option>
                  </select>
                </div>
                
                <div className="ci-filter-group">
                  <label>{t('conditionInsights.farm')}:</label>
                  <select 
                    value={historyFilter.farm} 
                    onChange={(e) => setHistoryFilter(prev => ({ ...prev, farm: e.target.value }))}
                    className="ci-filter-select"
                  >
                    {historyFarmOptions.map(farm => (
                      <option key={farm} value={farm}>
                        {farm === 'all' ? t('conditionInsights.allFarms') : farm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="ci-filter-row">
                <div className="ci-filter-group ci-search-group">
                  <label>{t('conditionInsights.search')}:</label>
                  <input
                    type="text"
                    placeholder={t('conditionInsights.searchPlaceholder')}
                    value={historyFilter.searchTerm}
                    onChange={(e) => setHistoryFilter(prev => ({ ...prev, searchTerm: e.target.value }))}
                    className="ci-filter-search"
                  />
                </div>
                
                <button 
                  onClick={() => setHistoryFilter({ severity: 'all', dateRange: 'all', farm: 'all', searchTerm: '' })}
                  className="ci-clear-filters"
                >
                  {t('conditionInsights.clearFilters')}
                </button>
              </div>
            </div>
            <div className="ci-modal-content" style={{ maxHeight: 480, overflow: 'auto' }}>
              {(() => {
                // Build history list: show most recent first, mark Resolved if stale or Normal
                const now = Date.now();
                const dayMs = 24 * 60 * 60 * 1000;
                
                // For assigned users, show all items for their farm, not just filtered ones
                let historyItems = items;
                if (isAssignedToFarm) {
                  // Show all items for assigned farm, regardless of age or severity
                  historyItems = items.filter(item => {
                    const farmMatch = item.farm === effectiveAssignedFarm || 
                                    item.farm === assignedFarmName ||
                                    item.farm === currentUser.farm ||
                                    item.farm?.toLowerCase() === effectiveAssignedFarm?.toLowerCase() ||
                                    item.farm?.toLowerCase() === assignedFarmName?.toLowerCase() ||
                                    item.farm?.toLowerCase() === currentUser.farm?.toLowerCase();
                    return farmMatch;
                  });
                } else {
                  historyItems = items;
                }
                
                // Apply filters
                let filteredList = historyItems.filter(item => {
                  // Severity filter
                  if (historyFilter.severity !== 'all') {
                    const severity = getSeverity(item.summary).level.toLowerCase();
                    if (severity !== historyFilter.severity) return false;
                  }
                  
                  // Date range filter
                  if (historyFilter.dateRange !== 'all') {
                    const itemTime = getMillis(item.timestamp);
                    const now = Date.now();
                    const dayMs = 24 * 60 * 60 * 1000;
                    const weekMs = 7 * dayMs;
                    const monthMs = 30 * dayMs;
                    
                    const ageMs = now - itemTime;
                    
                    switch (historyFilter.dateRange) {
                      case 'today':
                        if (ageMs > dayMs) return false;
                        break;
                      case 'week':
                        if (ageMs > weekMs) return false;
                        break;
                      case 'month':
                        if (ageMs > monthMs) return false;
                        break;
                    }
                  }
                  
                  // Farm filter
                  if (historyFilter.farm !== 'all') {
                    const itemFarm = (item.farm || '').toLowerCase();
                    const filterFarm = historyFilter.farm.toLowerCase();
                    if (itemFarm !== filterFarm) return false;
                  }
                  
                  // Search term filter
                  if (historyFilter.searchTerm.trim()) {
                    const searchLower = historyFilter.searchTerm.toLowerCase();
                    const summaryLower = (item.summary || '').toLowerCase();
                    const farmLower = (item.farm || '').toLowerCase();
                    const pondLower = (item.pond || '').toLowerCase();
                    
                    if (!summaryLower.includes(searchLower) && 
                        !farmLower.includes(searchLower) && 
                        !pondLower.includes(searchLower)) {
                      return false;
                    }
                  }
                  
                  return true;
                });
                
                const list = filteredList
                  .slice()
                  .sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
                
                if (list.length === 0) {
                  const hasFilters = historyFilter.severity !== 'all' || 
                                   historyFilter.dateRange !== 'all' || 
                                   historyFilter.farm !== 'all' ||
                                   historyFilter.searchTerm.trim();
                  return (
                    <div className="ci-empty" style={{ margin: 0 }}>
                      {hasFilters ? t('conditionInsights.noItemsForFilters') : t('conditionInsights.noHistory')}
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {list.map((it) => {
                      const sev = getSeverity(it.summary).level;
                      const ageMs = Math.max(0, now - getMillis(it.timestamp));
                      const isStale = ageMs > dayMs;
                      const isResolved = isStale || severityRank(sev) === 0;
                      return (
                        <div key={`${it.id}`} className={`ci-card ci-${(sev || 'Normal').toLowerCase()}`} style={{ cursor: 'default' }}>
                          <div className="ci-severity">
                            <span className="ci-sev-emoji">{getSeverity(it.summary).emoji}</span>
                            <span className="ci-sev-chip">{t(`conditionInsights.severity.${(sev || 'normal').toLowerCase()}`)} {isResolved ? `(${t('conditionInsights.resolved')})` : ''}</span>
                          </div>
                          <div className="ci-meta">{it.pond} @ {it.farm} — {new Date(getMillis(it.timestamp)).toLocaleString()}</div>
                          <div className="ci-message" title={it.summary}>{it.summary}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ConditionInsights;


