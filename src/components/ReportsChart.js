import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Label, Cell, ReferenceLine } from 'recharts';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './ReportsChart.css';
import { GiHamburgerMenu } from 'react-icons/gi';
import { FaSyncAlt } from 'react-icons/fa';
import { useReportsData } from '../contexts/ReportsDataContext';
import { useRefreshFeedback } from '../hooks/useRefreshFeedback';
import RefreshStatusMessage from './RefreshStatusMessage';
import { downloadReportsChartImage, exportReportsDataCSV } from '../utils/exportReportsChart';
import { useAuth } from '../contexts/AuthContext';
import { useFarms } from '../contexts/FarmsContext';
import { logActivity, logMessages, logTemporaryTechOfficerActivity } from '../utils/logger';
import { useTranslation } from 'react-i18next';

function ReportsChart({ dropdownCoordinator, onDropdownOpen }) {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { farmsById, farms } = useFarms();
  const { refreshReportsData } = useReportsData();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataRefreshTick, setDataRefreshTick] = useState(0);
  const { status: refreshStatus, runRefresh, isRefreshing: refreshingChart } = useRefreshFeedback();
  const [timeFilter, setTimeFilter] = useState('weekly'); // 'all', 'daily', 'weekly', 'monthly'
  const [viewMode, setViewMode] = useState('farm'); // 'farm', 'date'
  const [selectedFarm, setSelectedFarm] = useState('all'); // For consistency with stacked chart
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileExportOpen, setMobileExportOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  // Role helpers
  const roleLower = String(currentUser?.role || '').toLowerCase();
  const isTemporaryTechOfficer =
    currentUser?.temporaryTechOfficer ||
    roleLower === 'temp_tech_officer' ||
    roleLower === 'temporary tech officer';

  const isTechOfficer =
    roleLower === 'tech_officer' ||
    roleLower === 'tech officer' ||
    roleLower === 'new_main_tech_officer' ||
    roleLower === 'new main tech officer' ||
    isTemporaryTechOfficer;

  // Check if user is assigned to a farm (but not TTOs - they should see all farms)
  const isAssignedToFarm = Boolean(currentUser?.farm) && !isTemporaryTechOfficer;

  // Track viewport width for responsive behavior
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Close mobile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileExportOpen && !event.target.closest('.mobile-export-dropdown')) {
        setMobileExportOpen(false);
      }
    };

    if (mobileExportOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [mobileExportOpen]);

  useEffect(() => {
    if (!dropdownCoordinator?.signal) return;
    if (dropdownCoordinator.source !== 'homepageReportsExport') {
      setExportOpen(false);
      setMobileExportOpen(false);
    }
  }, [dropdownCoordinator]);

  // Initialize viewMode and timeFilter for assigned non-Tech Officer users
  useEffect(() => {
    if (isAssignedToFarm && !isTechOfficer) {
      setViewMode('date');
      setTimeFilter('daily');
    }
  }, [isAssignedToFarm, isTechOfficer]);

  const isStdPhone = viewportWidth >= 360 && viewportWidth <= 480;

  // Create the same filteredFarms logic as PondsAtRiskStackedChart
  const filteredFarms = useMemo(() => {
    if (!farms || farms.length === 0) return [];
    
    // Canonicalize all farms first (simplified version)
    const canon = farms.map(f => ({ ...f, name: f.name || 'Unknown Farm' }));
    
    if (isAssignedToFarm) {
      // For assigned users, only show their farm
      return canon.filter(f => 
        f.key === currentUser.farm || 
        f.name === assignedFarmName || 
        f.name === currentUser.farm
      );
    }
    
    // For non-assigned users, show all farms except excluded ones
    return canon.filter(f => 
      f.key !== 'WgS4mBVnPFPMGq7vfSYa' && 
      f.name !== 'Rojo Hatchery' &&
      f.name !== 'Freshwater Finfish Farm' &&
      !f.name?.toLowerCase().includes('freshwater finfish')
    );
  }, [farms, isAssignedToFarm, currentUser?.farm, assignedFarmName]);

  // Dynamic title and subtitle based on view mode
  const chartTitle = viewMode === 'farm' 
    ? (isAssignedToFarm ? `Reports Submitted by ${assignedFarmName || currentUser.farm}` : 'Reports Submitted by Fish Farmers')
    : (isAssignedToFarm ? `Reports Submitted Over Time - ${assignedFarmName || currentUser.farm}` : 'Reports Submitted Over Time');

  const chartSubtitle = viewMode === 'farm'
    ? (isAssignedToFarm
        ? `Each bar shows how many reports were submitted from your assigned farm during the selected time period.`
        : `Each bar (or bar group) shows how many reports were submitted from each farm during the selected time period.`)
    : (isAssignedToFarm
        ? `Each bar shows how many reports were submitted from your assigned farm for each ${timeFilter === 'daily' ? 'day of the current week' : timeFilter === 'weekly' ? 'week of the current month' : timeFilter === 'monthly' ? 'month of the current year' : 'period'}.`
        : `Each bar shows how many reports were submitted (all farms combined) for each ${timeFilter === 'daily' ? 'day of the current week' : timeFilter === 'weekly' ? 'week of the current month' : timeFilter === 'monthly' ? 'month of the current year' : 'period'}.`);

  // Farm colors matching the stacked bar chart (View by Risk mode)
  const farmColorMap = useMemo(() => {
    // Use the same color palette as PondsAtRiskStackedChart
    const palette = [
      '#94AECA', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
      '#edc949', '#af7aa1', '#ff9da7', '#9c755f', '#bab0ab',
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ];
    
    const custom = {
      'Salmon Hatchery': '#e24a33', // darker salmon (tomato) for better contrast
    };
    
    const map = new Map();
    
    // Use the same farm order as the stacked chart
    filteredFarms.forEach((f, idx) => {
      const defaultColor = palette[idx % palette.length];
      // Apply custom color only when showing All Farms and grouping by risk
      const useCustom = (selectedFarm === 'all' && viewMode === 'farm' && custom[f.name]);
      map.set(f.name, useCustom ? custom[f.name] : defaultColor);
    });
    
    return map;
  }, [filteredFarms, viewMode]);

  const getFarmColor = (farmName) => {
    return farmColorMap.get(farmName) || '#7ffcff';
  };

  // Known farms canonical list used for grouped views
  const KNOWN_FARMS = useMemo(() => (
    ['Aquino Fish Farm', "Vergara's Aqua Farm", 'Maningas Fish Farm', 'Labay Fish Farm']
  ), []);

  // Color indicators based on activity levels (for non-farm views)
  const getActivityColor = (count, maxCount) => {
    if (maxCount === 0) return '#e0e0e0'; // No data
    const ratio = count / maxCount;
    if (ratio >= 0.7) return '#4CAF50'; // High activity - green
    if (ratio >= 0.4) return '#FF9800'; // Medium activity - orange
    return '#F44336'; // Low activity - red
  };

  // Generate summary insights
  const generateSummary = () => {
    if (!data || data.length === 0) return 'No reports submitted in the selected period.';

    const periodLabel =
      timeFilter === 'all' ? 'all time' :
      timeFilter === 'daily' ? 'this week' :
      timeFilter === 'weekly' ? 'this month' :
      timeFilter === 'monthly' ? 'this year' :
      'the selected period';

    // In farm view with daily/weekly/monthly, chart rows look like:
    // { day|week|month, "Aquino Fish Farm": n, ... }
    const isGroupedFarmView =
      viewMode === 'farm' &&
      (timeFilter === 'daily' || timeFilter === 'weekly' || timeFilter === 'monthly') &&
      data.some(row => row && typeof row === 'object' && KNOWN_FARMS.some(f => typeof row[f] === 'number'));

    if (viewMode === 'farm' && isGroupedFarmView) {
      const totalsByFarm = {};
      KNOWN_FARMS.forEach(f => { totalsByFarm[f] = 0; });

      for (const row of data) {
        for (const farm of KNOWN_FARMS) {
          const v = Number(row?.[farm] || 0);
          if (!Number.isNaN(v)) totalsByFarm[farm] += v;
        }
      }

      const totalReports = Object.values(totalsByFarm).reduce((a, b) => a + b, 0);
      if (totalReports === 0) {
        return `No reports submitted across all farms in ${periodLabel}.`;
      }

      let topFarm = null;
      let maxReports = -1;
      for (const farm of KNOWN_FARMS) {
        if (totalsByFarm[farm] > maxReports) {
          maxReports = totalsByFarm[farm];
          topFarm = farm;
        }
      }

      return `${topFarm} submitted the most reports (${maxReports}). ${totalReports} reports submitted across all farms in ${periodLabel}.`;
    }

    // Default shape (e.g. viewMode=farm + all-time OR viewMode=date):
    // rows look like { farm, reports } OR { day|week|month, reports }
    const totalReports = data.reduce((sum, item) => sum + (item.reports || 0), 0);
    const maxReports = Math.max(...data.map(item => item.reports || 0));

    if (viewMode === 'farm') {
      if (totalReports === 0) return `No reports submitted across all farms in ${periodLabel}.`;
      const topPerformer = data.find(item => (item.reports || 0) === maxReports);
      const topName = topPerformer?.farm || topPerformer?.name || 'Top farm';
      return `${topName} submitted the most reports (${maxReports}). ${totalReports} reports submitted across all farms in ${periodLabel}.`;
    }

    if (totalReports === 0) return `No reports submitted in ${periodLabel}.`;
    return `${totalReports} reports submitted in ${periodLabel}. Reporting activity ${maxReports > 0 ? 'remains steady' : 'is low'}.`;
  };

  // Resolve assigned farm name from live Farms map first (fallback to Firestore fetch)
  useEffect(() => {
    const run = async () => {
      if (!isAssignedToFarm || !currentUser.farm) return;
      const fromMap = farmsById[currentUser.farm]?.name;
      if (fromMap) {
        setAssignedFarmName(fromMap);
        return;
      }
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const farmDoc = await getDoc(doc(db, 'farms', currentUser.farm));
        setAssignedFarmName((farmDoc.exists() && farmDoc.data().name) || currentUser.farm);
      } catch (_) {
        setAssignedFarmName(currentUser.farm);
      }
    };
    run();
  }, [isAssignedToFarm, currentUser?.farm, farmsById]);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const reportsRef = collection(db, 'reports');
        let querySnapshot = null;

        const runQuery = async (q) => {
          try {
            return await getDocs(q);
          } catch (_) {
            return null;
          }
        };

        if (isAssignedToFarm && currentUser?.farm) {
          const farmId = currentUser.farm;
          const farmName = assignedFarmName || farmsById[farmId]?.name || '';
          const attempts = [
            query(reportsRef, where('farm', '==', farmId), orderBy('timestamp', 'desc')),
            query(reportsRef, where('farmId', '==', farmId), orderBy('timestamp', 'desc')),
            query(reportsRef, where('farm_id', '==', farmId), orderBy('timestamp', 'desc')),
          ];
          if (farmName) {
            attempts.push(
              query(reportsRef, where('farm', '==', farmName), orderBy('timestamp', 'desc')),
              query(reportsRef, where('farm_name', '==', farmName), orderBy('timestamp', 'desc'))
            );
          }
          for (const q of attempts) {
            const snap = await runQuery(q);
            if (snap && snap.docs.length > 0) {
              querySnapshot = snap;
              break;
            }
          }
        }

        if (!querySnapshot) {
          querySnapshot = await getDocs(query(reportsRef, orderBy('timestamp', 'desc')));
        }
        
        let allReports = querySnapshot.docs
          .map(doc => {
            const data = doc.data();
            let date;
            try {
              // Try different timestamp field names
              if (data.timestamp && data.timestamp.toDate) {
                date = data.timestamp.toDate();
              } else if (data.createdAt && data.createdAt.toDate) {
                date = data.createdAt.toDate();
              } else if (data.date) {
                date = new Date(data.date);
              } else if (data.timestamp) {
                date = new Date(data.timestamp);
              } else {
                date = new Date(); // Fallback to current date
              }
            } catch (error) {
              date = new Date(); // Fallback to current date
            }
            
            return {
              date,
              farm: data.farm || data.farm_name || data.farmId || data.farm_id || 'Unknown Farm',
              farmId: data.farmId || data.farm_id || data.farm,
              farmName: data.farm_name || data.farm,
              userName: data.userName || data.user || data.submittedBy || data.email || 'Unknown User'
            };
          })
          .filter(report => 
            report.farmId !== 'WgS4mBVnPFPMGq7vfSYa' && 
            report.farm !== 'Rojo Hatchery' &&
            report.farm !== 'Freshwater Finfish Farm' &&
            !report.farm?.toLowerCase().includes('freshwater finfish')
          ); // Exclude Rojo Hatchery and Freshwater Finfish Farm reports

        // If user is assigned to a farm, filter to show only their assigned farm
        if (isAssignedToFarm && allReports.length > 0) {
          allReports = allReports.filter(report => {
            const farmMatch = report.farm === currentUser.farm || 
                            report.farmId === currentUser.farm ||
                            report.farmName === assignedFarmName ||
                            report.farm === assignedFarmName;
            return farmMatch;
          });
        }

        let chartData = [];
        const now = new Date();

        // Process data based on view mode
        if (viewMode === 'farm') {
          // Group by farm with proper name mapping and time filtering
          const farmCounts = {};
          
          // Farm name mapping from riskDataService
          const idToNewName = {
            'NyhjBvh9N9wfsOJ2qeEa': 'Aquino Fish Farm',
            'TP3p0y4iQlo2j0loELQb': "Vergara's Aqua Farm",
            'egGEARKL6Qk5jNgrY3Yu': 'Maningas Fish Farm',
            's5zKKXTBkF3voYnV8wuh': 'Labay Fish Farm',
          };
          
          const legacyMap = {
            'salmon-hatchery-facility': 'Aquino Fish Farm',
            'tilapia-production-center': "Vergara's Aqua Farm",
            'blue-ocean-aquafarm': 'Maningas Fish Farm',
            'marine-species-cultivation': 'Labay Fish Farm',
          };
          
          // Special handling: in farm view + daily, show Mon-Sun with 4 bars per day
          if (timeFilter === 'daily') {
            // build current week Monday-Sunday
            const startOfWeek = new Date(now);
            const day = startOfWeek.getDay(); // 0 Sun .. 6 Sat
            const diffToMonday = (day === 0 ? -6 : 1 - day);
            startOfWeek.setDate(now.getDate() + diffToMonday);
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            const days = [];
            for (let i = 0; i < 7; i++) {
              const d = new Date(startOfWeek);
              d.setDate(startOfWeek.getDate() + i);
              const dayKey = d.toLocaleDateString('en-US', { weekday: 'short' });
              const row = { day: dayKey, dateObj: d };
              KNOWN_FARMS.forEach(f => { row[f] = 0; });
              days.push(row);
            }

            // Count per farm per day using name mapping
            const mapFarmName = (report) => {
              let farmName = report.farm || report.farmName || 'Unknown Farm';
              if (report.farmId && idToNewName[report.farmId]) return idToNewName[report.farmId];
              if (legacyMap[farmName]) return legacyMap[farmName];
              const lower = String(farmName).toLowerCase();
              if (lower.includes('aquino')) return 'Aquino Fish Farm';
              if (lower.includes('vergara')) return "Vergara's Aqua Farm";
              if (lower.includes('maningas')) return 'Maningas Fish Farm';
              if (lower.includes('labay')) return 'Labay Fish Farm';
              return farmName;
            };

            allReports.forEach(r => {
              if (r.date < startOfWeek || r.date > endOfWeek) return;
              const farmName = mapFarmName(r);
              if (!KNOWN_FARMS.includes(farmName)) return;
              const idx = days.findIndex(d => d.dateObj.getFullYear() === r.date.getFullYear() && d.dateObj.getMonth() === r.date.getMonth() && d.dateObj.getDate() === r.date.getDate());
              if (idx !== -1) {
                days[idx][farmName] = (days[idx][farmName] || 0) + 1;
              }
            });

            chartData = days.map(({ dateObj, ...rest }) => rest);
          } else if (timeFilter === 'weekly') {
            // Weekly grouping: current month weeks, 4 bars per week
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const firstDayOfMonth = startOfMonth.getDay();
            const totalDays = endOfMonth.getDate();
            const totalWeeks = Math.ceil((totalDays + firstDayOfMonth) / 7);

            const weeks = Array.from({ length: totalWeeks }, (_, i) => {
              const row = { week: `Week ${i + 1}` };
              KNOWN_FARMS.forEach(f => { row[f] = 0; });
              return row;
            });

            const mapFarmName = (report) => {
              let farmName = report.farm || report.farmName || 'Unknown Farm';
              if (report.farmId && idToNewName[report.farmId]) return idToNewName[report.farmId];
              if (legacyMap[farmName]) return legacyMap[farmName];
              const lower = String(farmName).toLowerCase();
              if (lower.includes('aquino')) return 'Aquino Fish Farm';
              if (lower.includes('vergara')) return "Vergara's Aqua Farm";
              if (lower.includes('maningas')) return 'Maningas Fish Farm';
              if (lower.includes('labay')) return 'Labay Fish Farm';
              return farmName;
            };

            allReports.forEach(r => {
              const d = r.date;
              if (d < startOfMonth || d > endOfMonth) return;
              const farmName = mapFarmName(r);
              if (!KNOWN_FARMS.includes(farmName)) return;
              const dayOfMonth = d.getDate();
              const weekNumber = Math.floor((dayOfMonth + firstDayOfMonth - 1) / 7);
              if (weekNumber >= 0 && weekNumber < totalWeeks) {
                weeks[weekNumber][farmName] = (weeks[weekNumber][farmName] || 0) + 1;
              }
            });

            chartData = weeks;
          } else if (timeFilter === 'monthly') {
            // Monthly grouping: last 6 months, 4 bars per month
            const months = Array.from({ length: 6 }, (_, i) => {
              const monthIndex = (now.getMonth() - i + 12) % 12;
              const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const row = { month: monthNames[monthIndex] };
              KNOWN_FARMS.forEach(f => { row[f] = 0; });
              return row;
            }).reverse();

            const mapFarmName = (report) => {
              let farmName = report.farm || report.farmName || 'Unknown Farm';
              if (report.farmId && idToNewName[report.farmId]) return idToNewName[report.farmId];
              if (legacyMap[farmName]) return legacyMap[farmName];
              const lower = String(farmName).toLowerCase();
              if (lower.includes('aquino')) return 'Aquino Fish Farm';
              if (lower.includes('vergara')) return "Vergara's Aqua Farm";
              if (lower.includes('maningas')) return 'Maningas Fish Farm';
              if (lower.includes('labay')) return 'Labay Fish Farm';
              return farmName;
            };

            allReports.forEach(r => {
              const d = r.date;
              const monthDiff = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
              if (monthDiff < 6) {
                const farmName = mapFarmName(r);
                if (!KNOWN_FARMS.includes(farmName)) return;
                const monthIndex = 5 - monthDiff; // Reverse order
                months[monthIndex][farmName] = (months[monthIndex][farmName] || 0) + 1;
              }
            });

            // Ensure we always have 6 months for consistent divider rendering
            chartData = months.length === 6 ? months : months;
          } else {
            // Apply time filter when viewing by farm for non-daily modes, then aggregate per farm
            let filteredReports = allReports;
            if (timeFilter !== 'all') {
              const start = new Date(now);
              const end = new Date(now);
              if (timeFilter === 'weekly') {
                // current month
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setMonth(now.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
              } else if (timeFilter === 'monthly') {
                // last 6 months window
                const startMonthly = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                const endMonthly = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                endMonthly.setHours(23, 59, 59, 999);
                filteredReports = filteredReports.filter(r => r.date >= startMonthly && r.date <= endMonthly);
              }
              if (timeFilter === 'weekly') {
                filteredReports = filteredReports.filter(r => r.date >= start && r.date <= end);
              }
            }

            // Initialize all known farms with 0 reports
            KNOWN_FARMS.forEach(farm => { farmCounts[farm] = 0; });

            filteredReports.forEach(report => {
              let farmName = report.farm || report.farmName || 'Unknown Farm';
              if (report.farmId && idToNewName[report.farmId]) {
                farmName = idToNewName[report.farmId];
              } else if (legacyMap[farmName]) {
                farmName = legacyMap[farmName];
              } else if (farmName.toLowerCase().includes('aquino')) {
                farmName = 'Aquino Fish Farm';
              } else if (farmName.toLowerCase().includes('vergara')) {
                farmName = "Vergara's Aqua Farm";
              } else if (farmName.toLowerCase().includes('maningas')) {
                farmName = 'Maningas Fish Farm';
              } else if (farmName.toLowerCase().includes('labay')) {
                farmName = 'Labay Fish Farm';
              }
              if (KNOWN_FARMS.includes(farmName)) {
                farmCounts[farmName] = (farmCounts[farmName] || 0) + 1;
              }
            });

            chartData = Object.entries(farmCounts)
              .map(([farm, reports]) => ({ farm, reports, color: getFarmColor(farm) }))
              .sort((a, b) => b.reports - a.reports);
          }
          
          
        } else {
          // Default to date-based view (existing logic)
          switch (timeFilter) {
          case 'daily':
            // Get reports for the last 7 days (more useful than current week)
            const sevenDaysAgo = new Date(now);
            sevenDaysAgo.setDate(now.getDate() - 6); // Last 7 days including today
            sevenDaysAgo.setHours(0, 0, 0, 0);

            const endOfToday = new Date(now);
            endOfToday.setHours(23, 59, 59, 999);


            // Initialize data for the last 7 days
            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
              const date = new Date(now);
              date.setDate(now.getDate() - i);
              const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
              last7Days.push({ 
                day: dayName, 
                reports: 0,
                fullDate: new Date(date) // Keep full date for filtering
              });
            }

            // Count reports for each day
            allReports.forEach(report => {
              const reportDate = report.date;
              if (reportDate >= sevenDaysAgo && reportDate <= endOfToday) {
                // Find which day this report belongs to
                const dayIndex = last7Days.findIndex(day => {
                  const dayDate = day.fullDate;
                  return reportDate.getDate() === dayDate.getDate() &&
                         reportDate.getMonth() === dayDate.getMonth() &&
                         reportDate.getFullYear() === dayDate.getFullYear();
                });
                if (dayIndex !== -1) {
                  last7Days[dayIndex].reports++;
                }
              }
            });


            chartData = last7Days;
            break;

          case 'weekly':
            // Get current month's reports
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

            // Calculate total weeks in the month
            const firstDayOfMonth = startOfMonth.getDay();
            const totalDays = endOfMonth.getDate();
            const totalWeeks = Math.ceil((totalDays + firstDayOfMonth) / 7);

            // Initialize weeks array with the correct number of weeks
            const weeks = Array(totalWeeks).fill(0);
            
            allReports.forEach(report => {
              const reportDate = report.date;
              if (reportDate >= startOfMonth && reportDate <= endOfMonth) {
                const dayOfMonth = reportDate.getDate();
                const weekNumber = Math.floor((dayOfMonth + firstDayOfMonth - 1) / 7);
                if (weekNumber < totalWeeks) {
                  weeks[weekNumber]++;
                }
              }
            });

            chartData = weeks
              .map((count, i) => ({ week: `Week ${i + 1}`, reports: count }))
              .filter(item => item.reports > 0);
            break;

          case 'monthly':
            // Get reports for the last 6 months
            const months = Array(6).fill(0);
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            allReports.forEach(report => {
              const reportDate = report.date;
              const monthDiff = (now.getFullYear() - reportDate.getFullYear()) * 12 + 
                              now.getMonth() - reportDate.getMonth();
              if (monthDiff < 6) {
                months[monthDiff]++;
              }
            });

            chartData = months
              .map((count, i) => {
                const monthIndex = (now.getMonth() - i + 12) % 12;
                return { month: monthNames[monthIndex], reports: count };
              })
              .reverse();
            break;
          }
        }

        
        // If no data found, show a message or sample data
        if (chartData.length === 0) {
          // You could set some default data here if needed
        }
        
        setData(chartData);
      } catch (error) {
        console.error('Error fetching reports:', error);
        setData([]); // Set empty data on error
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [timeFilter, viewMode, isAssignedToFarm, currentUser?.farm, assignedFarmName, farmsById, dataRefreshTick]);

  const handleChartRefresh = () => runRefresh(async () => {
    await refreshReportsData();
    setDataRefreshTick((t) => t + 1);
    setLastUpdated(new Date());
  });

  if (loading) {
    return (
      <div className="loading-reports">
        <div className="loading-spinner" />
        <p>{t('reportsChart.loading')}</p>
      </div>
    );
  }

  // Only show "no data" message for date view mode, not for farm view mode
  if (data.length === 0 && viewMode === 'date') {
    return (
      <div className="bar-chart-container" id="reports-chart-card" style={{ background: 'transparent', boxShadow: 'none' }}>
        <h3 className="chart-title">
          {isAssignedToFarm 
            ? t('reportsChart.titleAssigned', { farm: assignedFarmName || currentUser.farm })
            : t('reportsChart.title')
          }
        </h3>
        {viewMode === 'date' && (
          <div className="chart-controls" style={{ display: 'flex', alignItems: 'center' }}>
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value)}
              className="time-filter"
            >
              <option value="daily">{t('reportsChart.daily')}</option>
              <option value="weekly">{t('reportsChart.weekly')}</option>
              <option value="monthly">{t('reportsChart.monthly')}</option>
            </select>
          </div>
        )}
        <div style={{ 
          textAlign: 'center', 
          color: '#cbd5e1', 
          padding: '40px 20px',
          fontSize: '16px'
        }}>
          {isAssignedToFarm 
            ? t('reportsChart.noReportsForFarm', { farm: assignedFarmName || currentUser.farm })
            : t('reportsChart.noReports')
          }
        </div>
      </div>
    );
  }

  return (
    <div className="bar-chart-container" id="reports-chart-card" style={{ background: 'transparent', boxShadow: 'none' }}>
      <h3 className="chart-title" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        gap: '8px' 
      }}>
        {isStdPhone && (
          <button
            onClick={() => {
              const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
              if (!isTemporaryTechOfficer) {
                const isOpening = !mobileExportOpen;
                if (isOpening && typeof onDropdownOpen === 'function') {
                  onDropdownOpen('homepageReportsExport');
                }
                setMobileExportOpen(v => !v);
              }
            }}
            disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? '#9ca3af' : '#7ffcff', 
              cursor: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'not-allowed' : 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              opacity: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 0.5 : 1,
              padding: '4px'
            }}
            aria-label="Export"
            title={(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? "Export unavailable for temporary accounts" : "Export"}
          >
            <GiHamburgerMenu style={{ fontSize: '1.2rem' }} />
          </button>
        )}
        {chartTitle}
      </h3>
      <p className="chart-subtitle" style={{ 
        textAlign: 'center', 
        color: 'rgba(255, 255, 255, 0.91)', 
        fontSize: '14px', 
        margin: '8px 0 16px 0',
        lineHeight: '1.4',
        maxWidth: '600px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        {chartSubtitle}
      </p>
        {isStdPhone && mobileExportOpen && (
          <div className="mobile-export-dropdown" style={{
            position: 'absolute',
            left: '50%',
            top: '60px',
            transform: 'translateX(-50%)',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
            minWidth: 200,
            overflow: 'hidden',
            zIndex: 5
          }}>
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadReportsChartImage('reports-chart-card', 'png', 'reports_chart'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'reports chart PNG'), u); } catch (_) {} setMobileExportOpen(false); }}>Download PNG</button>
            <div style={{ height: 1, background: '#e5e7eb' }} />
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadReportsChartImage('reports-chart-card', 'jpeg', 'reports_chart'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'reports chart JPEG'), u); } catch (_) {} setMobileExportOpen(false); }}>Download JPEG</button>
            <div style={{ height: 1, background: '#e5e7eb' }} />
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={async () => { await exportReportsDataCSV(timeFilter, 'reports_chart_data.csv'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'reports chart data'), u); } catch (_) {} setMobileExportOpen(false); }}>Export CSV</button>
          </div>
        )}
        <div className="chart-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {(isTechOfficer || !isAssignedToFarm) && (
            <div className="toggle-group" role="tablist" aria-label="View by">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'farm'}
                className={`toggle-segment ${viewMode === 'farm' ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '4px 8px' }}
                onClick={() => setViewMode('farm')}
              >
                View by Farm
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'date'}
                className={`toggle-segment ${viewMode === 'date' ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '4px 8px' }}
                onClick={() => setViewMode('date')}
              >
                View by Date
              </button>
            </div>
          )}
          {!isTechOfficer && isAssignedToFarm && (
            <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)', fontWeight: '500' }}>
              View by Date
            </div>
          )}
          {(viewMode === 'farm') && (
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value)}
              className="time-filter"
            >
              <option value="all">All time</option>
              <option value="daily">{t('reportsChart.daily')}</option>
              <option value="weekly">{t('reportsChart.weekly')}</option>
              <option value="monthly">{t('reportsChart.monthly')}</option>
            </select>
          )}
          {(viewMode === 'date') && (
            <select 
              value={timeFilter} 
              onChange={(e) => setTimeFilter(e.target.value)}
              className="time-filter"
            >
              <option value="daily">{t('reportsChart.daily')}</option>
              <option value="weekly">{t('reportsChart.weekly')}</option>
              <option value="monthly">{t('reportsChart.monthly')}</option>
            </select>
          )}
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            onClick={() => {
              const isOpening = !exportOpen;
              if (isOpening && typeof onDropdownOpen === 'function') {
                onDropdownOpen('homepageReportsExport');
              }
              setExportOpen(v => !v);
            }}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'white', 
              cursor: 'pointer', 
              display: isStdPhone ? 'none' : 'flex', // Hide on mobile screens (360px-480px)
              alignItems: 'center',
              opacity: 1
            }}
            aria-label="Export"
            title="Export"
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 26, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.08)', minWidth: 220, overflow: 'hidden', zIndex: 5 }}>
              <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadReportsChartImage('#reports-chart-card', 'png', 'reports_chart'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'reports chart PNG'), u); } catch (_) {} setExportOpen(false); }}>Download PNG</button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadReportsChartImage('#reports-chart-card', 'jpeg', 'reports_chart'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'reports chart JPEG'), u); } catch (_) {} setExportOpen(false); }}>Download JPEG</button>
              <div style={{ height: 1, background: '#e5e7eb' }} />
              <button
                style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }}
                onClick={async () => {
                  await exportReportsDataCSV(timeFilter, 'reports_chart_data.csv');
                  try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'reports chart data'), u); } catch (_) {}
                  setExportOpen(false);
                }}
              >
                Export Chart Data
              </button>
              
            </div>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={isStdPhone ? 320 : 240}>
        <BarChart data={data} barCategoryGap="10%">
          <CartesianGrid vertical={viewMode === 'farm' && timeFilter === 'monthly' ? false : false} />
            <XAxis 
              dataKey={(viewMode === 'farm') ? (timeFilter === 'daily' ? 'day' : (timeFilter === 'weekly' ? 'week' : (timeFilter === 'monthly' ? 'month' : 'farm'))) : (timeFilter === 'daily' ? 'day' : timeFilter === 'weekly' ? 'week' : 'month')}
              interval={0}
              angle={isStdPhone ? -45 : 0}
              textAnchor={isStdPhone ? 'end' : 'middle'}
              height={isStdPhone ? 60 : 40}
              tickFormatter={(value) => {
                if (viewMode === 'date' || (viewMode === 'farm' && timeFilter === 'daily')) {
                  if (timeFilter === 'daily') {
                    // Convert day abbreviations to full day names
                    const dayMap = {
                      'Mon': 'Monday',
                      'Tue': 'Tuesday', 
                      'Wed': 'Wednesday',
                      'Thu': 'Thursday',
                      'Fri': 'Friday',
                      'Sat': 'Saturday',
                      'Sun': 'Sunday'
                    };
                    return dayMap[value] || value;
                  } else if (timeFilter === 'weekly') {
                    // Keep week format as is (Week 1, Week 2, etc.)
                    return value;
                  } else if (timeFilter === 'monthly') {
                    // Convert month abbreviations to full month names
                    const monthMap = {
                      'Jan': 'January',
                      'Feb': 'February',
                      'Mar': 'March',
                      'Apr': 'April',
                      'May': 'May',
                      'Jun': 'June',
                      'Jul': 'July',
                      'Aug': 'August',
                      'Sep': 'September',
                      'Oct': 'October',
                      'Nov': 'November',
                      'Dec': 'December'
                    };
                    return monthMap[value] || value;
                  }
                }
                return value;
              }}
              tick={(props) => {
                const { x, y, payload } = props;
                const value = payload.value;
                
                if (viewMode === 'farm' && isStdPhone && timeFilter === 'all') {
                  const farmName = value;
                  let firstLine, secondLine;
                  
                  if (farmName.includes('Fish Farm')) {
                    firstLine = farmName.replace(' Fish Farm', '');
                    secondLine = 'Fish Farm';
                  } else if (farmName.includes('Aqua Farm')) {
                    firstLine = farmName.replace(' Aqua Farm', '');
                    secondLine = 'Aqua Farm';
                  } else {
                    firstLine = farmName;
                    secondLine = '';
                  }
                  
                  return (
                    <g>
                      <text 
                        x={x} 
                        y={y + 25} 
                        textAnchor="middle" 
                        fontSize={isStdPhone ? "12" : "10"} 
                        fill="#ffffff" 
                        fontFamily="customfont1"
                        transform={isStdPhone ? `rotate(-45 ${x} ${y + 25})` : 'rotate(0)'}
                      >
                        {firstLine}
                      </text>
                      {secondLine && (
                        <text 
                          x={x} 
                          y={y + 37} 
                          textAnchor="middle" 
                          fontSize={isStdPhone ? "12" : "10"} 
                          fill="#ffffff" 
                          fontFamily="customfont1"
                          transform={isStdPhone ? `rotate(-45 ${x} ${y + 37})` : 'rotate(0)'}
                        >
                          {secondLine}
                        </text>
                      )}
                    </g>
                  );
                } else {
                  // Handle date view mode and farm view on desktop
                  const displayValue = viewMode === 'date' ? 
                    (timeFilter === 'daily' ? 
                      ({'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'}[value] || value) :
                      timeFilter === 'weekly' ? value :
                      ({'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April', 'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August', 'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'}[value] || value)
                    ) : value;
                  
                  return (
                    <text 
                      x={x} 
                      y={y + 15} 
                      textAnchor="middle" 
                      fontSize={isStdPhone ? "12" : "10"} 
                      fill="#ffffff" 
                      fontFamily="customfont1"
                      transform={isStdPhone ? `rotate(-45 ${x} ${y + 15})` : 'rotate(0)'}
                    >
                      {displayValue}
                    </text>
                  );
                }
              }}
            />
          <YAxis>
            <Label 
              value="Number of Reports" 
              angle={-90} 
              position="insideLeft"
              dx={15}
              textAnchor="middle"
            />
          </YAxis>
          <Tooltip />
          {/* Add vertical dividers between months for monthly farm view */}
          {viewMode === 'farm' && timeFilter === 'monthly' && data && data.length > 1 && (
            <>
              {data.map((entry, index) => {
                // Create dividers between all month pairs
                // Skip the last month (no divider after it)
                if (index >= data.length - 1) return null;
                
                const currentMonth = entry?.month;
                const nextEntry = data[index + 1];
                if (!nextEntry) return null;
                const nextMonth = nextEntry.month;
                
                // Ensure we have valid month values
                if (!currentMonth || !nextMonth) return null;
                
                // Position divider between current and next month
                // Using nextMonth as reference and CSS transform to position it between groups
                return (
                  <ReferenceLine
                    key={`month-divider-${index}-${currentMonth}-to-${nextMonth}`}
                    x={nextMonth}
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth={1.5}
                    strokeDasharray="none"
                    ifOverflow="extendDomain"
                    className="month-divider"
                  />
                );
              })}
            </>
          )}
          {viewMode === 'farm' && (timeFilter === 'daily' || timeFilter === 'weekly' || timeFilter === 'monthly') ? (
            // Four grouped bars per day, one per farm
            KNOWN_FARMS.map((farm) => (
              <Bar
                key={`bar-${farm}`}
                dataKey={farm}
                name={farm}
                radius={[8, 8, 0, 0]}
                animationDuration={1500}
                isAnimationActive={true}
                fill={getFarmColor(farm)}
              />
            ))
          ) : (
            <Bar 
              dataKey="reports" 
              radius={[8, 8, 0, 0]}
              animationDuration={2000}
              animationBegin={0}
              animationEasing="ease-in-out"
              isAnimationActive={true}
              animationId="barAnimation"
            >
              {viewMode === 'farm' ? (
                data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))
              ) : (
                data.map((entry, index) => {
                  const maxReports = Math.max(...data.map(item => item.reports || 0));
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={getActivityColor(entry.reports, maxReports)} 
                    />
                  );
                })
              )}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
      
      {/* Farm Color Legend for Farm View */}
      {viewMode === 'farm' && (
        <div className="custom-legend" style={{
          marginTop: isStdPhone ? '-80px' : '-20px',
          display: 'flex',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '8px',
        }}>
          {timeFilter === 'daily' || timeFilter === 'weekly' || timeFilter === 'monthly' ? (
            // In daily farm view, legend comes from known farms/colors
            KNOWN_FARMS.map((farm, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '15px',
                color: 'rgba(255, 255, 255, 0.8)',
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  backgroundColor: getFarmColor(farm),
                  borderRadius: '2px'
                }} />
                <span>{farm}</span>
              </div>
            ))
          ) : (
            data.map((item, index) => {
              // Function to split farm name for mobile display
              const splitFarmName = (farmName) => {
                if (!isStdPhone) return farmName; // Return original name for non-mobile
                
                // Check if farmName exists and is a string
                if (!farmName || typeof farmName !== 'string') {
                  return farmName || 'Unknown Farm';
                }
                
                // Split common patterns
                if (farmName.includes(' Fish Farm')) {
                  const parts = farmName.split(' Fish Farm');
                  return { firstLine: parts[0], secondLine: 'Fish Farm' };
                }
                if (farmName.includes(' Aqua Farm')) {
                  const parts = farmName.split(' Aqua Farm');
                  return { firstLine: parts[0], secondLine: 'Aqua Farm' };
                }
                if (farmName.includes(' Aquaculture')) {
                  const parts = farmName.split(' Aquaculture');
                  return { firstLine: parts[0], secondLine: 'Aquaculture' };
                }
                // Default: try to split at space if name is long
                const words = farmName.split(' ');
                if (words.length > 1) {
                  const midPoint = Math.ceil(words.length / 2);
                  return {
                    firstLine: words.slice(0, midPoint).join(' '),
                    secondLine: words.slice(midPoint).join(' ')
                  };
                }
                return farmName;
              };

              const farmNameDisplay = splitFarmName(item.farm);
              
              return (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '15px',
                  color: 'rgba(255, 255, 255, 0.8)',
                }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: item.color || getFarmColor(item.farm),
                    borderRadius: '2px'
                  }} />
                  {isStdPhone && typeof farmNameDisplay === 'object' ? (
                    <div style={{ textAlign: 'center' }}>
                      <div>{farmNameDisplay.firstLine}</div>
                      <div>{farmNameDisplay.secondLine}</div>
                    </div>
                  ) : (
                    <span>{farmNameDisplay}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Activity Level Legend for Date View */}
      {viewMode === 'date' && data.length > 0 && (
        <div style={{
          marginTop: '-20px',
          display: 'flex',
          justifyContent: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '8px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '15px',
            color: 'rgba(255, 255, 255, 0.8)',
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              backgroundColor: '#4CAF50',
              borderRadius: '2px'
            }} />
            <span>High Activity</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '15px',
            color: 'rgba(255, 255, 255, 0.8)',
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              backgroundColor: '#FF9800',
              borderRadius: '2px'
            }} />
            <span>Moderate Activity</span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '15px',
            color: 'rgba(255, 255, 255, 0.8)',
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              backgroundColor: '#F44336',
              borderRadius: '2px'
            }} />
            <span>Low Activity</span>
          </div>
        </div>
      )}
      
      <div style={{ 
        marginTop: '0px', 
        padding: '12px', 
        backgroundColor: 'rgba(255, 255, 255, 0.05)', 
        borderRadius: '8px',
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.9)',
        textAlign: 'center'
      }}>
        {generateSummary()}
      </div>
      <div className="chart-last-updated-wrap">
        <div className="reports-last-updated chart-last-updated-row">
          <button
            type="button"
            className="chart-refresh-btn"
            onClick={handleChartRefresh}
            disabled={refreshingChart || loading}
            title={t('common.refresh')}
            aria-label={t('common.refresh')}
          >
            <FaSyncAlt className={refreshingChart ? 'chart-refresh-spin' : ''} />
          </button>
          <span>
            {t('reportsChart.asOf')} {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <RefreshStatusMessage status={refreshStatus} variant="onDark" />
      </div>
    </div>
  );
}

export default ReportsChart; 