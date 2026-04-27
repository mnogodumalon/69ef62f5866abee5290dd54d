import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Mitarbeiter, Schichttypen, Schichtplan } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [schichttypen, setSchichttypen] = useState<Schichttypen[]>([]);
  const [schichtplan, setSchichtplan] = useState<Schichtplan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [mitarbeiterData, schichttypenData, schichtplanData] = await Promise.all([
        LivingAppsService.getMitarbeiter(),
        LivingAppsService.getSchichttypen(),
        LivingAppsService.getSchichtplan(),
      ]);
      setMitarbeiter(mitarbeiterData);
      setSchichttypen(schichttypenData);
      setSchichtplan(schichtplanData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [mitarbeiterData, schichttypenData, schichtplanData] = await Promise.all([
          LivingAppsService.getMitarbeiter(),
          LivingAppsService.getSchichttypen(),
          LivingAppsService.getSchichtplan(),
        ]);
        setMitarbeiter(mitarbeiterData);
        setSchichttypen(schichttypenData);
        setSchichtplan(schichtplanData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const mitarbeiterMap = useMemo(() => {
    const m = new Map<string, Mitarbeiter>();
    mitarbeiter.forEach(r => m.set(r.record_id, r));
    return m;
  }, [mitarbeiter]);

  const schichttypenMap = useMemo(() => {
    const m = new Map<string, Schichttypen>();
    schichttypen.forEach(r => m.set(r.record_id, r));
    return m;
  }, [schichttypen]);

  return { mitarbeiter, setMitarbeiter, schichttypen, setSchichttypen, schichtplan, setSchichtplan, loading, error, fetchAll, mitarbeiterMap, schichttypenMap };
}