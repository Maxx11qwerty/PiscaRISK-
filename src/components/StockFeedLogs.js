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

const formatCurrency = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!isFinite(num)) return `₱${value}`;
  return `₱${num.toFixed(2)}`;
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
        const [logsSnap, usersSnap, farmsSnap] = await Promise.all([
          getDocs(collection(db, 'farmerLogs')),
          getDocs(collection(db, 'mobileUsers')),
          getDocs(collection(db, 'farms'))
        ]);
        const nestedLogsSnaps = await Promise.all(
          farmsSnap.docs.map(f => getDocs(collection(db, 'farms', f.id, 'farmerLogs')).then(s => ({ farmId: f.id, snap: s })))
        );

        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const idx = buildUserIndex(users);
        const farms = farmsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const farmIdToName = new Map(farms.map(f => [f.id, f.name]));
        const nameToFarmId = new Map(farms.map(f => [String(f.name || '').trim().toLowerCase(), f.id]));

        const rawLogs = [
          ...logsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          ...nestedLogsSnaps.flatMap(({ farmId, snap }) => snap.docs.map(d => ({ id: d.id, ...d.data(), _farm: farmId })))
        ].map(l => ({
          ...l,
          _farm: l._farm || l.farmId || l.farm,
          _farmName: l._farm ? (farmIdToName.get(l._farm) || l.farmName || l.farm) : (l.farmName || l.farm)
        }));
        const withUser = rawLogs.map(l => {
          const matchedUser = findUserForLog(l, idx);
          const inferredFarm = l._farm || (matchedUser?.farm ? (nameToFarmId.get(String(matchedUser.farm).trim().toLowerCase()) || matchedUser.farm) : (l.farmId || l.farm));
          const inferredFarmName = l._farmName || matchedUser?.farm || (farmIdToName.get(inferredFarm) || inferredFarm);
          return { ...l, _matchedUser: matchedUser, _farm: inferredFarm, _farmName: inferredFarmName };
        });

        // Filter by role
        const role = String(currentUser?.role || '').toLowerCase();
        const userFarm = currentUser?.farm ? String(currentUser.farm).trim() : '';
        const filteredByRole = withUser.filter(l => {
          if (role === 'super_admin' || role === 'superadmin' || role === 'super admin') return true;
          if (!userFarm) return true; // fallback: if no farm, show all
          const farmIdMatch = l._farm === userFarm || nameToFarmId.get(userFarm.toLowerCase()) === l._farm;
          const farmNameMatch = (String(l._farmName || '').trim().toLowerCase() === userFarm.toLowerCase());
          return farmIdMatch || farmNameMatch;
        });

        // Additionally, when a farm panel opens the modal, constrain to that farm
        const filtered = filteredByRole.filter(l => {
          if (!farmId && !farmName) return true;
          const fId = l._farm || l.farmId || '';
          const fName = l._farmName || l.farm || '';
          // match by id or by name string if available
          return (farmId && fId === farmId) || (farmName && (String(fName).toLowerCase() === String(farmName).toLowerCase()));
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

  // Group logs by calendar date (local)
  const groupedByDate = useMemo(() => {
    const map = new Map();
    logs.forEach(l => {
      const d = toDate(l.timestamp);
      const key = d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : 'unknown';
      const label = d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown Date';
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key).items.push(l);
    });
    // Sort groups by date desc using key (ISO of midnight local)
    const groups = Array.from(map.values()).sort((a, b) => (b.key > a.key ? 1 : (b.key < a.key ? -1 : 0)));
    // Sort items within each group by time desc
    groups.forEach(g => g.items.sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0)));
    return groups;
  }, [logs]);

  const selectedGroup = groupedByDate[selectedIndex] || { items: [] };

  if (loading) return <div>Loading farmer logs...</div>;
  if (error) return <div style={{ color: '#dc3545' }}>{error}</div>;
  if (!logs.length) return <div>No farmer logs found.</div>;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>Latest Logs</strong>
        <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))} className="filter-select">
          {groupedByDate.map((g, i) => (
            <option key={g.key} value={i}>
              {g.label} ({g.items.length})
            </option>
          ))}
        </select>
      </div>

      {selectedGroup.items.map(item => (
        <div key={item.id} className="report-detail-card" style={{ border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div className="report-header" style={{ marginBottom: 8 }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <GiDoubleFish />
              Farmer Logs - {item.fish_pond || '—'}
            </h4>
            <span className="report-date">{formatDateTime(item.timestamp)}</span>
          </div>

          <SectionTitle icon={<FaInfoCircle />} title="Fish Info" />
          <div className="condition-grid">
            <Row label="Pond" value={item.fish_pond} />
            <Row label="Fish Type" value={item.fish_type} />
            <Row label="Age" value={item.age != null ? `${item.age} days` : null} />
            <Row label="Size" value={item.size != null ? `${item.size} g` : null} />
            <Row label="Count" value={item.fish_count != null ? `${item.fish_count}` : null} />
            <Row label="Pond Size" value={item.pond_size ? `${item.pond_size} m²` : null} />
          </div>

          <SectionTitle icon={<FaChartBar />} title="Estimates" />
          <div className="condition-grid">
            <Row label="Days to Harvest" value={item.estimated_days_to_harvest != null ? `${item.estimated_days_to_harvest} days` : null} />
            <Row label="Est. Weight" value={item.estimated_harvest_weight != null ? `${item.estimated_harvest_weight}` : null} />
            <Row label="Est. Value" value={item.estimated_value != null ? formatCurrency(item.estimated_value) : null} />
            <Row label="Est. Profit" value={item.estimated_profit != null ? formatCurrency(item.estimated_profit) : null} />
          </div>

          <SectionTitle icon={<FaFish />} title="Feeding Info" />
          <div className="condition-grid">
            <Row label="Brand" value={item.feed_brand} />
            <Row label="Amount" value={item.feed_amount != null ? `${item.feed_amount}` : null} />
            <Row label="Cost" value={item.feed_cost != null ? formatCurrency(item.feed_cost) : null} />
            <Row label="Frequency" value={item.frequency != null ? `${item.frequency}` : null} />
          </div>

          <SectionTitle icon={<IoWater />} title="Environment" />
          <div className="condition-grid">
            <Row label="pH Level" value={item.ph_level != null ? item.ph_level : 'No Data'} />
            <Row label="Water Temp" value={item.water_temp != null ? item.water_temp : 'No Data'} />
          </div>

          <SectionTitle icon={<RiInfoCardFill />} title="Submitted Info" />
          <div className="report-meta">
            <Row label="Submitted by" value={item.submitted_by || item.username || '—'} />
            <Row label="Contact" value={item.user_contact || item.contact || '—'} />
            <Row label="Email" value={item.user_email || item.email || '—'} />
            <Row label="Farm" value={item._farmName || item._farm || '—'} />
            <Row label="Date" value={formatDateTime(item.timestamp)} />
          </div>
        </div>
      ))}
    </div>
  );
};

export default StockFeedLogs;


