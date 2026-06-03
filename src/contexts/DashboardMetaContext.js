import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchAllUsers } from '../services/accountService';
import { useReportsData } from './ReportsDataContext';
import { toCanonicalDisplay } from '../services/reportsDataService';

const DashboardMetaContext = createContext({
  farmUserCount: {},
  farmReportsCount: {},
  farmReviewedCount: {},
  loading: false,
  refreshDashboardMeta: async () => {},
});

const normalizeFarmName = (name) => {
  if (!name || typeof name !== 'string') return 'unknown-farm';
  return name.trim().toLowerCase().replace(/\s+/g, '-');
};

const toCanonicalKey = (farmRaw) => {
  const display = toCanonicalDisplay(farmRaw);
  return normalizeFarmName(display);
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedUsers = null;
let cachedUsersAt = 0;
let usersInFlight = null;

export const DashboardMetaProvider = ({ children }) => {
  const { reports, loading: reportsLoading } = useReportsData();
  const [farmUserCount, setFarmUserCount] = useState({});
  const [farmReportsCount, setFarmReportsCount] = useState({});
  const [farmReviewedCount, setFarmReviewedCount] = useState({});
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cachedUsers && (now - cachedUsersAt) < CACHE_TTL_MS) {
      return cachedUsers;
    }
    if (!force && usersInFlight) return usersInFlight;

    const promise = fetchAllUsers()
      .then((users) => {
        cachedUsers = users;
        cachedUsersAt = Date.now();
        usersInFlight = null;
        return users;
      })
      .catch((err) => {
        usersInFlight = null;
        if (cachedUsers) return cachedUsers;
        throw err;
      });

    usersInFlight = promise;
    return promise;
  }, []);

  const recomputeCounts = useCallback(async () => {
    try {
      setLoading(true);
      const users = await loadUsers(false);
      const userCounts = {};
      (users || []).forEach((u) => {
        const farmName = (u.farm || u.farm_name || '').toString().trim();
        if (!farmName) return;
        if (
          farmName === 'Rojo Hatchery' ||
          farmName === 'Freshwater Finfish Farm' ||
          farmName.toLowerCase().includes('freshwater finfish')
        ) {
          return;
        }
        const key = normalizeFarmName(farmName);
        if (key === 'unknown-farm') return;
        userCounts[key] = (userCounts[key] || 0) + 1;
      });
      setFarmUserCount(userCounts);

      const counts = {};
      const reviewed = {};
      (reports || []).forEach((r) => {
        const key = toCanonicalKey(r.farm);
        if (key === 'unknown-farm') return;
        counts[key] = (counts[key] || 0) + 1;
        const status = (r.status || '').toString().toLowerCase();
        const isReviewed =
          status === 'reviewed' || !!r.reviewedBy || !!r.reviewedAt;
        if (isReviewed) reviewed[key] = (reviewed[key] || 0) + 1;
      });
      setFarmReportsCount(counts);
      setFarmReviewedCount(reviewed);
    } finally {
      setLoading(false);
    }
  }, [reports, loadUsers]);

  useEffect(() => {
    if (reportsLoading) return;
    recomputeCounts().catch(() => setLoading(false));
  }, [reports, reportsLoading, recomputeCounts]);

  const refreshDashboardMeta = useCallback(async () => {
    await loadUsers(true);
    await recomputeCounts();
  }, [loadUsers, recomputeCounts]);

  const value = useMemo(
    () => ({
      farmUserCount,
      farmReportsCount,
      farmReviewedCount,
      loading: loading || reportsLoading,
      refreshDashboardMeta,
    }),
    [farmUserCount, farmReportsCount, farmReviewedCount, loading, reportsLoading, refreshDashboardMeta]
  );

  return (
    <DashboardMetaContext.Provider value={value}>
      {children}
    </DashboardMetaContext.Provider>
  );
};

export const useDashboardMeta = () => useContext(DashboardMetaContext);
