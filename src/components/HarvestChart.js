import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../firebase';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import './HarvestChart.css';

function HarvestChart() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [hasData, setHasData] = useState(true);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    const fetchHarvestData = async () => {
      try {
        setLoading(true);
        const reportsRef = collection(db, 'reports');

        // Filter range: first to last day of selected month
        const currentYear = new Date().getFullYear();
        const startDate = new Date(currentYear, selectedMonth, 1);
        const endDate = new Date(currentYear, selectedMonth + 1, 0, 23, 59, 59);
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        const q = query(
          reportsRef,
          where('timestamp', '>=', startTimestamp),
          where('timestamp', '<=', endTimestamp)
        );

        const querySnapshot = await getDocs(q);
        
        let readyCount = 0;
        let notReadyCount = 0;

        querySnapshot.forEach(doc => {
          const reportData = doc.data();
          if (reportData.ready_for_harvest === true) {
            readyCount++;
          } else {
            notReadyCount++;
          }
        });

        if (readyCount === 0 && notReadyCount === 0) {
          setHasData(false);
          setData([]);
        } else {
          setHasData(true);
          setData([
            { name: 'Ready', value: readyCount },
            { name: 'Not Ready', value: notReadyCount }
          ]);
        }
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Error fetching harvest data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHarvestData();
  }, [selectedMonth]);

  const handleMonthChange = (e) => {
    setSelectedMonth(parseInt(e.target.value));
  };

  const COLORS = ['#4CAF50', '#FF5722'];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const currentData = payload[0].payload;
      const total = data.reduce((sum, item) => sum + item.value, 0);
      const percentage = ((currentData.value / total) * 100).toFixed(1);
      return (
        <div className="custom-tooltip">
          <p>{`${currentData.name} – ${currentData.value} reports (${percentage}%)`}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return <div className="loading-reports">Loading harvest data...</div>;
  }

  return (
    <div className="bar-chart-container">
      <div className="chart-controls">
        <h2 className="pie-chart-title">Harvest Readiness</h2>
        <div className="harvest-controls">
          <select 
            className="month-filter" 
            value={selectedMonth} 
            onChange={handleMonthChange}
          >
            {months.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </select>
          <div className="harvest-label">Ready: {data[0]?.value || 0}</div>
        </div>
      </div>
      <div className="pie-chart-container">
        {hasData ? (
          <div className="chart-with-labels">
            <div className="chart-labels">
              <div className="chart-label ready">
                <span className="label-dot" style={{ backgroundColor: COLORS[0] }}></span>
                Ready: {data[0]?.value || 0}
              </div>
              <div className="chart-label not-ready">
                <span className="label-dot" style={{ backgroundColor: COLORS[1] }}></span>
                Not Ready: {data[1]?.value || 0}
              </div>
            </div>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  className="pie-chart-segment"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="no-data-message">No data available for {months[selectedMonth]}</div>
        )}
      </div>
      <div className="harvest-last-updated">
        As of {lastUpdated.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </div>
    </div>
  );
}

export default HarvestChart;
