import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { documents, documentChunks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processAndChunkPDF } from "@/lib/pdf/chunker";
import { generateEmbeddings, storeToPinecone } from "@/lib/vectordb/pinecone";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

//   CREATEING SSE READABLE STREAM
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { userId } = auth();
        if (!userId) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Unauthorized" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const body = await request.json();
        const { documentId, fileUrl } = body;

        // VERIFYING USER OWNS THIS
        const [document] = await db
          .select()
          .from(documents)
          .where(eq(documents.id, documentId))
          .limit(1);

        if (!document) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Document not found" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Send progress: Starti
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 0, message: "Starting PDF processing..." })}\n\n`
          )
        );

        // Step 1: Extract and chunk PDF text
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 10, message: "Extracting text from PDF..." })}\n\n`
          )
        );

        const chunks = await processAndChunkPDF(fileUrl);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 30, message: `Created ${chunks.length} chunks` })}\n\n`
          )
        );

        // Step 2: Generate embeddings
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 40, message: "Generating embeddings..." })}\n\n`
          )
        );

        const embeddings = await generateEmbeddings(
          chunks.map((c) => c.content)
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 60, message: "Storing embeddings..." })}\n\n`
          )
        );

        // Step 3: Store in Pinecone
        const vectorIds = await storeToPinecone(
          embeddings,
          chunks,
          documentId
        );

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 80, message: "Saving to database..." })}\n\n`
          )
        );

        // Step 4: Store chunks in database
        const chunkRecords = chunks.map((chunk, index) => ({
          documentId,
          chunkIndex: index,
          content: chunk.content,
          embeddingId: vectorIds[index],
          metadata: {
            pageNumber: chunk.metadata.pageNumber,
            section: chunk.metadata.section,
          },
        }));

        await db.insert(documentChunks).values(chunkRecords);

        // Mark document as processed
        await db
          .update(documents)
          .set({ isProcessed: true })
          .where(eq(documents.id, documentId));

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ progress: 100, message: "Processing complete!", complete: true })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        console.error("Processing error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Failed to process PDF" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}