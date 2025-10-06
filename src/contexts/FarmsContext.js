import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const FarmsContext = createContext({ farmsById: {}, farms: [], farmsNameByKey: {} });

export const FarmsProvider = ({ children }) => {
  const [farms, setFarms] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'farms'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFarms(items);
    });
    return () => unsub();
  }, []);

  const farmsById = useMemo(() => {
    const map = {};
    for (const f of farms) map[f.id] = f;
    return map;
  }, [farms]);

  // Normalize function local to context
  const normalize = (name) => {
    if (!name || typeof name !== 'string') return 'unknown-farm';
    return name.trim().toLowerCase().replace(/\s+/g, '-');
  };

  // Map normalized key -> live display name from farms collection
  const farmsNameByKey = useMemo(() => {
    const map = {};
    for (const f of farms) {
      const k = normalize(f.name);
      map[k] = f.name;
    }
    return map;
  }, [farms]);

  const value = useMemo(() => ({ farmsById, farms, farmsNameByKey }), [farmsById, farms, farmsNameByKey]);
  return <FarmsContext.Provider value={value}>{children}</FarmsContext.Provider>;
};

export const useFarms = () => useContext(FarmsContext);


