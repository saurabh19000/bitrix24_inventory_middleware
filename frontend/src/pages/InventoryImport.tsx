import { useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import FileUploader from '../components/FileUploader';
import DataPreview from '../components/DataPreview';
import ImportProgress from '../components/ImportProgress';
import ConfirmDialog from '../components/ConfirmDialog';
import { previewFile, createImport, downloadTemplate } from '../services/import.api';
import type { ImportPreview } from '../types';

// Steps requested: Upload -> Preview -> Confirm -> Import -> Result (Map Columns removed)
const STEPS = ['Upload', 'Preview', 'Confirm', 'Import', 'Result'];

interface UploadedFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  filePath: string;
}

interface AutoMapping {
  skuField?: string;
  nameField?: string;
  quantityField?: string;
  priceField?: string;
  barcodeField?: string;
}

// Automatically matches Excel headers to Bitrix product catalog and inventory fields
function detectInventoryColumns(headers: string[]): AutoMapping {
  const result: AutoMapping = {};
  const clean = (s: string) => s.trim().toLowerCase();

  // 1. SKU: CODE, SKU, PART NUMBER, PART NO, ITEM CODE, MODEL
  for (const h of headers) {
    const c = clean(h);
    if (['sku', 'code', 'product_code', 'item_code', 'product sku', 'item code'].includes(c)) {
      result.skuField = h;
      break;
    }
  }
  if (!result.skuField) {
    for (const h of headers) {
      const c = clean(h);
      if (c.includes('sku') || c.includes('code') || c.includes('part number') || c.includes('part no') || c.includes('item no')) {
        result.skuField = h;
        break;
      }
    }
  }

  // 2. Product Name: DESCRIPTION, PRODUCT NAME, NAME, TITLE, ITEM NAME, PRODUCT
  for (const h of headers) {
    const c = clean(h);
    if (['description', 'product name', 'name', 'product_name', 'item name', 'item description', 'title', 'product'].includes(c)) {
      result.nameField = h;
      break;
    }
  }
  if (!result.nameField) {
    for (const h of headers) {
      const c = clean(h);
      if (c.includes('desc') || c.includes('name') || c.includes('title') || c.includes('item')) {
        result.nameField = h;
        break;
      }
    }
  }

  // 3. Quantity: QTY IN STOCK, QUANTITY, QTY, STOCK, STOCK_QUANTITY, AMOUNT, IN STOCK, AVAILABLE
  for (const h of headers) {
    const c = clean(h);
    if (['qty in stock', 'quantity', 'qty', 'stock', 'stock_quantity', 'amount', 'in stock', 'available stock', 'stock qty'].includes(c)) {
      result.quantityField = h;
      break;
    }
  }
  if (!result.quantityField) {
    for (const h of headers) {
      const c = clean(h);
      if (c.includes('qty') || c.includes('quantity') || c.includes('stock')) {
        result.quantityField = h;
        break;
      }
    }
  }

  // 4. Price: END USER PRICE, DEALER PRICE, PRICE, BASE_PRICE, UNIT_PRICE, SELLING PRICE, MRP, COST
  for (const h of headers) {
    const c = clean(h);
    if (['end user price', 'dealer price', 'price', 'base_price', 'unit_price', 'selling price', 'mrp', 'cost', 'cost '].includes(c)) {
      result.priceField = h;
      break;
    }
  }
  if (!result.priceField) {
    for (const h of headers) {
      const c = clean(h);
      if (c.includes('price') || c.includes('cost') || c.includes('rate') || c.includes('mrp')) {
        result.priceField = h;
        break;
      }
    }
  }

  // 5. Barcode: BARCODE, BAR CODE, EAN, UPC, GTIN, CODE, PART NUMBER
  for (const h of headers) {
    const c = clean(h);
    if (['barcode', 'bar code', 'ean', 'upc', 'gtin', 'item barcode', 'barcode no', 'barcode number'].includes(c)) {
      result.barcodeField = h;
      break;
    }
  }
  if (!result.barcodeField) {
    for (const h of headers) {
      const c = clean(h);
      if (c.includes('barcode') || c.includes('bar code') || c.includes('ean') || c.includes('upc')) {
        result.barcodeField = h;
        break;
      }
    }
  }
  if (!result.barcodeField) {
    for (const h of headers) {
      const c = clean(h);
      if ((c === 'code' || c === 'item code' || c === 'part number' || c === 'part no') && h !== result.skuField) {
        result.barcodeField = h;
        break;
      }
    }
  }

  return result;
}

export default function InventoryImport() {
  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Auto-mapped columns state (with optional manual override)
  const [mapping, setMapping] = useState<AutoMapping>({});
  const [showMappingAdjust, setShowMappingAdjust] = useState(false);
  
  const [importMode, setImportMode] = useState('CREATE_UPDATE');
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creatingImport, setCreatingImport] = useState(false);

  // Step 0 -> Step 1: Upload and auto-preview
  const handleUploaded = useCallback(async (data: UploadedFile) => {
    setUploadedFile(data);
    setPreviewLoading(true);
    setCurrentStep(1); // Move to Preview
    try {
      const res = await previewFile(data.filePath, data.fileName);
      if (res.success && res.data) {
        setPreview(res.data);
        const auto = detectInventoryColumns(res.data.headers);
        setMapping(auto);
        toast.success(`Headers automatically analyzed and matched!`);
      } else {
        toast.error(res.message || 'Failed to preview file');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to preview file');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

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

  // Step 1 -> Step 2: Validate auto-mapped required columns before Confirm
  const handleProceedToConfirm = () => {
    if (!mapping.skuField && !mapping.nameField) {
      toast.error('Could not auto-detect SKU or Product Name. Please select them below.');
      setShowMappingAdjust(true);
      return;
    }
    setCurrentStep(2); // Move to Confirm
  };

  // Step 2 -> Step 3 & 4: Start Import & Result
  const handleStartImport = async () => {
    if (!uploadedFile) return;
    setConfirmOpen(false);
    setCurrentStep(3); // Import in progress
    setCreatingImport(true);

    try {
      const res = await createImport({
        filePath: uploadedFile.filePath,
        fileName: uploadedFile.fileName,
        fileSize: uploadedFile.fileSize,
        type: 'STOCK_RECEIPTS',
        mapping: {
          skuField: mapping.skuField || '',
          nameField: mapping.nameField || '',
          quantityField: mapping.quantityField,
          quantityArrivedField: mapping.quantityField,
          priceField: mapping.priceField,
          salesPriceField: mapping.priceField,
          purchasePriceField: mapping.priceField,
          barcodeField: mapping.barcodeField,
          defaultStoreId: 1,
        },
        importMode,
      });

      if (res.success && res.data) {
        setImportJobId(res.data.id);
        setCurrentStep(4); // Move to Result
        toast.success('Import job queued successfully!');
      } else {
        toast.error(res.message || 'Failed to start import');
        setCurrentStep(2); // Return to confirm on error
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start import');
      setCurrentStep(2);
    } finally {
      setCreatingImport(false);
    }
  };

  const mappedSummary = useMemo(() => [
    { label: 'Product Name', key: 'nameField', val: mapping.nameField, required: true },
    { label: 'SKU / Product Code', key: 'skuField', val: mapping.skuField, required: true },
    { label: 'Stock Quantity', key: 'quantityField', val: mapping.quantityField, required: false },
    { label: 'Price', key: 'priceField', val: mapping.priceField, required: false },
    { label: 'Barcode', key: 'barcodeField', val: mapping.barcodeField, required: false },
  ], [mapping]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Import</h1>
          <p className="text-sm text-gray-500">
            Automatic column mapping: Upload &rarr; Preview &rarr; Confirm &rarr; Import &rarr; Result
          </p>
        </div>
        <button onClick={handleDownloadTemplate} className="btn-secondary text-sm">
          Download Sample Template
        </button>
      </div>

      {/* 5-Step Stepper: Upload -> Preview -> Confirm -> Import -> Result */}
      <div className="flex items-center gap-2 justify-between bg-white rounded-lg p-4 border border-gray-200">
        {STEPS.map((step, idx) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              idx === currentStep
                ? 'bg-blue-600 text-white'
                : idx < currentStep
                  ? 'bg-green-100 text-green-700 font-bold'
                  : 'bg-gray-100 text-gray-400'
            }`}>
              {idx < currentStep ? '✓' : idx + 1}
            </div>
            <span className={`text-sm ${idx === currentStep ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
              {step}
            </span>
            {idx < STEPS.length - 1 && <span className="text-gray-300 ml-1">›</span>}
          </div>
        ))}
      </div>

      {/* STEP 0: Upload */}
      {currentStep === 0 && (
        <div className="card space-y-4">
          <h2 className="text-lg font-medium">Step 1: Upload Inventory File</h2>
          <p className="text-sm text-gray-500">
            Upload your Excel (.xlsx, .xls) or CSV spreadsheet. Columns will be automatically matched to Bitrix24 fields without manual mapping.
          </p>
          <FileUploader onUploaded={handleUploaded} />
        </div>
      )}

      {/* STEP 1: Preview & Auto-Mapped Fields */}
      {currentStep === 1 && uploadedFile && (
        <div className="space-y-6">
          {previewLoading ? (
            <div className="card text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-gray-600 font-medium">Analyzing spreadsheet & automatically matching columns...</p>
            </div>
          ) : preview ? (
            <>
              {/* Auto-Mapping Card */}
              <div className="card border-blue-100 bg-blue-50/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
                    <h3 className="font-semibold text-gray-900">Columns Automatically Matched</h3>
                  </div>
                  <button
                    onClick={() => setShowMappingAdjust(!showMappingAdjust)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 underline"
                  >
                    {showMappingAdjust ? 'Hide manual adjustments' : 'Need to adjust any column?'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mappedSummary.map((item) => (
                    <div key={item.key} className="bg-white p-3 rounded-md border border-gray-200 flex flex-col justify-between">
                      <span className="text-xs font-medium text-gray-500">
                        {item.label} {item.required && <span className="text-red-500">*</span>}
                      </span>
                      <div className="mt-1 flex items-center justify-between">
                        <span className={`text-sm font-semibold ${item.val ? 'text-blue-900' : 'text-gray-400 italic'}`}>
                          {item.val || 'Not detected'}
                        </span>
                        {item.val && (
                          <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
                            Auto-matched
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Optional Manual Adjustments Accordion */}
                {showMappingAdjust && (
                  <div className="mt-4 pt-4 border-t border-blue-200/60 bg-white p-4 rounded-lg space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Manual Column Override</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Product Name Column *</label>
                        <select
                          className="input-field text-xs py-1"
                          value={mapping.nameField || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, nameField: e.target.value }))}
                        >
                          <option value="">-- Select Column --</option>
                          {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-gray-700 mb-1">SKU / Code Column *</label>
                        <select
                          className="input-field text-xs py-1"
                          value={mapping.skuField || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, skuField: e.target.value }))}
                        >
                          <option value="">-- Select Column --</option>
                          {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Stock Quantity Column</label>
                        <select
                          className="input-field text-xs py-1"
                          value={mapping.quantityField || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, quantityField: e.target.value }))}
                        >
                          <option value="">-- None / Skip --</option>
                          {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Price Column</label>
                        <select
                          className="input-field text-xs py-1"
                          value={mapping.priceField || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, priceField: e.target.value }))}
                        >
                          <option value="">-- None / Skip --</option>
                          {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-gray-700 mb-1">Barcode Column</label>
                        <select
                          className="input-field text-xs py-1"
                          value={mapping.barcodeField || ''}
                          onChange={(e) => setMapping(prev => ({ ...prev, barcodeField: e.target.value }))}
                        >
                          <option value="">-- None / Skip --</option>
                          {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Preview */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    File Data Preview ({preview.totalRows} total rows)
                  </h3>
                  <span className="text-xs text-gray-500">Showing first {preview.rows.length} rows</span>
                </div>
                <DataPreview preview={preview} />
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => {
                    setUploadedFile(null);
                    setPreview(null);
                    setCurrentStep(0);
                  }}
                  className="btn-secondary"
                >
                  &larr; Upload Different File
                </button>
                <button
                  onClick={handleProceedToConfirm}
                  className="btn-primary"
                >
                  Continue to Confirm &rarr;
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* STEP 2: Confirm */}
      {currentStep === 2 && preview && (
        <div className="space-y-6">
          <div className="card space-y-5">
            <h2 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-3">
              Step 3: Confirm Import Settings
            </h2>

            {/* Mode selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bitrix24 Catalog Synchronization Mode
              </label>
              <select
                className="input-field"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
              >
                <option value="CREATE_UPDATE">Create + Update (Recommended: creates missing products & updates existing)</option>
                <option value="CREATE_ONLY">Create Only (Only adds products that don't yet exist in Bitrix)</option>
                <option value="UPDATE_ONLY">Update Only (Only updates existing Bitrix products matching SKU)</option>
              </select>
            </div>

            {/* Import Summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 border border-gray-200">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Import Overview</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-xs text-gray-500 block">File Name</span>
                  <span className="font-semibold text-gray-900 truncate block">{preview.fileName}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Total Items</span>
                  <span className="font-semibold text-gray-900">{preview.totalRows.toLocaleString()} rows</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Product Name Column</span>
                  <span className="font-semibold text-blue-700">{mapping.nameField || 'None'}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">SKU / Code Column</span>
                  <span className="font-semibold text-blue-700">{mapping.skuField || 'None'}</span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
              <strong>Bitrix24 Synchronization:</strong> Products will be checked against the Bitrix24 product catalog by SKU and Name. Prices and stock quantities will be updated in Bitrix24 via BullMQ background workers with automatic rate limiting.
            </div>

            <div className="flex justify-between items-center pt-2">
              <button onClick={() => setCurrentStep(1)} className="btn-secondary">
                &larr; Back to Preview
              </button>
              <button onClick={() => setConfirmOpen(true)} className="btn-primary">
                Confirm & Start Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Import in Progress */}
      {currentStep === 3 && (
        <div className="card text-center py-16 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <h3 className="text-lg font-medium text-gray-900">Queuing Import Job...</h3>
          <p className="text-sm text-gray-500">Creating records and preparing asynchronous background worker.</p>
        </div>
      )}

      {/* STEP 4: Live Progress & Result */}
      {currentStep === 4 && importJobId && (
        <div className="card space-y-6">
          <ImportProgress importId={importJobId} />
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <a
              href={`/imports/${importJobId}`}
              className="btn-primary"
            >
              View Full Import Details & Error Log
            </a>
            <button
              onClick={() => {
                setUploadedFile(null);
                setPreview(null);
                setImportJobId(null);
                setCurrentStep(0);
              }}
              className="btn-secondary"
            >
              Import Another File
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Catalog & Inventory Import"
        message={`Are you ready to import ${preview?.totalRows || 0} product records from "${preview?.fileName}" into Bitrix24 in ${importMode.replace(/_/g, ' ').toLowerCase()} mode?`}
        confirmLabel={creatingImport ? 'Starting...' : 'Start Import'}
        onConfirm={handleStartImport}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
