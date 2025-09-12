import { useEffect, useMemo, useState, useContext } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';
import { GiDoubleFish } from 'react-icons/gi';
import { FaInfoCircle, FaChartBar } from 'react-icons/fa';
import { FaFish } from 'react-icons/fa6';
import { IoWater } from 'react-icons/io5';
import { RiInfoCardFill } from 'react-icons/ri';

const toDate = (ts) => {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

const formatDateTime = (ts) => {
  const d = toDate(ts);
  return d ? d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
};

const SectionTitle = ({ icon, title }) => (
  <div style={{ fontWeight: 700, margin: '12px 0 8px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
    <span>{icon}</span>
    <span>{title}</span>
  </div>
);

const Row = ({ label, value }) => (
  <div className="meta-item">
    <span className="meta-label">{label}</span>
    <span className="meta-value">{value ?? '—'}</span>
  </div>
);

const buildUserIndex = (users) => {
  const idx = new Map();
  users.forEach(u => {
    const keys = [u.email, u.user_email, u.username]
      .filter(Boolean)
      .map(v => String(v).toLowerCase());
    keys.forEach(k => idx.set(k, u));
  });
  return idx;
};

const findUserForLog = (log, idx) => {
  const candidates = [log.user_email, log.email, log.submitted_by]
    .filter(Boolean)
    .map(v => String(v).toLowerCase());
  for (const key of candidates) {
    if (idx.has(key)) return idx.get(key);
  }
  return null;
};

const StockFeedLogs = ({ farmId, farmName }) => {
  const { currentUser } = useContext(AuthContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [logsSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'farmerLogs')),
          getDocs(collection(db, 'mobileUsers'))
        ]);

        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const idx = buildUserIndex(users);

        const rawLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const withUser = rawLogs.map(l => {
          const matchedUser = findUserForLog(l, idx);
          return { ...l, _matchedUser: matchedUser, _farm: matchedUser?.farm || l.farmId || l.farm };
        });

        // Filter by role
        const role = String(currentUser?.role || '').toLowerCase();
        const userFarm = currentUser?.farm;
        const filteredByRole = withUser.filter(l => {
          if (role === 'super_admin' || role === 'superadmin' || role === 'super admin') return true;
          if (!userFarm) return true; // fallback: if no farm, show all
          return (l._farm && l._farm === userFarm);
        });

        // Additionally, when a farm panel opens the modal, constrain to that farm
        const filtered = filteredByRole.filter(l => {
          if (!farmId && !farmName) return true;
          const f = l._farm || l.farmId || l.farm || '';
          // match by id or by name string if available
          return (f === farmId) || (farmName && (String(f).toLowerCase() === String(farmName).toLowerCase()));
        });

        // Sort latest first
        filtered.sort((a, b) => {
          const da = toDate(a.timestamp)?.getTime() || 0;
          const dbt = toDate(b.timestamp)?.getTime() || 0;
          return dbt - da;
        });

        setLogs(filtered);
        setSelectedIndex(0);
      } catch (e) {
        setError('Failed to load farmer logs');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.role, currentUser?.farm]);

  const selectedLog = useMemo(() => logs[selectedIndex] || null, [logs, selectedIndex]);

  if (loading) return <div>Loading farmer logs...</div>;
  if (error) return <div style={{ color: '#dc3545' }}>{error}</div>;
  if (!logs.length) return <div>No farmer logs found.</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Latest Logs</strong>
        <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))} className="filter-select">
          {logs.map((l, i) => (
            <option key={l.id} value={i}>
              {formatDateTime(l.timestamp)} — {l.fish_pond || 'Pond'}
            </option>
          ))}
        </select>
      </div>

      {selectedLog && (
        <div className="report-detail-card" style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div className="report-header" style={{ marginBottom: 8 }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <GiDoubleFish />
              Farmer Logs - {selectedLog.fish_pond || '—'}
            </h4>
            <span className="report-date">{formatDateTime(selectedLog.timestamp)}</span>
          </div>

          <SectionTitle icon={<FaInfoCircle />} title="Fish Info" />
          <div className="condition-grid">
            <Row label="Pond" value={selectedLog.fish_pond} />
            <Row label="Fish Type" value={selectedLog.fish_type} />
            <Row label="Age" value={selectedLog.age != null ? `${selectedLog.age} days` : null} />
            <Row label="Size" value={selectedLog.size != null ? `${selectedLog.size} g` : null} />
            <Row label="Count" value={selectedLog.fish_count != null ? `${selectedLog.fish_count}` : null} />
            <Row label="Pond Size" value={selectedLog.pond_size ? `${selectedLog.pond_size} m²` : null} />
          </div>

          <SectionTitle icon={<FaChartBar />} title="Estimates" />
          <div className="condition-grid">
            <Row label="Days to Harvest" value={selectedLog.estimated_days_to_harvest != null ? `${selectedLog.estimated_days_to_harvest} days` : null} />
            <Row label="Est. Weight" value={selectedLog.estimated_harvest_weight != null ? `${selectedLog.estimated_harvest_weight}` : null} />
            <Row label="Est. Value" value={selectedLog.estimated_value != null ? `₱${selectedLog.estimated_value}` : null} />
            <Row label="Est. Profit" value={selectedLog.estimated_profit != null ? `₱${selectedLog.estimated_profit}` : null} />
          </div>

          <SectionTitle icon={<FaFish />} title="Feeding Info" />
          <div className="condition-grid">
            <Row label="Brand" value={selectedLog.feed_brand} />
            <Row label="Amount" value={selectedLog.feed_amount != null ? `${selectedLog.feed_amount}` : null} />
            <Row label="Cost" value={selectedLog.feed_cost != null ? `₱${selectedLog.feed_cost}` : null} />
            <Row label="Frequency" value={selectedLog.frequency != null ? `${selectedLog.frequency}` : null} />
          </div>

          <SectionTitle icon={<IoWater />} title="Environment" />
          <div className="condition-grid">
            <Row label="pH Level" value={selectedLog.ph_level != null ? selectedLog.ph_level : 'No Data'} />
            <Row label="Water Temp" value={selectedLog.water_temp != null ? selectedLog.water_temp : 'No Data'} />
          </div>

          <SectionTitle icon={<RiInfoCardFill />} title="Submitted Info" />
          <div className="report-meta">
            <Row label="Submitted by" value={selectedLog.submitted_by || selectedLog.username || '—'} />
            <Row label="Contact" value={selectedLog.user_contact || selectedLog.contact || '—'} />
            <Row label="Email" value={selectedLog.user_email || selectedLog.email || '—'} />
            <Row label="Farm" value={selectedLog._farm || '—'} />
            <Row label="Date" value={formatDateTime(selectedLog.timestamp)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default StockFeedLogs;


