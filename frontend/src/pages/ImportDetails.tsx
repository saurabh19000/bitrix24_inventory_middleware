import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getImport, getImportErrors, downloadErrorReport, retryFailed } from '../services/import.api';
import type { ImportJob, ImportRecord } from '../types';
import StatusBadge from '../components/StatusBadge';

export default function ImportDetails() {
  const { id } = useParams<{ id: string }>();
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [errors, setErrors] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  const loadImport = useCallback(async () => {
    if (!id) return;
    try {
      const res = await getImport(id);
      if (res.success && res.data) setImportJob(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load import');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadErrors = useCallback(async () => {
    if (!id) return;
    try {
      const res = await getImportErrors(id);
      if (res.success) setErrors(res.data || []);
    } catch {
      // Non-fatal
    }
  }, [id]);

  useEffect(() => {
    loadImport();
    loadErrors();
  }, [loadImport, loadErrors]);

  const handleDownloadErrors = async () => {
    if (!id) return;
    try {
      const blob = await downloadErrorReport(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import_errors_${id.slice(0, 8)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Error report downloaded');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to download error report');
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const res = await retryFailed(id);
      if (res.success) {
        toast.success(`Retrying ${res.data?.retriedCount || 0} failed records`);
        await loadImport();
        await loadErrors();
      } else {
        toast.error(res.message || 'Retry failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-600"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div> Loading...</div>;
  }

  if (error || !importJob) {
    return <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error || 'Import not found'}</div>;
  }

  const duration = importJob.startedAt && importJob.completedAt
    ? Math.round((new Date(importJob.completedAt).getTime() - new Date(importJob.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Details</h1>
          <p className="text-sm text-gray-500">ID: <span className="font-mono">{importJob.id}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadErrors} className="btn-secondary text-sm" disabled={errors.length === 0}>
            Download Error Report
          </button>
          <button onClick={handleRetry} className="btn-primary text-sm" disabled={retrying || errors.length === 0}>
            {retrying ? 'Retrying...' : 'Retry Failed Records'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-xs text-gray-500">File</div>
          <div className="text-sm font-medium mt-1 break-all">{importJob.fileName}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">Import Mode</div>
          <div className="text-sm font-medium mt-1">{importJob.importMode.replace(/_/g, ' ')}</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">Type</div>
          <div className="text-sm font-medium mt-1">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
              importJob.type === 'INVOICES' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {importJob.type === 'INVOICES' ? 'Invoices' : 'Products'}
            </span>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">Status</div>
          <div className="mt-1"><StatusBadge status={importJob.status} /></div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500">Uploaded</div>
          <div className="text-sm font-medium mt-1">
            {importJob.createdAt ? new Date(importJob.createdAt).toLocaleString() : '-'}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="card">
        <h3 className="text-lg font-medium mb-4">Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{importJob.totalRows}</div>
            <div className="text-xs text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{importJob.successfulRows}</div>
            <div className="text-xs text-gray-500">Successful</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{importJob.failedRows}</div>
            <div className="text-xs text-gray-500">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-500">{importJob.skippedRows}</div>
            <div className="text-xs text-gray-500">Skipped</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{importJob.processedRows}</div>
            <div className="text-xs text-gray-500">Processed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{duration !== null ? `${duration}s` : '-'}</div>
            <div className="text-xs text-gray-500">Duration</div>
          </div>
        </div>
      </div>

      {/* Error records */}
      <div className="card">
        <h3 className="text-lg font-medium mb-4">Failed Records ({errors.length})</h3>
        {errors.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">No failed records</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{importJob.type === 'INVOICES' ? 'Invoice #' : 'SKU'}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{importJob.type === 'INVOICES' ? 'Subject' : 'Product'}</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {errors.map((rec) => (
                  <tr key={rec.id}>
                    <td className="px-3 py-2 text-sm text-gray-500">{rec.rowNumber}</td>
                    <td className="px-3 py-2 text-sm font-mono">{rec.sku || '-'}</td>
                    <td className="px-3 py-2 text-sm">{rec.productName || '-'}</td>
                    <td className="px-3 py-2"><StatusBadge status={rec.status} /></td>
                    <td className="px-3 py-2 text-sm text-red-600 max-w-md">
                      <div className="truncate" title={rec.errorMessage || ''}>{rec.errorMessage || '-'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
