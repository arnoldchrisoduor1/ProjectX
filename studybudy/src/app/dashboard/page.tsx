"use client";
import PDFUpload from '../../components/pdf-upload'

export default function DashboardPage() {
  return (
    <div className="container py-10">
      <h1 className="text-3xl font-bold mb-8">Upload Your Textbook</h1>
      <PDFUpload 
        onUploadComplete={(documentId) => {
          // Redirect to study page or show success
          console.log("Document ready:", documentId);
        }}
      />
    </div>
  );
}