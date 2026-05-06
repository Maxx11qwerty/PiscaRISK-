import { useState, useEffect, useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, getDoc, doc, Timestamp, updateDoc, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { sanitizeObjectStrings } from '../utils/sanitize';
import { logActivity, logMessages, isTemporaryTechOfficer, logTemporaryTechOfficerActivity } from '../utils/logger';
import { FaWater, FaFish, FaCloud, FaCalendarAlt, FaChevronDown, FaChevronRight, FaExclamationTriangle, FaPlus } from 'react-icons/fa';
import { FormControl, InputLabel, Select, MenuItem, OutlinedInput, Tooltip } from '@mui/material';
import AnimatedModal from './AnimatedModal';
import { FaFileExport } from 'react-icons/fa6';
import {
  exportFishConditionWithLogsCSV,
  exportFishConditionWithLogsPDF
} from '../utils/exportFishCondition';
import StockFeedLogs from './StockFeedLogs';
import { AuthContext } from '../contexts/AuthContext';
import './PondCondition.css';

// --- Canonicalization helpers (map legacy names/ids to new canonical names) ---
const normalizeNameKey = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

// Legacy name (normalized) -> Canonical display name
const legacyNameToCanonical = {
  'salmon-hatchery-facility': 'Aquino Fish Farm',
  'tilapia-production-center': "Vergara's Aqua Farm",
  'blue-ocean-aquafarm': 'Maningas Fish Farm',
  'marine-species-cultivation': 'Labay Fish Farm',
};

// Farm document id -> Canonical display name
const idToCanonical = {
  NyhjBvh9N9wfsOJ2qeEa: 'Aquino Fish Farm',
  TP3p0y4iQlo2j0loELQb: "Vergara's Aqua Farm",
  egGEARKL6Qk5jNgrY3Yu: 'Maningas Fish Farm',
  s5zKKXTBkF3voYnV8wuh: 'Labay Fish Farm',
};

// Build reverse map: canonical -> [aliases including canonical]
const canonicalToAliases = (() => {
  const map = {};
  const add = (canon, alias) => {
    if (!map[canon]) map[canon] = new Set();
    map[canon].add(alias);
  };
  // Seed with canonical self names
  Object.values(idToCanonical).forEach((canon) => add(canon, canon));
  // Add legacy aliases
  Object.entries(legacyNameToCanonical).forEach(([legacyKey, canon]) => {
    // Attempt to reconstruct a human alias from the key by replacing dashes with spaces and title-casing basics
    const human = legacyKey.replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace('Finfish', 'Finfish');
    add(canon, human);
  });
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, Array.from(v)]));
})();

const toCanonicalDisplay = (rawName, farmId) => {
  if (farmId && idToCanonical[farmId]) return idToCanonical[farmId];
  const key = normalizeNameKey(rawName);
  return legacyNameToCanonical[key] || rawName || '';
};

const aliasesForCanonical = (canonName) => {
  return canonicalToAliases[canonName] || [canonName].filter(Boolean);
};

const PondConditionDashboard = ({ isModal = false, selectedPond: propSelectedPond, setSelectedPond: propSetSelectedPond, navigationState = null }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useContext(AuthContext);
  
  // Check if user can mark reports as reviewed: Tech Officers, New Main Tech Officers, and Temporary Tech Officers
  const canMarkAsReviewed = () => {
    const role = String(currentUser?.role || '').toLowerCase().replace(/\s+/g, '_');
    const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || role === 'temp_tech_officer';
    const isNewMainTechOfficer = role === 'new_main_tech_officer';
    return role === 'tech_officer' || isNewMainTechOfficer || isTemporaryTechOfficer;
  };
  
  const [selectedPond, setSelectedPond] = useState(propSelectedPond || 'all');
  const [selectedFarmId, setSelectedFarmId] = useState('all');
  const [notificationFarmFilter, setNotificationFarmFilter] = useState(null);
  const [isProcessingNotification, setIsProcessingNotification] = useState(false);
  const [pondOptions, setPondOptions] = useState([1,2,3,4,5,6,7,8,9,10]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [reportFilter, setReportFilter] = useState('today');
  const [customDate, setCustomDate] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reports, setReports] = useState([]);
  const [farms, setFarms] = useState([]);
  const [reportsByFarm, setReportsByFarm] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedFarms, setExpandedFarms] = useState(new Set());
  const [openLogsModal, setOpenLogsModal] = useState(null); // { farmId, farmName }
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showAddFishpondForm, setShowAddFishpondForm] = useState(false);
  const [newPondNumber, setNewPondNumber] = useState('');
  const [newPondFarmId, setNewPondFarmId] = useState('');
  const [addPondError, setAddPondError] = useState('');
  const [addPondSuccess, setAddPondSuccess] = useState('');
  const [addingPond, setAddingPond] = useState(false);
  const [nextPondFromDb, setNextPondFromDb] = useState(null);
  const [pondNameByNumber, setPondNameByNumber] = useState({});
  const [pondStatusByNumber, setPondStatusByNumber] = useState({});
  const [pondInactiveByFarm, setPondInactiveByFarm] = useState({}); // farmId -> Set(numbers)
  const [pondNumbersByFarm, setPondNumbersByFarm] = useState({}); // farmId -> Set(numbers)
  const [isPondDropdownOpen, setIsPondDropdownOpen] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState({ open: false, pondNum: null, farmId: null, targetId: null, nextStatus: 'Inactive' });

  const pondMenuProps = {
    PaperProps: {
      style: { maxHeight: 48 * 4.5 + 8, width: 260 }
    }
  };

  // Keep pondOptions in sync with Firestore fishPonds for the active farm
  useEffect(() => {
    let isCancelled = false;
    const loadPonds = async () => {
      try {
        // Determine which farm to use: assigned farm id or selectedFarmId for admins
        let farmIdToUse = null;
        if (currentUser?.farm) {
          farmIdToUse = await getUserAssignedFarmId();
        } else if (selectedFarmId && selectedFarmId !== 'all') {
          farmIdToUse = selectedFarmId;
        }
        const buildForFarm = async (fid) => {
          const snap = await getDocs(collection(db, 'farms', fid, 'fishPonds'));
          let maxNum = 0;
          const pondMap = {};
          const statusMap = {};
          const numbersSet = new Set();
          const inactiveSet = new Set();
          snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            const nm = String(data.name || '').trim();
            const st = String(data.status || 'Active');
            // Prefer explicit pondNumber field if present
            const pnRaw = data.pondNumber;
            const pn = pnRaw != null && pnRaw !== '' && !isNaN(parseInt(String(pnRaw).trim(), 10))
              ? parseInt(String(pnRaw).trim(), 10)
              : null;
            if (pn != null && Number.isFinite(pn)) {
              maxNum = Math.max(maxNum, pn);
              numbersSet.add(pn);
              if (!pondMap[pn]) pondMap[pn] = nm || `Fish pond ${pn}`;
              statusMap[pn] = st;
              if (st.trim().toLowerCase() === 'inactive') inactiveSet.add(pn);
            } else {
              // Fallback: parse number from name
              const m = nm.match(/^\s*fish\s*pond\s*(\d+)\s*$/i);
              if (m && m[1]) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n)) maxNum = Math.max(maxNum, n);
                if (!isNaN(n)) { 
                  numbersSet.add(n); 
                  if (!pondMap[n]) pondMap[n] = nm; 
                  statusMap[n] = st; 
                  if (st.trim().toLowerCase()==='inactive') {
                    inactiveSet.add(n);
                  }
                }
              } else {
                const n2 = parseInt(nm, 10);
                if (!isNaN(n2)) maxNum = Math.max(maxNum, n2);
                if (!isNaN(n2)) { 
                  numbersSet.add(n2); 
                  if (!pondMap[n2]) pondMap[n2] = nm; 
                  statusMap[n2] = st; 
                  if (st.trim().toLowerCase()==='inactive') {
                    inactiveSet.add(n2);
                  }
                }
              }
            }
          });
          return { pondMap, statusMap, numbers: Array.from(numbersSet).sort((a,b)=>a-b), inactiveSet };
        };

        if (!farmIdToUse && selectedFarmId === 'all') {
          // Admin/all farms view: build inactive map, per-farm pond numbers, and global pond number set across all farms
          const inactiveByFarm = {};
          const numbersByFarm = {};
          const globalNumbers = new Set();
          for (const f of farms) {
            try {
              const r = await buildForFarm(f.id);
              inactiveByFarm[f.id] = r.inactiveSet;
              numbersByFarm[f.id] = new Set(r.numbers);
              r.numbers.forEach(n => globalNumbers.add(n));
            } catch (_) {}
          }
          if (!isCancelled) {
            setPondInactiveByFarm(inactiveByFarm);
            setPondNumbersByFarm(numbersByFarm);
            if (globalNumbers.size > 0) {
              setPondOptions(Array.from(globalNumbers).sort((a,b)=>a-b));
            }
          }
          return;
        }

        if (!farmIdToUse) return; // No specific farm context
        const r = await buildForFarm(farmIdToUse);
        if (!isCancelled) {
          setPondOptions(r.numbers.length ? r.numbers : [1]);
          setPondNameByNumber(r.pondMap);
          setPondStatusByNumber(r.statusMap);
          setPondInactiveByFarm(prev => ({ ...prev, [farmIdToUse]: r.inactiveSet }));
          setPondNumbersByFarm(prev => ({ ...prev, [farmIdToUse]: new Set(r.numbers) }));
        }
      } catch (_) {
        // ignore; keep existing options
      }
    };
    loadPonds();
    return () => { isCancelled = true; };
  }, [currentUser?.farm, selectedFarmId, farms]);

  // Ensure pond filter defaults to 'all' when opened as a modal
  useEffect(() => {
    if (isModal) {
      setSelectedPond('all');
    }
  }, [isModal]);

  // Handle navigation state from notifications
  useEffect(() => {
    const state = navigationState || location.state;
    if (state?.fromNotification) {
      setIsProcessingNotification(true);
      if (state.selectedPond) {
        setSelectedPond(state.selectedPond);
      }
      if (state.farmFilter) {
        setNotificationFarmFilter(state.farmFilter);
      }
      // Set a broader date filter when coming from notification to show more reports
      setReportFilter('last7days');
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [navigationState, location.state]);

  // Handle farm filter from notification after farms are loaded
  useEffect(() => {
    
    if (notificationFarmFilter && farms.length > 0) {
      // Find the farm by name and set the selectedFarmId
      const targetFarm = farms.find(farm => 
        farm.name === notificationFarmFilter || 
        farm.id === notificationFarmFilter
      );
      if (targetFarm) {
        setSelectedFarmId(targetFarm.id);
        // Clear the notification farm filter after applying
        setNotificationFarmFilter(null);
        // Mark notification processing as complete
        setIsProcessingNotification(false);
      } else {
        // Mark notification processing as complete even if farm not found
        setIsProcessingNotification(false);
      }
    }
  }, [farms, notificationFarmFilter]);

  // Update parent component if props are provided
  useEffect(() => {
    if (propSetSelectedPond) {
      propSetSelectedPond(selectedPond);
    }
  }, [selectedPond, propSetSelectedPond]);

  // Ensure selectedFarmId is set to user's assigned farm when available
  // But don't override if it's already set from a notification
  useEffect(() => {
    if (currentUser?.farm && !notificationFarmFilter) {
      setSelectedFarmId(currentUser.farm);
    }
  }, [currentUser?.farm, notificationFarmFilter]);


  // Monitor farms state changes
  useEffect(() => {
  }, [farms]);

  // Load farms and their reports (grouped by farm)
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);

        // Helper: fetch reports for multiple farm aliases from main 'reports' collection
        const fetchReportsByAliases = async (aliasNames) => {
          const collected = [];
          for (const alias of aliasNames) {
            try {
              const reportsRef = collection(db, 'reports');
              const q1 = query(reportsRef, where('farm', '==', alias));
              const snap1 = await getDocs(q1);
              snap1.docs.forEach(d => collected.push({ ...d.data(), id: d.id, __collection: 'reports' }));
            } catch (_) {}
            try {
              const reportsRef = collection(db, 'reports');
              const q2 = query(reportsRef, where('farm_name', '==', alias));
              const snap2 = await getDocs(q2);
              snap2.docs.forEach(d => collected.push({ ...d.data(), id: d.id, __collection: 'reports' }));
            } catch (_) {}
          }
          // Deduplicate by id
          const seen = new Set();
          const unique = [];
          for (const r of collected) {
            if (r.id && !seen.has(r.id)) { seen.add(r.id); unique.push(r); }
          }
          return unique;
        };

        // Build a strong dedupe key: canonical farm display + pond + precise timestamp ms
        const buildDedupeKey = (report) => {
          const farmName = report.farm || '';
          const pondName = report.pond || '';
          let ms = 0;
          const ts = report.originalTimestamp || report.date;
          try {
            if (ts && typeof ts.toDate === 'function') ms = ts.toDate().getTime();
            else if (ts && typeof ts.seconds === 'number') ms = ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0);
            else if (ts instanceof Date) ms = ts.getTime();
            else if (typeof ts === 'number') ms = ts;
            else if (typeof ts === 'string') ms = Date.parse(ts) || 0;
          } catch (_) { ms = 0; }
          return `${farmName}::${pondName}::${ms}`;
        };

        const dedupeReports = (reportsList) => {
          const seen = new Set();
          const out = [];
          for (const r of reportsList) {
            const k = buildDedupeKey(r);
            if (!seen.has(k)) { seen.add(k); out.push(r); }
          }
          return out;
        };
        
        // Determine which farms to load based on user's farm assignment
        let farmsToLoad = [];
        
        // Check if user is a Temporary Tech Officer (should have access to all farms like main Tech Officer)
        const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
        
        if (currentUser?.farm && !notificationFarmFilter && !isTemporaryTechOfficer) {
          // User has a specific farm assigned - ONLY load that farm (unless coming from notification or is TTO)
          // Skip if user is assigned to Rojo Hatchery
          if (currentUser.farm === 'WgS4mBVnPFPMGq7vfSYa') {
            farmsToLoad = [];
            setSelectedFarmId('all');
          } else {
            const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
            if (farmDoc.exists()) {
              const farmData = farmDoc.data();
              farmsToLoad = [{ id: farmDoc.id, ...farmData }];
              // Force the selected farm to user's assigned farm
              setSelectedFarmId(currentUser.farm);
            } else {
              // Create a placeholder farm entry so the UI can still render
              farmsToLoad = [{ id: currentUser.farm, name: currentUser.farm, location: 'Assigned Farm' }];
              setSelectedFarmId(currentUser.farm);
            }
          }
        } else {
          // User has no farm assigned, is admin, is TTO, or coming from notification - load all farms
          const farmsSnap = await getDocs(collection(db, 'farms'));
          farmsToLoad = farmsSnap.docs
            .map(d => ({ id: d.id, ...(d.data() || {}) }))
            .filter(farm => farm.id !== 'WgS4mBVnPFPMGq7vfSYa') // Exclude Rojo Hatchery
            .sort((a,b)=>(a.name||'').localeCompare(b.name||''));
        }
        
        // Set farms state - this controls what farms are displayed in the UI
        setFarms(farmsToLoad);

        // Fetch reports based on farm field in report data
        const nextReportsByFarm = {};
        let totalReports = [];
        
        if (currentUser?.farm && !isTemporaryTechOfficer) {
          // User has assigned farm - fetch reports by farm field (but not for TTOs)
          
          // Try to get the farm name from the farm document
          const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
          const rawFarmName = farmDoc.exists() ? farmDoc.data().name : currentUser.farm;
          const canonicalName = toCanonicalDisplay(rawFarmName, currentUser.farm);
          const aliases = aliasesForCanonical(canonicalName);
          
          // Query reports collection for reports with any alias (single source of truth)
          const reportsFromCollection = await fetchReportsByAliases(aliases);
          const itemsRaw = reportsFromCollection.map(dataDoc => {
            const data = dataDoc;

            // Normalize timestamp to Date regardless of Firestore Timestamp or stored string/number
            let normalizedDate = null;
            if (data.timestamp?.toDate) {
              normalizedDate = data.timestamp.toDate();
            } else if (typeof data.timestamp === 'number') {
              normalizedDate = new Date(data.timestamp);
            } else if (typeof data.timestamp === 'string') {
              const tryDate = new Date(data.timestamp);
              normalizedDate = isNaN(tryDate.getTime()) ? new Date() : tryDate;
            } else if (data.timestamp?.seconds) {
              normalizedDate = new Date(data.timestamp.seconds * 1000);
            } else {
              normalizedDate = new Date();
            }
            

            return {
              id: data.id,
              date: normalizedDate,
              farm: data.farm || data.farm_name || canonicalName,
              pond: data.fish_pond,
              fish: data.fish_condition,
              water: data.water_condition,
              weather: data.weather,
              harvest: data.ready_for_harvest ? 'Ready' : 'Not Ready',
              notes: data.additional_notes,
              uid: data.uid,
              submittedBy: data.submitted_by,
              userRole: data.user_role,
              contact: data.user_contact,
              email: data.user_email,
              status: data.status,
                reviewedBy: data.reviewed_by || data.reviewedBy,
                reviewedByRole: data.reviewed_by_role || data.reviewedByRole,
              reviewedAt: data.reviewed_at || data.reviewedAt,
              source: data.source || 'web',
              originalTimestamp: data.timestamp,
              __collection: 'reports',
              __hadFarmField: Object.prototype.hasOwnProperty.call(data, 'farm')
            };
          });

          const items = dedupeReports(itemsRaw);

          nextReportsByFarm[currentUser.farm] = { farm: { id: currentUser.farm, name: canonicalName }, reports: items };
          totalReports = totalReports.concat(items.map(r => ({ ...r, __farmId: currentUser.farm })));
          
        } else {
          // User has no farm assignment - fetch all reports from all farms
          
          for (const farm of farmsToLoad) {
            // Only use reports collection with farm field (single source of truth)
            let farmReports = [];
            try {
              const canonicalName = toCanonicalDisplay(farm.name, farm.id);
              const aliases = aliasesForCanonical(canonicalName);
              const reportsFromCollection = await fetchReportsByAliases(aliases);
              farmReports = reportsFromCollection;
            } catch (error) {
            }
            
            const itemsRaw = farmReports.map(report => {
              const data = report;

              // Normalize timestamp to Date regardless of Firestore Timestamp or stored string/number
              let normalizedDate = null;
              if (data.timestamp?.toDate) {
                normalizedDate = data.timestamp.toDate();
              } else if (typeof data.timestamp === 'number') {
                normalizedDate = new Date(data.timestamp);
              } else if (typeof data.timestamp === 'string') {
                const tryDate = new Date(data.timestamp);
                normalizedDate = isNaN(tryDate.getTime()) ? new Date() : tryDate;
              } else if (data.timestamp?.seconds) {
                normalizedDate = new Date(data.timestamp.seconds * 1000);
              } else {
                normalizedDate = new Date();
              }

              return {
                id: data.id,
                date: normalizedDate,
                farm: toCanonicalDisplay(data.farm || data.farm_name || farm.name, farm.id),
                pond: data.fish_pond,
                fish: data.fish_condition,
                water: data.water_condition,
                weather: data.weather,
                harvest: data.ready_for_harvest ? 'Ready' : 'Not Ready',
                notes: data.additional_notes,
                uid: data.uid,
                submittedBy: data.submitted_by,
                userRole: data.user_role,
                contact: data.user_contact,
                email: data.user_email,
                status: data.status,
                reviewedBy: data.reviewed_by || data.reviewedBy,
                reviewedByRole: data.reviewed_by_role || data.reviewedByRole,
                reviewedAt: data.reviewed_at || data.reviewedAt,
                source: data.source || 'web',
                originalTimestamp: data.timestamp,
                __hadFarmField: Object.prototype.hasOwnProperty.call(data, 'farm')
              };
            });

            const items = dedupeReports(itemsRaw);

            nextReportsByFarm[farm.id] = { farm: { ...farm, name: toCanonicalDisplay(farm.name, farm.id) }, reports: items };
            totalReports = totalReports.concat(items.map(r => ({ ...r, __farmId: farm.id })));
          }
        }

        // Deduplicate reports across all farms (aliases may create logical duplicates)
        // Use a strong key: canonical farm name + pond + exact timestamp ms
        const toMillis = (ts) => {
          try {
            if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
            if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0);
            if (ts instanceof Date) return ts.getTime();
            if (typeof ts === 'number') return ts;
            if (typeof ts === 'string') return Date.parse(ts) || 0;
          } catch (_) { /* ignore */ }
          return 0;
        };

        const normalize = (s) => String(s || '').trim().toLowerCase();
        const keyOf = (r) => {
          // Prefer stable farm id when available; else canonicalized farm name
          let farmKey = r.__farmId || '';
          if (!farmKey) {
            const lower = normalize(r.farm);
            const match = farms.find(f => normalize(f.name) === lower);
            farmKey = match ? match.id : lower;
          }
          const pondKey = normalize(r.pond || r.fish_pond);
          const ms = toMillis(r.originalTimestamp || r.date || r.timestamp);
          return `${farmKey}::${pondKey}::${ms}`;
        };
        const seenKeys = new Set();
        const uniqueTotalReports = [];
        for (const r of totalReports) {
          const k = keyOf(r);
          if (!seenKeys.has(k)) { seenKeys.add(k); uniqueTotalReports.push(r); }
        }
        
        setReportsByFarm(nextReportsByFarm);
        // Include all unique reports (per-farm filtering manages visibility)
        setReports(uniqueTotalReports);
      } catch (error) {
        logActivity('error', logMessages.error.database(`Error fetching reports: ${error.message}`), 'System');
      } finally {
        setLoading(false);
      }
    };
  
    fetchReports();
  }, [selectedFarmId, currentUser?.farm, notificationFarmFilter]);

  // Get and sort reports
  const allReports = [...reports].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Extract numeric pond number from names like "Fish pond 2" or plain numbers
  function extractPondNumber(value) {
    if (!value) return null;
    const text = String(value).trim();
    const m = text.match(/(\d+)/);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  function getReportPondNumber(report) {
    return extractPondNumber(report?.pond ?? report?.fish_pond ?? '');
  }

  function matchesSelectedPond(report, selectedPondNum) {
    if (!selectedPondNum) return true;
    const repNum = getReportPondNumber(report);
    if (repNum === selectedPondNum) return true;
    const reportName = String(report?.pond ?? report?.fish_pond ?? '').trim().toLowerCase();
    const officialName = String(pondNameByNumber[selectedPondNum] || '').trim().toLowerCase();
    return officialName && reportName === officialName;
  }

  // Filter reports based on selected filter and pond selection
  const getFilteredReports = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const selectedPondNum = (selectedPond && selectedPond !== 'all') ? Number(selectedPond) : null;
    
    // Filter function that checks if a report should be hidden due to inactive pond
    const hideIfInactive = (r) => {
      const pondNum = getReportPondNumber(r);
      
      // 1) use embedded farmId if present
      let farmId = r.__farmId;
      
      // 2) else resolve by farm name against loaded farms
      if (!farmId && r.farm) {
        const lower = String(r.farm).trim().toLowerCase();
        const match = farms.find(f => String(f.name || '').trim().toLowerCase() === lower);
        if (match) farmId = match.id;
      }
      
      // 3) if farmId found, use per-farm inactive map
      if (farmId && pondInactiveByFarm[farmId] instanceof Set) {
        const isInactive = pondInactiveByFarm[farmId].has(pondNum);
        return !isInactive;
      }
      
      // 4) fallback to global map (assigned farm view)
      const status = String(pondStatusByNumber[pondNum] || 'Active').trim().toLowerCase();
      const result = status !== 'inactive';
      return result;
    };

    let filteredResults = [];

    // Apply filtering in each report filter case
    switch(reportFilter) {
      case 'today':
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const reportDateString = reportDate.toDateString();
          const matchesDate = reportDateString === today.toDateString();
          const matchesPond = matchesSelectedPond(report, selectedPondNum);
          const isActive = hideIfInactive(report);
          
          return matchesDate && matchesPond && isActive;
        });
        break;
        
      case 'last7days':
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const timeDiff = today.getTime() - reportDate.getTime();
          const daysDiff = timeDiff / (1000 * 3600 * 24);
          const matchesDate = daysDiff <= 7 && daysDiff >= 0;
          const matchesPond = matchesSelectedPond(report, selectedPondNum);
          const isActive = hideIfInactive(report);
          
          return matchesDate && matchesPond && isActive;
        });
        break;
      case 'thisMonth':
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const matchesDate = reportDate >= startOfMonth && reportDate <= endOfMonth;
          const matchesPond = matchesSelectedPond(report, selectedPondNum);
          const isActive = hideIfInactive(report);
          return matchesDate && matchesPond && isActive;
        });
        break;
        
      case 'custom':
        if (!customDate) {
          return [];
        }
        const selectedCustomDate = new Date(customDate);
        selectedCustomDate.setHours(0, 0, 0, 0);
        const nextDay = new Date(selectedCustomDate);
        nextDay.setDate(nextDay.getDate() + 1);
        filteredResults = allReports.filter(report => {
          const reportDate = new Date(report.date);
          const matchesDate = reportDate >= selectedCustomDate && reportDate < nextDay;
          const matchesPond = matchesSelectedPond(report, selectedPondNum);
          const isActive = hideIfInactive(report);
          
          return matchesDate && matchesPond && isActive;
        });
        break;
        
      default:
        filteredResults = allReports.filter(report => {
          const matchesPond = matchesSelectedPond(report, selectedPondNum);
          const isActive = hideIfInactive(report);
          
          return matchesPond && isActive;
        });
    }
    
    return filteredResults;
  };

  const filteredReports = getFilteredReports();

  const toggleExpanded = (farmId) => {
    // Single-open behavior: open the clicked farm and close others
    const isCurrentlyOpen = expandedFarms.has(farmId);
    const isExpanding = !isCurrentlyOpen;
    const next = new Set();
    if (isExpanding) {
      next.add(farmId);
    }
    setExpandedFarms(next);
    
    // Log the activity for regular users only
    const username = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
    const farm = farms.find(f => f.id === farmId);
    const farmName = farm?.name || 'Unknown Farm';
    
    if (!isTemporaryTechOfficer(currentUser)) {
      try { 
        logActivity('report', `Farm ${farmName} ${isExpanding ? 'expanded' : 'collapsed'} to view reports`, username); 
      } catch (_) {}
    }
  };

  const markReportAsReviewed = async (report, farmContext) => {
    try {
      const reviewerName = currentUser?.fullName || currentUser?.displayName || currentUser?.email || currentUser?.uid || 'Unknown Reviewer';
      const reviewedAtIso = new Date().toISOString();
      
      // Define variables for logging
      const username = currentUser?.username || currentUser?.email || 'Unknown';
      const pondId = report.pond || 'Unknown Pond';
      const farmName = report.farm || 'Unknown Farm';

      // Determine reviewer role label for display
      const reviewerRoleLabel = (() => {
        const role = String(currentUser?.role || '').toLowerCase();
        if (currentUser?.temporaryTechOfficer || role === 'temp_tech_officer') return 'Temporary Tech Officer';
        if (role === 'tech_officer' || role === 'tech officer') return 'Tech Officer';
        if (role === 'new_main_tech_officer' || role === 'new main tech officer') return 'Tech Officer';
        if (role === 'super_admin' || role === 'super admin' || role === 'superadmin') return 'Super Admin';
        if (role === 'admin') return 'Admin';
        return currentUser?.role || 'User';
      })();

      // Optimistic UI update: update local states first
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: 'Reviewed', reviewedBy: reviewerName, reviewedByRole: reviewerRoleLabel, reviewedAt: reviewedAtIso } : r));
      setReportsByFarm(prev => {
        const next = { ...prev };
        const group = next[farmContext?.id || farmContext] || next[report.__farmId];
        if (group) {
          group.reports = group.reports.map(r => r.id === report.id ? { ...r, status: 'Reviewed', reviewedBy: reviewerName, reviewedByRole: reviewerRoleLabel, reviewedAt: reviewedAtIso } : r);
        }
        return next;
      });

      // Update main reports collection
      const mainDocRef = doc(db, 'reports', report.id);
      const updates = [updateDoc(mainDocRef, sanitizeObjectStrings({
        status: 'Reviewed',
        reviewed_by: reviewerName,
        reviewed_by_role: reviewerRoleLabel,
        reviewed_at: Timestamp.now()
      }))];

      // Robustly mirror to farms/{farmId}/reports
      try {
        const targetTs = report.originalTimestamp || report.date || report.timestamp;
        const toMillis = (ts) => {
          try {
            if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
            if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000 + (ts.nanoseconds ? Math.floor(ts.nanoseconds / 1e6) : 0);
            if (ts instanceof Date) return ts.getTime();
            if (typeof ts === 'number') return ts;
            if (typeof ts === 'string') return Date.parse(ts) || 0;
          } catch (_) { /* ignore */ }
          return 0;
        };
        const targetMs = toMillis(targetTs);
        const tsForQuery = targetMs ? Timestamp.fromDate(new Date(targetMs)) : null;
        const targetPondLower = String(report.pond || report.fish_pond || '').trim().toLowerCase();

        // Determine candidate farmIds
        const candidateFarmIds = new Set();
        if (report.__farmId) candidateFarmIds.add(report.__farmId);
        if (report.farm) {
          const matchByName = farms.find(f => String(f.name || '').trim().toLowerCase() === String(report.farm).trim().toLowerCase());
          if (matchByName) candidateFarmIds.add(matchByName.id);
        }
        // If none resolved, try all farms as last resort
        if (candidateFarmIds.size === 0 && Array.isArray(farms)) farms.forEach(f => candidateFarmIds.add(f.id));

        // Helper to push an update for a specific sub doc id
        const pushUpdate = (farmId, docId) => {
          updates.push(updateDoc(doc(db, 'farms', farmId, 'reports', docId), sanitizeObjectStrings({
            status: 'Reviewed',
            reviewed_by: reviewerName,
            reviewed_by_role: reviewerRoleLabel,
            reviewed_at: Timestamp.now()
          })));
        };

        for (const farmId of candidateFarmIds) {
          try {
            const collRef = collection(db, 'farms', farmId, 'reports');
            let matched = false;

            // 1) Try by report_id if present in sub-docs
            try {
              const byReportId = await getDocs(query(collRef, where('report_id', '==', report.id)));
              if (!byReportId.empty) {
                byReportId.forEach(d => pushUpdate(farmId, d.id));
                matched = true;
              }
            } catch (_) {}

            // 2) Try by uid + exact timestamp
            if (!matched && report.uid && tsForQuery) {
              try {
                const byUidTs = await getDocs(query(collRef, where('uid', '==', report.uid), where('timestamp', '==', tsForQuery)));
                if (!byUidTs.empty) {
                  byUidTs.forEach(d => pushUpdate(farmId, d.id));
                  matched = true;
                }
              } catch (_) {}
            }

            // 3) Try by pond + exact timestamp (fish_pond then pond)
            if (!matched && tsForQuery) {
              try {
                const r1 = await getDocs(query(collRef, where('fish_pond', '==', report.pond || report.fish_pond), where('timestamp', '==', tsForQuery)));
                if (!r1.empty) {
                  r1.forEach(d => pushUpdate(farmId, d.id));
                  matched = true;
                } else {
                  const r2 = await getDocs(query(collRef, where('pond', '==', report.pond || report.fish_pond), where('timestamp', '==', tsForQuery)));
                  if (!r2.empty) {
                    r2.forEach(d => pushUpdate(farmId, d.id));
                    matched = true;
                  }
                }
              } catch (_) {}
            }

            // 4) As a final fallback, scan and match by pond + near timestamp (+/- 2 minutes)
            if (!matched && targetMs) {
              try {
                const snap = await getDocs(collRef);
                snap.forEach(d => {
                  const data = d.data() || {};
                  const pondLower = String(data.fish_pond || data.pond || '').trim().toLowerCase();
                  const ms = toMillis(data.timestamp);
                  if (pondLower === targetPondLower && Math.abs(ms - targetMs) <= 120000) {
                    pushUpdate(farmId, d.id);
                    matched = true;
                  }
                });
              } catch (_) {}
            }
          } catch (_) {}
        }
      } catch (_) { /* ignore subcollection update errors */ }

      // Final fallback: if not updated yet, try searching by uid + timestamp across all farms
      try {
        const targetTs = report.originalTimestamp || report.date || report.timestamp;
        const targetMs = (() => {
          try {
            if (targetTs && typeof targetTs.toDate === 'function') return targetTs.toDate().getTime();
            if (targetTs && typeof targetTs.seconds === 'number') return targetTs.seconds * 1000 + (targetTs.nanoseconds ? Math.floor(targetTs.nanoseconds / 1e6) : 0);
            if (targetTs instanceof Date) return targetTs.getTime();
            if (typeof targetTs === 'number') return targetTs;
            if (typeof targetTs === 'string') return Date.parse(targetTs) || 0;
          } catch (_) { /* ignore */ }
          return 0;
        })();
        if (targetMs && report.uid && Array.isArray(farms) && farms.length > 0) {
          const tsForQuery = (targetTs && typeof targetTs.toDate === 'function') ? targetTs : Timestamp.fromDate(new Date(targetMs));
          for (const f of farms) {
            try {
              const collRef = collection(db, 'farms', f.id, 'reports');
              const q = query(collRef, where('uid', '==', report.uid), where('timestamp', '==', tsForQuery));
              const rs = await getDocs(q);
              if (!rs.empty) {
                rs.forEach(d => {
                  updates.push(updateDoc(doc(db, 'farms', f.id, 'reports', d.id), {
                    status: 'Reviewed',
                    reviewed_by: reviewerName,
                    reviewed_by_role: reviewerRoleLabel,
                    reviewed_at: Timestamp.now()
                  }));
                });
                break;
              }
            } catch (_) {}
          }
        }
      } catch (_) { /* ignore */ }

      const results = await Promise.allSettled(updates);
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        // Fallback: try to find the report in 'reports' by strong identifiers (farm, pond, timestamp)
        try {
          const reportsRef = collection(db, 'reports');
          const q = query(
            reportsRef,
            where('farm', '==', report.farm || report?.farm),
            where('fish_pond', '==', report.pond || report?.pond)
          );
          const snap = await getDocs(q);
          // Try to match by timestamp equality if available
          const targetTs = report.originalTimestamp;
          let matchedDoc = null;
          if (snap && !snap.empty) {
            matchedDoc = snap.docs.find(d => {
              const data = d.data() || {};
              const ts = data.timestamp;
              if (!targetTs || !ts) return false;
              if (typeof ts?.toDate === 'function' && typeof targetTs?.toDate === 'function') {
                return ts.toDate().getTime() === targetTs.toDate().getTime();
              }
              if (ts?.seconds && targetTs?.seconds) {
                return ts.seconds === targetTs.seconds && ts.nanoseconds === targetTs.nanoseconds;
              }
              // Fallback: string/number compare
              return String(ts) === String(targetTs);
            }) || snap.docs[0];
          }

          if (matchedDoc) {
            await updateDoc(doc(db, 'reports', matchedDoc.id), {
              status: 'Reviewed',
              reviewed_by: reviewerName,
              reviewed_at: Timestamp.now()
            });
            // Log the activity with proper role identification
      if (isTemporaryTechOfficer(currentUser)) {
        try { 
          await logTemporaryTechOfficerActivity(
            'temporaryTechOfficer', 
            logMessages.temporaryTechOfficer.reportMarkReviewed(username, pondId, farmName), 
            username, 
            currentUser?.role || 'temp_tech_officer'
          ); 
        } catch (_) {}
      } else {
        try { logActivity('report', `Report marked as reviewed for ${pondId}`, username); } catch (_) {}
      }
      return;
          }
        } catch (e) {
          // fall through to final throw
        }

        throw new Error('Failed to update report status in any known location');
      }
      
      // Log the activity with proper role identification
      if (isTemporaryTechOfficer(currentUser)) {
        try { 
          await logTemporaryTechOfficerActivity(
            'temporaryTechOfficer', 
            logMessages.temporaryTechOfficer.reportMarkReviewed(username, pondId, farmName), 
            username, 
            currentUser?.role || 'temp_tech_officer'
          ); 
        } catch (_) {}
      } else {
        try { logActivity('report', `Report marked as reviewed for ${pondId}`, username); } catch (_) {}
      }
    } catch (error) {
      // Revert optimistic update on error
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, status: report.status, reviewedBy: report.reviewedBy, reviewedAt: report.reviewedAt } : r));
      setReportsByFarm(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(fid => {
          next[fid] = {
            ...next[fid],
            reports: next[fid].reports.map(r => r.id === report.id ? { ...r, status: report.status, reviewedBy: report.reviewedBy, reviewedAt: report.reviewedAt } : r)
          };
        });
        return next;
      });
    }
  };

  const getConditionIcon = (condition) => {
    if (condition?.toLowerCase().includes('good') || condition?.toLowerCase().includes('healthy')) {
      return <span className="condition-icon healthy">✓</span>;
    } else if (condition?.toLowerCase().includes('fair') || condition?.toLowerCase().includes('moderate')) {
      return <span className="condition-icon moderate">~</span>;
    } else if (condition?.toLowerCase().includes('poor') || condition?.toLowerCase().includes('unhealthy')) {
      return <span className="condition-icon poor">⚠</span>;
    }
    return <span className="condition-icon">-</span>;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else if (timestamp instanceof Date) {
        return timestamp.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        return new Date(timestamp).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Helper function to get the user's assigned farm name
  const getUserAssignedFarmName = () => {
    if (!currentUser?.farm) return null;
    
    
    // First try to find in the farms array
    const farmFromArray = farms.find(f => f.id === currentUser.farm);
    if (farmFromArray) {
      return farmFromArray.name;
    }
    
    // If not found in array, return the farm ID as fallback
    return currentUser.farm;
  };

  // Helper to resolve the assigned farm ID reliably
  const getUserAssignedFarmId = async () => {
    if (!currentUser?.farm) return null;
    // 0) Try to read user's profile for a canonical farmId
    try {
      const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDocSnap.exists()) {
        const u = userDocSnap.data() || {};
        const directFarmId = u.farmId || u.farm;
        if (directFarmId) {
          const farmSnap = await getDoc(doc(db, 'farms', String(directFarmId)));
          if (farmSnap.exists()) return farmSnap.id;
        }
      }
    } catch {}
    // 1) Check loaded farms array (fast path) by id or by name, preferring canonical Firestore IDs (20-char base62)
    const byId = farms.find(f => f.id === currentUser.farm);
    if (byId && /^[A-Za-z0-9]{20}$/.test(byId.id)) return byId.id;
    const normalizedTarget = String(currentUser.farm).trim().toLowerCase();
    const byName = farms.find(f => String(f.name || '').trim().toLowerCase() === normalizedTarget && /^[A-Za-z0-9]{20}$/.test(f.id));
    if (byName) return byName.id;
    // 2) Query by name (prefer canonical 20-char IDs)
    try {
      const q = query(collection(db, 'farms'), where('name', '==', currentUser.farm), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const doc0 = snap.docs[0];
        if (/^[A-Za-z0-9]{20}$/.test(doc0.id)) return doc0.id;
      }
    } catch {}
    // 3) Fallback: load all farms and match by normalized name (tolerate case/spacing), preferring canonical IDs
    try {
      const allSnap = await getDocs(collection(db, 'farms'));
      let matchId = null;
      const target = String(currentUser.farm).trim().toLowerCase();
      allSnap.forEach(d => {
        const nm = String((d.data() || {}).name || '').trim().toLowerCase();
        if (!matchId && nm === target && /^[A-Za-z0-9]{20}$/.test(d.id)) matchId = d.id;
      });
      if (matchId) return matchId;
    } catch {}
    // 4) Not resolvable
    return null;
  };

  // Helper function to get the count of reports for user's assigned farm
  const getAssignedFarmReportCount = () => {
    if (!currentUser?.farm) return 0;
    
    const farmReports = reportsByFarm[currentUser.farm]?.reports || [];
    return farmReports.length;
  };

  // Helper function to get the next pond number
  const getNextPondNumber = () => {
    const maxPondNumber = Math.max(...pondOptions);
    return maxPondNumber + 1;
  };

  // Check if a pond number has any data under current filter context
  const hasDataForPond = (pondNumber) => {
    const normalizePondNum = (val) => {
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'string') {
        const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsed)) return parsed;
      }
      return null;
    };
    let farmIds = [];
    if (currentUser?.farm) {
      farmIds = [currentUser.farm];
    } else if (selectedFarmId && selectedFarmId !== 'all') {
      farmIds = [selectedFarmId];
    } else {
      farmIds = farms.map(f => f.id);
    }
    for (const fid of farmIds) {
      const reps = (reportsByFarm[fid]?.reports) || [];
      for (const r of reps) {
        const pn = normalizePondNum(r.pond);
        if (pn === pondNumber) return true;
      }
    }
    return false;
  };

  // Compute next pond number strictly from the given farm's fishPonds (per-farm suggestion)
  const getNextPondNumberFromDb = async (farmId) => {
    try {
      const snap = await getDocs(collection(db, 'farms', farmId, 'fishPonds'));
      let maxNum = 0;
      snap.forEach(docSnap => {
        const data = docSnap.data() || {};
        const name = String(data.name || '').trim();
        const explicitNumRaw = data.pondNumber;
        const explicitNum = explicitNumRaw != null && explicitNumRaw !== '' && !isNaN(parseInt(String(explicitNumRaw).trim(), 10))
          ? parseInt(String(explicitNumRaw).trim(), 10)
          : null;
        if (explicitNum != null && Number.isFinite(explicitNum)) {
          maxNum = Math.max(maxNum, explicitNum);
        } else {
          // Match patterns like "Fish pond 12" or numeric-only names
          const m = name.match(/^\s*fish\s*pond\s*(\d+)\s*$/i);
          if (m && m[1]) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n)) maxNum = Math.max(maxNum, n);
          } else {
            const n2 = parseInt(name, 10);
            if (!isNaN(n2)) maxNum = Math.max(maxNum, n2);
          }
        }
      });
      return (maxNum || 0) + 1;
    } catch (_) {
      // Safe fallback
      return 1;
    }
  };

  // Function to handle adding a new fishpond
  const handleAddFishpond = async () => {
    if (!newPondNumber.trim()) return;
    
    setAddingPond(true);
    try {
      // Determine farm context: assigned farm or selected farm (for Super Admin)
      const assignedFarmId = await getUserAssignedFarmId();
      const targetFarmId = assignedFarmId || newPondFarmId;
      if (!targetFarmId) {
        throw new Error('Please select a farm to add the fishpond to.');
      }
      // Verify farm doc exists (authoritative)
      const farmDocSnap = await getDoc(doc(db, 'farms', targetFarmId));
      if (!farmDocSnap.exists()) {
        throw new Error('Assigned farm document does not exist. Please contact admin.');
      }
      const assignedFarmName = farmDocSnap.data()?.name || getUserAssignedFarmName() || 'Unknown Farm';
      
      // Choose pond number: honor user's numeric input if available and not taken; otherwise use next available
      const rawInput = String(newPondNumber || '').trim();
      const requestedNum = extractPondNumber(rawInput);
      // Build a set of taken numbers for the target farm from Firestore to avoid duplicates
      const existingSnap = await getDocs(collection(db, 'farms', targetFarmId, 'fishPonds'));
      const takenSet = new Set();
      existingSnap.forEach(ds => {
        const d = ds.data() || {};
        const pnRaw = d.pondNumber;
        const pn = pnRaw != null && pnRaw !== '' && !isNaN(parseInt(String(pnRaw).trim(), 10))
          ? parseInt(String(pnRaw).trim(), 10)
          : (() => { const m = String(d.name || '').match(/(\d+)/); return m ? parseInt(m[1], 10) : null; })();
        if (pn != null && Number.isFinite(pn)) takenSet.add(pn);
      });
      // Compute next from the selected/target farm
      const fallbackNext = nextPondFromDb || await getNextPondNumberFromDb(targetFarmId);
      // Validate duplicate
      if (requestedNum && takenSet.has(requestedNum)) {
        setAddPondError(`You already have pond ${requestedNum}. Please choose a different number or a custom name (e.g., "Pond ${requestedNum}A").`);
        setAddingPond(false);
        return;
      }
      const chosenNum = (requestedNum && !takenSet.has(requestedNum)) ? requestedNum : fallbackNext;
      // If user typed a custom label (e.g., "tilapia"), append it to the official pond name
      // Accept formats like "tilapia", "Fish pond 14 - tilapia", or any text containing non-digits
      let customLabel = '';
      if (rawInput) {
        // Remove a leading canonical prefix if user typed it
        const withoutPrefix = rawInput.replace(/^\s*fish\s*pond\s*\d+\s*-?\s*/i, '').trim();
        // Consider as label if it contains letters or spaces beyond just the number
        if (withoutPrefix && /[A-Za-z]/.test(withoutPrefix)) {
          customLabel = withoutPrefix;
        }
      }
      const nameToSave = `Fish pond ${chosenNum}` + (customLabel ? ` - ${customLabel}` : '');

      // Document to be stored in top-level collection "fishPonds"
      const pondData = {
        name: nameToSave,
        pondNumber: String(chosenNum),
        status: "Active",
        createdAt: serverTimestamp(),
        farmName: assignedFarmName,
        created_by: currentUser?.uid,
      };

      // Add to fishPonds subcollection under the assigned farm id
      const docRef = await addDoc(collection(db, 'farms', targetFarmId, 'fishPonds'), pondData);

      // Log the activity
      await logActivity(
        'fishpond',
        `Added new fishpond "${nameToSave}" to ${assignedFarmName}`,
        currentUser?.username || currentUser?.email || 'Unknown',
        null,
        currentUser?.role || null
      );

      // Add to pond options if it's a number (keep current selection to avoid heavy reloads)
      if (!pondOptions.includes(chosenNum)) {
        setPondOptions(prev => [...prev, chosenNum].sort((a, b) => a - b));
      }

      
      
      // Reset form and show success toast, then close the form
      setNewPondNumber(String(chosenNum + 1));
      setNextPondFromDb(chosenNum + 1);
      setAddPondSuccess(`Successfully added Fish pond ${chosenNum} to ${assignedFarmName}.`);
      try { clearTimeout(window.__pondAddToastTimer); } catch(_) {}
      window.__pondAddToastTimer = setTimeout(() => setAddPondSuccess(''), 3500);
      // Auto-close the add form after the success message duration
      try { clearTimeout(window.__pondAddFormCloseTimer); } catch(_) {}
      window.__pondAddFormCloseTimer = setTimeout(() => setShowAddFishpondForm(false), 3500);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.error('Error adding fishpond:', err);
      }
      const message = err?.message || 'Unknown error';
      alert(`${t('pondCondition.addPond_failed')}: ${message}`);
    } finally {
      setAddingPond(false);
    }
  };

  if (loading || isProcessingNotification) {
    return (
      <div className="pond-condition-container">
        <div className="loading-state">
          <div className="loading-spinner" />
          <h3>{isProcessingNotification ? 'Processing notification...' : t('pondCondition.loading_reports')}</h3>
          <p>{isProcessingNotification ? 'Setting up farm and pond filters...' : t('pondCondition.fetching_latest_data')}</p>
        </div>
      </div>
    );
  }

  // When Stock & Feed Logs is opened, replace the Fish Pond Condition UI
  // so it doesn't overlay, and keep the same outer modal size.
  if (openLogsModal) {
    return (
      <div className={`pond-condition-container ${isModal ? 'modal-view' : ''}`} style={{ position: 'relative' }}>
        <button
          type="button"
          className="pond-logs-inline-close"
          onClick={() => setOpenLogsModal(null)}
          aria-label="Close Stock & Feed Logs and go back to Fish Pond Condition"
        >
          &times;
        </button>
        <StockFeedLogs farmId={openLogsModal.farmId} farmName={openLogsModal.farmName} />
      </div>
    );
  }

  return (
    <div className={`pond-condition-container ${isModal ? 'modal-view' : ''}`}>
      <div className="pond-report-header">
        <div className="header-content">
          <FaWater className="header-icon" />
          <h2>{t('pondCondition.pond_condition_reports')}</h2>
          <p className="header-subtitle">
            {currentUser?.farm ? 
              `${t('pondCondition.comprehensive_overview')} - ${getUserAssignedFarmName() || 'Assigned Farm'}` : 
              t('pondCondition.comprehensive_overview')
            }
            {selectedPond !== 'all' ? ` — Fish pond ${selectedPond}` : ''}
          </p>

        </div>
        
        {/* Export Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExportMenuOpen((v) => !v);
            }}
            title="Export"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              color: '#1A4375',
              cursor: 'pointer',
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: 1
            }}
          >
            <FaFileExport />
            <span style={{ textDecoration: 'underline' }}>Export</span>
          </button>
          {exportMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 6,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                zIndex: 5,
                minWidth: 180,
                overflow: 'hidden'
              }}
            >
              <button
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('export', logMessages.export.csvDownload(u, 'fishpond condition data with logs'), u); 
                    } catch (_) {}
                    const ts = new Date().toISOString().split('T')[0];
                    exportFishConditionWithLogsCSV(
                      filteredReports,
                      { farmId: selectedFarmId !== 'all' ? selectedFarmId : null, farmName: getUserAssignedFarmName(), reportFilter, customDate },
                      `fishpond_condition_reports_${ts}.csv`
                    );
                    setExportMenuOpen(false);
                  }}
              >
                Export CSV
              </button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
                  onClick={(e) => {
                    e.stopPropagation();
                    try { 
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      logActivity('export', logMessages.export.pdfDownload(u, 'fishpond condition data with logs'), u); 
                    } catch (_) {}
                    const ts = new Date().toISOString().split('T')[0];
                    exportFishConditionWithLogsPDF(
                      filteredReports,
                      { farmId: selectedFarmId !== 'all' ? selectedFarmId : null, farmName: getUserAssignedFarmName(), reportFilter, customDate },
                      `fishpond_condition_reports_${ts}.pdf`
                    );
                    setExportMenuOpen(false);
                  }}
              >
                Export PDF
              </button>
            </div>
          )}
        </div>
        
        <div className="report-summary">
          <div className="summary-item">
            <FaFish className="summary-icon" />
            <span className="summary-count">
              {currentUser?.farm ? getAssignedFarmReportCount() : allReports.length}
            </span>
            <span className="summary-label">
              {currentUser?.farm ? `${t('pondCondition.total_reports')} (${getUserAssignedFarmName()})` : t('pondCondition.total_reports')}
            </span>
          </div>
          
        </div>
      </div>

      <div className="filter-section">
        {!currentUser?.farm ? (
          <div className="filter-group">
            <label>{t('pondCondition.farm')}:</label>
            <select 
              value={selectedFarmId} 
              onChange={(e) => setSelectedFarmId(e.target.value)}
              className="filter-select"
            >
              <option value="all">{t('pondCondition.all_farms')}</option>
              {farms.map(f => (
                <option key={f.id} value={f.id}>{f.name || t('pondCondition.unnamed_farm')}{f.location ? ` — ${f.location}` : ''}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="filter-group">
            <label>{t('pondCondition.farm')}:</label>
            <div className="assigned-farm-display">
              <span className="assigned-farm-text">
                {getUserAssignedFarmName() || 'Your Assigned Farm'}
              </span>
            </div>
          </div>
        )}
        
        <div className="filter-group">
          <label>{t('pondCondition.pond')}:</label>
          <div className="pond-filter-container">
            <FormControl sx={{ minWidth: 160,
              '& .MuiOutlinedInput-root': { height: 40, borderRadius: '8px' },
              '& .MuiOutlinedInput-notchedOutline': { borderWidth: '2px', borderColor: '#e2e8f0' },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1A4375' },
              '& .MuiSelect-select': { padding: '8px 12px', fontSize: '0.95rem', color: '#1f2937' }
            }} size="small">
              <InputLabel id="pond-select-label">{t('pondCondition.pond')}</InputLabel>
              <Select
                labelId="pond-select-label"
                id="pond-select"
                value={selectedPond === 'all' || (typeof selectedPond === 'number' && pondOptions.includes(selectedPond)) ? selectedPond : 'all'}
                label={t('pondCondition.pond')}
                input={<OutlinedInput label={t('pondCondition.pond')} />}
                onOpen={() => setIsPondDropdownOpen(true)}
                onClose={() => setIsPondDropdownOpen(false)}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'all') {
                    setSelectedPond('all');
                  } else {
                    const numValue = Number(value);
                    if (!isNaN(numValue)) {
                      setSelectedPond(numValue);
                    }
                  }
                }}
                MenuProps={pondMenuProps}
              >
                <MenuItem value={'all'}>{t('pondCondition.all_ponds')}</MenuItem>
                {pondOptions
                  .filter((n) => String(pondStatusByNumber[n] || 'Active').toLowerCase() !== 'inactive')
                  .map((n) => {
                    const hasData = hasDataForPond(n);
                    const indicator = hasData ? '🟢' : '⚪';
                    const tooltipText = hasData ? 'Has Data' : 'No Data Yet';
                    return (
                      <MenuItem key={n} value={n}>
                        <Tooltip title={tooltipText} arrow placement="right">
                          <span style={{ width: '100%' }}>{`${indicator} ${t('pondCondition.pond')} ${n}`}</span>
                        </Tooltip>
                      </MenuItem>
                    );
                  })}
                {pondOptions.some((n) => String(pondStatusByNumber[n] || 'Active').toLowerCase() === 'inactive') && (
                  <MenuItem disabled divider>──────── Deactivated ────────</MenuItem>
                )}
                {pondOptions
                  .filter((n) => String(pondStatusByNumber[n] || 'Active').toLowerCase() === 'inactive')
                  .map((n) => {
                    const hasData = hasDataForPond(n);
                    const tooltipText = hasData ? 'Has Data' : 'No Data Yet';
                    return (
                      <MenuItem key={`inactive-${n}`} value={n}>
                        <Tooltip title={tooltipText} arrow placement="right">
                          <span style={{ width: '100%' }}>{`⚫ ${t('pondCondition.pond')} ${n} (Deactivated)`}</span>
                        </Tooltip>
                      </MenuItem>
                    );
                  })}
              </Select>
            </FormControl>
            
            {/* Add New Fishpond Button - Visible to assigned-farm users and unassigned Admin/Tech Officer/TTO */}
            {(
              (currentUser?.farm) ||
              (
                !currentUser?.farm && (
                  String(currentUser?.role || '').toLowerCase() === 'admin' ||
                  String(currentUser?.role || '').toLowerCase() === 'tech_officer' ||
                  String(currentUser?.role || '').toLowerCase() === 'tech officer' ||
                  String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer' ||
                  !!currentUser?.temporaryTechOfficer
                )
              )
            ) && (
            <button 
              className="add-fishpond-btn-small"
              onClick={async () => {
                const opening = !showAddFishpondForm;
                setShowAddFishpondForm(opening);
                setAddPondError('');
                setAddPondSuccess('');
                try { clearTimeout(window.__pondAddToastTimer); } catch(_) {}
                try { clearTimeout(window.__pondAddFormCloseTimer); } catch(_) {}
                if (opening) {
                  try {
                    const farmId = await getUserAssignedFarmId();
                    if (farmId) {
                      const next = await getNextPondNumberFromDb(farmId);
                      setNextPondFromDb(next);
                      setNewPondNumber(String(next));
                      setNewPondFarmId(farmId);
                    } else {
                      // Unassigned Admin/Tech Officer/TTO; wait for farm selection
                      setNextPondFromDb(null);
                      setNewPondNumber('');
                      setNewPondFarmId('');
                    }
                  } catch {
                    setNextPondFromDb(null);
                    setNewPondNumber('');
                    setNewPondFarmId('');
                  }
                } else {
                  setNextPondFromDb(null);
                  setAddPondError('');
                  setNewPondFarmId('');
                }
              }}
                title="Add a new fishpond to your assigned farm"
              >
                <FaPlus className="btn-icon" />
                {showAddFishpondForm ? 'Cancel' : 'Add'}
              </button>
            )}
            {selectedPond !== 'all' && (String(currentUser?.role || '').toLowerCase() === 'admin') && !!currentUser?.farm && (
              <button
                className="deactivate-pond-btn"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const farmId = await getUserAssignedFarmId();
                    if (!farmId || !selectedPond) return;
                    // Find the fishPonds doc for the selected pond number
                    const snap = await getDocs(collection(db, 'farms', farmId, 'fishPonds'));
                    let targetId = null;
                    let currentStatus = 'Active';
                    snap.forEach(d => {
                      const data = d.data() || {};
                      const nm = String(data.name || '').trim();
                      const m = nm.match(/^\s*fish\s*pond\s*(\d+)\s*$/i);
                      const num = m && m[1] ? parseInt(m[1], 10) : parseInt(nm, 10);
                      if (!isNaN(num) && num === Number(selectedPond)) {
                        targetId = d.id;
                        currentStatus = String(data.status || 'Active');
                      }
                    });
                    if (!targetId) return;
                    const nextStatus = currentStatus.toLowerCase() === 'inactive' ? 'Active' : 'Inactive';
                    // If deactivating and pond has data, show styled modal instead of window.confirm
                    if (nextStatus === 'Inactive' && hasDataForPond(Number(selectedPond))) {
                      setDeactivateConfirm({ open: true, pondNum: Number(selectedPond), farmId, targetId, nextStatus });
                      return;
                    }
                    await updateDoc(doc(db, 'farms', farmId, 'fishPonds', targetId), { status: nextStatus });
                    try {
                      const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                      let farmName = farms.find(f => f.id === farmId)?.name;
                      if (!farmName) {
                        const farmSnap = await getDoc(doc(db, 'farms', farmId));
                        farmName = farmSnap.exists() ? (farmSnap.data()?.name || 'Unknown Farm') : 'Unknown Farm';
                      }
                      const pondNum = Number(selectedPond);
                      const action = nextStatus === 'Inactive' ? 'Deactivated' : 'Activated';
                      await logActivity('fishpond', `${action} Fish pond ${pondNum} in ${farmName}`, u);
                    } catch (_) {}
                    // Refresh pond lists/status
                    const refreshed = await getDocs(collection(db, 'farms', farmId, 'fishPonds'));
                    const numbersSet = new Set();
                    const nameMap = {}; const statusMap = {};
                    refreshed.forEach(dd => {
                      const dat = dd.data() || {};
                      const nm = String(dat.name || '').trim();
                      const st = String(dat.status || 'Active');
                      const m2 = nm.match(/^\s*fish\s*pond\s*(\d+)\s*$/i);
                      const val = m2 && m2[1] ? parseInt(m2[1], 10) : parseInt(nm, 10);
                      if (!isNaN(val)) { numbersSet.add(val); if (!nameMap[val]) nameMap[val] = nm; statusMap[val] = st; }
                    });
                    setPondOptions(Array.from(numbersSet).sort((a,b)=>a-b));
                    setPondNameByNumber(nameMap);
                    setPondStatusByNumber(statusMap);
                  } catch (_) {}
                }}
                title="Deactivate/Activate selected pond"
              >
                {String(pondStatusByNumber[selectedPond] || 'Active').toLowerCase() === 'inactive' ? 'Activate' : 'Deactivate'}
              </button>
            )}
          </div>
        </div>
        
        <div className="filter-group">
          <label>{t('pondCondition.date_range')}:</label>
          <select 
            value={reportFilter} 
            onChange={(e) => setReportFilter(e.target.value)}
            className="filter-select"
          >
            <option value="today">{t('pondCondition.today')}</option>
            <option value="last7days">{t('pondCondition.last_7_days')}</option>
            <option value="thisMonth">This Month</option>
            <option value="custom">{t('pondCondition.custom_date')}</option>
          </select>
        </div>
        
        {reportFilter === 'custom' && (
          <div className="filter-group">
            <label>{t('pondCondition.select_date')}:</label>
            <input 
              type="date" 
              value={customDate} 
              onChange={(e) => setCustomDate(e.target.value)}
              className="filter-select"
            />
          </div>
        )}
      </div>

      {/* Add Fishpond Form - Inline Dropdown */}
      {showAddFishpondForm && (
        <div className="add-fishpond-dropdown">
          <div className="dropdown-content">
            <h4>Add New Fishpond</h4>
            {addPondSuccess && (
              <div className="form-success" style={{ marginBottom: 8, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '6px 10px', borderRadius: 6 }}>
                {addPondSuccess}
              </div>
            )}
            {!currentUser?.farm && (
              <div className="form-row">
                <label>Select Farm</label>
                <select
                  className="pond-input"
                  value={newPondFarmId}
                  onChange={async (e) => {
                    const fid = e.target.value;
                    setNewPondFarmId(fid);
                    if (fid) {
                      const next = await getNextPondNumberFromDb(fid);
                      setNextPondFromDb(next);
                      setNewPondNumber(String(next));
                      setAddPondError('');
                    } else {
                      setNextPondFromDb(null);
                      setNewPondNumber('');
                      setAddPondError('');
                    }
                  }}
                >
                  <option value="">Select a farm…</option>
                  {farms.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>{t('pondCondition.addPond_number_label')}</label>
                <input
                  type="text"
                  value={newPondNumber}
                  onChange={(e) => setNewPondNumber(e.target.value)}
                  placeholder={`${t('pondCondition.addPond_suggested')}: ${getNextPondNumber()}`}
                  className="pond-input"
                />
                <small className="form-hint">
                  {t('pondCondition.addPond_hint')}
                </small>
                {addPondError && (
                  <div className="form-error">{addPondError}</div>
                )}
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAddFishpondForm(false);
                    setNewPondNumber('');
                  }}
                  className="btn btn-cancel"
                  disabled={addingPond}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddFishpond(); }}
                  className="btn btn-add"
                  disabled={addingPond || !newPondNumber.trim()}
                >
                  {addingPond ? t('pondCondition.adding') : t('pondCondition.addPond')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="farm-cards-list">
        {farms.length === 0 ? (
          <div className="no-reports">
            <FaExclamationTriangle className="no-reports-icon" />
            <h3>{t('pondCondition.no_farms_found')}</h3>
            <p>{t('pondCondition.no_farms_match_criteria')}</p>
          </div>
        ) : (
          farms
            .filter(farm => {
              // If selectedFarmId is set (e.g., from notification), filter by that first
              if (selectedFarmId && selectedFarmId !== 'all') {
                const matches = farm.id === selectedFarmId;
                return matches;
              }
              // If user has a farm assignment, only show that farm
              if (currentUser?.farm) {
                const matches = farm.id === currentUser.farm;
                return matches;
              }
              // If a specific pond is selected, show only farms that have that pond number
              const selectedPondNum = (selectedPond && selectedPond !== 'all') ? Number(selectedPond) : null;
              if (selectedPondNum != null && Number.isFinite(selectedPondNum)) {
                const setForFarm = pondNumbersByFarm[farm.id];
                if (setForFarm instanceof Set) {
                  return setForFarm.has(selectedPondNum);
                }
              }
              // If user has no farm assignment, show all farms
              return true;
            })
            .map((farm) => {
            const group = reportsByFarm[farm.id];
            const farmReports = group?.reports || [];
            
            // Apply filters to farm reports
            const visibleReports = (() => {
              
              const today = new Date(); today.setHours(0,0,0,0);
              const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); sevenDaysAgo.setHours(0,0,0,0);
              const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
              const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
              const selectedPondNum = (selectedPond && selectedPond !== 'all') ? Number(selectedPond) : null;

              // Reuse the same inactive-pond logic used in the top-level filtering
              const hideIfInactive = (r) => {
                const pondNum = getReportPondNumber(r);
                let farmId = r.__farmId;
                if (!farmId && r.farm) {
                  const lower = String(r.farm).trim().toLowerCase();
                  const match = farms.find(f => String(f.name || '').trim().toLowerCase() === lower);
                  if (match) farmId = match.id;
                }
                if (farmId && pondInactiveByFarm[farmId] instanceof Set) {
                  return !pondInactiveByFarm[farmId].has(pondNum);
                }
                const status = String(pondStatusByNumber[pondNum] || 'Active').trim().toLowerCase();
                return status !== 'inactive';
              };

              let filteredReports = [];

              switch (reportFilter) {
                case 'today':
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate.toDateString() === today.toDateString();
                    const matchesPond = !selectedPondNum || getReportPondNumber(r) === selectedPondNum;
                    const isActive = hideIfInactive(r);
                    return matchesDate && matchesPond && isActive;
                  });
                  break;
                case 'last7days':
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate >= sevenDaysAgo;
                    const matchesPond = !selectedPondNum || getReportPondNumber(r) === selectedPondNum;
                    const isActive = hideIfInactive(r);
                    return matchesDate && matchesPond && isActive;
                  });
                  break;
                case 'thisMonth':
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate >= startOfMonth && reportDate <= endOfMonth;
                    const matchesPond = !selectedPondNum || getReportPondNumber(r) === selectedPondNum;
                    const isActive = hideIfInactive(r);
                    return matchesDate && matchesPond && isActive;
                  });
                  break;
                case 'custom':
                  if (!customDate) return [];
                  const d0 = new Date(customDate); d0.setHours(0,0,0,0);
                  const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
                  filteredReports = farmReports.filter(r => {
                    const reportDate = new Date(r.date);
                    const matchesDate = reportDate >= d0 && reportDate < d1;
                    const matchesPond = !selectedPondNum || getReportPondNumber(r) === selectedPondNum;
                    const isActive = hideIfInactive(r);
                    return matchesDate && matchesPond && isActive;
                  });
                  break;
                default:
                  filteredReports = (selectedPondNum
                    ? farmReports.filter(r => getReportPondNumber(r) === selectedPondNum)
                    : farmReports
                  ).filter(r => hideIfInactive(r));
              }

              return filteredReports;
            })();

            // Show farm card even if no reports match current filter, but show message
            if (visibleReports.length === 0 && selectedFarmId !== 'all') {
            }

            return (
              <div key={farm.id} className="farm-report-card">
                <div className={`farm-summary-view ${expandedFarms.has(farm.id) ? 'expanded' : ''}`} onClick={() => toggleExpanded(farm.id)}>
                  <div className="summary-content">
                    <div className="summary-title">
                      <h3 className="farm-title">
                        {farm.name || t('pondCondition.unnamed_farm')} 
                        <span className="farm-location">{farm.location ? ` — ${farm.location}` : ''}</span>
                      </h3>
                      <div className="summary-meta">
                        <span className="report-count">{visibleReports.length} {t('pondCondition.report_s')}</span>
                        <span className="timestamp">
                          <FaCalendarAlt className="time-icon" />
                          {t('pondCondition.latest')}: {visibleReports.length > 0 ? formatTimestamp(visibleReports[0].date) : t('pondCondition.no_reports')}
                        </span>
                        <button
                          className="logs-link-btn"
                          style={{ marginLeft: 8 }}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            try { 
                              const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                              logActivity('report', `View Stock & Feed Logs opened for farm ${farm.name}`, u); 
                            } catch (_) {}
                            setOpenLogsModal({ farmId: farm.id, farmName: farm.name }); 
                          }}
                        >
                          View Stock & Feed Logs
                        </button>
                      </div>
                    </div>
                    <div className="summary-indicators">
                      <div className="expand-icon">
                        {expandedFarms.has(farm.id) ? <FaChevronDown /> : <FaChevronRight />}
                      </div>
                    </div>
                  </div>
                </div>
                
                {expandedFarms.has(farm.id) && (
                  <div className="farm-detail-view">
                    {visibleReports.length === 0 ? (
                      <div className="no-reports">
                        <p>{t('pondCondition.no_reports_for_selected_filters')}</p>
                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '10px' }}>
                          Debug: Total farm reports: {farmReports.length} | Filter: {reportFilter} | Pond: {selectedPond}
                        </p>
                      </div>
                    ) : (
                      visibleReports.map((report) => (
                        <div key={report.id} className="report-detail-card" onMouseEnter={() => { try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('report', logMessages.report.reportView(u, report.pond || 'Unknown'), u); } catch (_) {} }}>
                          <div className="report-header">
                            <div className="report-header-left">
                              <span className="pond-badge">{report.pond || t('pondCondition.unknown_pond')}</span>
                              <span className={`status-badge ${String(report.status||'').toLowerCase().replace(/\s+/g,'-')}`}>{report.status || '—'}</span>
                              {String(report.status || '').toLowerCase() === 'pending' && canMarkAsReviewed() && (
                                <button
                                  className="mark-reviewed-btn"
                                  onClick={(e) => { e.stopPropagation(); markReportAsReviewed(report, farm); }}
                                  title="Mark this report as reviewed"
                                >
                                  Mark as Reviewed
                                </button>
                              )}
                              <span className={`harvest-badge ${report.harvest === 'Ready' ? 'ready' : 'not-ready'}`}>{report.harvest === 'Ready' ? t('pondCondition.harvest_ready') : t('pondCondition.not_ready')}</span>
                            </div>
                            <span className="report-date">{formatTimestamp(report.date)}</span>
                          </div>
                          
                          <div className="report-content">
                            <div className="condition-grid">
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.fish_condition')}</span>
                                <span className="condition-value">
                                  {getConditionIcon(report.fish)}
                                  {report.fish || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.water_condition')}</span>
                                <span className="condition-value">
                                  {getConditionIcon(report.water)}
                                  {report.water || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.weather')}</span>
                                <span className="condition-value">
                                  <FaCloud className="weather-icon" />
                                  {report.weather || '—'}
                                </span>
                              </div>
                              <div className="condition-item">
                                <span className="condition-label">{t('pondCondition.harvest')}</span>
                                <span className="condition-value">
                                  {report.harvest === 'Ready' ? t('pondCondition.yes') : t('pondCondition.no')}</span>
                              </div>
                            </div>
                            
                            <div className="report-meta">
                              <div className="meta-item">
                                <span className="meta-label">{t('pondCondition.submitted_by')}</span>
                                <span className="meta-value">{report.submittedBy || '—'}{report.userRole ? ` (${report.userRole})` : ''}</span>
                              </div>
                              {(report.reviewedBy || report.reviewedAt) && (
                                <div className="meta-item">
                                  <span className="meta-label">Reviewed</span>
                                  <span className="meta-value">
                                    {report.reviewedBy ? `by ${report.reviewedBy}${report.reviewedByRole ? ` (${report.reviewedByRole})` : ''}` : ''}
                                    {report.reviewedAt ? ` on ${formatTimestamp(report.reviewedAt)}` : ''}
                                  </span>
                                </div>
                              )}
                              {report.contact || report.email ? (
                                <div className="meta-item">
                                  <span className="meta-label">{t('pondCondition.contact')}</span>
                                  <span className="meta-value">{[report.contact, report.email].filter(Boolean).join(' | ') || '—'}</span>
                                </div>
                              ) : null}
                            </div>
                            
                            {report.notes && (
                              <div className="report-notes">
                                <span className="notes-label">{t('pondCondition.additional_notes')}:</span>
                                <p className="notes-content">{report.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Deactivate Confirmation Modal */}
      <AnimatedModal
        isOpen={deactivateConfirm.open}
        onClose={() => setDeactivateConfirm({ open: false, pondNum: null, farmId: null, targetId: null, nextStatus: 'Inactive' })}
        title={deactivateConfirm.pondNum ? `Deactivate Fish pond ${deactivateConfirm.pondNum}?` : 'Deactivate Pond?'}
        icon={<FaExclamationTriangle />}
        containerClassName="small-modal"
        overlayClassName="left-shift"
      >
        <div style={{ padding: 8 }}>
          <p style={{ marginTop: 0, color: '#374151', fontSize: '0.92rem', lineHeight: 1.35 }}>This pond has existing reports. If you deactivate it, those reports will be hidden in this dashboard until you activate the pond again.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              className="btn btn-cancel"
              onClick={() => setDeactivateConfirm({ open: false, pondNum: null, farmId: null, targetId: null, nextStatus: 'Inactive' })}
            >
              Cancel
            </button>
            <button
              className="deactivate-pond-btn"
              onClick={async () => {
                try {
                  const { farmId, targetId, nextStatus } = deactivateConfirm;
                  if (!farmId || !targetId) return;
                  await updateDoc(doc(db, 'farms', farmId, 'fishPonds', targetId), { status: nextStatus });
                  try {
                    const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown';
                    let farmName = farms.find(f => f.id === farmId)?.name;
                    if (!farmName) {
                      const farmSnap = await getDoc(doc(db, 'farms', farmId));
                      farmName = farmSnap.exists() ? (farmSnap.data()?.name || 'Unknown Farm') : 'Unknown Farm';
                    }
                    const pondNum = deactivateConfirm.pondNum ?? null;
                    const action = nextStatus === 'Inactive' ? 'Deactivated' : 'Activated';
                    await logActivity('fishpond', `${action} Fish pond ${pondNum} in ${farmName}`, u);
                  } catch (_) {}
                  const refreshed = await getDocs(collection(db, 'farms', farmId, 'fishPonds'));
                  const numbersSet = new Set(); const nameMap = {}; const statusMap = {};
                  refreshed.forEach(dd => {
                    const dat = dd.data() || {};
                    const nm = String(dat.name || '').trim();
                    const st = String(dat.status || 'Active');
                    const m2 = nm.match(/^\s*fish\s*pond\s*(\d+)\s*$/i);
                    const val = m2 && m2[1] ? parseInt(m2[1], 10) : parseInt(nm, 10);
                    if (!isNaN(val)) { numbersSet.add(val); if (!nameMap[val]) nameMap[val] = nm; statusMap[val] = st; }
                  });
                  setPondOptions(Array.from(numbersSet).sort((a,b)=>a-b));
                  setPondNameByNumber(nameMap);
                  setPondStatusByNumber(statusMap);
                } catch (_) {}
                setDeactivateConfirm({ open: false, pondNum: null, farmId: null, targetId: null, nextStatus: 'Inactive' });
              }}
            >
              Deactivate
            </button>
          </div>
        </div>
      </AnimatedModal>

      <AnimatedModal
        isOpen={!!openLogsModal}
        onClose={() => setOpenLogsModal(null)}
        title={openLogsModal ? `Stock & Feed Logs — ${openLogsModal.farmName || ''}` : ''}
        icon={<FaFish />}
        containerClassName="align-left"
        overlayClassName="align-left"
        bodyClassName="hide-scrollbar"
      >
        {openLogsModal && (
          <StockFeedLogs farmId={openLogsModal.farmId} farmName={openLogsModal.farmName} />
        )}
      </AnimatedModal>

    </div>
  );
};

export default PondConditionDashboard;