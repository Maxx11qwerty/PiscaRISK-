import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWeather } from '../contexts/WeatherContext';
import { getTimeOfDay, getWeatherImage, getWeatherIcon } from '../utils/weatherUtils';
import './WeatherDisplay.css';

const WeatherDisplay = () => {
  const { t } = useTranslation();
  const { weather: weatherData, loading: weatherLoading, loadWeather } = useWeather();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadWeather(false)
      .then(() => setLastUpdated(new Date()))
      .catch(() => {});

    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    const weatherInterval = setInterval(() => {
      loadWeather(true)
        .then(() => setLastUpdated(new Date()))
        .catch(() => {});
    }, 30 * 60 * 1000);
    
    return () => {
      clearInterval(timeInterval);
      clearInterval(weatherInterval);
    };
  }, [loadWeather]);

  const loading = weatherLoading && !weatherData;

  // Memoize expensive calculations to prevent re-computation on language change
  const weatherDisplayData = useMemo(() => {
    if (!weatherData) return null;
    
    const timeOfDay = getTimeOfDay(currentTime);
    const weatherImage = getWeatherImage(weatherData);
    const weatherIconData = getWeatherIcon(weatherData.weather[0].main, currentTime, weatherData);
    
    return {
      timeOfDay,
      weatherImage,
      weatherIcon: weatherIconData.icon,
      isNight: weatherIconData.isNight,
      weatherCondition: weatherData.weather[0].main.toLowerCase()
    };
  }, [weatherData, currentTime]); // Only recalculate when weather data or time changes, not language

  if (loading) return <div>{t('weather.loading')}</div>;
  if (!weatherData || !weatherDisplayData) return <div>{t('weather.failedToLoad')}</div>;

  const { timeOfDay, weatherImage, weatherIcon, isNight, weatherCondition } = weatherDisplayData;

  return (
    <div className={`weather-display-container ${timeOfDay}`}>
      <div 
        className="weather-display-background" 
        style={{ 
          backgroundImage: `url(${weatherImage})`,
          // Add smooth transition to prevent flickering
          transition: 'background-image 0.3s ease-in-out'
        }}
      />
      <div className="weather-display-content">
        <div className="weather-time-info">
          <div className="location-name">
            {weatherData.locationName}
          </div>
          <div className="current-date-time">
            <div className="current-date">
              {currentTime.toLocaleDateString([], { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
              })}
            </div>
            <div className="time-temp-container">
              <div className="current-time">
                {currentTime.toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
              <div className="current-temp">
                {Math.round(weatherData.main.temp)}°C
              </div>
            </div>
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