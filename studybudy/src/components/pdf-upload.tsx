"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface PDFUploadProps {
  onUploadComplete?: (documentId: string) => void;
}

export default function PDFUpload({ onUploadComplete }: PDFUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
      console.log("File has been successfully accepted");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      if (rejection.errors[0]?.code === "file-too-large") {
        setError("File is too large. Maximum size is 50MB.");
      } else if (rejection.errors[0]?.code === "file-invalid-type") {
        setError("Invalid file type. Please upload a PDF.");
      } else {
        setError("Failed to upload file. Please try again.");
      }
    },
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setProgress(10);
      setError(null);
      console.log("Attempting to upload file");

      // Create form data
      const formData = new FormData();
      formData.append("file", selectedFile);

      // Upload file
      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload file");
      } else {
        console.log("Uploaded successfully!")
      }

      const { documentId, fileUrl } = await uploadResponse.json();
      setProgress(50);
      setUploading(false);
      setProcessing(true);

      console.log("Attempting to process PDF, chunking and embeddings");
      // Process PDF (chunking, embeddings)
      const processResponse = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, fileUrl }),
      });

      console.log("PDF successfully processed");

      if (!processResponse.ok) {
        throw new Error("Failed to process PDF");
      }

      // Stream progress updates
      const reader = processResponse.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (data.progress) {
                setProgress(50 + data.progress / 2); // 50-100%
              }
            }
          }
        }
      }

      setProgress(100);
      setProcessing(false);

      // Callback with document ID
      if (onUploadComplete) {
        onUploadComplete(documentId);
      }

      console.log("SUCCESS: Documents has been successfully processed and uploaded!!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setUploading(false);
      setProcessing(false);
      setProgress(0);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setProgress(0);
    setError(null);
  };

  const isProcessingOrUploading = uploading || processing;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {!selectedFile ? (
        <Card
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed p-12 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Upload your textbook</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {isDragActive
              ? "Drop your PDF here..."
              : "Drag & drop a PDF file here, or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground">
            Maximum file size: 50MB
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3">
              <File className="w-10 h-10 text-primary" />
              <div>
                <h3 className="font-semibold">{selectedFile.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            </div>
            {!isProcessingOrUploading && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveFile}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {isProcessingOrUploading && (
            <div className="space-y-2 mb-4">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                {uploading && "Uploading..."}
                {processing && "Processing PDF and generating embeddings..."}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
              {error}
            </div>
          )}

          {!isProcessingOrUploading && !error && (
            <Button
              onClick={handleUpload}
              className="w-full"
              size="lg"
            >
              Start Processing
            </Button>
          )}

          {isProcessingOrUploading && (
            <Button disabled className="w-full" size="lg">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}