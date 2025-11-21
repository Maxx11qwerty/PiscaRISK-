import { useEffect, useMemo, useState, useContext } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { AuthContext } from '../contexts/AuthContext';
import { GiDoubleFish } from 'react-icons/gi';
import { FaInfoCircle, FaChartBar, FaCalendarAlt, FaSpinner } from 'react-icons/fa';
import { FaFish } from 'react-icons/fa6';
import { IoWater } from 'react-icons/io5';
import { RiInfoCardFill } from 'react-icons/ri';
import { MdOutlineInbox } from 'react-icons/md';
import './StockFeedLogs.css';

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
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const DataRow = ({ label, value, highlight = false }) => (
  <div className={`data-row ${highlight ? 'highlight' : ''}`}>
    <div className="data-label">{label}</div>
    <div className="data-value">{value ?? '—'}</div>
  </div>
);

const DataSection = ({ title, icon, children, color = '#1A4375' }) => (
  <div className="data-section">
    <div className="data-section-header" style={{ borderLeftColor: color }}>
      <span className="section-icon">{icon}</span>
      <span className="section-title">{title}</span>
    </div>
    <div className="data-section-content">
      {children}
    </div>
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
        const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || role === 'temp_tech_officer';
        const userFarm = currentUser?.farm ? String(currentUser.farm).trim() : '';
        const filteredByRole = withUser.filter(l => {
          if (role === 'super_admin' || role === 'superadmin' || role === 'super admin') return true;
          if (isTemporaryTechOfficer) return true;
          if (!userFarm) return true;
          const farmIdMatch = l._farm === userFarm || nameToFarmId.get(userFarm.toLowerCase()) === l._farm;
          const farmNameMatch = (String(l._farmName || '').trim().toLowerCase() === userFarm.toLowerCase());
          return farmIdMatch || farmNameMatch;
        });

        // Additionally, when a farm panel opens the modal, constrain to that farm
        const filtered = filteredByRole.filter(l => {
          if (!farmId && !farmName) return true;
          const fId = l._farm || l.farmId || '';
          const fName = l._farmName || l.farm || '';
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
  }, [currentUser?.role, currentUser?.farm, farmId, farmName]);

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
    const groups = Array.from(map.values()).sort((a, b) => (b.key > a.key ? 1 : (b.key < a.key ? -1 : 0)));
    groups.forEach(g => g.items.sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0)));
    return groups;
  }, [logs]);

  const selectedGroup = groupedByDate[selectedIndex] || { items: [] };
  const totalLogs = logs.length;
  const totalDays = groupedByDate.length;

  if (loading) {
    return (
      <div className="stock-logs-loading">
        <FaSpinner className="spinner-icon" />
        <h3>Loading Stock & Feed Logs</h3>
        <p>Please wait while we fetch the latest data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stock-logs-error">
        <div className="error-icon">⚠️</div>
        <h3>Error Loading Logs</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="stock-logs-empty">
        <MdOutlineInbox className="empty-icon" />
        <h3>No Logs Found</h3>
        <p>No stock and feed logs are available at this time.</p>
      </div>
    );
  }

  return (
    <div className="stock-feed-logs-container">
      {/* Header */}
      <div className="stock-logs-header">
        <div className="header-main">
          <GiDoubleFish className="header-icon" />
          <div>
            <h1>Stock & Feed Logs</h1>
            {farmName && <p className="header-subtitle">{farmName}</p>}
          </div>
        </div>
        <div className="header-stats">
          <div className="stat-item">
            <span className="stat-number">{totalLogs}</span>
            <span className="stat-text">Total Logs</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{totalDays}</span>
            <span className="stat-text">Days Recorded</span>
          </div>
        </div>
      </div>

      {/* Date Selector */}
      <div className="stock-date-selector">
        <FaCalendarAlt className="date-icon" />
        <label htmlFor="date-select">Date:</label>
        <select 
          id="date-select"
          value={selectedIndex} 
          onChange={(e) => setSelectedIndex(Number(e.target.value))} 
          className="stock-date-select"
        >
          {groupedByDate.map((g, i) => (
            <option key={g.key} value={i}>
              {g.label} ({g.items.length} {g.items.length === 1 ? 'log' : 'logs'})
            </option>
          ))}
        </select>
      </div>

      {/* Logs List */}
      <div className="stock-logs-list">
        {selectedGroup.items.map((item, idx) => (
          <div key={item.id} className="log-entry">
            {/* Entry Header */}
            <div className="log-entry-header">
              <div className="log-entry-title">
                <GiDoubleFish className="log-icon" />
                <div>
                  <h2>Pond {item.fish_pond || '—'}</h2>
                  <span className="log-entry-date">{formatDateTime(item.timestamp)}</span>
                </div>
              </div>
              <div className="log-entry-number">#{idx + 1}</div>
            </div>

            {/* Entry Content */}
            <div className="log-entry-content">
              {/* Fish Information */}
              <DataSection title="Fish Information" icon={<FaInfoCircle />} color="#1A4375">
                <DataRow label="Pond Number" value={item.fish_pond} />
                <DataRow label="Fish Type" value={item.fish_type} />
                <DataRow label="Age" value={item.age != null ? `${item.age} days` : null} />
                <DataRow label="Size" value={item.size != null ? `${item.size} g` : null} />
                <DataRow label="Count" value={item.fish_count != null ? item.fish_count.toLocaleString() : null} highlight={item.fish_count != null} />
                <DataRow label="Pond Size" value={item.pond_size ? `${item.pond_size} m²` : null} />
              </DataSection>

              {/* Harvest Estimates */}
              {(item.estimated_days_to_harvest != null || item.estimated_harvest_weight != null || item.estimated_value != null || item.estimated_profit != null) && (
                <DataSection title="Harvest Estimates" icon={<FaChartBar />} color="#059669">
                  <DataRow label="Days to Harvest" value={item.estimated_days_to_harvest != null ? `${item.estimated_days_to_harvest} days` : null} />
                  <DataRow label="Estimated Weight" value={item.estimated_harvest_weight != null ? `${item.estimated_harvest_weight} kg` : null} />
                  <DataRow label="Estimated Value" value={item.estimated_value != null ? formatCurrency(item.estimated_value) : null} highlight={item.estimated_value != null} />
                  <DataRow label="Estimated Profit" value={item.estimated_profit != null ? formatCurrency(item.estimated_profit) : null} highlight={item.estimated_profit != null} />
                </DataSection>
              )}

              {/* Feeding Information */}
              {(item.feed_brand || item.feed_amount != null || item.feed_cost != null || item.frequency != null) && (
                <DataSection title="Feeding Information" icon={<FaFish />} color="#DC2626">
                  <DataRow label="Feed Brand" value={item.feed_brand} />
                  <DataRow label="Amount" value={item.feed_amount != null ? item.feed_amount : null} />
                  <DataRow label="Cost" value={item.feed_cost != null ? formatCurrency(item.feed_cost) : null} />
                  <DataRow label="Frequency" value={item.frequency != null ? item.frequency : null} />
                </DataSection>
              )}

              {/* Environment */}
              {(item.ph_level != null || item.water_temp != null) && (
                <DataSection title="Environment" icon={<IoWater />} color="#0284C7">
                  <DataRow label="pH Level" value={item.ph_level != null ? item.ph_level : 'No Data'} />
                  <DataRow label="Water Temperature" value={item.water_temp != null ? `${item.water_temp}°C` : 'No Data'} />
                </DataSection>
              )}

              {/* Submission Details */}
              <DataSection title="Submission Details" icon={<RiInfoCardFill />} color="#7C3AED">
                <DataRow label="Submitted By" value={item.submitted_by || item.username || '—'} />
                <DataRow label="Contact" value={item.user_contact || item.contact || '—'} />
                <DataRow label="Email" value={item.user_email || item.email || '—'} />
                <DataRow label="Farm" value={item._farmName || item._farm || '—'} />
                <DataRow label="Date Submitted" value={formatDateTime(item.timestamp)} />
              </DataSection>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockFeedLogs;
