import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import FileUploader from '../components/FileUploader';
import DataPreview from '../components/DataPreview';
import ColumnMapper from '../components/ColumnMapper';
import ImportProgress from '../components/ImportProgress';
import ConfirmDialog from '../components/ConfirmDialog';
import { previewFile, createImport, downloadTemplate } from '../services/import.api';
import { getProductFields } from '../services/bitrix.api';
import type { ImportPreview } from '../types';

const STEPS = ['Upload', 'Preview', 'Map Columns', 'Confirm', 'Import', 'Result'];

interface UploadedFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  filePath: string;
}

export default function InventoryImport() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [bitrixFields, setBitrixFields] = useState<{ id: string; name: string }[]>([]);
  const [mappingDetails, setMappingDetails] = useState<Record<string, string>>({});
  const [importMode, setImportMode] = useState('CREATE_UPDATE');
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creatingImport, setCreatingImport] = useState(false);

  const handleUploaded = useCallback((data: UploadedFile) => {
    setUploadedFile(data);
    setCurrentStep(1);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!uploadedFile) return;
    setPreviewLoading(true);
    try {
      const res = await previewFile(uploadedFile.filePath, uploadedFile.fileName);
      if (res.success && res.data) {
        setPreview(res.data);
        setCurrentStep(2);
      } else {
        toast.error(res.message || 'Failed to preview file');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to preview file');
    } finally {
      setPreviewLoading(false);
    }
  }, [uploadedFile]);

  // Load Bitrix fields when entering mapping step
  const handleStartMapping = useCallback(async () => {
    setCurrentStep(2);
    try {
      const res = await getProductFields();
      if (res.success) {
        const fields = (res.data || []).map((f: any) => ({
          id: f.id,
          name: f.name,
        }));
        setBitrixFields(fields);
      }
    } catch (err: any) {
      toast.error('Failed to load Bitrix fields. Is Bitrix configured?');
    }
  }, []);

  const handleMappingChange = useCallback((mapping: Record<string, string>) => {
    setMappingDetails(mapping);
  }, []);

  const handleConfirmImport = () => {
    setConfirmOpen(true);
  };

  const handleStartImport = async () => {
    if (!uploadedFile) return;
    setConfirmOpen(false);
    setCreatingImport(true);
    try {
      // Find mapped fields
      const skuField = Object.entries(mappingDetails).find(([excel, bitrix]) =>
        ['SKU', 'PRODUCT_SKU', 'CODE', 'PRODUCT_CODE', 'ITEM_CODE'].includes(bitrix)
      )?.[0];
      const nameField = Object.entries(mappingDetails).find(([excel, bitrix]) =>
        ['NAME', 'PRODUCT_NAME'].includes(bitrix)
      )?.[0];
      const qtyField = Object.entries(mappingDetails).find(([excel, bitrix]) =>
        ['QUANTITY', 'STOCK', 'STOCK_QUANTITY', 'AMOUNT'].includes(bitrix)
      )?.[0];
      const priceField = Object.entries(mappingDetails).find(([excel, bitrix]) =>
        ['PRICE', 'BASE_PRICE'].includes(bitrix)
      )?.[0];
      const barcodeField = Object.entries(mappingDetails).find(([excel, bitrix]) =>
        ['BARCODE', 'BAR_CODE'].includes(bitrix)
      )?.[0];

      if (!skuField || !nameField) {
        toast.error('Please map the SKU and Product Name fields');
        return;
      }

      const res = await createImport({
        filePath: uploadedFile.filePath,
        fileName: uploadedFile.fileName,
        fileSize: uploadedFile.fileSize,
        mapping: {
          skuField,
          nameField,
          quantityField: qtyField,
          priceField: priceField,
          barcodeField: barcodeField,
        },
        importMode,
      });

      if (res.success) {
        setImportJobId(res.data.id);
        setCurrentStep(5);
        toast.success('Import started');
      } else {
        toast.error(res.message || 'Failed to start import');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start import');
    } finally {
      setCreatingImport(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inventory_template.xlsx';
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const mappedSkuField = Object.entries(mappingDetails).find(([excel, bitrix]) =>
    ['SKU', 'PRODUCT_SKU', 'CODE', 'PRODUCT_CODE', 'ITEM_CODE'].includes(bitrix)
  )?.[0];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Import</h1>
        <button onClick={handleDownloadTemplate} className="btn-secondary text-sm">
          Download Excel Template
        </button>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 justify-between bg-white rounded-lg p-4 border border-gray-200">
        {STEPS.map((step, idx) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              idx === currentStep
                ? 'bg-blue-600 text-white'
                : idx < currentStep
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {idx < currentStep ? '✓' : idx + 1}
            </div>
            <span className={`text-sm ${idx === currentStep ? 'font-medium text-gray-900' : 'text-gray-500'}`}>{step}</span>
          </div>
        ))}
      </div>

      {/* Step 0: Upload */}
      {currentStep === 0 && (
        <div className="space-y-4">
          <FileUploader onUploaded={handleUploaded} />
          <div className="text-center text-xs text-gray-500">
            <p>Supported: .xlsx, .xls, .csv | Max size: 10MB</p>
            <p>Required columns: SKU, Product Name. Optional: Quantity, Price, Barcode</p>
          </div>
        </div>
      )}

      {/* Step 1: Preview */}
      {currentStep === 1 && uploadedFile && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200 flex items-center justify-between">
            <div>
              <p className="font-medium">{uploadedFile.fileName}</p>
              <p className="text-sm text-gray-500">{(uploadedFile.fileSize / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={handlePreview} disabled={previewLoading} className="btn-primary">
              {previewLoading ? 'Loading...' : 'Preview Data'}
            </button>
          </div>
          {preview && <DataPreview preview={preview} />}
        </div>
      )}

      {/* Step 2: Map Columns */}
      {currentStep === 2 && preview && (
        <div className="space-y-4">
          <ColumnMapper
            headers={preview.headers}
            bitrixFields={bitrixFields}
            onMappingChange={handleMappingChange}
          />
          <div className="flex justify-between">
            <button onClick={() => setCurrentStep(1)} className="btn-secondary">Back</button>
            <button onClick={() => setCurrentStep(3)} className="btn-primary">Continue</button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {currentStep === 3 && preview && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="text-lg font-medium mb-4">Import Summary</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <div className="text-xs text-gray-500">File</div>
                <div className="font-medium">{preview.fileName}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Total Rows</div>
                <div className="font-medium">{preview.totalRows}</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="label">Import Mode</label>
              <select className="input-field" value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="CREATE_UPDATE">Create + Update (Recommended)</option>
                <option value="CREATE_ONLY">Create Only</option>
                <option value="UPDATE_ONLY">Update Only</option>
              </select>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm"><span>Total Rows</span><span className="font-medium">{preview.totalRows.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span>Mapped SKU Field</span><span className="font-medium">{mappingDetails.skuField || 'Not set'}</span></div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setCurrentStep(2)} className="btn-secondary">Back</button>
            <button onClick={handleConfirmImport} className="btn-primary">Review & Start Import</button>
          </div>
        </div>
      )}

      {/* Import Progress */}
      {currentStep === 5 && importJobId && (
        <ImportProgress importId={importJobId} />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Import"
        message={`Are you sure you want to start importing ${preview?.totalRows || 0} product records into Bitrix24? This will match existing products by their SKU and create or update them in ${importMode.replace(/_/g, ' ').toLowerCase()} mode.`}
        confirmLabel={creatingImport ? 'Starting...' : 'Start Import'}
        onConfirm={handleStartImport}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
