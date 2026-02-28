import { UploadDropzone } from './UploadDropzone';

export default function UploadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-12">
      <div className="w-full max-w-[640px]">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Upload Data</h1>
        <UploadDropzone />
      </div>
    </main>
  );
}
