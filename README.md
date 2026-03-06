# KABS Design AI - Deployment & Developer Guide

## 1. Project Overview
**KABS Design AI** is a specialized Sketch-to-Render engine designed to convert technical kitchen blueprints (PDF/Images) into photorealistic 3D visualizations. It is built with **React/Vite** and powered by **Google Gemini 2.5 Flash Image** model.

### Key Capabilities
- **Smart PDF Scanning**: Analyzes up to 30 pages of a PDF to identify the best 3D perspective view.
- **Single-View Synthesis**: Merges details from multiple pages (e.g., Island Detail + Wall Elevation) into a single coherent scene.
- **Deterministic Rendering**: Hashing algorithm ensures that re-uploading the same file produces the exact same geometry (100% consistency).
- **ControlNet-Style Coloring**: "Paints" over the original lines rather than generating a new scene from scratch, ensuring architectural fidelity.
- **Shape-Aware Camera**: Automatically adjusts camera rules for U-Shape (Long Distance), L-Shape (Opposite Corner), and Galley kitchens.

---

## 2. Deployment Instructions

### Prerequisites
- Node.js (v18 or higher)
- Google Cloud Project with **Gemini API Key** enabled.

### Steps to Deploy
1.  **Clone Repository**
    ```bash
    git clone <repository-url>
    cd kabs-design-ai
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory:
    ```env
    VITE_API_KEY=your_google_gemini_api_key_here
    ```

4.  **Production Build**
    ```bash
    npm run build
    ```
    This will generate a `dist/` folder containing the static assets.

5.  **Hosting**
    You can deploy the `dist/` folder to any static hosting service:
    - **Vercel**: `vercel deploy`
    - **Netlify**: Drag and drop `dist` folder.
    - **AWS S3 / CloudFront**: Upload contents of `dist`.

---

## 3. Codebase Structure

### `/src`
- **`App.tsx`**: Main application logic. Handles file uploads, state management, and the deterministic rendering workflow.
- **`services/`**
  - **`geminiService.ts`**: The core AI logic. Contains the complex prompt engineering (Phases 1-6), negative prompts, and API interaction.
  - **`fileParser.ts`**: Handles PDF processing. Uses `pdfjs-dist` to convert pages to images and extract text.
- **`components/`**
  - **`Sidebar.tsx`**: UI for selecting cabinet colors, door styles, and materials.
  - **`UploadZone.tsx`**: Drag-and-drop file interface.
- **`types.ts`**: TypeScript definitions for Design Settings and Render States.

---

## 4. Key Algorithms

### Deterministic Seeding (`App.tsx`)
To ensure consistency, we generate a seed based on the file's metadata:
```typescript
const generateSeedFromFile = (file: File): number => {
  const str = `${file.name}-${file.size}-${file.lastModified}`;
  // ... hash logic ...
  return Math.abs(hash);
};
```

### Intelligent View Selection (`geminiService.ts`)
The AI is instructed to scan all input images and prioritize them based on keywords ("Perspective", "3D") and visual content (Wide Angle vs. Detail View).

### Refinement vs. Fresh Generation
- **Initial Render**: Uses the PDF inputs + Seed.
- **Sidebar Updates**: Uses the *Generated Image* as input (Image-to-Image) to swap colors without changing geometry.
- **"Update Render" Button**: Forces a fresh generation from PDF using the same seed (useful for resetting artifacts).

---

## 5. Troubleshooting

- **"Split Screen" Output**: If the AI generates two images side-by-side, check `geminiService.ts` Negative Prompts. The current prompt explicitly forbids "SPLIT SCREEN" and "COLLAGE".
- **Missing Cabinets**: Ensure the PDF contains a clear 3D view. 2D-only floor plans are harder to visualize in 3D without a reference sketch.
- **API Errors**: Check the Browser Console. If you see `400 Bad Request`, the payload might be too large (too many pages). The `fileParser.ts` limits scanning to 30 pages to prevent this.
