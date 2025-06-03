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
  currentUser
}) => {
  setShowDownloadOptions(false);

  // Log export start
  logActivity('export', logMessages.export.exportStart(currentUser.username, 'dashboard'), currentUser.username);

  try {
    // Extract weather data - returns array of lines
    const getWeatherContent = (weatherData) => {
      if (!weatherData || !weatherData.weather) return ["No weather data available"];

      return [
        "WEATHER OVERVIEW",
        "----------------",
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

        // Add content for each pond
        Object.entries(pondReports).forEach(([pondName, reports]) => {
          const latestReport = reports[0];
          content.push(
            `POND: ${pondName}`,
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
              "HISTORICAL REPORTS",
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

      return `"Weather Condition","${weatherData.weather[0].description}"
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
  
      if (box.id === 1) { // Weather Condition box
        contentArray = getWeatherContent(weatherData);
      } 
      else if (box.id === 2) { // Fish Pond Condition box
        contentArray = await getAllPondsContent();
      }
      else if (typeof box.content === 'string') {
        contentArray = box.content.split('\n');
      }
      else if (box.content.props?.children) {
        contentArray = React.Children.toArray(box.content.props.children)
          .map(child => typeof child === 'string' ? child : '')
          .filter(Boolean);
      }
  
      return {
        Title: box.title,
        Content: contentArray,
        CSVContent: box.id === 1 ? getWeatherCSVData(weatherData) : 
                    box.id === 2 ? await getPondsCSVData() : 
                    '' // Default empty CSV for other boxes
      };
    }));
  
    if (format === 'csv') {
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_export_${timestamp}.csv`;
      
      // Create combined CSV content
      let combinedCSV = `PiscaRisk Export\nGenerated on: ${new Date().toLocaleString()}\n\n`;
      
      // Add each box's data with clear section headers
      exportData.forEach((box, index) => {
        if (!box.CSVContent) return; // Skip boxes without CSV content
        
        combinedCSV += `\n===== ${box.Title} =====\n\n`;
        combinedCSV += box.CSVContent;
        combinedCSV += '\n\n'; // Add spacing between sections
      });
      
      // Create and download the combined CSV file
      const blob = new Blob([combinedCSV], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();

      // Log successful CSV export
      logActivity('export', logMessages.export.csvDownload(currentUser.username, 'dashboard data'), currentUser.username);
    }
    else if (format === 'pdf') {
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
      doc.save(`piscarisk_export_${timestamp}.pdf`);

      // Log successful PDF export
      logActivity('export', logMessages.export.pdfDownload(currentUser.username, 'dashboard data'), currentUser.username);
    }

    // Log export completion
    logActivity('export', logMessages.export.exportComplete(currentUser.username, 'dashboard data'), currentUser.username);

  } catch (error) {
    console.error('Export error:', error);
    logActivity('export', logMessages.export.exportError(currentUser.username, error.message), currentUser.username);
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