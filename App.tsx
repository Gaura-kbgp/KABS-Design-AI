
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UploadZone } from './components/UploadZone';
import { fileParser } from './services/fileParser';
import { generateKitchenRender } from './services/geminiService';
import { DesignSettings, DEFAULT_SETTINGS, RenderState } from './types';
import { RefreshCw, AlertCircle, X, Settings2, Download, ArrowLeft } from 'lucide-react';

export default function App() {
  // --- State ---
  const [settings, setSettings] = useState<DesignSettings>(DEFAULT_SETTINGS);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [floorPlanPreviews, setFloorPlanPreviews] = useState<string[]>([]);
  // CHANGED: Support multiple selections
  const [selectedPreviewIndices, setSelectedPreviewIndices] = useState<number[]>([0]);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  const [renderState, setRenderState] = useState<RenderState>({
    isLoading: false,
    generatedImage: null,
    error: null,
    seed: Math.floor(Math.random() * 1000000)
  });

  // --- Handlers ---
  const handleFileSelect = async (file: File) => {
    setFloorPlanFile(file);
    setSelectedPreviewIndices([0]); // Reset to first page
    
    if (file.type === 'application/pdf') {
      try {
        const images = await fileParser.pdfToImages(file);
        setFloorPlanPreviews(images);
        setRenderState({ 
          isLoading: false, 
          generatedImage: null, 
          error: null,
          seed: Math.floor(Math.random() * 1000000)
        });
      } catch (err) {
        console.error("Failed to convert PDF preview", err);
        setRenderState(prev => ({ ...prev, error: "Failed to read PDF drawing." }));
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFloorPlanPreviews([e.target?.result as string]);
        setRenderState({ 
          isLoading: false, 
          generatedImage: null, 
          error: null,
          seed: Math.floor(Math.random() * 1000000)
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const togglePageSelection = (index: number) => {
    setSelectedPreviewIndices(prev => {
        if (prev.includes(index)) {
            // Don't allow deselecting the last one
            if (prev.length === 1) return prev;
            return prev.filter(i => i !== index);
        } else {
            // APPEND to the end (The last selected becomes the Master View)
            return [...prev, index]; 
        }
    });
  };

  const handleSettingsUpdate = (key: keyof DesignSettings, value: string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    if (floorPlanPreviews.length > 0) {
      triggerGeneration(newSettings);
    }
  };

  const triggerGeneration = async (currentSettings: DesignSettings, seedOverride?: number, forceFresh: boolean = false) => {
    if (floorPlanPreviews.length === 0 || !floorPlanFile) return;

    setRenderState(prev => ({ ...prev, isLoading: true, error: null }));
    setSidebarOpen(false);

    try {
      // Determine if we should use previous render (Refinement) or fresh start
      const hasPreviousRender = !!renderState.generatedImage && !forceFresh;
      
      let inputData: string | string[] = '';
      let inputMime = 'image/png';

      if (hasPreviousRender && renderState.generatedImage) {
        // Refinement mode: Use the existing render
        inputData = renderState.generatedImage.split(',')[1];
      } else {
        // New Generation: Use ALL selected preview images
        const selectedImages = selectedPreviewIndices.map(i => floorPlanPreviews[i]);
        
        // Pass array of base64 strings (full data URLs)
        inputData = selectedImages;
        
        // Detect mime type from the first one (assume all are same)
        const mimeMatch = selectedImages[0].match(/^data:(.*);base64,/);
        inputMime = mimeMatch ? mimeMatch[1] : 'image/png';
      }

      const seedToUse = seedOverride ?? renderState.seed;

      const imageUrl = await generateKitchenRender(
        inputData, 
        inputMime, 
        currentSettings, 
        seedToUse,
        hasPreviousRender
      );
      
      setRenderState(prev => ({
        ...prev,
        isLoading: false,
        generatedImage: imageUrl,
        error: null
      }));
    } catch (err: any) {
      console.error(err);
      setRenderState(prev => ({
        ...prev,
        isLoading: false,
        generatedImage: prev.generatedImage, 
        error: err.message || "Generation failed."
      }));
    }
  };

  const resetUpload = () => {
    setFloorPlanFile(null);
    setFloorPlanPreviews([]);
    setSelectedPreviewIndices([0]);
    setRenderState({ 
      isLoading: false, 
      generatedImage: null, 
      error: null,
      seed: Math.floor(Math.random() * 1000000) 
    });
  };

  const handleDownload = () => {
    if (renderState.generatedImage) {
      const link = document.createElement('a');
      link.href = renderState.generatedImage;
      link.download = `kabs-design-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleRegenerate = () => {
    const newSeed = Math.floor(Math.random() * 1000000);
    setRenderState(prev => ({ ...prev, seed: newSeed }));
    triggerGeneration(settings, newSeed, true);
  };

  const closeRender = () => {
    setRenderState(prev => ({
      ...prev,
      generatedImage: null,
      error: null
    }));
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 font-sans">
      
      <Sidebar 
        settings={settings} 
        onUpdate={handleSettingsUpdate} 
        disabled={renderState.isLoading || floorPlanPreviews.length === 0}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 bg-slate-950/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-white md:hidden">
               <Settings2 size={24} />
             </button>
             {floorPlanFile && (
               <button onClick={resetUpload} className="p-2 -ml-2 text-slate-400 hover:text-white hidden md:block" title="Back to Upload">
                 <ArrowLeft size={24} />
               </button>
             )}
            <span className="text-sm font-bold text-white">
              {floorPlanFile ? floorPlanFile.name : '3D Visualizer'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
             {renderState.isLoading && (
               <div className="flex items-center gap-2 text-blue-400 text-xs md:text-sm animate-pulse">
                 <RefreshCw size={14} className="animate-spin" />
                 <span className="hidden sm:inline">Processing...</span>
               </div>
             )}
             
             {floorPlanFile && (
               <button onClick={resetUpload} className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors">
                 <X size={14} /> <span className="hidden sm:inline">Clear Project</span>
               </button>
             )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
          
             <div className="h-full w-full p-4 md:p-6 overflow-y-auto flex flex-col items-center">
                {renderState.error && (
                  <div className="w-full max-w-3xl mb-4 bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-3">
                    <AlertCircle size={18} />
                    <span className="text-sm">{renderState.error}</span>
                  </div>
                )}

                {!floorPlanFile ? (
                  <UploadZone onFileSelect={handleFileSelect} />
                ) : (
                  <div className="w-full max-w-6xl flex flex-col xl:flex-row gap-6 h-full">
                      
                      {/* Left: Input Preview & Selection */}
                      <div className="w-full xl:w-1/3 flex flex-col gap-4">
                        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 shadow-xl flex-1 flex flex-col">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Input Drawing</h3>
                            
                            {/* Main Preview */}
                            <div className="relative aspect-[4/3] bg-white rounded-lg overflow-hidden border border-slate-700 mb-4">
                              {floorPlanPreviews.length > 0 && (
                                <img 
                                  src={floorPlanPreviews[selectedPreviewIndices[selectedPreviewIndices.length - 1]]} // Show the most recently added selection or last one
                                  alt={`Page ${selectedPreviewIndices[selectedPreviewIndices.length - 1] + 1}`} 
                                  className="w-full h-full object-contain"
                                />
                              )}
                              {selectedPreviewIndices.length > 1 && (
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                                  +{selectedPreviewIndices.length - 1} other(s) selected
                                </div>
                              )}
                            </div>

                            {/* Page Selection Strip */}
                            {floorPlanPreviews.length > 1 && (
                              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                {floorPlanPreviews.map((img, idx) => {
                                  const isSelected = selectedPreviewIndices.includes(idx);
                                  return (
                                    <button 
                                      key={idx}
                                      onClick={() => togglePageSelection(idx)}
                                      className={`relative w-16 h-16 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                                        isSelected 
                                          ? 'border-blue-500 ring-2 ring-blue-500/20 scale-105' 
                                          : 'border-slate-700 hover:border-slate-500 opacity-60 hover:opacity-100'
                                      }`}
                                    >
                                      <img src={img} className="w-full h-full object-cover" />
                                      <span className="absolute bottom-0 right-0 bg-black/70 text-[10px] text-white px-1">P{idx + 1}</span>
                                      
                                      {/* Selection Indicator */}
                                      {isSelected && (
                                        <div className="absolute top-0 right-0 bg-blue-500 text-white w-4 h-4 flex items-center justify-center rounded-bl-md">
                                          <span className="text-[10px] font-bold">✓</span>
                                        </div>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            
                            <div className="mt-auto pt-4 border-t border-slate-800/50">
                                <p className="text-xs text-slate-500 text-center">
                                  <strong>Tip:</strong> Select Context images first. Select the <strong>Main View LAST</strong> (it will be the basis for the render).
                                </p>
                            </div>
                        </div>
                      </div>

                      {/* Right: Output Render */}
                      <div className="flex-1 bg-slate-900 rounded-xl p-1 border border-slate-800 shadow-2xl relative group overflow-hidden flex flex-col">
                        <div className="absolute top-4 left-4 z-10">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">AI Render Output</h3>
                        </div>
                        
                        {renderState.generatedImage && (
                          <div className="absolute top-4 right-4 z-10 flex gap-2">
                             <button onClick={handleRegenerate} className="bg-slate-800/90 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-sm transition-all border border-slate-700">
                               <RefreshCw size={14} /> Update
                             </button>
                             <button onClick={handleDownload} className="bg-blue-600/90 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg backdrop-blur-sm transition-all">
                               <Download size={14} /> Download
                             </button>
                          </div>
                        )}

                        {renderState.generatedImage ? (
                          <div className="relative w-full h-full group">
                            <img 
                              src={renderState.generatedImage} 
                              alt="AI Rendered Kitchen" 
                              className={`w-full h-full object-contain transition-opacity duration-700 ${renderState.isLoading ? 'opacity-50 blur-sm' : 'opacity-100'}`}
                            />
                            
                            {/* Floating Toolbar for Update / Back */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-slate-950/80 p-2 rounded-full backdrop-blur-md border border-slate-800 shadow-2xl">
                                <button 
                                  onClick={closeRender}
                                  className="flex items-center gap-2 px-4 py-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
                                  disabled={renderState.isLoading}
                                >
                                  <ArrowLeft size={16} />
                                  Back to Input
                                </button>
                                
                                <div className="w-px h-6 bg-slate-700"></div>

                                <button 
                                  onClick={handleRegenerate}
                                  className="flex items-center gap-2 px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-medium shadow-lg"
                                  disabled={renderState.isLoading}
                                >
                                  {renderState.isLoading ? (
                                    <RefreshCw size={16} className="animate-spin" />
                                  ) : (
                                    <RefreshCw size={16} />
                                  )}
                                  Update Render
                                </button>
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                             <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <RefreshCw className="text-slate-600" size={32} />
                             </div>
                             <h3 className="text-slate-300 font-medium">Ready to Visualize</h3>
                             <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
                               {selectedPreviewIndices.length === 1 
                                 ? `Selected Page ${selectedPreviewIndices[0] + 1}` 
                                 : `${selectedPreviewIndices.length} Pages Selected`}
                             </p>
                             <button onClick={() => triggerGeneration(settings)} disabled={renderState.isLoading} className="mt-6 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full text-sm font-medium shadow-lg transition-transform active:scale-95">
                               {renderState.isLoading ? 'Rendering...' : `Generate from ${selectedPreviewIndices.length} Page${selectedPreviewIndices.length > 1 ? 's' : ''}`}
                             </button>
                          </div>
                        )}
                      </div>
                  </div>
                )}
             </div>
        </div>
      </main>
    </div>
  );
}
