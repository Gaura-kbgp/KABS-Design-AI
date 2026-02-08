import { GoogleGenAI } from "@google/genai";
import { DesignSettings, COLOR_PROMPT_MAP } from "../types";

// Switching to gemini-2.5-flash-image (standard model)
const MODEL_NAME = 'gemini-2.5-flash-image'; 

export async function generateKitchenRender(
  inputImages: string | string[], // Can be single base64 or array of base64 strings
  mimeType: string,
  settings: DesignSettings,
  seed: number,
  isRefinement: boolean = false // True if we are just changing colors on an existing render
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
    1. **UNIFORM COLOR**: All cabinets (Perimeter AND Island) must be "${COLOR_PROMPT_MAP[settings.cabinetColor]}" unless the floor plan has a text label explicitly naming a different color for the island.
       - Do NOT make the island a random accent color.
       - Do NOT make upper cabinets a different color from base cabinets.
    2. **COUNTERTOPS**: All surfaces must be "${settings.countertop}".
    3. **DOOR STYLE**: ${doorDescription}.
  `;

  if (settings.viewMode === '2D Architectural Plan') {
    // === MODE 3: 2D ARCHITECTURAL COLORING ===
    prompt = `
      You are "KABS Design AI". 
      TASK: Colorize this 2D floor plan layout.
      
      [STRICT ADHERENCE]
      1. KEEP ALL ORIGINAL TEXT LABELS (Cabinet Codes like B30, W3030). Do not obscure them.
      2. FILL COLORS inside the existing lines only.
      3. Cabinet Fill: ${COLOR_PROMPT_MAP[settings.cabinetColor]}
      4. Flooring: Subtle grid or wood texture.
      5. Do not change the geometry.

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
      - Change Cabinet Color to: ${COLOR_PROMPT_MAP[settings.cabinetColor]} (Apply to ALL cabinets including Island).
      - Change Wall Color to: ${settings.wallColor}
      - Change Countertop to: ${settings.countertop}
      
      ${commonRules}
      
      Output: Photorealistic image with identical geometry to input.
    `;
  } else {
    // === MODE 1: 3D INITIAL CONSTRUCTION FROM PDF/IMAGE ===
    prompt = `
      You are an expert Architectural Visualization AI. 
      TASK: Generate a high-quality 3D render of the kitchen shown in the input images.

      [INPUT ANALYSIS & HIERARCHY]
      You have been provided with one or more input images.
      
      **CRITICAL RULE: The LAST image in the list is the "MASTER VIEW".**
      - You MUST generate the final render from the **EXACT SAME CAMERA ANGLE** as the LAST image.
      - If the last image is a 3D Line Drawing/Sketch: You must essentially "paint over" it. Do not change the perspective. Do not move lines. Replace the sketch lines with photorealistic textures.
      - If the last image is a **2D Elevation (Front View of cabinets)**: Render it as a **Photorealistic Elevation**. Keep it flat and straight-on. Do not turn it into a perspective view.
      - If the last image is a Floor Plan: You must Extrude it into 3D from a standard eye-level perspective.
      - Any *other* images (if provided) are ONLY for reference (e.g. to see dimensions from a floor plan while rendering the sketch).

      [MULTI-VIEW CONSISTENCY - CRITICAL]
      If you are provided with a "Detail View" (e.g., a close-up of an island, specific cabinet run, or hood) AND a "Master View" (Full Kitchen):
      - You MUST Update the Master View to match the specific design details found in the Detail View.
      - **Example**: If the Master View shows a generic island, but the Detail View shows an island with a Microwave Drawer and 3 Drawers, you MUST render the Master View island with that exact Microwave and Drawer configuration.
      - **Trust the Detail View** for specific furniture configurations over the generic Master View sketch.

      [TRANSFORMATION LOGIC - "THE PIXEL-PERFECT TEXTURE OVERLAY"]
      You are NOT a creative artist. You are a "Texture Mapping Engine".
      
      **TASK**:
      1. Take the input line drawing (the Last Image).
      2. Keep EVERY SINGLE LINE exactly where it is.
      3. Simply "fill" the areas between lines with photorealistic textures.
      
      **STRICT CONSTRAINTS**:
      - **DO NOT RE-DRAW THE CABINETS.**
      - If the drawing shows 3 drawers, YOU MUST RENDER 3 DRAWERS.
      - If the drawing shows a Microwave opening, YOU MUST RENDER A MICROWAVE OPENING in that exact spot.
      - **DO NOT** straighten perspective. **DO NOT** "fix" the drawing.
      - **DO NOT** add handles if they aren't there.
      - **DO NOT** change the number of panels.
      
      **ISLAND MATCHING RULE**:
      - Look at the "Detail View" (if provided).
      - Count the drawers. Count the doors. Note the position of appliances.
      - The Final Render MUST have the EXACT SAME count of drawers/doors/appliances.
      - **If the render does not match the drawing line-for-line, you have FAILED.**

      [NO HALLUCINATIONS / NO ADD-ONS]
      - **ABSOLUTELY NO DECORATIONS** (No fruit, no plants, no vases).
      - Render the kitchen **EMPTY**.

      [STRICT MATERIAL SPECS]
      1. **CABINET COLOR**: ${COLOR_PROMPT_MAP[settings.cabinetColor]} (Apply to ALL cabinets unless island is noted otherwise).
      2. **COUNTERTOPS**: ${settings.countertop} (Must look like real stone/quartz with reflections).
      3. **DOOR STYLE**: ${doorDescription}.
      4. **WALLS**: ${settings.wallColor}.

      Output: A single high-quality photorealistic image that perfectly matches the perspective of the last input image.
      5. **FLOOR**: Hardwood or Tile (Photorealistic texture).

      [COMMON MISTAKES TO AVOID]
      - Do NOT return a "colored sketch". It must be a PHOTO.
      - Do NOT leave black wireframe lines visible.
      - Do NOT change the camera angle.

      Output: A Photorealistic 3D Render matching the drawing's geometry exactly.
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
        // Increased temperature slightly to allow for better texture/lighting synthesis while keeping geometry strict
        temperature: 0.35, 
        imageConfig: {
            aspectRatio: '4:3',
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        ],
      },
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content.parts;
      
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