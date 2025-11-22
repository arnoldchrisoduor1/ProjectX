import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { Chunck } from "@/lib/pdf/chunker";

// Now initializing the pinecone.
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!,
});

// initializing open ai for embeddings.
const openai = new OpenAI({
    apiKey: process.env.OPEN_API_KEY!,
});

const indexName = process.env.PINECONE_INDEX_NAME || "study-budy";

// GETTING OT CREATING THE PINECONE INDEX.
async function getIndex() {
    try {
        // first checking if the indices exist.
        const indexes = await pinecone.listIndexes();
        const indexExists = indexes.indexes?.some((idx) => idx.name == indexName);

        if (!indexExists) {
            await pinecone.createIndex({
                name: indexName,
                dimension: 1536,
                metric: "cosine",
                spec: {
                    serverless: {
                        cloud: "aws",
                        region: "us-east-1",
                    },
                },
            });
            await new Promise((resolve) => setTimeout(resolve, 60000));
        }
    return pinecone.index(indexName);
    } catch (error) {
        console.error("Error generating embeddings:", error);
        throw error;
    }
}

// NOW GENERATING EMBEDDINGS FOR TEXT CHUNKS USING OPENAI
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: texts,
        });
        return response.data.map((item) => item.embedding);
    } catch(error) {
        console.log("Error generating embeddings:", error);
        throw error;
    }
}

// Storing the embeddings in Pinecone with metadata.
export async function storeToPinecone(
    embeddings: number[][],
    chunks: Chunk[],
    documentId: string
): Promise<string[]> {
    try {
        const index = await getIndex();

        // Preparing vectors for upsert.
        const vectors = embeddings.map((embedding, i) => ({
            id: `${documentId}-chunk-${i}`,
            values: embedding,
            metadata: {
                documentId,
                chunkIndex: i,
                content: chunks[i].content,
                pageNumber: chunks[i].metadata.pageNumber,
                section: chunks[i].metadata.section || "",
            }
        }));

        // upsert in batches of 100
        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            await index.upsert(batch);
        }
        return vectors.map((v) => v.id);
    } catch (error) {
        console.error("Error storing to Pinecone");
        throw error;
    }
}

// QUERY PINECONE FOR SIMILAR CHUNKS
export async function querySimilarChunks(query: string, documentId: string, topK: number = 5) {
    try {
        const index = await getIndex();

        // generating embedding for query.
        const [queryEmbedding] = await generateEmbeddings([query]);

        // query the pinecone.
        const results = await index.query({
            vector: queryEmbedding,
            topK,
            includeMetadata: true,
            filter: {
                documentId: { $eq: documentId },
            },
        });
        return results.matches?.map((match) => ({
            id: match.id,
            score: match.score,
            content: match.metadata?.content as string,
            pageNumber: match.metadata?.pageNumber as number,
            section: match.metadata?.section as string,
        }));
    } catch (error) {
        console.error("Error querying pinecone:", error);
        throw error;
    }
}

// DELETING DOCUMENT VECTORS FROM PINECONE.
export async function deleteDocumentVectors(documentId: string) {
    try {
        const index = await getIndex();

        // delete all vectors for this document.
        await  index.deleteMany({
            filter: {
                documentId: { $eq: documentId },
            },
        });
    } catch (error) {
        console.error("Error deleting from pinecone:", error);
        throw error;
    }
}