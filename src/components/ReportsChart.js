import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Label, Cell } from 'recharts';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './ReportsChart.css';
import { GiHamburgerMenu } from 'react-icons/gi';
import { downloadReportsChartImage, exportReportsDataCSV } from '../utils/exportReportsChart';
import { useAuth } from '../contexts/AuthContext';
import { useFarms } from '../contexts/FarmsContext';
import { logActivity, logMessages, logTemporaryTechOfficerActivity } from '../utils/logger';
import { useTranslation } from 'react-i18next';

function ReportsChart() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { farmsById, farms } = useFarms();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('weekly'); // 'daily', 'weekly', 'monthly'
  const [viewMode, setViewMode] = useState('farm'); // 'farm', 'date'
  const [selectedFarm, setSelectedFarm] = useState('all'); // For consistency with stacked chart
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);

  // Check if user is assigned to a farm (but not TTOs - they should see all farms)
  const isTemporaryTechOfficer = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
  const isAssignedToFarm = Boolean(currentUser?.farm) && !isTemporaryTechOfficer;

  // Track viewport width for responsive behavior
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Initialize viewMode and timeFilter for assigned users
  useEffect(() => {
    if (isAssignedToFarm) {
      setViewMode('date');
      setTimeFilter('daily');
    }
  }, [isAssignedToFarm]);

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
    ? (isAssignedToFarm ? `Shows the total number of reports submitted from your assigned farm within the selected period.` : `Shows the total number of reports submitted from each farm.`)
    : (isAssignedToFarm ? `Shows reporting activity trends for your assigned farm throughout the selected time period.` : `Shows reporting activity trends throughout the selected time period.`);

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
    
    const totalReports = data.reduce((sum, item) => sum + (item.reports || 0), 0);
    const maxReports = Math.max(...data.map(item => item.reports || 0));
    const topPerformer = data.find(item => item.reports === maxReports);
    
    if (viewMode === 'farm') {
      return topPerformer 
        ? `${topPerformer.farm || topPerformer.name} submitted the most reports (${maxReports} total). ${totalReports} reports submitted across all farms.`
        : `${totalReports} reports submitted across all farms.`;
    } else {
      return `${totalReports} reports submitted in the selected period. Reporting activity ${maxReports > 0 ? 'remains steady' : 'is low'}.`;
    }
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
        
        // Build query based on farm assignment
        let q;
        if (isAssignedToFarm) {
          // First try to get all reports to see what farm fields exist
          const allReportsQuery = query(reportsRef, orderBy('timestamp', 'desc'));
          const allReportsSnapshot = await getDocs(allReportsQuery);
          
          
          // Try different farm field names and values
          const farmFields = ['farm', 'farm_name', 'farmId', 'farm_id'];
          let foundMatchingReports = false;
          
          for (const field of farmFields) {
            try {
              // Try with the farm ID
              q = query(
                reportsRef,
                where(field, '==', currentUser.farm),
                orderBy('timestamp', 'desc')
              );
              const testSnapshot = await getDocs(q);
              if (testSnapshot.docs.length > 0) {
                foundMatchingReports = true;
                break;
              }
            } catch (error) {
            }
          }
          
          // If no matches with farm ID, try with farm name
          if (!foundMatchingReports && assignedFarmName) {
            for (const field of farmFields) {
              try {
                q = query(
                  reportsRef,
                  where(field, '==', assignedFarmName),
                  orderBy('timestamp', 'desc')
                );
                const testSnapshot = await getDocs(q);
                if (testSnapshot.docs.length > 0) {
                  foundMatchingReports = true;
                  break;
                }
              } catch (error) {
              }
            }
          }
          
          // If still no matches, fall back to all reports
          if (!foundMatchingReports) {
            q = query(
              reportsRef,
              orderBy('timestamp', 'desc')
            );
          }
        } else {
          // Get all reports for non-assigned users
          q = query(
            reportsRef,
            orderBy('timestamp', 'desc')
          );
        }
        
        const querySnapshot = await getDocs(q);
        
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
          // Group by farm with proper name mapping
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
          
          allReports.forEach(report => {
            let farmName = report.farm || report.farmName || 'Unknown Farm';
            
            // Map by ID first
            if (report.farmId && idToNewName[report.farmId]) {
              farmName = idToNewName[report.farmId];
            }
            // Then try legacy mapping
            else if (legacyMap[farmName]) {
              farmName = legacyMap[farmName];
            }
            // Handle common variations
            else if (farmName.toLowerCase().includes('aquino')) {
              farmName = 'Aquino Fish Farm';
            } else if (farmName.toLowerCase().includes('vergara')) {
              farmName = "Vergara's Aqua Farm";
            } else if (farmName.toLowerCase().includes('maningas')) {
              farmName = 'Maningas Fish Farm';
            } else if (farmName.toLowerCase().includes('labay')) {
              farmName = 'Labay Fish Farm';
            }
            
            // Only count if it's one of our known farms
            if (['Aquino Fish Farm', "Vergara's Aqua Farm", 'Maningas Fish Farm', 'Labay Fish Farm'].includes(farmName)) {
              farmCounts[farmName] = (farmCounts[farmName] || 0) + 1;
            }
          });
          
          chartData = Object.entries(farmCounts)
            .map(([farm, reports]) => ({ 
              farm, 
              reports, 
              color: getFarmColor(farm) 
            }))
            .sort((a, b) => b.reports - a.reports);
            
        } else {
          // Default to date-based view (existing logic)
          switch (timeFilter) {
          case 'daily':
            // Get reports for current week
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Start from Monday
            startOfWeek.setHours(0, 0, 0, 0);

            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            // Initialize data for each day of the week
            const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const dailyCounts = daysOfWeek.map(day => ({ day, reports: 0 }));

            // Count reports for each day
            allReports.forEach(report => {
              const reportDate = report.date;
              if (reportDate >= startOfWeek && reportDate <= endOfWeek) {
                const dayIndex = (reportDate.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
                dailyCounts[dayIndex].reports++;
              }
            });

            chartData = dailyCounts;
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
  }, [timeFilter, viewMode, isAssignedToFarm, currentUser?.farm]);

  if (loading) {
    return <div className="loading-reports">{t('reportsChart.loading')}</div>;
  }

  if (data.length === 0) {
    return (
      <div className="bar-chart-container" id="reports-chart-card" style={{ background: 'transparent', boxShadow: 'none' }}>
        <h3 className="chart-title">
          {isAssignedToFarm 
            ? t('reportsChart.titleAssigned', { farm: assignedFarmName || currentUser.farm })
            : t('reportsChart.title')
          }
        </h3>
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
                setExportOpen(v => !v);
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
        {isStdPhone && exportOpen && !(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
          <div style={{
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
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadReportsChartImage('reports-chart-card', 'png', 'reports_chart'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'reports chart PNG'), u); } catch (_) {} setExportOpen(false); }}>Download PNG</button>
            <div style={{ height: 1, background: '#e5e7eb' }} />
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { downloadReportsChartImage('reports-chart-card', 'jpeg', 'reports_chart'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.dataExport(u, 'reports chart JPEG'), u); } catch (_) {} setExportOpen(false); }}>Download JPEG</button>
            <div style={{ height: 1, background: '#e5e7eb' }} />
            <button style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 12px', textAlign: 'left', cursor: 'pointer' }} onClick={async () => { await exportReportsDataCSV(timeFilter, 'reports_chart_data.csv'); try { const u = currentUser?.username || currentUser?.email || currentUser?.uid || 'Unknown'; logActivity('export', logMessages.export.csvDownload(u, 'reports chart data'), u); } catch (_) {} setExportOpen(false); }}>Export CSV</button>
          </div>
        )}
        <div className="chart-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {!isAssignedToFarm && (
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
          {isAssignedToFarm && (
            <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)', fontWeight: '500' }}>
              View by Date
            </div>
          )}
          {viewMode === 'date' && (
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
              const isTTO = currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer';
              if (isTTO) {
                // Log the restricted access attempt
                const username = currentUser?.username || currentUser?.email || 'Unknown';
                try {
                  logTemporaryTechOfficerActivity(
                    'temporaryTechOfficer',
                    logMessages.temporaryTechOfficer.exportAttempt(username, 'reports chart'),
                    username,
                    currentUser?.role || 'temp_tech_officer'
                  );
                } catch (_) {}
              } else {
                setExportOpen(v => !v);
              }
            }}
            disabled={currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer'}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? '#9ca3af' : 'white', 
              cursor: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 'not-allowed' : 'pointer', 
              display: isStdPhone ? 'none' : 'flex', // Hide on mobile screens (360px-480px)
              alignItems: 'center',
              opacity: (currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? 0.5 : 1
            }}
            aria-label="Export"
            title={(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') ? "Export unavailable for temporary accounts" : "Export"}
          >
            <GiHamburgerMenu style={{ fontSize: '20px' }} />
          </button>
          {exportOpen && !(currentUser?.temporaryTechOfficer || String(currentUser?.role || '').toLowerCase() === 'temp_tech_officer') && (
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
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
            <XAxis 
              dataKey={viewMode === 'farm' ? 'farm' : (timeFilter === 'daily' ? 'day' : timeFilter === 'weekly' ? 'week' : 'month')}
              interval={0}
              angle={isStdPhone ? -45 : 0}
              textAnchor={isStdPhone ? 'end' : 'middle'}
              height={isStdPhone ? 60 : 40}
              tickFormatter={(value) => {
                if (viewMode === 'date') {
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
                
                if (viewMode === 'farm' && isStdPhone) {
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
              // For farm view, use individual colors for each bar
              data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))
            ) : (
              // For other views, use activity-based colors
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
        </BarChart>
      </ResponsiveContainer>
      
      {/* Farm Color Legend for Farm View */}
         {viewMode === 'farm' && data.length > 0 && (
           <div className="custom-legend" style={{
             marginTop: isStdPhone ? '-80px' : '-20px',
             display: 'flex',
             justifyContent: 'flex-start',
             flexWrap: 'wrap',
             gap: '16px',
             padding: '8px',
           }}>
          {data.map((item, index) => {
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
          })}
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
        color: 'rgba(255, 255, 255, 0.8)',
        textAlign: 'center'
      }}>
        {generateSummary()}
      </div>
      <div className="reports-last-updated">
        {t('reportsChart.asOf')} {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

export default ReportsChart; 