import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchRiskReportData } from '../services/riskDataService';
import { filterExcludedFarms } from '../utils/excludeFarms';

const RiskDataContext = createContext({
  farms: [],
  loading: false,
  error: null,
  lastFetchedAt: null,
  refreshRiskData: async () => [],
});

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedFarms = null;
let cachedAt = 0;
let inFlightPromise = null;

export const RiskDataProvider = ({ children }) => {
  const [farms, setFarms] = useState(() => cachedFarms || []);
  const [loading, setLoading] = useState(!cachedFarms);
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(cachedAt || null);

  const loadRiskData = useCallback(async (force = false) => {
    const now = Date.now();
    const cacheValid = cachedFarms && (now - cachedAt) < CACHE_TTL_MS;

    if (!force && cacheValid) {
      setFarms(cachedFarms);
      setLastFetchedAt(cachedAt);
      setLoading(false);
      return cachedFarms;
    }

    if (!force && inFlightPromise) {
      return inFlightPromise;
    }

    setLoading(true);
    setError(null);

    const promise = fetchRiskReportData()
      .then((raw) => {
        const filtered = filterExcludedFarms(Array.isArray(raw) ? raw : []);
        cachedFarms = filtered;
        cachedAt = Date.now();
        inFlightPromise = null;
        setFarms(filtered);
        setLastFetchedAt(cachedAt);
        setLoading(false);
        return filtered;
      })
      .catch((err) => {
        inFlightPromise = null;
        setError(err);
        setLoading(false);
        if (cachedFarms) {
          setFarms(cachedFarms);
          setLastFetchedAt(cachedAt);
          return cachedFarms;
        }
        throw err;
      });

    inFlightPromise = promise;
    return promise;
  }, []);

  useEffect(() => {
    loadRiskData(false).catch(() => {});
  }, [loadRiskData]);

  const refreshRiskData = useCallback(() => loadRiskData(true), [loadRiskData]);

  const value = useMemo(
    () => ({
      farms,
      loading,
      error,
      lastFetchedAt,
      refreshRiskData,
    }),
    [farms, loading, error, lastFetchedAt, refreshRiskData]
  );

  return (
    <RiskDataContext.Provider value={value}>
      {children}
    </RiskDataContext.Provider>
  );
};

export const useRiskData = () => useContext(RiskDataContext);
