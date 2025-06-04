// src/services/weatherService.js
const API_KEY = "d2ac047010bdc4eb7a196d94bf69cd27";

// Default coordinates for San Pablo City, Laguna
const DEFAULT_LAT = 14.1104;
const DEFAULT_LON = 121.1446;

export const fetchWeatherData = async (lat = DEFAULT_LAT, lon = DEFAULT_LON) => {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
    );
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    data.locationName = "San Pablo City, Laguna";
    return data;
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
};
