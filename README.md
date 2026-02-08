<div align="center">
  <img width="1200" height="475" alt="KABS Design AI" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# KABS Design AI

KABS Design AI is a professional architectural visualization tool that transforms technical 2D/3D kitchen drawings (PDFs) into photorealistic renders. It utilizes Google's Gemini 1.5 Flash multimodal AI to "see" and understand technical sketches, applying realistic textures and lighting while strictly adhering to the original geometry.

## 🚀 Features

- **Smart PDF Parsing**: Converts multi-page PDF technical drawings into high-resolution images.
- **Multi-View Context**: Allows users to select multiple pages (e.g., floor plans + 3D perspectives).
- **Master View Logic**: The last selected image acts as the "Camera Angle," while previous images provide spatial context.
- **Geometry Lock**: Uses a "Tracing Protocol" to ensure the AI renders *exactly* what is drawn, without hallucinating extra furniture or decorations.
- **Photorealistic Rendering**: Transforms line drawings into "Real Life" photos based on selected styles (Modern, Traditional, etc.) and color palettes.

---

## 📂 Code Structure & File Details

### Core Application
- **[`App.tsx`](file:///App.tsx)**: The main entry point and state manager.
  - Manages the "Master View" selection logic (last selected image = camera view).
  - Handles the floating toolbar for "Update Render" and "Back to Input".
  - Coordinates the flow between file upload, page selection, and rendering.

### Services (The Brains)
- **[`services/geminiService.ts`](file:///services/geminiService.ts)**: The AI Engine.
  - Communicates with Google's Gemini 1.5 Flash API.
  - Contains the **System Prompt** with "Tracing Protocols" and "No Hallucination" rules.
  - Implements the logic to prioritize "Detail Views" (e.g., island sketches) over generic master views for specific cabinetry details.
- **[`services/fileParser.ts`](file:///services/fileParser.ts)**: The Vision System.
  - Uses `pdf.js` to render PDF pages into Base64 images.
  - Ensures high-quality input for the AI to recognize faint lines and text labels.

### Components (UI)
- **[`components/Sidebar.tsx`](file:///components/Sidebar.tsx)**: Design Controls.
  - Allows users to select Design Styles (Modern, Industrial, etc.) and Color Palettes.
  - Simplified to focus purely on aesthetics.
- **[`components/UploadZone.tsx`](file:///components/UploadZone.tsx)**: Input Interface.
  - Handles PDF drag-and-drop functionality.

### Configuration
- **[`vite.config.ts`](file:///vite.config.ts)**: Build configuration.
  - Configured to inject environment variables (`process.env`) for secure API key handling.

---

## 🛠️ Local Development

**Prerequisites:** Node.js (v18+ recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Gaura-kbgp/KABS-Design-AI.git
   cd kabs-design-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   - Create a `.env` file in the root directory.
   - Add your Gemini API Key:
     ```env
     GEMINI_API_KEY=your_google_gemini_api_key_here
     ```

4. **Run the app:**
   ```bash
   npm run dev
   ```

---

## 🌍 Deployment Process

This project is built with **Vite** and can be easily deployed to platforms like Vercel, Netlify, or Cloudflare Pages.

### Deploy to Vercel (Recommended)

1. **Push your code to GitHub.**
2. **Import project into Vercel:**
   - Go to the Vercel Dashboard and click "Add New Project".
   - Select your `KABS-Design-AI` repository.
3. **Configure Build Settings:**
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Set Environment Variables:**
   - In the "Environment Variables" section, add:
     - Key: `GEMINI_API_KEY`
     - Value: `your_actual_api_key`
5. **Deploy:**
   - Click "Deploy". Vercel will build the project and provide a live URL.

### Manual Build
To create a production build locally:

```bash
npm run build
```
The output will be in the `dist/` folder, which can be served by any static file server.
