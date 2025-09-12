import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaBell } from 'react-icons/fa';
import { GiHamburgerMenu } from 'react-icons/gi';
import { exportConditionInsightsCSV, exportConditionInsightsPDF } from '../utils/exportConditionInsights';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import './ConditionInsights.css';
import { useAuth } from '../contexts/AuthContext';
import { logActivity, logMessages } from '../utils/logger';

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
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const timerRef = useRef(null);
  const isSuperAdmin = (userRole || '').toLowerCase() === 'superadmin' || (userRole || '').toLowerCase() === 'super admin';
  const [showHistory, setShowHistory] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  
  // Check if user is assigned to a farm
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const effectiveAssignedFarm = isAssignedToFarm ? currentUser.farm : assignedFarm;

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
          console.error('Error resolving farm name:', error);
          setAssignedFarmName(currentUser.farm);
        }
      }
    };
    resolveAssignedFarmName();
  }, [isAssignedToFarm, currentUser?.farm]);

  // Fetch condition summaries from risk_predictions
  useEffect(() => {
    (async () => {
      try {
        const col = collection(db, 'risk_predictions');
        
        // Always fetch all data first, then filter client-side for debugging
        console.log('Fetching all data from risk_predictions collection...');
        const snap = await getDocs(query(col));
        console.log('ConditionInsights Debug:', {
          isAssignedToFarm,
          effectiveAssignedFarm,
          assignedFarmName,
          currentUserFarm: currentUser?.farm,
          totalDocs: snap.docs.length,
          firstDoc: snap.docs[0]?.data(),
          collectionName: 'risk_predictions'
        });
        
        const list = [];
        snap.forEach((doc) => {
          const data = doc.data();
          const summary = data.conditions_summary || data.input_data?.conditions_summary;
          if (!summary) {
            console.log('Doc without summary:', doc.id, data);
            return;
          }
          const farm = data.farm_name || data.farm || data.input_data?.farm_name || 'Unknown Farm';
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
        
        console.log('Raw condition insights found:', list.length);
        console.log('Sample insights:', list.slice(0, 3));
        console.log('All farms in data:', [...new Set(list.map(item => item.farm))]);

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
                            item.farm?.toLowerCase() === currentUser.farm?.toLowerCase() ||
                            item.farm?.includes('Salmon') ||
                            item.farm?.includes('salmon');
            
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
          // Show all farms for super admin
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
        
        console.log(`ConditionInsights: ${deduped.length} total items, ${finalItems.length} final items`);

        setItems(finalItems);
        // onCountChange will be triggered by separate effect using active list
        setIndex(0);
      } catch (e) {
        setItems([]);
      }
    })();
  }, [effectiveAssignedFarm, isSuperAdmin, onCountChange, isAssignedToFarm, assignedFarmName, currentUser?.farm]);

  // Auto-rotate
  useEffect(() => {
    if (!enableRotate || items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, autoRotateMs);
    return () => clearInterval(timerRef.current);
  }, [items.length, autoRotateMs, enableRotate]);

  const [selectedFarm, setSelectedFarm] = useState('all');
  const [exportOpen, setExportOpen] = useState(false);
  const farmOptions = useMemo(() => {
    if (!isSuperAdmin) return [];
    const setFarms = new Set(items.map(it => it.farm).filter(Boolean));
    return ['all', ...Array.from(setFarms)];
  }, [items, isSuperAdmin]);

  // Define active items: within 24h and severity > Normal (temporarily disabled age filter for debugging)
  const activeItems = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const filtered = items.filter(it => {
      const sev = getSeverity(it.summary).level;
      const ageMs = Math.max(0, now - getMillis(it.timestamp));
      const isRecent = ageMs <= dayMs;
      const isRisk = severityRank(sev) > 0; // Elevated or Critical
      
      // Temporarily show all items with risk, regardless of age, for debugging
      return isRisk; // || isRecent; // Commented out age filter temporarily
    });
    
    console.log('Active items filtering:', {
      totalItems: items.length,
      activeItems: filtered.length,
      sampleItems: items.slice(0, 3).map(it => ({
        farm: it.farm,
        summary: it.summary.substring(0, 50) + '...',
        severity: getSeverity(it.summary).level,
        age: Math.max(0, now - getMillis(it.timestamp)) / (60 * 60 * 1000) // hours
      }))
    });
    
    return filtered;
  }, [items]);

  // Push active count up when it changes
  useEffect(() => {
    if (typeof onCountChange === 'function') onCountChange(activeItems.length);
  }, [activeItems.length, onCountChange]);

  // Apply farm filter on active list for display
  const filtered = useMemo(() => {
    const base = activeItems;
    if (!isSuperAdmin || selectedFarm === 'all') {
      console.log('Final filtered results:', {
        isSuperAdmin,
        selectedFarm,
        activeItemsCount: base.length,
        finalCount: base.length,
        sampleResults: base.slice(0, 2).map(it => ({
          farm: it.farm,
          summary: it.summary.substring(0, 30) + '...',
          severity: getSeverity(it.summary).level
        }))
      });
      return base;
    }
    const farmFiltered = base.filter(it => it.farm === selectedFarm);
    console.log('Farm filtered results:', {
      selectedFarm,
      activeItemsCount: base.length,
      farmFilteredCount: farmFiltered.length
    });
    return farmFiltered;
  }, [activeItems, isSuperAdmin, selectedFarm]);

  useEffect(() => {
    // Reset index when filter changes
    setIndex(0);
  }, [selectedFarm]);

  // If no active items found, show all items for debugging
  const displayItems = filtered.length > 0 ? filtered : items.slice(0, 5); // Show first 5 items for debugging
  const current = displayItems[index] || null;
  const total = displayItems.length;
  
  console.log('Display state:', {
    filteredCount: filtered.length,
    displayItemsCount: displayItems.length,
    currentIndex: index,
    hasCurrent: !!current,
    currentFarm: current?.farm,
    currentSeverity: current ? getSeverity(current.summary).level : 'none'
  });

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
            Condition Insights
          </span>
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isSuperAdmin && farmOptions.length > 1 && (
            <select className="ci-farm-filter" value={selectedFarm} onChange={(e) => setSelectedFarm(e.target.value)}>
              {farmOptions.map((op) => (
                <option key={op} value={op}>{op === 'all' ? 'All Farms' : op}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setExportOpen(v => !v)}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            aria-label="Export"
            title="Export"
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 26, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 240, overflow: 'hidden', zIndex: 5 }}>
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => { setShowHistory(true); setExportOpen(false); }}
              >
                View History
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
                Export to CSV
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
                Export to PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {current ? (
        <div 
          className={`ci-card ci-${getSeverity(current.summary).level.toLowerCase()} ci-clickable`}
          onClick={() => handleCardClick(current)}
        >
          <div className="ci-severity">
            <span className="ci-sev-emoji">{getSeverity(current.summary).emoji}</span>
            <span className="ci-sev-chip" style={{ color: severityColor(getSeverity(current.summary).level) }}>
              {getSeverity(current.summary).level} Risk
            </span>
          </div>
          <div className="ci-meta">{current.pond} @ {current.farm}</div>
          <div className="ci-message" title={current.summary}>{current.summary}</div>

          <div className="ci-pagination">
            <button className="ci-nav ci-nav-prev" onClick={(e) => { e.stopPropagation(); handlePrev(); }} disabled={total <= 1}>◀ Prev</button>
            <span className="ci-index">{Math.min(index + 1, total)}/{total || 0}</span>
            <button className="ci-nav ci-nav-next" onClick={(e) => { e.stopPropagation(); handleNext(); }} disabled={total <= 1}>Next ▶</button>
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
            ? `No condition insights available for ${assignedFarmName || currentUser.farm}`
            : 'No condition insights available'
          }
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedItem && (
        <div className="ci-modal-overlay" onClick={closeModal}>
          <div className="ci-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ci-modal-header">
              <h3>Condition Details</h3>
              <button className="ci-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="ci-modal-content">
              <div className="ci-modal-severity">
                <span className="ci-modal-emoji">{getSeverity(selectedItem.summary).emoji}</span>
                <span className="ci-modal-chip" style={{ color: severityColor(getSeverity(selectedItem.summary).level) }}>
                  {getSeverity(selectedItem.summary).level} Risk
                </span>
              </div>
              <div className="ci-modal-meta">
                <div><strong>Farm:</strong> {selectedItem.farm}</div>
                <div><strong>Pond:</strong> {selectedItem.pond}</div>
                <div><strong>Timestamp:</strong> {selectedItem.timestamp ? new Date(getMillis(selectedItem.timestamp)).toLocaleString() : 'Unknown'}</div>
              </div>
              <div className="ci-modal-message">
                <strong>Summary:</strong>
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
              <h3>Condition Insights History</h3>
              <button className="ci-modal-close" onClick={() => setShowHistory(false)}>✕</button>
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
                                    item.farm?.toLowerCase() === currentUser.farm?.toLowerCase() ||
                                    item.farm?.includes('Salmon') ||
                                    item.farm?.includes('salmon');
                    return farmMatch;
                  });
                } else if (isSuperAdmin && selectedFarm !== 'all') {
                  historyItems = items.filter(it => it.farm === selectedFarm);
                }
                
                const list = historyItems
                  .slice()
                  .sort((a, b) => getMillis(b.timestamp) - getMillis(a.timestamp));
                  
                console.log('History items:', {
                  totalItems: items.length,
                  historyItems: list.length,
                  isAssignedToFarm,
                  effectiveAssignedFarm,
                  sampleFarms: list.slice(0, 3).map(item => item.farm)
                });
                
                if (list.length === 0) return <div className="ci-empty" style={{ margin: 0 }}>No history available.</div>;
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
                            <span className="ci-sev-chip">{sev} {isResolved ? '(Resolved)' : ''}</span>
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


