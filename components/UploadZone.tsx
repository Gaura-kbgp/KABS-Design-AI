import React, { useCallback } from 'react';
import { Upload, FileText, Image as ImageIcon } from 'lucide-react';

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  }, [onFileSelect]);

  return (
    <div 
      className="flex flex-col items-center justify-center w-full h-full min-h-[250px] md:min-h-[400px] border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50 hover:bg-slate-800 hover:border-blue-500 transition-all cursor-pointer group p-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-upload')?.click()}
    >
      <input 
        id="file-upload" 
        type="file" 
        className="hidden" 
        accept="image/*,application/pdf"
        onChange={handleChange}
      />
      
      <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        <Upload className="text-slate-400 group-hover:text-blue-400" size={24} />
      </div>
      
      <h3 className="text-base md:text-lg font-semibold text-white mb-2 text-center">Upload Floor Plan</h3>
      <p className="text-slate-400 text-xs md:text-sm max-w-xs text-center mb-6">
        Drag & drop your 2D PDF or Image here.
        <br />
        <span className="text-slate-500 text-[10px] md:text-xs">(Supported: JPG, PNG, PDF)</span>
      </p>
      
      <div className="flex gap-4 text-[10px] md:text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <FileText size={12} />
          <span>PDF Parsed</span>
        </div>
        <div className="flex items-center gap-1">
          <ImageIcon size={12} />
          <span>Image Supported</span>
        </div>
      </div>
    </div>
  );
};