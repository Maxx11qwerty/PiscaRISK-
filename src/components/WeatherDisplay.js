import { useState, useEffect } from 'react';
import { fetchWeatherData } from '../services/weatherService';
import { getTimeOfDay, getWeatherImage, getWeatherIcon } from '../utils/weatherUtils';
import './WeatherDisplay.css';

const WeatherDisplay = ({ }) => {
  const [weatherData, setWeatherData] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchWeatherData();
      setWeatherData(data);
      setLastUpdated(new Date());
      setLoading(false);
    };
    loadData();

    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    const weatherInterval = setInterval(loadData, 30 * 60 * 1000);
    
    return () => {
      clearInterval(timeInterval);
      clearInterval(weatherInterval);
    };
  }, []);

  if (loading) return <div>Loading weather data...</div>;
  if (!weatherData) return <div>Failed to load weather data</div>;

  const timeOfDay = getTimeOfDay(currentTime);
  const weatherImage = getWeatherImage(weatherData);
  const weatherIconData = getWeatherIcon(weatherData.weather[0].main, currentTime, weatherData);
  const weatherIcon = weatherIconData.icon;
  const isNight = weatherIconData.isNight;
  const weatherCondition = weatherData.weather[0].main.toLowerCase();

  return (
    <div className={`weather-display-container ${timeOfDay}`}>
      <div 
        className="weather-display-background" 
        style={{ backgroundImage: `url(${weatherImage})` }}
      />
      <div className="weather-display-content">
        <div className="weather-time-info">
          <div className="current-date-time">
            <div className="current-date">
              {currentTime.toLocaleDateString([], { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
              })}
            </div>
            <div className="current-time">
              {currentTime.toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </div>
          </div>
          <div className="current-temp">
            {Math.round(weatherData.main.temp)}°C
          </div>
        </div>
        <img 
          src={weatherIcon} 
          alt={weatherCondition} 
          className={`weather-condition-icon ${weatherCondition.replace(/\s+/g, '-')} ${
            isNight ? 'night' : 'day'
          }`}
        />
        <p className={`weather-condition-text ${timeOfDay}`}>
          {weatherData.weather[0].description}
        </p>
      </div>
    </div>
  );
};

export default WeatherDisplay;