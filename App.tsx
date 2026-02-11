
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
    // Just switch the view, do not toggle selection (Everything is selected by default)
    setViewingIndex(index);
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
        // New Generation: Use ALL preview images
        const selectedImages = floorPlanPreviews;
        
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
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-950/80 p-2 rounded-full backdrop-blur-md border border-slate-800 shadow-2xl">
                                <button 
                                  onClick={resetUpload}
                                  className="flex items-center gap-2 px-4 py-2 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
                                  disabled={renderState.isLoading}
                                >
                                  <ArrowLeft size={16} />
                                  Upload New
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
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 md:space-y-8">
                             
                             <div className="relative group cursor-pointer" onClick={() => setSidebarOpen(true)}>
                                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                                <div className="relative w-48 h-48 md:w-64 md:h-64 bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-2xl flex items-center justify-center">
                                   {floorPlanPreviews.length > 0 ? (
                                     <img src={floorPlanPreviews[0]} alt="Preview" className="w-full h-full object-contain opacity-80" />
                                   ) : (
                                     <div className="text-slate-600">No Preview</div>
                                   )}
                                   
                                   {/* Overlay Hint */}
                                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <div className="bg-slate-900/90 text-white px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md flex items-center gap-2">
                                        <Settings2 size={16} /> Configure Settings
                                      </div>
                                   </div>
                                </div>
                             </div>
                      
                             <div>
                               <h3 className="text-xl md:text-2xl text-white font-bold">Ready to Render</h3>
                               <p className="text-slate-400 mt-2 max-w-md mx-auto text-sm md:text-base">
                                 Your blueprint is loaded. Select your colors and materials in the sidebar, then click Generate.
                               </p>
                             </div>
                             
                             <button 
                               onClick={() => triggerGeneration(settings)}
                               className="bg-blue-600 hover:bg-blue-500 text-white text-base md:text-lg font-bold px-6 py-3 md:px-8 md:py-3 rounded-full shadow-blue-900/20 shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-3"
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
