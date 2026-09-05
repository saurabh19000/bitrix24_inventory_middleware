import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  getBitrixSettings,
  saveBitrixSettings,
  testBitrixConnection,
} from '../services/settings.api';

interface FormData {
  portalUrl: string;
  webhookUrl: string;
}

export default function BitrixSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('UNKNOWN');
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await getBitrixSettings();
        if (res.success && res.data) {
          setValue('portalUrl', res.data.portalUrl || '');
          setWebhookConfigured(res.data.webhookConfigured);
          setConnectionStatus(res.data.connectionStatus);
          setLastTestedAt(res.data.lastTestedAt);
        }
      } catch (err: any) {
        toast.error(err.response?.data?.message || 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, [setValue]);

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      const res = await saveBitrixSettings({
        portalUrl: data.portalUrl,
        webhookUrl: data.webhookUrl || undefined,
      });
      if (res.success) {
        toast.success('Configuration saved successfully');
        setWebhookConfigured(true);
      } else {
        toast.error(res.message || 'Failed to save configuration');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testBitrixConnection();
      if (res.success) {
        toast.success('Bitrix24 connection successful');
        setConnectionStatus('CONNECTED');
        setLastTestedAt(res.data?.lastTestedAt || new Date().toISOString());
      } else {
        toast.error(res.message || 'Unable to connect to Bitrix24');
        setConnectionStatus('FAILED');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Unable to connect to Bitrix24');
      setConnectionStatus('FAILED');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-gray-600"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div> Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Bitrix24 Configuration</h1>

      <div className="card space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Bitrix Portal URL</label>
            <input
              type="url"
              {...register('portalUrl', { required: 'Portal URL is required' })}
              className="input-field"
              placeholder="https://your-company.bitrix24.com"
            />
            {errors.portalUrl && <p className="mt-1 text-sm text-red-600">{errors.portalUrl.message}</p>}
          </div>

          <div>
            <label className="label">
              Bitrix Webhook URL
              {webhookConfigured ? (
                <span className="ml-2 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Webhook configured</span>
              ) : null}
            </label>
            <input
              type="text"
              {...register('webhookUrl')}
              className="input-field font-mono"
              placeholder={webhookConfigured ? '******************************' : 'https://your-company.bitrix24.com/rest/USER_ID/TOKEN/'}
            />
            {webhookConfigured && (
              <p className="text-xs text-gray-500 mt-1">
                A webhook is already configured. Enter a new one to replace it, or leave blank to keep the existing.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !webhookConfigured}
              className="btn-secondary"
            >
              {testing ? 'Testing connection...' : 'Test Connection'}
            </button>
          </div>
        </form>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Connection Status</h3>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus === 'CONNECTED' ? 'bg-green-500' :
              connectionStatus === 'FAILED' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
            <span className="text-sm font-medium">
              {connectionStatus === 'CONNECTED' ? 'Connected' :
               connectionStatus === 'FAILED' ? 'Failed' : 'Not tested'}
            </span>
          </div>
          {lastTestedAt && (
            <p className="text-xs text-gray-500 mt-1">
              Last Tested: {new Date(lastTestedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {!webhookConfigured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          <strong>Note:</strong> You must configure a valid Bitrix webhook URL to import products/inventory. The webhook is stored securely (encrypted) in our database and is never exposed to the frontend.
        </div>
      )}
    </div>
  );
}
