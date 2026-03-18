import { jsPDF } from "jspdf";
import { logActivity, logMessages } from "./logger";

const buildWeatherRows = (weatherData, lastUpdated) => {
  if (!weatherData || !weatherData.weather || !weatherData.main || !weatherData.wind) {
    return [["Weather Data", "No data available"]];
  }

  const exportedAt = new Date();
  const locationName = weatherData.locationName || weatherData.name || "Unknown Location";
  const formatTime = (ts) => {
    if (!ts) return "N/A";
    return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return [
    ["Location", locationName],
    ["Current Date", exportedAt.toLocaleDateString()],
    ["Current Time", exportedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })],
    ["Weather", weatherData.weather[0]?.main || "N/A"],
    ["Condition", weatherData.weather[0]?.description || "N/A"],
    ["Temperature (C)", Math.round(weatherData.main.temp)],
    ["Feels Like (C)", Math.round(weatherData.main.feels_like)],
    ["Humidity (%)", weatherData.main.humidity],
    ["Pressure (hPa)", weatherData.main.pressure],
    ["Sea Level (hPa)", weatherData.main.sea_level || "N/A"],
    ["Wind Speed (m/s)", weatherData.wind.speed],
    ["Wind Direction", `${weatherData.wind.deg}°`],
    ["Sunrise", formatTime(weatherData.sys?.sunrise ?? weatherData.sunrise)],
    ["Sunset", formatTime(weatherData.sys?.sunset ?? weatherData.sunset)],
    ["Last Updated", lastUpdated ? lastUpdated.toLocaleString() : "N/A"],
  ];
};

export const exportWeatherData = ({ format, weatherData, lastUpdated, currentUser }) => {
  const rows = buildWeatherRows(weatherData, lastUpdated);
  const timestamp = new Date().toISOString().split("T")[0];
  const username = currentUser?.username || "Unknown";

  if (format === "csv") {
    const csv = rows.map(([key, value]) => `"${key}","${String(value).replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `weather_condition_export_${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    try {
      logActivity("export", logMessages.export.csvDownload(username, "weather data"), username);
    } catch (_) {}
    return;
  }

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Weather Condition Export", 14, 18);
    doc.setFontSize(10);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, 24);

    let y = 34;
    rows.forEach(([key, value]) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.setFont(undefined, "bold");
      doc.text(`${key}:`, 14, y);
      doc.setFont(undefined, "normal");
      doc.text(String(value), 60, y);
      y += 7;
    });

    doc.save(`weather_condition_export_${timestamp}.pdf`);
    try {
      logActivity("export", logMessages.export.pdfDownload(username, "weather data"), username);
    } catch (_) {}
  }
};

