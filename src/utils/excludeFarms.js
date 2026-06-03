export const isExcludedFarmRecord = (farm) => {
  if (!farm) return true;
  const key = farm.farm_key || farm.key || '';
  const name = farm.name || farm.farm_name || '';
  const nameLower = String(name).toLowerCase();
  return (
    key === 'rojo-hatchery' ||
    name === 'Rojo Hatchery' ||
    key === 'freshwater-finfish-farm' ||
    name === 'Freshwater Finfish Farm' ||
    nameLower.includes('freshwater finfish')
  );
};

export const filterExcludedFarms = (farms) => {
  if (!Array.isArray(farms)) return [];
  return farms.filter((farm) => !isExcludedFarmRecord(farm));
};
