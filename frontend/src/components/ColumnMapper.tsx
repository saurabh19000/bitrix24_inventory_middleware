import { useState, useEffect } from 'react';

interface ColumnMapperProps {
  headers: string[];
  bitrixFields: { id: string; name: string }[];
  onMappingChange: (mapping: Record<string, string>) => void;
  suggestedFields?: Record<string, string[]>;
}

const SUGGESTED_FIELDS: Record<string, string[]> = {
  SKU: ['SKU', 'PRODUCT_SKU', 'CODE', 'PRODUCT_CODE', 'ITEM_CODE'],
  NAME: ['NAME', 'PRODUCT_NAME', 'TITLE', 'ITEM_NAME'],
  QUANTITY: ['QUANTITY', 'QTY', 'STOCK', 'STOCK_QUANTITY', 'AMOUNT', 'AVAILABLE'],
  PRICE: ['PRICE', 'BASE_PRICE', 'UNIT_PRICE', 'COST'],
  BARCODE: ['BARCODE', 'BAR_CODE', 'EAN', 'UPC'],
};

export const INVOICE_SUGGESTED_FIELDS: Record<string, string[]> = {
  ACCOUNT_NUMBER: ['INVOICE NUMBER', 'INVOICE NO', 'INVOICE#', 'INV NO', 'INVOICE NR', 'ACCOUNT NUMBER', 'ACCOUNT NO', 'REFERENCE'],
  ORDER_TOPIC: ['ORDER TOPIC', 'SUBJECT', 'DESCRIPTION', 'MEMO', 'TITLE', 'INVOICE SUBJECT', 'PARTICULARS'],
  CLIENT: ['CUSTOMER', 'CLIENT', 'COMPANY', 'CONTACT', 'BILL TO', 'PARTY NAME', 'BUYER'],
  AMOUNT: ['AMOUNT', 'INVOICE AMOUNT', 'TOTAL', 'TOTAL AMOUNT', 'VALUE', 'SUBTOTAL', 'NET AMOUNT', 'PRICE'],
  CURRENCY: ['CURRENCY', 'CURRENCY CODE', 'CCY'],
  STATUS: ['STATUS', 'INVOICE STATUS', 'PAYMENT STATUS', 'PAID STATUS'],
  BILL_DATE: ['INVOICE DATE', 'BILL DATE', 'DATE ISSUED', 'ISSUE DATE', 'DATE'],
  DUE_DATE: ['DUE DATE', 'PAYMENT DUE', 'DUE', 'DATE DUE', 'PAYMENT DEADLINE'],
  COMMENT: ['COMMENT', 'NOTES', 'NOTE', 'REMARKS', 'MEMO NOTES'],
};

export default function ColumnMapper({ headers, bitrixFields, onMappingChange, suggestedFields }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const fieldKeywords = suggestedFields || SUGGESTED_FIELDS;

  // Auto-map on component mount or when fields load
  useEffect(() => {
    if (bitrixFields.length === 0) return;
    const autoMap: Record<string, string> = {};
    const fieldIds = bitrixFields.map(f => f.id);

    headers.forEach(col => {
      const colLower = col.toLowerCase().trim();
      
      // Direct match
      const direct = fieldIds.find(f => f.toLowerCase() === colLower);
      if (direct) {
        autoMap[col] = direct;
        return;
      }

      // Keyword match
      for (const [target, keywords] of Object.entries(fieldKeywords)) {
        for (const kw of keywords) {
          if (colLower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(colLower)) {
            autoMap[col] = target;
            break;
          }
        }
        if (autoMap[col]) break;
      }
    });

    setMapping(autoMap);
    onMappingChange(autoMap);
  }, [headers, bitrixFields, onMappingChange, fieldKeywords]);

  const handleChange = (excelCol: string, bitrixField: string) => {
    const newMapping = { ...mapping, [excelCol]: bitrixField };
    setMapping(newMapping);
    onMappingChange(newMapping);
  };

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-lg font-medium">Column Mapping</h3>
        <p className="text-sm text-gray-500">Map Excel columns to Bitrix fields. Review auto-mapping before continuing.</p>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Excel Column</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">→</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bitrix Field</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {headers.map((col, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2 font-medium text-sm">{col}</td>
                <td className="px-3 py-2 text-center text-gray-400">→</td>
                <td className="px-3 py-2">
                  <select
                    className="input-field max-w-xs"
                    value={mapping[col] || ''}
                    onChange={(e) => handleChange(col, e.target.value)}
                  >
                    <option value="">-- Select field --</option>
                    <optgroup label="Core Fields">
                      {Object.entries(fieldKeywords).map(([id, _]) => (
                        <option key={id} value={id}>{id}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Bitrix Fields">
                      {bitrixFields.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.id})</option>
                      ))}
                    </optgroup>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
