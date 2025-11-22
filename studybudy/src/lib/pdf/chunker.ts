import { PDFParse } from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";


export interface ChunckMetadata {
    pageNumber?: number;
    section?: string;
    chapterTitle?: string;
}

export interface Chunk {
    content: string;
    metadata: ChunckMetadata;
}

// Fetching and parse PDF from URL.
async function fetchAndParsePDF(fileUrl: string) {
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parser = new PDFParse({ data: buffer });
    const pdfData = await parser.getInfo({ parsePageInfo: true });
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