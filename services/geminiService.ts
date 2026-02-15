import { GoogleGenAI } from "@google/genai";
import { DesignSettings, COLOR_PROMPT_MAP } from "../types";

// Using Gemini 3 Pro Image (Preview) as the "Better/Higher" model first.
// This is the image-generation capable variant of the "Gemini 3 Pro" model selected in the IDE.
// Fallback to Gemini 2.5 Flash Image if Pro fails or is unavailable.
const PRIMARY_MODEL = 'gemini-3-pro-image-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash-image';

async function generateWithModel(
  ai: GoogleGenAI, 
  modelName: string, 
  parts: any[], 
  seed: number
): Promise<string> {
  console.log(`Attempting generation with model: ${modelName}`);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        seed: seed,
        temperature: 0.0, // Strict adherence
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const content = candidates[0].content;
      if (!content || !content.parts) throw new Error("Empty content");

      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
      
      // If we get text instead of image, treat it as a failure for the "Image Generator"
      let textResponse = '';
      for (const part of content.parts) {
        if (part.text) textResponse += part.text + ' ';
      }
      if (textResponse) {
        throw new Error(`Model returned text instead of image: ${textResponse.substring(0, 50)}...`);
      }
    }
    throw new Error("No candidates returned");
  } catch (error) {
    console.warn(`Model ${modelName} failed:`, error);
    throw error;
  }
}

export async function generateKitchenRender(
  inputImages: string | string[], 
  mimeType: string,
  settings: DesignSettings,
  seed: number,
  isRefinement: boolean = false, 
  pdfTextContext: string = '' 
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // ... (Prompt construction remains the same, I will insert the logic below)


  let prompt = '';

  // DYNAMIC DOOR STYLE DESCRIPTION - STRICTLY ENFORCING SOLID MATERIALS
  const doorDescription = settings.doorStyle === 'Shaker' 
    ? 'Solid Wood Shaker style (Recessed Panel with flat center). OPAQUE PAINTED FINISH. SOLID DOORS ONLY. ABSOLUTELY NO GLASS INSERTS on wall cabinets unless explicitly labeled "Glass".' 
    : 'Modern Minimalist Flat Slab. SOLID OPAQUE FINISH. SOLID DOORS ONLY. ABSOLUTELY NO GLASS INSERTS.';

  const commonRules = `
    [MATERIAL CONSISTENCY RULES]
    1. **WALL CABINETS (Uppers)**: Must be "${COLOR_PROMPT_MAP[settings.wallCabinetColor]}".
       - This applies to all cabinets MOUNTED ON THE WALL above the counter.
    2. **BASE CABINETS & ISLAND**: Must be "${COLOR_PROMPT_MAP[settings.baseCabinetColor]}".
       - **CRITICAL**: This color applies to ALL LOWER ELEMENTS:
         - All Base Cabinets (under the counter).
         - All Drawers (drawer fronts).
         - The entire Island structure (front, back, and sides).
       - **DRAWER COLOR RULE**: Drawers are part of the base cabinets. They MUST be ${COLOR_PROMPT_MAP[settings.baseCabinetColor]}.
         - IGNORE any shading in the sketch that suggests a different material.
         - If the base cabinets are ${COLOR_PROMPT_MAP[settings.baseCabinetColor]}, the DRAWERS are also ${COLOR_PROMPT_MAP[settings.baseCabinetColor]}.
       - This is a Two-Tone kitchen design if the colors are different.
       - STRICTLY respect the separation: Uppers = ${settings.wallCabinetColor}, Lowers = ${settings.baseCabinetColor}.
    3. **COUNTERTOPS**: All surfaces must be "${settings.countertop}".
    4. **DOOR STYLE**: ${doorDescription}.
  `;

  // NKBA Standards Reference
  const nkbaStandards = `
    [NKBA CABINET NOMENCLATURE - STRICT DECODING]
    - **B[Width]**: Base Cabinet (e.g., B30 = 30" Base). Standard has 1 drawer on top, doors below.
    - **DB[Width]** or **3DB[Width]**: Drawer Base. 3-drawer stack. (e.g., DB30).
    - **SB[Width]**: Sink Base. False drawer front on top, 2 doors below.
    - **W[Width][Height]**: Wall Cabinet (e.g., W3030 = 30" Wide, 30" High).
    - **MW** or **MICRO**: Microwave Cabinet.
    - **OV** or **OVEN**: Wall Oven Cabinet (Tall).
    - **REP** or **REF**: Refrigerator Enclosure.
    - **DW**: Dishwasher (24" wide space next to sink).
    - **F** or **FILLER**: Filler strip (plain wood).
  `;

  const photorealismRules = `
      [PHASE 3: PHOTOREALISTIC STYLE TRANSFER]
      - **TASK**: Treat the input lines as a "Wireframe".
      - **ACTION**: Apply PBR (Physically Based Rendering) materials to the wireframe.
      - **LIGHTING**: Add "Global Illumination". Light must bounce off the floor onto the cabinets.
      - **DEPTH**: Add "Ambient Occlusion" in the corners.
      - **SHADOWS**: The island must cast a soft shadow on the wood floor.
      - **REFLECTIONS**: The countertop must reflect the under-cabinet lighting.
      - **ANTI-FLATNESS**: Banish "flat colors". Every surface must have texture (grain, vein, noise).
  `;

  const negativePrompt = `
      [NEGATIVE PROMPT - STRICTLY FORBIDDEN]
      - **SPLIT SCREEN**, **COLLAGE**, **GRID**, **TILED IMAGES**.
      - **WHITE BORDERS** inside the image.
      - **MULTIPLE VIEWPOINTS**.
      - **CARTOON**, **FLAT COLOR**, **SKETCH STYLE** (Output must be PHOTO-REAL).
      - **GHOSTING**, **DOUBLE VISION**.
      - **INSET IMAGES** (Do not put small pictures in the corner).
      - **BLUEPRINT LINES** (This is a photo, not a drawing).
      - **TEXT OVERLAYS**.
      - **HALLUCINATED OBJECTS**: No fruit bowls, no vases, no plants, no knife blocks unless in sketch.
      - **DISTORTED PERSPECTIVE**: No fisheye, no warped walls.
  `;

  if (settings.viewMode === '2D Architectural Plan') {
    // === MODE 3: 2D ARCHITECTURAL COLORING ===
    prompt = `
      You are "KABS Design AI". 
      TASK: Colorize this 2D floor plan layout.
      
      [STRICT ADHERENCE]
      1. KEEP ALL ORIGINAL TEXT LABELS (Cabinet Codes like B30, W3030). Do not obscure them.
      2. FILL COLORS inside the existing lines only.
      3. Base Cabinet Fill: ${COLOR_PROMPT_MAP[settings.baseCabinetColor]}
      4. Wall Cabinet Fill: ${COLOR_PROMPT_MAP[settings.wallCabinetColor]}
      5. Flooring: Subtle grid or wood texture.
      6. Do not change the geometry.
      
      Output: High-quality colored architectural plan.
    `;
  } else if (isRefinement) {
    // === MODE 2: 3D MATERIAL SWAP (Locks Geometry) ===
    prompt = `
      TASK: Retexture this 3D render.
      
      [GEOMETRY LOCK]
      - DO NOT CHANGE THE LAYOUT.
      - DO NOT ADD OR REMOVE CABINETS.
      - KEEP THE EXACT CAMERA ANGLE.
      
      [UPDATES]
      - Change Wall Cabinet Color to: ${COLOR_PROMPT_MAP[settings.wallCabinetColor]}
      - Change Base/Island Cabinet Color to: ${COLOR_PROMPT_MAP[settings.baseCabinetColor]}
      - Change Wall Color to: ${settings.wallColor}
      - Change Countertop to: ${settings.countertop}
      
      ${commonRules}

      ${photorealismRules}

      ${negativePrompt}
      
      Output: Photorealistic image with identical geometry to input.
    `;
  } else {
    // === MODE 1: 3D INITIAL CONSTRUCTION FROM PDF/IMAGE ===
    const isMultiPage = Array.isArray(inputImages) && inputImages.length > 1;

    // DETECT IF SINGLE IMAGE INPUT
    // If user selects only ONE page, we must enforce strict single-image processing
    const singleImageDirectives = !isMultiPage ? `
      [SHEET CLEANUP PROTOCOL - CRITICAL]
      - **INPUT ANALYSIS**: The input image might be a "Technical Drawing Sheet" containing MULTIPLE separate drawings (e.g., a Main View on top, an Island View on bottom, and a Floor Plan in the corner).
      - **TASK**: You must OUTPUT a SINGLE, COHESIVE IMAGE.
      - **ACTION**:
        1. **SCAN** the sheet for the *largest* and *most complete* 3D Perspective View.
        2. **CROP & ZOOM**: Mentally "cut out" that single best view.
        3. **DISCARD**: Completely ignore the secondary views, floor plans, text blocks, and page borders.
        4. **EXPAND**: Make that single selected view fill your entire output canvas.
      - **RESULT**: The user must see ONE big photo of the kitchen, not a sheet with multiple boxes.
    ` : '';

    prompt = `
      [SYSTEM: CRITICAL OVERRIDE]
      **MODE**: INTELLIGENT PHOTOREALISTIC RE-FRAMING.
      **ROLE**: You are a "Virtual Staging Camera".
      **TASK**: Extract the main kitchen design from the technical sheet and render it as a real photo.
      
      [STEP 1: VIEWPORT SELECTION & COMPOSITION]
      - **DO NOT** just color the whole page. That looks like a mess.
      - **FIND THE HERO SHOT**: Look at the input. Identify the Main Kitchen Perspective.
      - **IGNORE CLUTTER**: Ignore small detail drawings, floating cabinets, or floor plans on the same page.
      - **FRAME IT**: Your output image should be a close-up, immersive view of that Main Kitchen Perspective.

      [STEP 2: STRICT GEOMETRY PRESERVATION (WITHIN THE VIEW)]
      - Once you have selected the Main View, **LOCK THE GEOMETRY**.
      - **DO NOT** move cabinets, appliances, or walls *within that view*.
      - **DO NOT** add objects (NO vases, NO fruit, NO plants).
      - **DO NOT** "hallucinate" parts of the room that aren't there.
      
      [STEP 3: MATERIAL APPLICATION]
      1. **CABINETS**: Fill all lower cabinet shapes with "${COLOR_PROMPT_MAP[settings.baseCabinetColor]}" texture.
      2. **UPPERS**: Fill all upper cabinet shapes with "${COLOR_PROMPT_MAP[settings.wallCabinetColor]}" texture.
      3. **FLOOR**: Fill the floor area with a realistic wood or tile texture.
      4. **LIGHTING**: Apply "Global Illumination" to simulate depth.

      ${singleImageDirectives}

      [PHASE 1: MASTER VIEW IDENTIFICATION (MULTI-PAGE INPUT)]
      - If multiple images are provided, one might be a floor plan and one a 3D view.
      - **ALWAYS PRIORITIZE THE 3D PERSPECTIVE**.
      - Use the floor plan only for context (e.g., "Where is the window?").
      - Your output must correspond to the VISUAL PERSPECTIVE of the 3D Drawing.

      [PHASE 2: CROSS-REFERENCE DETAILS]
      - If the Main View is sketchy, look at the Detail Views.
      - If Detail View shows a "Shaker" door, paint "Shaker" shading on the Main View.

      [PHASE 3: PHOTOREALISM WITHOUT HALLUCINATION]
      - **GOAL**: The result must look like a high-end architectural visualization.
      - **METHOD**:
        - Treat the black lines as "creases" or "edges" in the 3D geometry.
        - **ABSOLUTE BAN**: Do not add "staging props". No fruit bowls. No flowers. No chairs unless drawn.

      ${commonRules}
      
      ${nkbaStandards}

      ${negativePrompt}
      - **NO SPLIT SCREENS** (Crucial: Output must be one single scene).
      - **NO TILED IMAGES**.
      - **NO WHITE BORDERS**.
      - **NO TEXT OVERLAYS**.
      - **NO CARTOON/SKETCH EFFECTS**.
      - **NO EXTRA FURNITURE**.
      - **NO VASES / PLANTS / DECOR**.

      Output: A single, full-screen, high-fidelity photograph of the MAIN KITCHEN VIEW.
    `;
  }

  // Normalize input to array
  const imageInputs = Array.isArray(inputImages) ? inputImages : [inputImages];
  
  // Construct parts: Prompt + All Images
  const parts: any[] = [{ text: prompt }];

  imageInputs.forEach(imgBase64 => {
      // Remove data prefix if present for clean base64
      const cleanData = imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64;
      
      parts.push({
          inlineData: {
              mimeType: mimeType, 
              data: cleanData
          }
      });
  });

  // === NEW FALLBACK MECHANISM ===
  // Try the "Better/Higher" model first.
  try {
    console.log("Starting generation with PRIMARY model:", PRIMARY_MODEL);
    return await generateWithModel(ai, PRIMARY_MODEL, parts, seed);
  } catch (primaryError) {
    console.warn(`PRIMARY MODEL (${PRIMARY_MODEL}) FAILED. Switching to FALLBACK (${FALLBACK_MODEL}). Reason:`, primaryError);
    
    // Retry with the fallback model (Gemini 2.5 Flash Image)
    try {
      console.log("Starting generation with FALLBACK model:", FALLBACK_MODEL);
      return await generateWithModel(ai, FALLBACK_MODEL, parts, seed);
    } catch (fallbackError) {
      console.error("BOTH MODELS FAILED. Critical Error.", fallbackError);
      throw new Error(`AI Generation Failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
    }
  }
}