// src/services/weatherService.js
const API_KEY = "d2ac047010bdc4eb7a196d94bf69cd27";

export const fetchWeatherData = async (city = "Manila") => {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`
    );
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error("Error fetching weather data:", error);
    return null;
  }
};