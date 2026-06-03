import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFarms } from './FarmsContext';
import { fetchReportsBundle } from '../services/reportsDataService';

const ReportsDataContext = createContext({
  reports: [],
  reportsByFarm: {},
  loading: false,
  error: null,
  lastFetchedAt: null,
  refreshReportsData: async () => ({ reports: [], reportsByFarm: {} }),
});

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedBundle = null;
let cachedAt = 0;
let inFlightPromise = null;

export const ReportsDataProvider = ({ children }) => {
  const { farms: liveFarms } = useFarms();
  const [reports, setReports] = useState(() => cachedBundle?.reports || []);
  const [reportsByFarm, setReportsByFarm] = useState(() => cachedBundle?.reportsByFarm || {});
  const [loading, setLoading] = useState(!cachedBundle);
  const [error, setError] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(cachedAt || null);

  const loadReportsData = useCallback(async (force = false, silent = false) => {
    const now = Date.now();
    const cacheValid = cachedBundle && (now - cachedAt) < CACHE_TTL_MS;

    if (!force && cacheValid) {
      setReports(cachedBundle.reports);
      setReportsByFarm(cachedBundle.reportsByFarm);
      setLastFetchedAt(cachedAt);
      setLoading(false);
      return cachedBundle;
    }

    if (!force && inFlightPromise) {
      return inFlightPromise;
    }

    if (!silent || !cachedBundle) {
      setLoading(true);
    }
    setError(null);

    const promise = fetchReportsBundle(liveFarms)
      .then((bundle) => {
        cachedBundle = bundle;
        cachedAt = Date.now();
        inFlightPromise = null;
        setReports(bundle.reports);
        setReportsByFarm(bundle.reportsByFarm);
        setLastFetchedAt(cachedAt);
        setLoading(false);
        return bundle;
      })
      .catch((err) => {
        inFlightPromise = null;
        setError(err);
        setLoading(false);
        if (cachedBundle) {
          setReports(cachedBundle.reports);
          setReportsByFarm(cachedBundle.reportsByFarm);
          setLastFetchedAt(cachedAt);
          return cachedBundle;
        }
        throw err;
      });

    inFlightPromise = promise;
    return promise;
  }, [liveFarms]);

  useEffect(() => {
    if (!liveFarms || liveFarms.length === 0) return;
    loadReportsData(false).catch(() => {});
  }, [liveFarms, loadReportsData]);

  const refreshReportsData = useCallback(
    (opts) => {
      const silent = opts === true || (opts && opts.silent === true);
      return loadReportsData(true, silent);
    },
    [loadReportsData]
  );

  const value = useMemo(
    () => ({
      reports,
      reportsByFarm,
      loading,
      error,
      lastFetchedAt,
      refreshReportsData,
    }),
    [reports, reportsByFarm, loading, error, lastFetchedAt, refreshReportsData]
  );

  return (
    <ReportsDataContext.Provider value={value}>
      {children}
    </ReportsDataContext.Provider>
  );
};

export const useReportsData = () => useContext(ReportsDataContext);
