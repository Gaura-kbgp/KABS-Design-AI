
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UploadZone } from './components/UploadZone';
import { fileParser } from './services/fileParser';
import { generateKitchenRender } from './services/geminiService';
import { DesignSettings, DEFAULT_SETTINGS, RenderState } from './types';
import { RefreshCw, AlertCircle, X, Settings2, Download, ArrowLeft, Check } from 'lucide-react';

export default function App() {
  // --- State ---
  const [settings, setSettings] = useState<DesignSettings>(DEFAULT_SETTINGS);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [floorPlanPreviews, setFloorPlanPreviews] = useState<string[]>([]);
  const [selectedPageIndices, setSelectedPageIndices] = useState<number[]>([]); // Track user-selected pages
  const [viewingIndex, setViewingIndex] = useState<number>(0); // For viewing only, not selection
  const [pdfTextContent, setPdfTextContent] = useState<string>(''); // New State for Text
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  const [renderState, setRenderState] = useState<RenderState>({
    isLoading: false,
    generatedImage: null,
    error: null,
    seed: Math.floor(Math.random() * 1000000)
  });

  // --- Helper for Deterministic Seeding ---
  const generateSeedFromFile = (file: File): number => {
    // Simple hash based on file properties to ensure same file = same seed
    const str = `${file.name}-${file.size}-${file.lastModified}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  // --- Handlers ---
  const handleFileSelect = async (file: File) => {
    setFloorPlanFile(file);
    setViewingIndex(0); 
    
    // GENERATE DETERMINISTIC SEED
    const deterministicSeed = generateSeedFromFile(file);

    // Clear previous results immediately
    setRenderState(prev => ({ 
      isLoading: false, // Do NOT start loading automatically. Wait for user to click "Generate".
      generatedImage: null, 
      error: null,
      seed: deterministicSeed // Use fixed seed
    }));

    if (file.type === 'application/pdf') {
      try {
        const images = await fileParser.pdfToImages(file);
        setFloorPlanPreviews(images);
        // Default: Select the first page (usually the best perspective sorted by parser)
        setSelectedPageIndices([0]);
        
        // Extract Text from PDF
        const text = await fileParser.pdfToText(file);
        setPdfTextContent(text);
        
      } catch (err) {
        console.error("Failed to convert PDF preview", err);
        setRenderState(prev => ({ ...prev, isLoading: false, error: "Failed to read PDF blueprint." }));
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setFloorPlanPreviews([result]);
        setSelectedPageIndices([0]);
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to trigger generation with explicit data (bypassing state lag)
  const triggerGenerationWithData = async (images: string[], text: string, currentSettings: DesignSettings, seedToUse: number) => {
     try {
        // Detect mime type
        const mimeMatch = images[0].match(/^data:(.*);base64,/);
        const inputMime = mimeMatch ? mimeMatch[1] : 'image/png';

        const imageUrl = await generateKitchenRender(
          images, 
          inputMime, 
          currentSettings, 
          seedToUse,
          false, // isRefinement
          text
        );
        
        setRenderState(prev => ({
          ...prev,
          isLoading: false,
          generatedImage: imageUrl,
          error: null,
          seed: seedToUse
        }));
     } catch (err: any) {
        console.error(err);
        setRenderState(prev => ({
          ...prev,
          isLoading: false,
          generatedImage: null, 
          error: err.message || "Generation failed."
        }));
     }
  };

  const togglePageSelection = (index: number) => {
    setSelectedPageIndices(prev => {
        if (prev.includes(index)) {
             return prev.filter(i => i !== index);
        } else {
             return [...prev, index];
        }
    });
  };

  const handleSettingsUpdate = (key: keyof DesignSettings, value: string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    // Only auto-update if we already have a render (Refinement Mode).
    // If we are in "Ready to Render" mode (initial state), do NOT auto-trigger. User must click "Generate".
    if (floorPlanPreviews.length > 0 && renderState.generatedImage) {
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
        // New Generation: Use SELECTED preview images
        let selectedImages = floorPlanPreviews.filter((_, index) => selectedPageIndices.includes(index));
        
        // Fallback: If nothing selected, use the first page
        if (selectedImages.length === 0 && floorPlanPreviews.length > 0) {
            selectedImages = [floorPlanPreviews[0]];
        }
        
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
        hasPreviousRender,
        pdfTextContent // Pass the extracted text
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
    setPdfTextContent('');
    setViewingIndex(0);
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
    // Preserve the current seed unless explicitly forcing a new one (which we don't do here anymore)
    // This ensures that "Update Render" (e.g. changing colors) KEEPS the same geometry/layout.
    triggerGeneration(settings, renderState.seed, true);
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
          
             <div className="h-full w-full p-2 md:p-4 overflow-y-auto flex flex-col items-center">
                {renderState.error && (
                  <div className="w-full max-w-3xl mb-4 bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-3">
                    <AlertCircle size={18} />
                    <span className="text-sm">{renderState.error}</span>
                  </div>
                )}

                {/* Content Area - Only Show Upload Zone if no file is selected */}
                {!floorPlanFile && (
                  <UploadZone onFileSelect={handleFileSelect} />
                )}

                {/* Loading State or Result State */}
                {floorPlanFile && (
                  <div className="w-full max-w-full lg:max-w-[1800px] flex flex-col h-full">
                      
                      {/* Right: Output Render */}
                      <div className="flex-1 bg-slate-900 rounded-xl p-1 border border-slate-800 shadow-2xl relative group overflow-hidden flex flex-col">
                        <div className="absolute top-4 left-4 z-10">
                          <h3 className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">AI Render Output</h3>
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
                            
                            {/* Floating Toolbar for Update / Back - Always Visible */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-950/80 p-2 rounded-full backdrop-blur-md border border-slate-800 shadow-2xl z-50">
                                <button 
                                  onClick={closeRender}
                                  className="flex items-center gap-2 px-4 py-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
                                  disabled={renderState.isLoading}
                                >
                                  <ArrowLeft size={16} />
                                  Back to Selection
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
                        ) : renderState.isLoading ? (
                          // LOADING STATE (When file selected but image not yet ready)
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6">
                             <div className="relative">
                               <div className="w-24 h-24 rounded-full border-4 border-slate-800 border-t-blue-500 animate-spin"></div>
                               <div className="absolute inset-0 flex items-center justify-center">
                                 <RefreshCw className="text-blue-500 animate-pulse" size={32} />
                               </div>
                             </div>
                             <div>
                               <h3 className="text-xl text-white font-semibold">Analyzing Blueprint...</h3>
                               <p className="text-slate-400 mt-2 max-w-sm mx-auto">
                                 Identifying walls, islands, and cabinets. Constructing 3D scene...
                               </p>
                             </div>
                          </div>
                        ) : (
                          // READY STATE (File uploaded, waiting for user to click Generate)
                          <div className="h-full flex flex-col items-center justify-center p-4 md:p-8 text-center space-y-6">
                             
                             {/* Page Selection Grid */}
                             <div className="w-full max-w-5xl mx-auto flex-1 min-h-0 flex flex-col">
                                <div className="flex items-center justify-between mb-3 px-2 shrink-0">
                                    <h3 className="text-sm font-semibold text-slate-300">Select Pages to Render ({selectedPageIndices.length})</h3>
                                    <div className="flex gap-3">
                                        <button onClick={() => setSelectedPageIndices(floorPlanPreviews.map((_, i) => i))} className="text-xs text-blue-400 hover:text-blue-300">
                                          Select All
                                        </button>
                                        <button onClick={() => setSelectedPageIndices([])} className="text-xs text-slate-500 hover:text-slate-400">
                                          Clear
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 overflow-y-auto p-2 bg-slate-900/50 rounded-xl border border-slate-800 min-h-[200px]">
                                   {floorPlanPreviews.map((img, idx) => (
                                       <div 
                                          key={idx} 
                                          onClick={() => togglePageSelection(idx)}
                                          className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all group ${selectedPageIndices.includes(idx) ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg shadow-blue-900/20' : 'border-slate-800 opacity-60 hover:opacity-100 hover:border-slate-600'}`}
                                       >
                                          <img src={img} className="w-full h-full object-contain bg-white" />
                                          
                                          {selectedPageIndices.includes(idx) && (
                                              <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1.5 shadow-lg z-10">
                                                  <Check size={14} />
                                              </div>
                                          )}
                                          
                                          <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-1.5 truncate text-center backdrop-blur-sm">
                                              Page {idx + 1}
                                          </div>
                                       </div>
                                   ))}
                                </div>
                             </div>
                      
                             <div className="shrink-0">
                               <h3 className="text-xl md:text-2xl text-white font-bold">Ready to Render</h3>
                               <p className="text-slate-400 mt-2 max-w-md mx-auto text-sm md:text-base">
                                 {selectedPageIndices.length === 0 
                                    ? "Please select at least one page from the grid above." 
                                    : "Configure your materials in the sidebar, then click Generate."}
                               </p>
                             </div>
                             
                             <button 
                               onClick={() => triggerGeneration(settings)}
                               disabled={selectedPageIndices.length === 0}
                               className={`text-base md:text-lg font-bold px-6 py-3 md:px-8 md:py-3 rounded-full shadow-xl transition-all flex items-center gap-3 ${selectedPageIndices.length === 0 ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20 hover:shadow-2xl hover:scale-105'}`}
                             >
                               <RefreshCw size={20} />
                               GENERATE RENDER
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
