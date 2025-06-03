import React, { useState, useEffect } from "react";
import {  
  FaCloud, 
  FaClock,
  FaSyncAlt,
  FaCompass,
  FaWater,
  FaSun
} from 'react-icons/fa';
import './WeatherBox.css';

const WeatherBox = ({isModal = false, weatherData, lastUpdated, refreshWeather }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!weatherData) return <div>Failed to load weather data</div>;

  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="weather-dashboard">
      <div className="weather-header">
        <h1 className="weather-title">Weather details</h1>
        <div className="weather-time">
          <span className="time-updating">
            {currentTime.toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
          <button onClick={refreshWeather} className="refresh-btn">
            <FaSyncAlt />
          </button>
        </div>
      </div>

      <div className="weather-grid">
        {/* Temperature Card */}
        <div className="weather-card temperature-card">
          <div className="weather-card-header">Temperature</div>
          <div className="temperature-display">
            <span className="temperature-value">{Math.round(weatherData.main.temp)}</span>
            <span className="temperature-unit">°</span>
            <span className="temperature-status">Steady</span>
          </div>
          <div className="detail-description">
            Steady at current value of {Math.round(weatherData.main.temp)}°
          </div>
        </div>

        {/* Feels Like Card */}
        <div className="weather-card">
          <div className="weather-card-header">Feels like</div>
          <div className="detail-value">{Math.round(weatherData.main.feels_like)}°</div>
          <div className="detail-secondary">Dominant factor: humidity</div>
          <div className="detail-description">
            Feels {weatherData.main.feels_like > weatherData.main.temp ? 'warmer' : 'cooler'} than the actual temperature
          </div>
        </div>

        {/* Humidity Card */}
        <div className="weather-card">
          <div className="weather-card-header">Humidity</div>
          <div className="detail-value">{weatherData.main.humidity}%</div>
          <div className="detail-secondary">Relative Humidity</div>
          <div className="humidity-level">
            <div 
              className="humidity-level-fill" 
              style={{ width: `${weatherData.main.humidity}%` }}
            ></div>
          </div>
          <div className="detail-description">
            {weatherData.main.humidity > 70 ? 'Very humid' : 
             weatherData.main.humidity > 40 ? 'Moderate humidity' : 'Dry conditions'}
          </div>
        </div>

       {/* Conditions Card */}
        <div className="weather-card">
          <div className="weather-card-header">Conditions</div>
          <div className="detail-value">
            {weatherData.weather[0].main}
          </div>
          <div className="detail-secondary">
            {weatherData.weather[0].description}
          </div>
          <div className="weather-icon">
            <FaCloud style={{ fontSize: '2rem', marginTop: '0.5rem' }} />
          </div>
        </div>

        {/* Wind Card */}
        <div className="weather-card">
          <div className="weather-card-header">Wind</div>
          <div className="wind-display">
            <FaCompass 
              style={{ 
                transform: `rotate(${weatherData.wind.deg || 0}deg)`,
                fontSize: '1.5rem',
                marginRight: '0.5rem'
              }} 
            />
            <span className="detail-value">
              {weatherData.wind.speed} m/s
            </span>
          </div>
          {weatherData.wind.gust && (
            <div className="weather-detail">
              <div className="detail-label">Wind Gust</div>
              <div className="detail-value">{weatherData.wind.gust} m/s</div>
            </div>
          )}
        </div>

        {/* Pressure Card */}
        <div className="weather-card">
          <div className="weather-card-header">Pressure</div>
          <div className="detail-value">{weatherData.main.pressure} hPa</div>
          <div className="detail-secondary">Atmospheric Pressure</div>
          <div className="detail-description">
            {weatherData.main.pressure > 1013 ? 'Higher than average' : 'Lower than average'}
          </div>
        </div>

        {/* Sea Level Pressure Card */}
        {weatherData.main.sea_level && (
          <div className="weather-card">
            <div className="weather-card-header">Sea Level Pressure</div>
            <div className="detail-value">{weatherData.main.sea_level} hPa</div>
            <div className="detail-secondary">At Sea Level</div>
            <div className="weather-icon">
              <FaWater style={{ fontSize: '1.5rem', marginTop: '0.5rem' }} />
            </div>
          </div>
        )}

        {/* Sunrise/Sunset Card */}
          <div className="weather-card">
          <div className="weather-card-header">Sun</div>
          <div className="sun-moon-times">
            <div className="time-row">
              <FaSun className="time-icon" style={{ color: '#FFD700' }} />
              <span className="time-label">Sunrise:</span>
              <span className="time-value">
                {formatTime(weatherData.sys?.sunrise ?? weatherData.sunrise)}
              </span>
            </div>
            <div className="time-row">
              <FaSun className="time-icon" style={{ color: '#FF8C00' }} />
              <span className="time-label">Sunset:</span>
              <span className="time-value">
                {formatTime(weatherData.sys?.sunset ?? weatherData.sunset)}
              </span>
            </div>
          </div>
        </div>
      </div>
      {!isModal && (
        <div className="last-updated">
          <FaClock className="update-icon" />
            Last updated: {new Date().toLocaleTimeString()}
          </div>
      )}
    </div>
  );
};

export default WeatherBox;