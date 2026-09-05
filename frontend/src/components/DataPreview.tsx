import { ImportPreview } from '../types';

interface DataPreviewProps {
  preview: ImportPreview;
}

export default function DataPreview({ preview }: DataPreviewProps) {
  const displayRows = preview.rows.slice(0, 50);

  return (
    <div className="bg-white rounded-lg overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h3 className="text-lg font-medium">Preview</h3>
        <div className="flex gap-4 text-sm text-gray-600">
          <span>File: <strong>{preview.fileName}</strong></span>
          <span>Rows: <strong>{preview.totalRows}</strong></span>
          <span>Columns: <strong>{preview.columnCount}</strong></span>
          <span>Sheet: <strong>{preview.worksheetName}</strong></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
              {preview.headers.slice(0, 10).map((header, idx) => (
                <th key={idx} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-500">
                  {String(row._rowNumber || rowIdx + 2)}
                </td>
                {preview.headers.slice(0, 10).map((header, colIdx) => (
                  <td key={colIdx} className="px-3 py-2 text-sm whitespace-nowrap">
                    {row[header] !== undefined && row[header] !== null ? String(row[header]) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview.totalRows > 50 && (
        <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500 text-center border-t border-gray-200">
          Showing first 50 of {preview.totalRows} rows
        </div>
      )}
    </div>
  );
}
