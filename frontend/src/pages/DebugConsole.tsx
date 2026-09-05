import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { getDebugLogs, getDebugLogStats, clearDebugLogs } from '../services/debug.api';
import type { DebugLog as DebugLogType, DebugLogStats } from '../types';

const LEVEL_STYLES: Record<string, string> = {
  DEBUG: 'bg-gray-100 text-gray-600',
  INFO: 'bg-blue-100 text-blue-700',
  WARN: 'bg-yellow-100 text-yellow-800',
  ERROR: 'bg-red-100 text-red-700',
};

const SOURCE_STYLES: Record<string, string> = {
  API: 'bg-gray-100 text-gray-700',
  AUTH: 'bg-indigo-100 text-indigo-700',
  SETTINGS: 'bg-teal-100 text-teal-700',
  BITRIX: 'bg-blue-100 text-blue-700',
  IMPORT: 'bg-purple-100 text-purple-700',
  WORKER: 'bg-pink-100 text-pink-700',
  SYSTEM: 'bg-orange-100 text-orange-700',
};

const SOURCES = ['ALL', 'API', 'AUTH', 'SETTINGS', 'BITRIX', 'IMPORT', 'WORKER', 'SYSTEM'];
const LEVELS = ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'];

export default function DebugConsole() {
  const [logs, setLogs] = useState<DebugLogType[]>([]);
  const [stats, setStats] = useState<DebugLogStats | null>(null);
  const [level, setLevel] = useState('ALL');
  const [source, setSource] = useState('ALL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [logsRes, statsRes] = await Promise.all([
        getDebugLogs({ level, source, search, limit: 200 }),
        getDebugLogStats(),
      ]);
      if (logsRes.success) {
        setLogs(logsRes.data || []);
        setLoading(false);
      }
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    } catch {
      setLoading(false);
    }
  }, [level, source, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSearch = () => {
    setSearch(searchInput.trim());
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClear = async () => {
    if (!confirm('Clear all debug logs from the database?')) return;
    setClearing(true);
    try {
      const res = await clearDebugLogs();
      if (res.success) {
        toast.success(`Cleared ${res.data?.deleted || 0} logs`);
        await load();
      } else {
        toast.error(res.message || 'Failed to clear logs');
      }
    } catch {
      toast.error('Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const visibleLogs = logs;
  const hasFilters = level !== 'ALL' || source !== 'ALL' || !!search;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debug Console</h1>
          <p className="text-sm text-gray-500">Live application + Bitrix API activity recorded in the database</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${autoRefresh ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
          >
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </button>
          <button onClick={handleClear} disabled={clearing} className="btn-secondary text-sm">
            {clearing ? 'Clearing...' : 'Clear Logs'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="card text-center">
          <div className="text-2xl font-bold">{stats?.total ?? '-'}</div>
          <div className="text-xs text-gray-500">Total Logs</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-600">{stats?.errorsLast24h ?? '-'}</div>
          <div className="text-xs text-gray-500">Errors (24h)</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-red-600">{stats?.levelCounts?.ERROR ?? 0}</div>
          <div className="text-xs text-gray-500">ERROR</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats?.levelCounts?.WARN ?? 0}</div>
          <div className="text-xs text-gray-500">WARN</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-blue-600">{stats?.levelCounts?.INFO ?? 0}</div>
          <div className="text-xs text-gray-500">INFO</div>
        </div>
        <div className="card text-center">
          <div className="text-2xl font-bold text-gray-600">{stats?.levelCounts?.DEBUG ?? 0}</div>
          <div className="text-xs text-gray-500">DEBUG</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${level === l ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {l}
            </button>
          ))}
        </div>
        <select
          value={source}
          onChange={e => setSource(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm"
        >
          {SOURCES.map(s => (
            <option key={s} value={s}>{s === 'ALL' ? 'All sources' : s}</option>
          ))}
        </select>
        <div className="flex gap-1 flex-1 min-w-[200px]">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search messages..."
            className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
          />
          <button onClick={handleSearch} className="btn-primary text-sm px-3 py-1.5">Search</button>
        </div>
      </div>

      {/* Log list */}
      <div className="card p-0 overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading logs...</div>
          ) : visibleLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {hasFilters ? 'No logs match the selected filters' : 'No logs yet'}
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-40">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-20">Level</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Source</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-16">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleLogs.map(log => (
                  <LogRow key={log.id} log={log} expanded={expanded.has(log.id)} onToggle={() => toggleExpand(log.id)} />
                ))}
              </tbody>
            </table>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function LogRow({ log, expanded, onToggle }: { log: DebugLogType; expanded: boolean; onToggle: () => void }) {
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
          {new Date(log.createdAt).toLocaleString()}
        </td>
        <td className="px-3 py-2">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LEVEL_STYLES[log.level] || LEVEL_STYLES.INFO}`}>
            {log.level}
          </span>
        </td>
        <td className="px-3 py-2">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${SOURCE_STYLES[log.source] || SOURCE_STYLES.SYSTEM}`}>
            {log.source}
          </span>
        </td>
        <td className="px-3 py-2 text-sm text-gray-800">
          <div className={expanded ? '' : 'truncate max-w-lg'}>{log.message}</div>
        </td>
        <td className="px-3 py-2 text-xs">
          {hasDetails ? (expanded ? '−' : '+') : ''}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-gray-50">
          <td colSpan={5} className="px-3 py-2 text-xs text-gray-600 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(log.details, null, 2)}
          </td>
        </tr>
      )}
    </>
  );
}