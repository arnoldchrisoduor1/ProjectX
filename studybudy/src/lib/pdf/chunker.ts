import { PDFParse } from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// import path from "path";
// import process from "process";
// import { pathToFileURL } from "url";
// import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// const workerPathAbsolute = path.join(
//   process.cwd(), 
//   'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
// );

// GlobalWorkerOptions.workerSrc = pathToFileURL(workerPathAbsolute).toString();

export interface ChunckMetadata {
    pageNumber?: number;
    section?: string;
    chapterTitle?: string;
}

export interface Chunk {
    content: string;
    metadata: ChunckMetadata;
}

// Define the expected return type
export interface PdfParseResult {
    text: string;
    numpages?: number; 
    info: any;
}

// Fetching and parse PDF from URL.
async function fetchAndParsePDF(fileUrl: string): Promise<PdfParseResult> {
    const url = new URL(fileUrl); // creating url object from the string.
    const pathname = url.pathname;
    const safepath = encodeURI(decodeURI(pathname));
    const safeFileUrl = url.origin + safepath;

    const response = await fetch(safeFileUrl);
    if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`Download Buffer Size: ${buffer.length} bytes`);

    if (buffer.length < 100) {
         throw new Error("Downloaded file is too small or empty.");
    }
    
    // Instantiate the parser
    const parser = new PDFParse({ data: buffer });

    const pdfResult = await parser.promise;

    // Ensure the result has the properties we need
    if (!pdfResult || typeof pdfResult.text !== 'string') {
        throw new Error("PDF parsing failed to extract text.");
    }
    
    // Return the full result object
    return {
        text: pdfResult.text,
        numpages: pdfResult.numpages,
        info: pdfResult.info,
    };
}

// EXTRACTING THE CHAPTER/SECTION STRUCTURE FROM TEXT
function extractStructure(text: string): { sections: Array<{ title: string; start: number; end: number }> } {
  const sections: Array<{ title: string; start: number; end: number }> = [];
  
  // Common patterns for chapters/sections
  const patterns = [
    /^Chapter\s+\d+[:\s]+(.+)$/gim,
    /^Section\s+\d+[:\s]+(.+)$/gim,
    /^\d+\.\s+(.+)$/gm,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];
      
      sections.push({
        title: match[1].trim(),
        start: match.index || 0,
        end: nextMatch?.index || text.length,
      });
    }
    
    if (sections.length > 0) break; // Use first pattern that matches
  }

  return { sections };
}

// MAIN FUNCTION PROCESSING AND CREATING CHUNKS.
export async function processAndChunkPDF(fileUrl: string): Promise<Chunk[]> {
  // 1. Parse PDF
  const pdfData = await fetchAndParsePDF(fileUrl);
  const fullText = pdfData.text;

  console.log("The full text: ", fullText);

  // 2. Extract structure (chapters, sections)
  const { sections } = extractStructure(fullText);

  // 3. Create text splitter
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, // ~750 words
    chunkOverlap: 200, // Overlap to maintain context
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  // 4. Split text into chunks
  const textChunks = await splitter.createDocuments([fullText]);

  // 5. Add metadata to chunks
  const chunks: Chunk[] = textChunks.map((chunk: any, index:any) => {
    const chunkStart = fullText.indexOf(chunk.pageContent);
    
    // Find which section this chunk belongs to
    const section = sections.find(
      (s) => chunkStart >= s.start && chunkStart < s.end
    );

    // Estimate page number (rough calculation)
    const charsPerPage = 2000; // Average characters per page
    const estimatedPage = Math.floor(chunkStart / charsPerPage) + 1;

    return {
      content: chunk.pageContent,
      metadata: {
        pageNumber: estimatedPage,
        section: section?.title,
      },
    };
  });

  return chunks;
}


// FUNCTION THAT WILL PROCESS PDF BY PAGES.
export async function processAndChunkByPages(fileUrl: string): Promise<Chunk[]> {
  const pdfData = await fetchAndParsePDF(fileUrl);
  const fullText = pdfData.text;
  
  // This is simplified - you'd need a PDF library that extracts text per page
  // For now, we'll estimate page breaks
  const avgCharsPerPage = 2000;
  const chunks: Chunk[] = [];
  
  for (let i = 0; i < fullText.length; i += avgCharsPerPage) {
    const pageText = fullText.slice(i, i + avgCharsPerPage);
    const pageNumber = Math.floor(i / avgCharsPerPage) + 1;
    
    // Further split if page is too large
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const pageChunks = await splitter.createDocuments([pageText]);
    
    pageChunks.forEach((chunk: any) => {
      chunks.push({
        content: chunk.pageContent,
        metadata: {
          pageNumber,
        },
      });
    });
  }
  
  return chunks;
}