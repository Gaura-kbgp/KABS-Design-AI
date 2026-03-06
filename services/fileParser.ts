
// Declare global variables loaded via CDN in index.html
declare const window: any;

export const fileParser = {
  /**
   * Extracts text from all pages of a PDF.
   * This allows the AI to "read" cabinet codes and notes.
   */
  async pdfToText(file: File): Promise<string> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        fullText += `[PAGE ${i}]: ${pageText}\n`;
      }
      return fullText;
    } catch (e) {
      console.error("PDF Parse Error", e);
      return "Error reading PDF text. Please ensure it is a valid PDF.";
    }
  },

  /**
   * Converts PDF pages to an array of images.
   * SMART MODE: Scans text first to identify relevant pages (Perspectives, Elevations).
   */
  async pdfToImages(file: File): Promise<string[]> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const images: string[] = [];
      const MAX_OUTPUT_IMAGES = 12; // Limit payload to Gemini
      const SCAN_LIMIT = Math.min(pdf.numPages, 30); // Scan first 30 pages for keywords

      const perspectivePages: number[] = [];
      const elevationPages: number[] = [];
      const otherPages: number[] = [];
      
      // Always include Page 1 (Cover) and Page 2 (Floor Plan/Notes)
      // But classify them appropriately
      const checkPage = async (i: number) => {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item: any) => item.str).join(' ').toLowerCase();

        if (text.includes('perspective') || text.includes('3d')) {
           perspectivePages.push(i);
        } else if (text.includes('elevation') || text.includes('view')) {
           elevationPages.push(i);
        } else {
           otherPages.push(i);
        }
      };

      // Scan first 30 pages
      for (let i = 1; i <= SCAN_LIMIT; i++) {
         await checkPage(i);
      }

      // Priority Sort: Perspectives FIRST, then Elevations, then others (Plans/Notes)
      // This ensures the AI sees the 3D Sketch immediately as the primary visual anchor.
      const finalIndices = [...perspectivePages, ...elevationPages, ...otherPages]
        .filter((value, index, self) => self.indexOf(value) === index) // Unique
        .slice(0, MAX_OUTPUT_IMAGES);

      console.log("Smart Parser Priority Order:", finalIndices);

      for (const i of finalIndices) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // Reduced scale slightly for performance
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        // Fill white background
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Use JPEG 0.8 to reduce payload size significantly (vs PNG)
        images.push(canvas.toDataURL('image/jpeg', 0.8));
      }

      return images;
    } catch (e) {
      console.error("PDF to Images Error", e);
      throw new Error("Failed to convert PDF pages to images.");
    }
  },

  /**
   * Parses Excel file to a structured string (CSV-like or JSON-like)
   * for the AI to understand pricing and catalog data.
   */
  async excelToString(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = window.XLSX.read(data, { type: 'array' });
          
          let result = '';
          workbook.SheetNames.forEach((sheetName: string) => {
            const worksheet = workbook.Sheets[sheetName];
            const json = window.XLSX.utils.sheet_to_json(worksheet);
            result += `[SHEET: ${sheetName}]\n${JSON.stringify(json, null, 2)}\n`;
          });
          
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }
};
