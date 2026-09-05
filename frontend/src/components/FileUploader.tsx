import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { uploadFile } from '../services/import.api';

interface FileUploaderProps {
  onUploaded: (data: { fileId: string; fileName: string; fileSize: number; filePath: string }) => void;
}

const ACCEPTED_EXTENSIONS = '.xlsx,.xls,.csv';

export default function FileUploader({ onUploaded }: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      toast.error(`Unsupported file type: .${ext}. Please upload .xlsx, .xls, or .csv`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File exceeds 10MB maximum size');
      return;
    }

    setUploading(true);
    try {
      const res = await uploadFile(file);
      if (res.success && res.data) {
        onUploaded(res.data);
        toast.success('File uploaded successfully');
      } else {
        toast.error(res.message || 'Upload failed');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploaded]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-sm text-gray-600">Uploading...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 13a3 3 0 11-2 5.236V16M12 8v8" />
          </svg>
          <p className="text-gray-600">Drag & drop your Excel file here, or</p>
          <label className="btn-primary cursor-pointer inline-flex items-center">
            <span>Browse files</span>
            <input
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
          <p className="text-xs text-gray-500">Supported: .xlsx, .xls, .csv (max 10MB)</p>
        </div>
      )}
    </div>
  );
}
