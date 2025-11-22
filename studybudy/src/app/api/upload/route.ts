import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { documents, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PDFParse } from 'pdf-parse';

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large PDFs

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get or create user in database
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);

    let dbUserId = user?.id;

    if (!user) {
      const [newUser] = await db
        .insert(users)
        .values({
          clerkId: userId,
          email: "", //TODO: You can get this from Clerk if needed
        })
        .returning();
      dbUserId = newUser.id;
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF files are allowed." },
        { status: 400 }
      );
    }

    // Validate file size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 }
      );
    }

    // Extract PDF metadata
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parser = new PDFParse({ data: buffer });
    const pdfData = await parser.getInfo({ parsePageInfo: true });
    
    // NOTE: The documentation recommends calling destroy() when done.
    await parser.destroy();

    // Upload to Vercel Blob (or your preferred storage)
    const blob = await put(file.name, buffer, {
      access: "public",
      contentType: "application/pdf",
    });

    // Create document record
    const [document] = await db
      .insert(documents)
      .values({
        userId: dbUserId!,
        title: file.name.replace(".pdf", ""),
        fileName: file.name,
        fileUrl: blob.url,
        pageCount: pdfData.total,
        isProcessed: false,
        metadata: {
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          info: pdfData.info,
        },
      })
      .returning();

    return NextResponse.json({
      documentId: document.id,
      fileUrl: blob.url,
      pageCount: pdfData.total,
      title: document.title,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}