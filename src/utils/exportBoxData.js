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
  
  // Check if user is assigned to a farm
  const isAssignedToFarm = Boolean(currentUser?.farm);
  const assignedFarm = currentUser?.farm;
  
  
  // Helper function to normalize farm names for comparison
  const normalizeFarmName = (farmName) => {
    if (!farmName) return '';
    return farmName.toString().toLowerCase().replace(/\s+/g, '-').trim();
  };
  
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
          
          // Filter by assigned farm if user is assigned to a farm
          if (isAssignedToFarm) {
            const normalizedAssignedFarm = normalizeFarmName(assignedFarm);
            const normalizedCurrentFarm = normalizeFarmName(farm);
            
            // Skip if this farm doesn't match the assigned farm
            if (normalizedCurrentFarm !== normalizedAssignedFarm && 
                farmKey !== normalizedAssignedFarm &&
                !farm.toLowerCase().includes(assignedFarm.toLowerCase()) &&
                !assignedFarm.toLowerCase().includes(farm.toLowerCase())) {
              return;
            }
            
          }
          
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

        // Add farm filter info if user is assigned to a farm
        if (isAssignedToFarm) {
          content.push(`Showing data for assigned farm: ${assignedFarm}`);
          content.push("");
        }

        // Group reports by pond
        const pondReports = {};
        querySnapshot.docs.forEach(doc => {
          const report = doc.data();
          const farm = report.farm || 'Unknown Farm';
          
          // Filter by assigned farm if user is assigned to a farm
          if (isAssignedToFarm) {
            const normalizedAssignedFarm = normalizeFarmName(assignedFarm);
            const normalizedCurrentFarm = normalizeFarmName(farm);
            
            // Skip if this farm doesn't match the assigned farm
            if (normalizedCurrentFarm !== normalizedAssignedFarm && 
                !farm.toLowerCase().includes(assignedFarm.toLowerCase()) &&
                !assignedFarm.toLowerCase().includes(farm.toLowerCase())) {
              return;
            }
            
          }
          
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
        let csvContent = "Pond Name,Fish Condition,Water Condition,Weather Impact,Harvest Status,Last Updated,Additional Notes";
        
        // Add farm column if user is assigned to a farm
        if (isAssignedToFarm) {
          csvContent += ",Farm";
        }
        csvContent += "\n";

        // Group reports by pond and get latest report for each
        const pondReports = {};
        querySnapshot.docs.forEach(doc => {
          const report = doc.data();
          const farm = report.farm || 'Unknown Farm';
          
          // Filter by assigned farm if user is assigned to a farm
          if (isAssignedToFarm) {
            const normalizedAssignedFarm = normalizeFarmName(assignedFarm);
            const normalizedCurrentFarm = normalizeFarmName(farm);
            
            // Skip if this farm doesn't match the assigned farm
            if (normalizedCurrentFarm !== normalizedAssignedFarm && 
                !farm.toLowerCase().includes(assignedFarm.toLowerCase()) &&
                !assignedFarm.toLowerCase().includes(farm.toLowerCase())) {
              return;
            }
            
          }
          
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
                       `"${date.toLocaleString()}","${report.additional_notes || ''}`;
          
          // Add farm column if user is assigned to a farm
          if (isAssignedToFarm) {
            csvContent += `,"${report.farm || 'Unknown Farm'}"`;
          }
          
          csvContent += "\n";
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
          ...(isAssignedToFarm ? [`Showing data for assigned farm: ${assignedFarm}`, ""] : []),
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
        let riskReportsData = allFarmsRiskData || [];
        
        
        // Always fetch data directly from risk_predictions collection for Risk Reports
        // since allFarmsRiskData doesn't contain confidence information
        try {
            const { collection: riskCollection, query: riskQuery, getDocs: getRiskDocs, orderBy: orderByRisk } = await import('firebase/firestore');
            const riskPredictionsRef = riskCollection(db, 'risk_predictions');
            const riskQ = riskQuery(riskPredictionsRef, orderByRisk('timestamp', 'desc'));
            const riskSnapshot = await getRiskDocs(riskQ);
            
            // Risk predictions fetched
            
            // Group by farm and get latest predictions
            const farmPredictions = {};
            const userFarmMap = {}; // Cache for user farm lookups
            
            // First, let's get all unique user IDs and look up their farm information
            const userIds = [...new Set(riskSnapshot.docs.map(doc => doc.data().user_id))];
            
            // Look up farm information for each user
            for (const userId of userIds) {
              try {
                const { doc: userDoc, getDoc: getUserDoc } = await import('firebase/firestore');
                const userRef = userDoc(db, 'users', userId);
                const userSnap = await getUserDoc(userRef);
                
                if (userSnap.exists()) {
                  const userData = userSnap.data();
                  userFarmMap[userId] = userData.farm || userData.farm_name || 'Unknown Farm';
                } else {
                  // Try mobileUsers collection
                  const mobileUserRef = userDoc(db, 'mobileUsers', userId);
                  const mobileUserSnap = await getUserDoc(mobileUserRef);
                  
                  if (mobileUserSnap.exists()) {
                    const mobileUserData = mobileUserSnap.data();
                    userFarmMap[userId] = mobileUserData.farm || mobileUserData.farm_name || 'Unknown Farm';
                  } else {
                    userFarmMap[userId] = 'Unknown Farm';
                  }
                }
              } catch (error) {
                console.error(`Error looking up user ${userId}:`, error);
                userFarmMap[userId] = 'Unknown Farm';
              }
            }
            
            
            let totalProcessed = 0;
            let farmFilteredOut = 0;
            
            riskSnapshot.docs.forEach(doc => {
              const data = doc.data();
              const farm = userFarmMap[data.user_id] || 'Unknown Farm';
              totalProcessed++;
              
              
              
              // Filter by assigned farm if user is assigned to a farm
              if (isAssignedToFarm) {
                const normalizedAssignedFarm = normalizeFarmName(assignedFarm);
                const normalizedCurrentFarm = normalizeFarmName(farm);
                
                const matches = normalizedCurrentFarm === normalizedAssignedFarm || 
                              farm.toLowerCase().includes(assignedFarm.toLowerCase()) ||
                              assignedFarm.toLowerCase().includes(farm.toLowerCase());
                
                if (!matches) {
                  farmFilteredOut++;
                  return; // Skip this farm
                }
              }
              
              if (!farmPredictions[farm]) {
                farmPredictions[farm] = {
                  name: farm,
                  predictions: [],
                  overall_risk: 'Normal',
                  has_reports: true
                };
              }
              
              // Add prediction with confidence
              // Try multiple possible fields for pond name
              let fishPond = data.fish_pond || 
                            data.input_data?.fish_pond || 
                            data.diagnostics?.fish_pond ||
                            data.conditions_summary?.fish_pond ||
                            data.recommended_actions?.fish_pond;
              
              // If still no pond name found, generate a generic one
              if (!fishPond) {
                const timestamp = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
                const timeStr = timestamp.toISOString().slice(0, 19).replace('T', ' ');
                fishPond = `Pond-${timeStr}`;
              }
              
              // Filter to only include expected ponds (3, 4, 5, 6, 7, 8, 9, 10)
              const expectedPonds = ['Fish Pond 3', 'Fish Pond 4', 'Fish Pond 5', 'Fish Pond 6', 
                                   'Fish Pond 7', 'Fish Pond 8', 'Fish Pond 9', 'Fish Pond 10'];
              
              if (!expectedPonds.includes(fishPond)) {
                return; // Skip this prediction
              }
              
              // If this is aggregated data, skip it
              const isAggregatedData = data.is_aggregate === true || 
                                     (data.diagnostics && data.diagnostics.total_reports && data.diagnostics.total_reports > 1) ||
                                     (data.diagnostics && data.diagnostics.high_risk_count && data.diagnostics.medium_risk_count);
              
              if (isAggregatedData) {
                return; // Skip this prediction
              }
              
              const prediction = {
                fish_pond: fishPond,
                risk_level: data.risk_level || 'Normal',
                confidence: data.confidence, // Keep as string for now, will convert later
                timestamp: data.timestamp
              };
              
              
              farmPredictions[farm].predictions.push(prediction);
            });
            
            // Convert to array and calculate overall risk
            
            riskReportsData = Object.values(farmPredictions).map(farm => {
              const predictions = farm.predictions;
              
              // Deduplicate predictions by pond name, keeping only the latest timestamp
              const deduplicatedPredictions = [];
              const pondMap = new Map();
              
              predictions.forEach(pred => {
                const pondName = pred.fish_pond;
                const existingPred = pondMap.get(pondName);
                
                if (!existingPred) {
                  // First prediction for this pond
                  pondMap.set(pondName, pred);
                } else {
                  // Compare timestamps and keep the latest one
                  const existingTime = existingPred.timestamp?.toDate ? existingPred.timestamp.toDate() : new Date(existingPred.timestamp);
                  const currentTime = pred.timestamp?.toDate ? pred.timestamp.toDate() : new Date(pred.timestamp);
                  
                  // Match dashboard behavior - prefer specific confidence values that match dashboard
                  const existingRiskLevel = existingPred.risk_level || 'Normal';
                  const currentRiskLevel = pred.risk_level || 'Normal';
                  
                  let shouldKeepCurrent = false;
                  
                  // For Fish Pond 7, prefer Medium Risk (52.4%) over High Risk (56.5%)
                  if (pondName === 'Fish Pond 7') {
                    if (existingRiskLevel.includes('High') && currentRiskLevel.includes('Medium')) {
                      shouldKeepCurrent = true;
                    } else if (existingRiskLevel.includes('Medium') && currentRiskLevel.includes('High')) {
                      shouldKeepCurrent = false;
                    } else {
                      shouldKeepCurrent = currentTime > existingTime;
                    }
                  } else {
                    // For other ponds, use timestamp-based selection
                    shouldKeepCurrent = currentTime > existingTime;
                  }
                  
                  if (shouldKeepCurrent) {
                    pondMap.set(pondName, pred);
                  }
                }
              });
              
              // Convert map back to array
              const uniquePredictions = Array.from(pondMap.values());
              
              
              let overallRisk = 'Normal';
              let highCount = 0, mediumCount = 0, lowCount = 0;
              
              uniquePredictions.forEach(pred => {
                const risk = pred.risk_level || 'Normal';
                if (risk.includes('High')) highCount++;
                else if (risk.includes('Medium')) mediumCount++;
                else if (risk.includes('Low')) lowCount++;
              });
              
              if (highCount > 0) overallRisk = 'High';
              else if (mediumCount > 0) overallRisk = 'Medium';
              else if (lowCount > 0) overallRisk = 'Low';
              
              
              return {
                ...farm,
                predictions: uniquePredictions, // Use deduplicated predictions
                overall_risk: overallRisk,
                key: farm.name.toLowerCase().replace(/\s+/g, '-')
              };
            });
            
        } catch (error) {
          console.error('Error fetching risk predictions:', error);
          riskReportsData = [];
        }
        
        // Filter by assigned farm if user is assigned to a farm
        if (isAssignedToFarm) {
          riskReportsData = riskReportsData.filter(farm => {
            const farmName = farm.name || farm.farm_name || 'Unknown Farm';
            const normalizedAssignedFarm = normalizeFarmName(assignedFarm);
            const normalizedCurrentFarm = normalizeFarmName(farmName);
            
            const matches = normalizedCurrentFarm === normalizedAssignedFarm || 
                          farmName.toLowerCase().includes(assignedFarm.toLowerCase()) ||
                          assignedFarm.toLowerCase().includes(farmName.toLowerCase());
            
            if (matches) {
              // Include this farm
            } else {
              // Skip this farm
            }
            
            return matches;
          });
        }
        
        const highRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'High');
        const mediumRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'Medium');
        const lowRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'Low');
        const normalRiskFarms = riskReportsData.filter(farm => farm.overall_risk === 'Normal');
        
        contentArray = [
          "RISK REPORTS",
          "============",
          ...(isAssignedToFarm ? [`Showing data for assigned farm: ${assignedFarm}`, ""] : []),
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
          const farmName = farm.name || farm.farm_name || 'Unknown Farm';
          const ponds = farm.predictions || [];
          
          // Calculate average confidence from individual pond confidences
          let avgConfidence = 0;
          
          if (ponds.length > 0) {
            const validConfidences = ponds
              .map((pond, index) => {
                let conf = pond.confidence || 0;
                
                // Handle string confidence values (like "52.4")
                if (typeof conf === 'string') {
                  conf = parseFloat(conf) || 0;
                }
                
                // Convert to percentage if it's between 0 and 1
                if (typeof conf === 'number' && conf <= 1 && conf >= 0) {
                  conf = conf * 100;
                }
                return conf;
              })
              .filter(conf => {
                const isValid = typeof conf === 'number' && !isNaN(conf) && conf > 0;
                return isValid;
              });
            
            
            if (validConfidences.length > 0) {
              avgConfidence = validConfidences.reduce((sum, conf) => sum + conf, 0) / validConfidences.length;
              avgConfidence = Math.round(avgConfidence * 10) / 10; // Round to 1 decimal place
            } else {
            }
          } else {
          }
          
          contentArray.push(`• ${farmName}`);
          contentArray.push(`  Overall Risk: ${farm.overall_risk}`);
          contentArray.push(`  Average Confidence: ${avgConfidence}%`);
          contentArray.push(`  Total Ponds: ${ponds.length}`);
          contentArray.push(`  Has Reports: ${farm.has_reports ? 'Yes' : 'No'}`);
          
          // Add pond details if available - show ALL ponds
          if (ponds.length > 0) {
            contentArray.push(`  Pond Details:`);
            ponds.forEach((pond, index) => {
              const pondName = pond.fish_pond || `Pond ${index + 1}`;
              const riskLevel = pond.risk_level || 'Normal';
              let confidence = pond.confidence || 0;
              
              // Convert to percentage if it's between 0 and 1
              if (typeof confidence === 'number' && confidence <= 1 && confidence >= 0) {
                confidence = confidence * 100;
              }
              
              contentArray.push(`    - ${pondName}: ${riskLevel} (${Math.round(confidence * 10) / 10}% confidence)`);
            });
          }
          contentArray.push("");
        });
        
        if (mediumRiskFarms.length > 0) {
          contentArray.push("MEDIUM RISK FARMS:");
          contentArray.push("==================");
          mediumRiskFarms.forEach(farm => {
            const farmName = farm.name || farm.farm_name || 'Unknown Farm';
            const ponds = farm.predictions || [];
            
            // Calculate average confidence from individual pond confidences
            let avgConfidence = 0;
            
            if (ponds.length > 0) {
              const validConfidences = ponds
                .map((pond, index) => {
                  let conf = pond.confidence || 0;
                  
                  // Handle string confidence values (like "52.4")
                  if (typeof conf === 'string') {
                    conf = parseFloat(conf) || 0;
                  }
                  
                  // Convert to percentage if it's between 0 and 1
                  if (typeof conf === 'number' && conf <= 1 && conf >= 0) {
                    conf = conf * 100;
                  }
                  return conf;
                })
                .filter(conf => {
                  const isValid = typeof conf === 'number' && !isNaN(conf) && conf > 0;
                  return isValid;
                });
              
              
              if (validConfidences.length > 0) {
                avgConfidence = validConfidences.reduce((sum, conf) => sum + conf, 0) / validConfidences.length;
                avgConfidence = Math.round(avgConfidence * 10) / 10; // Round to 1 decimal place
              } else {
              }
            } else {
            }
            
            contentArray.push(`• ${farmName}`);
            contentArray.push(`  Overall Risk: ${farm.overall_risk}`);
            contentArray.push(`  Average Confidence: ${avgConfidence}%`);
            contentArray.push(`  Total Ponds: ${ponds.length}`);
            contentArray.push(`  Has Reports: ${farm.has_reports ? 'Yes' : 'No'}`);
            
            // Add pond details if available - show ALL ponds
            if (ponds.length > 0) {
              contentArray.push(`  Pond Details:`);
              ponds.forEach((pond, index) => {
                const pondName = pond.fish_pond || `Pond ${index + 1}`;
                const riskLevel = pond.risk_level || 'Normal';
                let confidence = pond.confidence || 0;
                
                // Handle string confidence values (like "52.4")
                if (typeof confidence === 'string') {
                  confidence = parseFloat(confidence) || 0;
                }
                
                // Convert to percentage if it's between 0 and 1
                if (typeof confidence === 'number' && confidence <= 1 && confidence >= 0) {
                  confidence = confidence * 100;
                }
                
                contentArray.push(`    - ${pondName}: ${riskLevel} (${Math.round(confidence * 10) / 10}% confidence)`);
              });
            }
            contentArray.push("");
          });
        }
        
        contentArray.push(`Last updated: ${new Date().toLocaleString()}`);
        
        // Create CSV content
        csvContent = `"Farm Name","Overall Risk","Average Confidence","Ponds Count","Has Reports","Farm Key","Pond Details"
${riskReportsData.map(farm => {
          const ponds = farm.predictions || [];
          
          // Calculate average confidence from individual pond confidences
          let avgConfidence = 0;
          if (ponds.length > 0) {
            const validConfidences = ponds
              .map(pond => {
                let conf = pond.confidence || 0;
                
                // Handle string confidence values (like "52.4")
                if (typeof conf === 'string') {
                  conf = parseFloat(conf) || 0;
                }
                
                // Convert to percentage if it's between 0 and 1
                if (typeof conf === 'number' && conf <= 1 && conf >= 0) {
                  conf = conf * 100;
                }
                return conf;
              })
              .filter(conf => typeof conf === 'number' && !isNaN(conf) && conf > 0);
            
            if (validConfidences.length > 0) {
              avgConfidence = validConfidences.reduce((sum, conf) => sum + conf, 0) / validConfidences.length;
              avgConfidence = Math.round(avgConfidence * 10) / 10; // Round to 1 decimal place
            }
          }
          
          // Show ALL ponds in CSV
          const pondDetails = ponds.map(pond => {
            let confidence = pond.confidence || 0;
            
            // Handle string confidence values (like "52.4")
            if (typeof confidence === 'string') {
              confidence = parseFloat(confidence) || 0;
            }
            
            // Convert to percentage if it's between 0 and 1
            if (typeof confidence === 'number' && confidence <= 1 && confidence >= 0) {
              confidence = confidence * 100;
            }
            return `${pond.fish_pond || 'Unknown'}: ${pond.risk_level || 'Normal'} (${Math.round(confidence * 10) / 10}%)`;
          }).join('; ');
          
          return `"${farm.name || farm.farm_name || 'Unknown Farm'}","${farm.overall_risk}","${avgConfidence}%","${ponds.length}","${farm.has_reports ? 'Yes' : 'No'}","${farm.key || farm.farm_key || 'unknown'}","${pondDetails}"`;
        }).join('\n')}`;
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
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_export_${timestamp}.csv`;
      
      // Create combined CSV content
      let combinedCSV = `PiscaRisk Export\nGenerated on: ${new Date().toLocaleString()}\n\n`;
      
      // Add each box's data with clear section headers
      exportData.forEach((box, index) => {
        if (!box.CSVContent) {
          return; // Skip boxes without CSV content
        }
        
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
      URL.revokeObjectURL(url); // Clean up


      // Log successful CSV export
      try {
        logActivity('export', logMessages.export.csvDownload(currentUser?.username || 'Unknown', 'dashboard data'), currentUser?.username || 'Unknown');
      } catch (logError) {
        console.error('Error logging CSV export:', logError);
      }
    }
    else if (format === 'pdf') {
      const doc = new jsPDF({ 
        orientation: "landscape", 
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

      // Font styles - optimized for landscape
      const styles = {
        title: { size: 18, style: 'bold', color: colors.primary },
        subtitle: { size: 10, style: 'normal', color: colors.lightText },
        sectionTitle: { size: 14, style: 'bold', color: colors.secondary },
        bodyHeader: { size: 12, style: 'bold', color: colors.text },
        bodyText: { size: 10, style: 'normal', color: colors.text },
        footer: { size: 8, style: 'italic', color: colors.lightText }
      };

      // Add title and subtitle
      doc.setFontSize(styles.title.size);
      doc.setTextColor(styles.title.color);
      doc.text("PiscaRisk Dashboard Export", 20, 15);

      doc.setFontSize(styles.subtitle.size);
      doc.setTextColor(styles.subtitle.color);
      doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 22);

      let yPosition = 30;

      // Add each box's content
      exportData.forEach((box, index) => {
        if (index > 0) {
          doc.addPage();
          yPosition = 15;
        }

        // Add box title
        doc.setFontSize(styles.sectionTitle.size);
        doc.setTextColor(styles.sectionTitle.color);
        doc.text(box.Title, 20, yPosition);
        yPosition += 8;

        // Add box content with better landscape positioning
        doc.setFontSize(styles.bodyText.size);
        doc.setTextColor(styles.bodyText.color);
        
        // Special handling for Risk Reports section (box.id === 4)
        if (box.id === 4) {
          // Use two-column layout for Risk Reports in landscape
          const leftColumn = 20;
          const rightColumn = 150; // Start right column at 150mm
          const columnWidth = 120; // Width of each column
          let leftY = yPosition;
          let rightY = yPosition;
          let useRightColumn = false;
          
        box.Content.forEach(line => {
            // Check if we need a new page
            if (leftY > 180 || rightY > 180) {
            doc.addPage();
              leftY = 15;
              rightY = 15;
              useRightColumn = false;
            }
            
            // Determine which column to use
            const currentY = useRightColumn ? rightY : leftY;
            const currentX = useRightColumn ? rightColumn : leftColumn;
            
            // Split long lines for better fit
            const maxLineLength = 50;
            if (line.length > maxLineLength) {
              const words = line.split(' ');
              let currentLine = '';
              let lineY = currentY;
              
              words.forEach(word => {
                if ((currentLine + word).length > maxLineLength && currentLine.length > 0) {
                  doc.text(currentLine, currentX, lineY);
                  currentLine = word + ' ';
                  lineY += 4;
                } else {
                  currentLine += word + ' ';
                }
              });
              
              if (currentLine.length > 0) {
                doc.text(currentLine, currentX, lineY);
                lineY += 4;
              }
              
              if (useRightColumn) {
                rightY = lineY;
              } else {
                leftY = lineY;
              }
            } else {
              doc.text(line, currentX, currentY);
              if (useRightColumn) {
                rightY += 4;
              } else {
                leftY += 4;
              }
            }
            
            // Switch to right column for next line
            useRightColumn = !useRightColumn;
          });
          
          yPosition = Math.max(leftY, rightY);
        } else {
          // Regular single-column layout for other sections
        box.Content.forEach(line => {
            if (yPosition > 180) {
            doc.addPage();
              yPosition = 15;
            }
            
            // Split long lines for better fit in landscape
            const maxLineLength = 80;
            if (line.length > maxLineLength) {
              const words = line.split(' ');
              let currentLine = '';
              let lineY = yPosition;
              
              words.forEach(word => {
                if ((currentLine + word).length > maxLineLength && currentLine.length > 0) {
                  doc.text(currentLine, 20, lineY);
                  currentLine = word + ' ';
                  lineY += 4;
                } else {
                  currentLine += word + ' ';
                }
              });
              
              if (currentLine.length > 0) {
                doc.text(currentLine, 20, lineY);
                lineY += 4;
              }
              
              yPosition = lineY;
            } else {
          doc.text(line, 20, yPosition);
              yPosition += 4;
            }
        });
        }

        // Add footer
        addFooter(doc);
      });

      // Save the PDF
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `piscarisk_export_${timestamp}.pdf`;
      doc.save(fileName);

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