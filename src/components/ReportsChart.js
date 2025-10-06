import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Label } from 'recharts';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './ReportsChart.css';
import { GiHamburgerMenu } from 'react-icons/gi';
import { downloadReportsChartImage, exportReportsDataCSV } from '../utils/exportReportsChart';
import { useAuth } from '../contexts/AuthContext';
import { useFarms } from '../contexts/FarmsContext';
import { logActivity, logMessages } from '../utils/logger';
import { useTranslation } from 'react-i18next';

function ReportsChart() {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { farmsById } = useFarms();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('weekly'); // 'daily', 'weekly', 'monthly'
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [exportOpen, setExportOpen] = useState(false);
  const [assignedFarmName, setAssignedFarmName] = useState('');

  // Check if user is assigned to a farm
  const isAssignedToFarm = Boolean(currentUser?.farm);

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
        
        let allReports = querySnapshot.docs.map(doc => {
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
            farmName: data.farm_name || data.farm
          };
        });

        // If user is assigned to a farm and we got all reports, filter client-side
        if (isAssignedToFarm && allReports.length > 0) {
          const originalLength = allReports.length;
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

        
        // If no data found, show a message or sample data
        if (chartData.length === 0) {
          // You could set some default data here if needed
        }
        
        setData(chartData);
      } catch (error) {
        setData([]); // Set empty data on error
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [timeFilter, isAssignedToFarm, currentUser?.farm]);

  if (loading) {
    return <div className="loading-reports">{t('reportsChart.loading')}</div>;
  }

  if (data.length === 0) {
    return (
      <div className="bar-chart-container" id="reports-chart-card">
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
    <div className="bar-chart-container" id="reports-chart-card">
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
        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button
            onClick={() => setExportOpen(v => !v)}
            style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
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
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis 
            dataKey={timeFilter === 'daily' ? 'day' : timeFilter === 'weekly' ? 'week' : 'month'} 
          />
          <YAxis>
            <Label 
              value={t('reportsChart.yAxisLabel')} 
              angle={-90} 
              position="insideLeft" 
            />
          </YAxis>
          <Tooltip />
          <Bar 
            dataKey="reports" 
            fill="#FFB74D" 
            radius={[8, 8, 0, 0]}
            animationDuration={2000}
            animationBegin={0}
            animationEasing="ease-in-out"
            isAnimationActive={true}
            animationId="barAnimation"
          />
        </BarChart>
      </ResponsiveContainer>
      <div className="reports-last-updated">
        {t('reportsChart.asOf')} {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

export default ReportsChart; 