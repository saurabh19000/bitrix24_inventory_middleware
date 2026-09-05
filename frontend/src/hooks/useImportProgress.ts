import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

export function useImportProgress(importId: string | null, enabled = true, intervalMs = 3000) {
  const [importData, setImportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchImport = async () => {
    if (!importId || !enabled) return;
    try {
      setLoading(true);
      const res = await api.get(`/imports/${importId}`);
      if (res.data.success) {
        setImportData(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch import progress:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!importId || !enabled) return;
    fetchImport();
    pollRef.current = setInterval(fetchImport, intervalMs);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [importId, enabled, intervalMs]);

  return { importData, loading, refresh: fetchImport };
}