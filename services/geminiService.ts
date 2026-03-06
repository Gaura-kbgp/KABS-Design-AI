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
      contents: [{ parts }],
      config: {
        seed: seed,
        temperature: 0.0,
      },
      // Fallback for different SDK variants
      generationConfig: {
        seed: seed,
        temperature: 0.0,
      }
    } as any);

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
    prompt = `
      # ROLE: Professional 3D Visualization Camera.
      
      # TASK: Synthesize the input technical drawings into EXACTLY ONE cohesive, full-room 3D kitchen render.
      
      # [CRITICAL: ROOM SYNTHESIS]
      - **INPUT ANALYSIS**: You are receiving multiple drawings (e.g., Wall Elevations, Island Details, 3D Perspectives).
      - **GOAL**: Merge these elements into a single **Wide-Angle Hero Shot** of the entire kitchen.
      - **COMPOSITION**: 
        - If one image shows the main wall cabinets and another shows the island, you MUST render them together in one scene.
        - Place the island in the foreground/center and the wall cabinets in the background as shown in the layout.
      - **FAIL CONDITION**: Do not just pick one drawing and ignore the others. Do not output a collage or split screen.

      # [GEOMETRY & PERSPECTIVE FIDELITY]
      - **MIRROR THE LAYOUT**: Follow the spatial relationship defined in the blueprints.
      - **ISLAND ORIENTATION**: 
        - If the drawing shows the side with the sink/faucet (Front), render the FRONT.
        - If the drawing shows the decorative panel side (Back), render the BACK.
      - **CABINET COUNT**: Preserve the exact count of all cabinets, drawers, and appliance placements across all input pages.

      # [MATERIAL SPECS]
      - Wall Cabinets (Uppers): ${COLOR_PROMPT_MAP[settings.wallCabinetColor]}.
      - Base/Island Cabinets: ${COLOR_PROMPT_MAP[settings.baseCabinetColor]}.
      - Countertops: ${settings.countertop}.
      - Door Style: ${doorDescription}.
      - Scene Style: Cinematic, ultra-photorealistic, high-end architectural photography.

      # [NEGATIVE PROMPT]
      - No split screens, no collages, no grids.
      - No paper borders, no text, no architectural lines.
      - No "Single Item" focus if other room elements are provided.

      FINAL OUTPUT: One single, wide-angle, full-room photorealistic 3D render.
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
    const result = await generateWithModel(ai, PRIMARY_MODEL, parts, seed);
    console.log("SUCCESS: Generated with PRIMARY model:", PRIMARY_MODEL);
    return result;
  } catch (primaryError) {
    console.warn(`PRIMARY MODEL (${PRIMARY_MODEL}) FAILED. Switching to FALLBACK (${FALLBACK_MODEL}). Reason:`, primaryError);

    // Retry with the fallback model (Gemini 2.5 Flash Image)
    try {
      console.log("Starting generation with FALLBACK model:", FALLBACK_MODEL);
      const result = await generateWithModel(ai, FALLBACK_MODEL, parts, seed);
      console.log("SUCCESS: Generated with FALLBACK model:", FALLBACK_MODEL);
      return result;
    } catch (fallbackError) {
      console.error("BOTH MODELS FAILED. Critical Error.", fallbackError);
      throw new Error(`AI Generation Failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
    }
  }
}