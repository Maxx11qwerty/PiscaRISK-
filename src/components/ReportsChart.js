import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Label } from 'recharts';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import './ReportsChart.css';

function ReportsChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('weekly'); // 'daily', 'weekly', 'monthly'
  const [lastUpdated, setLastUpdated] = useState(new Date());

  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const reportsRef = collection(db, 'reports');
        const q = query(
          reportsRef,
          orderBy('timestamp', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const allReports = querySnapshot.docs.map(doc => ({
          date: doc.data().timestamp.toDate()
        }));

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

        setData(chartData);
      } catch (error) {
        console.error('Error fetching reports:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [timeFilter]);

  if (loading) {
    return <div className="loading-reports">Loading chart data...</div>;
  }

  return (
    <div className="bar-chart-container">
      <div className="chart-controls">
        <select 
          value={timeFilter} 
          onChange={(e) => setTimeFilter(e.target.value)}
          className="time-filter"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid vertical={false} />
          <XAxis 
            dataKey={timeFilter === 'daily' ? 'day' : timeFilter === 'weekly' ? 'week' : 'month'} 
          />
          <YAxis>
            <Label 
              value="Reports Submitted" 
              angle={-90} 
              position="insideLeft" 
            />
          </YAxis>
          <Tooltip />
          <Bar 
            dataKey="reports" 
            fill="#7ffcff" 
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
        As of {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

export default ReportsChart; 