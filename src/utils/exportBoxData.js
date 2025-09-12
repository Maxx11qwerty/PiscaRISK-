import { jsPDF } from "jspdf";
import React from "react";
import { logActivity, logMessages } from './logger';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

export const exportBoxData = async ({
  format,
  boxData,
  weatherData,
  selectedPond,
  lastUpdated,
  setShowDownloadOptions,
  currentUser,
  allFarmsRiskData = []
}) => {
  console.log('Export started with format:', format);
  console.log('Box data:', boxData);
  console.log('Weather data:', weatherData);
  console.log('Current user:', currentUser);
  
  setShowDownloadOptions(false);

  // Log export start
  try {
    logActivity('export', logMessages.export.exportStart(currentUser?.username || 'Unknown', 'dashboard'), currentUser?.username || 'Unknown');
  } catch (logError) {
    console.error('Error logging export start:', logError);
  }

  try {
    // Fetch PiscaRISK data
    const getPiscaRiskData = async () => {
      try {
        // Fetch farms data from reports collection
        const reportsRef = collection(db, 'reports');
        const q = query(reportsRef, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const farmsData = {};
        const farmReportsCount = {};
        const farmReviewedCount = {};
        
        querySnapshot.forEach(doc => {
          const data = doc.data();
          const farm = data.farm || 'Unknown Farm';
          const farmKey = farm.toLowerCase().replace(/\s+/g, '-');
          
          if (!farmsData[farmKey]) {
            farmsData[farmKey] = {
              key: farmKey,
              name: farm,
              risk: 'Normal',
              overall_risk: 'Normal',
              ponds: new Set(),
              predictions: [],
              has_reports: true,
              counts: { high: 0, medium: 0, low: 0, normal: 0 },
              totalReports: 0,
              reviewedReports: 0
            };
          }
          
          farmsData[farmKey].totalReports++;
          farmsData[farmKey].ponds.add(data.fish_pond || 'Unknown Pond');
          
          if (data.status === 'Reviewed') {
            farmsData[farmKey].reviewedReports++;
          }
          
          // Count risk levels
          const riskLevel = data.fish_condition || 'Normal';
          const riskKey = riskLevel.toLowerCase();
          if (riskKey.includes('high') || riskKey.includes('critical')) {
            farmsData[farmKey].counts.high++;
          } else if (riskKey.includes('medium')) {
            farmsData[farmKey].counts.medium++;
          } else if (riskKey.includes('low')) {
            farmsData[farmKey].counts.low++;
          } else {
            farmsData[farmKey].counts.normal++;
          }
        });
        
        // Convert to array and calculate overall risk
        const farmsArray = Object.values(farmsData).map(farm => {
          const totalCount = Object.values(farm.counts).reduce((sum, count) => sum + count, 0);
          const highCount = farm.counts.high;
          const mediumCount = farm.counts.medium;
          
          let overallRisk = 'Normal';
          if (highCount > 0) overallRisk = 'High';
          else if (mediumCount > 0) overallRisk = 'Medium';
          
          return {
            ...farm,
            ponds: Array.from(farm.ponds),
            overall_risk: overallRisk,
            pondsWithReports: farm.ponds.size
          };
        });
        
        return farmsArray;
      } catch (error) {
        console.error('Error fetching PiscaRISK data:', error);
        return [];
      }
    };

    // Extract weather data - returns array of lines
    const getWeatherContent = (weatherData) => {
      if (!weatherData || !weatherData.weather) return ["No weather data available"];

      return [
        "WEATHER OVERVIEW",
        "----------------",
        "Location: San Pablo City, Laguna",
        `Condition: ${weatherData.weather[0].description}`,
        `Temperature: ${Math.round(weatherData.main.temp)}°C`,
        `Feels like: ${Math.round(weatherData.main.feels_like)}°C`,
        `Humidity: ${weatherData.main.humidity}%`,
        `Pressure: ${weatherData.main.pressure} hPa`,
        ...(weatherData.main.sea_level ? [`Sea Level: ${weatherData.main.sea_level} hPa`] : []),
        `Wind: ${weatherData.wind.speed} m/s, ${weatherData.wind.deg}°`,
        lastUpdated ? `Last updated: ${lastUpdated.toLocaleString()}` : ""
      ].filter(Boolean);
    };

    const getAllPondsContent = async () => {
      try {
        const reportsRef = collection(db, 'reports');
        const q = query(reportsRef, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          return ["No pond data available"];
        }

        let content = [
          "FISH POND STATUS REPORT",
          "=====================",
          ""
        ];

        // Group reports by pond
        const pondReports = {};
        querySnapshot.docs.forEach(doc => {
          const report = doc.data();
          const pondName = report.fish_pond;
          if (!pondReports[pondName]) {
            pondReports[pondName] = [];
          }
          pondReports[pondName].push({
            ...report,
            date: report.timestamp.toDate()
          });
        });

        // Sort ponds numerically
        const sortedPonds = Object.entries(pondReports).sort(([pondA], [pondB]) => {
          const numA = parseInt(pondA.match(/\d+/)?.[0] || '0');
          const numB = parseInt(pondB.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });

        // Add content for each pond
        sortedPonds.forEach(([pondName, reports]) => {
          const latestReport = reports[0];
          content.push(
            `**POND: ${pondName}**`,
            "-------------------",
            `Current Status:`,
            `• Fish Condition: ${latestReport.fish_condition}`,
            `• Water Condition: ${latestReport.water_condition}`,
            `• Weather Impact: ${latestReport.weather}`,
            `• Harvest Status: ${latestReport.ready_for_harvest ? 'Ready for Harvest' : 'Not Ready'}`,
            `• Last Updated: ${latestReport.date.toLocaleString()}`,
            `• Additional Notes: ${latestReport.additional_notes || 'None'}`,
            ""
          );

          if (reports.length > 0) {
            content.push(
              "**HISTORICAL REPORTS**",
              "-----------------"
            );
            reports.slice(0, 5).forEach((report, index) => {
              content.push(
                `Report ${index + 1} - ${report.date.toLocaleString()}`,
                `• Fish Status: ${report.fish_condition}`,
                `• Water Quality: ${report.water_condition}`,
                `• Weather Conditions: ${report.weather}`,
                `• Harvest Status: ${report.ready_for_harvest ? 'Ready' : 'Not Ready'}`,
                `• Notes: ${report.additional_notes || 'None'}`,
                ""
              );
            });
          }

          content.push("=====================", "");
        });

        return content.filter(line => line !== "");
      } catch (error) {
        console.error('Error fetching pond data:', error);
        return ["Error fetching pond data"];
      }
    };

    const getPondsCSVData = async () => {
      try {
        const reportsRef = collection(db, 'reports');
        const q = query(reportsRef, orderBy('timestamp', 'desc'));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          return "Pond Name,Status,No data available";
        }

        // CSV headers
        let csvContent = "Pond Name,Fish Condition,Water Condition,Weather Impact,Harvest Status,Last Updated,Additional Notes\n";

        // Group reports by pond and get latest report for each
        const pondReports = {};
        querySnapshot.docs.forEach(doc => {
          const report = doc.data();
          const pondName = report.fish_pond;
          if (!pondReports[pondName] || report.timestamp.toDate() > pondReports[pondName].timestamp.toDate()) {
            pondReports[pondName] = report;
          }
        });

        // Add each pond's data
        Object.entries(pondReports).forEach(([pondName, report]) => {
          const date = report.timestamp.toDate();
          csvContent += `"${pondName}","${report.fish_condition}","${report.water_condition}",` +
                       `"${report.weather}","${report.ready_for_harvest ? 'Ready' : 'Not Ready'}",` +
                       `"${date.toLocaleString()}","${report.additional_notes || ''}"\n`;
        });

        return csvContent;
      } catch (error) {
        console.error('Error generating CSV data:', error);
        return "Error generating CSV data";
      }
    };

    const getWeatherCSVData = (weatherData) => {
      if (!weatherData) return "Weather Data,No data available";

      return `"Location","San Pablo City, Laguna"
"Weather Condition","${weatherData.weather[0].description}"
"Temperature (C)","${Math.round(weatherData.main.temp)}"
"Feels Like (C)","${Math.round(weatherData.main.feels_like)}"
"Humidity (%)","${weatherData.main.humidity}"
"Pressure (hPa)","${weatherData.main.pressure}"
"Sea Level (hPa)","${weatherData.main.sea_level || 'N/A'}"
"Wind Speed (m/s)","${weatherData.wind.speed}"
"Wind Direction","${weatherData.wind.deg}°"
"Last Updated","${lastUpdated ? lastUpdated.toLocaleString() : 'N/A'}"`;
    };

    const exportData = await Promise.all(boxData.map(async box => {
      let contentArray = [];
      let csvContent = '';
  
      if (box.id === 1) { // Weather Condition box
        contentArray = getWeatherContent(weatherData);
        csvContent = getWeatherCSVData(weatherData);
      } 
      else if (box.id === 2) { // Fish Pond Condition box
        contentArray = await getAllPondsContent();
        csvContent = await getPondsCSVData();
      }
      else if (box.id === 3) { // PiscaRISK Data box
        const piscaRiskData = await getPiscaRiskData();
        contentArray = [
          "PISCA RISK DATA",
          "===============",
          `Total Farms: ${piscaRiskData.length}`,
          `Total Ponds: ${piscaRiskData.reduce((sum, farm) => sum + farm.pondsWithReports, 0)}`,
          `Total Reports: ${piscaRiskData.reduce((sum, farm) => sum + farm.totalReports, 0)}`,
          `Reviewed Reports: ${piscaRiskData.reduce((sum, farm) => sum + farm.reviewedReports, 0)}`,
          "",
          "FARM BREAKDOWN:",
          "==============="
        ];
        
        piscaRiskData.forEach(farm => {
          contentArray.push(`Farm: ${farm.name}`);
          contentArray.push(`  Overall Risk: ${farm.overall_risk}`);
          contentArray.push(`  Ponds with Reports: ${farm.pondsWithReports}`);
          contentArray.push(`  Total Reports: ${farm.totalReports}`);
          contentArray.push(`  Reviewed: ${farm.reviewedReports}/${farm.totalReports}`);
          contentArray.push(`  Risk Counts: High: ${farm.counts.high}, Medium: ${farm.counts.medium}, Low: ${farm.counts.low}, Normal: ${farm.counts.normal}`);
          contentArray.push("");
        });
        
        contentArray.push(`Last updated: ${new Date().toLocaleString()}`);
        
        // Create CSV content
        csvContent = `"Farm Name","Overall Risk","Ponds with Reports","Total Reports","Reviewed Reports","High Risk","Medium Risk","Low Risk","Normal Risk"
${piscaRiskData.map(farm => `"${farm.name}","${farm.overall_risk}","${farm.pondsWithReports}","${farm.totalReports}","${farm.reviewedReports}","${farm.counts.high}","${farm.counts.medium}","${farm.counts.low}","${farm.counts.normal}"`).join('\n')}`;
      }
      else if (box.id === 4) { // Risk Reports box
        const riskReportsData = allFarmsRiskData || [];
        const highRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'High');
        const mediumRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'Medium');
        const lowRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'Low');
        const normalRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'Normal');
        
        contentArray = [
          "RISK REPORTS",
          "============",
          `Total Farms Monitored: ${riskReportsData.length}`,
          `High Risk Farms: ${highRiskFarms.length}`,
          `Medium Risk Farms: ${mediumRiskFarms.length}`,
          `Low Risk Farms: ${lowRiskFarms.length}`,
          `Normal Risk Farms: ${normalRiskFarms.length}`,
          "",
          "HIGH RISK FARMS:",
          "================"
        ];
        
        highRiskFarms.forEach(farm => {
          contentArray.push(`• ${farm.name || farm.farm_name || 'Unknown Farm'}`);
          contentArray.push(`  Risk Level: ${farm.overall_risk}`);
          contentArray.push(`  Ponds: ${farm.predictions?.length || 0}`);
          contentArray.push(`  Has Reports: ${farm.has_reports ? 'Yes' : 'No'}`);
          contentArray.push("");
        });
        
        if (mediumRiskFarms.length > 0) {
          contentArray.push("MEDIUM RISK FARMS:");
          contentArray.push("==================");
          mediumRiskFarms.forEach(farm => {
            contentArray.push(`• ${farm.name || farm.farm_name || 'Unknown Farm'}`);
            contentArray.push(`  Risk Level: ${farm.overall_risk}`);
            contentArray.push(`  Ponds: ${farm.predictions?.length || 0}`);
            contentArray.push("");
          });
        }
        
        contentArray.push(`Last updated: ${new Date().toLocaleString()}`);
        
        // Create CSV content
        csvContent = `"Farm Name","Risk Level","Ponds Count","Has Reports","Farm Key"
${riskReportsData.map(farm => `"${farm.name || farm.farm_name || 'Unknown Farm'}","${farm.overall_risk}","${farm.predictions?.length || 0}","${farm.has_reports ? 'Yes' : 'No'}","${farm.key || farm.farm_key || 'unknown'}"`).join('\n')}`;
      }
      else if (typeof box.content === 'string') {
        contentArray = box.content.split('\n');
      }
      else if (box.content && box.content.props?.children) {
        contentArray = React.Children.toArray(box.content.props.children)
          .map(child => typeof child === 'string' ? child : '')
          .filter(Boolean);
      }
      else {
        // Default content for boxes without proper content
        contentArray = [
          `${box.title || 'Unknown Box'}`,
          "==================",
          "No specific content available for this section.",
          "Please check the application for detailed information.",
          "",
          "Last updated: " + new Date().toLocaleString()
        ];
      }
  
      return {
        Title: box.title || 'Unknown Section',
        Content: contentArray,
        CSVContent: csvContent
      };
    }));
  
    if (format === 'csv') {
      console.log('Processing CSV export...');
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_export_${timestamp}.csv`;
      
      // Create combined CSV content
      let combinedCSV = `PiscaRisk Export\nGenerated on: ${new Date().toLocaleString()}\n\n`;
      
      // Add each box's data with clear section headers
      exportData.forEach((box, index) => {
        console.log(`Processing box ${index + 1}: ${box.Title}`);
        if (!box.CSVContent) {
          console.log(`Skipping box ${box.Title} - no CSV content`);
          return; // Skip boxes without CSV content
        }
        
        combinedCSV += `\n===== ${box.Title} =====\n\n`;
        combinedCSV += box.CSVContent;
        combinedCSV += '\n\n'; // Add spacing between sections
      });
      
      console.log('CSV content generated, creating download...');
      
      // Create and download the combined CSV file
      const blob = new Blob([combinedCSV], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url); // Clean up

      console.log('CSV download initiated');

      // Log successful CSV export
      try {
        logActivity('export', logMessages.export.csvDownload(currentUser?.username || 'Unknown', 'dashboard data'), currentUser?.username || 'Unknown');
      } catch (logError) {
        console.error('Error logging CSV export:', logError);
      }
    }
    else if (format === 'pdf') {
      console.log('Processing PDF export...');
      const doc = new jsPDF({ 
        orientation: "portrait", 
        unit: "mm", 
        format: "a4",
        compress: true
      });
      
      // Color scheme
      const colors = {
        primary: '#1a5276',
        secondary: '#2874a6',
        accent: '#3498db',
        text: '#2c3e50',
        lightText: '#7f8c8d'
      };

      // Font styles
      const styles = {
        title: { size: 22, style: 'bold', color: colors.primary },
        subtitle: { size: 12, style: 'normal', color: colors.lightText },
        sectionTitle: { size: 16, style: 'bold', color: colors.secondary },
        bodyHeader: { size: 14, style: 'bold', color: colors.text },
        bodyText: { size: 12, style: 'normal', color: colors.text },
        footer: { size: 10, style: 'italic', color: colors.lightText }
      };

      // Add title and subtitle
      doc.setFontSize(styles.title.size);
      doc.setTextColor(styles.title.color);
      doc.text("PiscaRisk Dashboard Export", 20, 20);

      doc.setFontSize(styles.subtitle.size);
      doc.setTextColor(styles.subtitle.color);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 30);

      let yPosition = 40;

      // Add each box's content
      exportData.forEach((box, index) => {
        if (index > 0) {
          doc.addPage();
          yPosition = 20;
        }

        // Add box title
        doc.setFontSize(styles.sectionTitle.size);
        doc.setTextColor(styles.sectionTitle.color);
        doc.text(box.Title, 20, yPosition);
        yPosition += 10;

        // Add box content
        doc.setFontSize(styles.bodyText.size);
        doc.setTextColor(styles.bodyText.color);
        box.Content.forEach(line => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }
          doc.text(line, 20, yPosition);
          yPosition += 7;
        });

        // Add footer
        addFooter(doc);
      });

      // Save the PDF
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_export_${timestamp}.pdf`;
      console.log('Saving PDF:', fileName);
      doc.save(fileName);
      console.log('PDF download initiated');

      // Log successful PDF export
      try {
        logActivity('export', logMessages.export.pdfDownload(currentUser?.username || 'Unknown', 'dashboard data'), currentUser?.username || 'Unknown');
      } catch (logError) {
        console.error('Error logging PDF export:', logError);
      }
    }

    // Log export completion
    try {
      logActivity('export', logMessages.export.exportComplete(currentUser?.username || 'Unknown', 'dashboard data'), currentUser?.username || 'Unknown');
    } catch (logError) {
      console.error('Error logging export completion:', logError);
    }

  } catch (error) {
    console.error('Export error:', error);
    try {
      logActivity('export', logMessages.export.exportError(currentUser?.username || 'Unknown', error.message), currentUser?.username || 'Unknown');
    } catch (logError) {
      console.error('Error logging export error:', logError);
    }
  }
};

function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
  }
}