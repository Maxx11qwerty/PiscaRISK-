import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { fetchWeatherData } from '../services/weatherService';

const WeatherContext = createContext({
  weather: null,
  loading: false,
  lastFetchedAt: null,
  loadWeather: async () => null,
});

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedWeather = null;
let cachedAt = 0;
let inFlightPromise = null;

export const WeatherProvider = ({ children }) => {
  const [weather, setWeather] = useState(cachedWeather);
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(cachedAt || null);

  const loadWeather = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedWeather && (now - cachedAt) < CACHE_TTL_MS) {
      setWeather(cachedWeather);
      setLastFetchedAt(cachedAt);
      return cachedWeather;
    }
    if (!force && inFlightPromise) return inFlightPromise;

    setLoading(true);
    const promise = fetchWeatherData()
      .then((data) => {
        cachedWeather = data;
        cachedAt = Date.now();
        inFlightPromise = null;
        setWeather(data);
        setLastFetchedAt(cachedAt);
        setLoading(false);
        return data;
      })
      .catch((err) => {
        inFlightPromise = null;
        setLoading(false);
        if (cachedWeather) {
          setWeather(cachedWeather);
          setLastFetchedAt(cachedAt);
          return cachedWeather;
        }
        throw err;
      });

    inFlightPromise = promise;
    return promise;
  }, []);

  const value = useMemo(
    () => ({ weather, loading, lastFetchedAt, loadWeather }),
    [weather, loading, lastFetchedAt, loadWeather]
  );

  return (
    <WeatherContext.Provider value={value}>
      {children}
    </WeatherContext.Provider>
  );
};

export const useWeather = () => useContext(WeatherContext);
