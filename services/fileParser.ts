
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
   * This allows the user to select which specific view (page) they want to render.
   */
  async pdfToImages(file: File): Promise<string[]> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const MAX_PAGES = Math.min(pdf.numPages, 5); // Limit to first 5 pages
      const images: string[] = [];

      for (let i = 1; i <= MAX_PAGES; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // High quality
        
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

        images.push(canvas.toDataURL('image/png'));
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
