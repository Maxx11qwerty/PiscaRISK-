import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaBell } from 'react-icons/fa';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import './ConditionInsights.css';

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
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const timerRef = useRef(null);
  const isSuperAdmin = (userRole || '').toLowerCase() === 'superadmin' || (userRole || '').toLowerCase() === 'super admin';

  // Fetch condition summaries from risk_predictions
  useEffect(() => {
    (async () => {
      try {
        const col = collection(db, 'risk_predictions');
        let constraints = [];
        if (assignedFarm && !isSuperAdmin) {
          constraints.push(where('farm_name', '==', assignedFarm));
        }
        const snap = await getDocs(constraints.length ? query(col, ...constraints) : query(col));
        const list = [];
        snap.forEach((doc) => {
          const data = doc.data();
          const summary = data.conditions_summary || data.input_data?.conditions_summary;
          if (!summary) return;
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

        setItems(deduped);
        if (typeof onCountChange === 'function') onCountChange(deduped.length);
        setIndex(0);
      } catch (e) {
        setItems([]);
      }
    })();
  }, [assignedFarm, isSuperAdmin, onCountChange]);

  // Auto-rotate
  useEffect(() => {
    if (!enableRotate || items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, autoRotateMs);
    return () => clearInterval(timerRef.current);
  }, [items.length, autoRotateMs, enableRotate]);

  const [selectedFarm, setSelectedFarm] = useState('all');
  const farmOptions = useMemo(() => {
    if (!isSuperAdmin) return [];
    const setFarms = new Set(items.map(it => it.farm).filter(Boolean));
    return ['all', ...Array.from(setFarms)];
  }, [items, isSuperAdmin]);

  const filtered = useMemo(() => {
    if (!isSuperAdmin || selectedFarm === 'all') return items;
    return items.filter(it => it.farm === selectedFarm);
  }, [items, isSuperAdmin, selectedFarm]);

  useEffect(() => {
    // Reset index when filter changes
    setIndex(0);
  }, [selectedFarm]);

  const current = filtered[index] || null;
  const total = filtered.length;

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
          <span className="ci-title">Condition Insights</span>
        </div>
        {isSuperAdmin && farmOptions.length > 1 && (
          <select className="ci-farm-filter" value={selectedFarm} onChange={(e) => setSelectedFarm(e.target.value)}>
            {farmOptions.map((op) => (
              <option key={op} value={op}>{op === 'all' ? 'All Farms' : op}</option>
            ))}
          </select>
        )}
      </div>

      {current ? (
        <div 
          className={`ci-card ci-${getSeverity(current.summary).level.toLowerCase()} ci-clickable`}
          onClick={() => handleCardClick(current)}
        >
          <div className="ci-severity">
            <span className="ci-sev-emoji">{getSeverity(current.summary).emoji}</span>
            <span className="ci-sev-chip">{getSeverity(current.summary).level} Risk</span>
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
        <div className="ci-empty">No condition summaries available.</div>
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
                <span className="ci-modal-chip">{getSeverity(selectedItem.summary).level} Risk</span>
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

    </div>
  );
};

export default ConditionInsights;


