import { GoogleGenAI } from "@google/genai";
import { DesignSettings, COLOR_PROMPT_MAP } from "../types";

// Using Gemini 2.5 Flash Image model as requested. 
// This model is optimized for native image generation.
const MODEL_NAME = 'gemini-2.5-flash-image';     

export async function generateKitchenRender(
  inputImages: string | string[], // Can be single base64 or array of base64 strings
  mimeType: string,
  settings: DesignSettings,
  seed: number,
  isRefinement: boolean = false, // True if we are just changing colors on an existing render
  pdfTextContext: string = '' // New: Raw text from PDF
): Promise<string> {
  // Vite exposes env variables prefixed with VITE_ on import.meta.env
  // However, guidelines strictly require using process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
      [SINGLE IMAGE MODE ACTIVATED]
      - **INPUT**: You have received EXACTLY ONE image.
      - **SHEET LAYOUT DETECTION**: Does this image contain multiple viewports (e.g., a top view and a bottom view stacked)?
      - **ACTION**: If the image is a "Drawing Sheet" with multiple views:
        1. **IDENTIFY** the single best "Perspective View" (usually the largest 3D angle).
        2. **CROP MENTALLY**: Ignore the secondary views, floor plans, or small details on the sheet.
        3. **GENERATE**: Output a SINGLE, FULL-SCREEN image based on that one best view.
      - **PROHIBITION**: Do not output a split screen. Do not output the white paper borders.
    ` : '';

    prompt = `
      [SYSTEM: CRITICAL OVERRIDE]
      **MODE**: STRICT IMAGE SYNTHESIS (NOT GENERATION).
      **ROLE**: You are a "Smart Texture Engine" (like ControlNet).
      **TASK**: Apply realistic materials and lighting to the provided wireframe drawing.
      
      [CORE DIRECTIVE: DO NOT GENERATE NEW GEOMETRY]
      - The input image is a "mask". You may only color INSIDE the lines.
      - **DO NOT** add objects (no vases, no fruit, no plants).
      - **DO NOT** add windows, doors, or cabinets that are not in the sketch.
      - **DO NOT** change the perspective or camera angle.
      - **DO NOT** "imagine" the rest of the room. If the sketch stops, the render stops.

      [STRICT MATERIAL APPLICATION]
      1. **CABINETS**: Apply "${COLOR_PROMPT_MAP[settings.baseCabinetColor]}" to all lower cabinets/drawers.
      2. **UPPERS**: Apply "${COLOR_PROMPT_MAP[settings.wallCabinetColor]}" to all wall cabinets.
      3. **FLOOR**: Apply a realistic wood or tile texture based on context.
      4. **LIGHTING**: Add soft, realistic Global Illumination. Shadows must match the geometry.

      ${singleImageDirectives}

      [PHASE 1: MASTER VIEW IDENTIFICATION]
      - You may receive multiple reference images.
      - Select the ONE image that is the "Main Perspective" (widest angle 3D view).
      - This selected image is your CANVAS. You will paint on THIS canvas.
      - Use other images ONLY to understand details (e.g., "Oh, the island has 3 drawers").

      [PHASE 2: CROSS-REFERENCE DETAILS]
      - If the Main View is sketchy, look at the Detail Views.
      - If Detail View shows a "Shaker" door, paint "Shaker" style on the Main View.
      - If Detail View shows a Microwave, paint a Microwave on the Main View.

      [PHASE 3: PHOTOREALISM WITHOUT HALLUCINATION]
      - **GOAL**: Make it look like a photo, NOT a drawing.
      - **METHOD**:
        - Hide the black sketch lines by blending them into shadows/edges.
        - Add reflections on the countertop.
        - Add ambient occlusion in corners.
      - **CONSTRAINT**: If a line exists in the sketch, it must exist as an edge in the photo.

      ${commonRules}
      
      ${nkbaStandards}

      ${negativePrompt}
      - **NO SPLIT SCREENS**.
      - **NO TEXT OVERLAYS**.
      - **NO CARTOON/SKETCH EFFECTS**.
      - **NO EXTRA FURNITURE**.

      Output: A single, high-fidelity photograph of the EXACT scene in the sketch.
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
              mimeType: mimeType, // Assuming all images share the same mime type for simplicity (usually PNG from PDF conversion)
              data: cleanData
          }
      });
  });

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: parts,
      },
      config: {
        seed: seed,
        // Reduced temperature to 0.0 for MAXIMUM DETERMINISM.
        // We do not want creativity. We want STRICT adherence to the input.
        temperature: 0.0, 
        // Safety settings removed to avoid type conflicts with @google/genai SDK. 
        // Default safety settings will apply.
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      // Safety check: Ensure content and parts exist before iterating
      const content = candidates[0].content;
      
      // Handle cases where parts might be null or undefined
      if (!content || !content.parts) {
         console.warn("Gemini returned a candidate but no content parts. Raw response:", JSON.stringify(candidates[0]));
         throw new Error("AI returned an empty response. Please try again.");
      }
      
      const parts = content.parts;
      
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      let textResponse = '';
      for (const part of parts) {
        if (part.text) {
          textResponse += part.text + ' ';
        }
      }
      
      if (textResponse) {
        console.warn("Gemini returned text instead of image:", textResponse);
        throw new Error(`AI processing note: "${textResponse.trim().substring(0, 150)}..."`);
      }
    }
    
    throw new Error("No image generated.");
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
}