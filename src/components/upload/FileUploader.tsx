
import React, { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, File, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import JSZip from "jszip";
import * as pako from "pako";
import { LZMA } from "lzma";

interface FileUploaderProps {
  onFileProcessed: (content: string) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileProcessed }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<"uploading" | "decompressing" | "processing" | "complete">("uploading");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isValidFileType = (fileName: string): boolean => {
    const supportedExtensions = [".log", ".txt", ".zip", ".gz", ".7z"];
    return supportedExtensions.some(ext => 
      fileName.toLowerCase().endsWith(ext)
    );
  };

  const readAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const readAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const decompressZip = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await readAsArrayBuffer(file);
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(arrayBuffer);
      
      // Find the first .log or .txt file in the zip
      const logFiles = Object.keys(zipContents.files).filter(
        filename => filename.endsWith('.log') || filename.endsWith('.txt')
      );
      
      if (logFiles.length === 0) {
        throw new Error("No log files found in the ZIP archive");
      }
      
      // Use the first log file found
      const logFile = zipContents.files[logFiles[0]];
      const content = await logFile.async("string");
      
      return content;
    } catch (error) {
      console.error("Failed to decompress ZIP file:", error);
      throw new Error("Failed to extract log file from the ZIP archive. It may be corrupted or not a valid ZIP file.");
    }
  };

  const decompressGzip = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await readAsArrayBuffer(file);
      const compressed = new Uint8Array(arrayBuffer);
      const decompressed = pako.ungzip(compressed);
      
      // Convert Uint8Array to string
      const textDecoder = new TextDecoder('utf-8');
      return textDecoder.decode(decompressed);
    } catch (error) {
      console.error("Failed to decompress GZIP file:", error);
      throw new Error("Failed to decompress GZIP file. It may be corrupted or not a valid GZIP file.");
    }
  };

  const decompress7z = async (file: File): Promise<string> => {
    try {
      const arrayBuffer = await readAsArrayBuffer(file);
      const content = await new Promise<string>((resolve, reject) => {
        LZMA.decompress(new Uint8Array(arrayBuffer), 
          (result, error) => {
            if (error) {
              reject(new Error("Failed to decompress 7z file"));
            } else {
              resolve(result);
            }
          },
          (progress) => {
            // Update progress during decompression
            setProgress(Math.round(progress * 100));
          }
        );
      });
      
      return content;
    } catch (error) {
      console.error("Failed to decompress 7z file:", error);
      toast.error("Failed to process 7z file. It may be corrupted or in an unsupported format.");
      throw new Error("Failed to extract log file from the 7z archive. It may be corrupted or not a valid 7z file.");
    }
  };

  const processLogFile = async (file: File): Promise<string> => {
    setCurrentStep("decompressing");

    let content = "";
    const fileName = file.name.toLowerCase();

    try {
      if (fileName.endsWith('.gz')) {
        content = await decompressGzip(file);
      } else if (fileName.endsWith('.zip')) {
        content = await decompressZip(file);
      } else if (fileName.endsWith('.7z')) {
        content = await decompress7z(file);
      } else {
        // Regular .log or .txt file
        content = await readAsText(file);
      }
      
      return content;
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error(error instanceof Error ? error.message : "Failed to process file");
      throw error;
    }
  };

  const processFile = async (file: File) => {
    if (!isValidFileType(file.name)) {
      toast.error("Invalid file type. Please upload a .log, .txt, .zip, .gz, or .7z file");
      return;
    }

    try {
      setIsUploading(true);
      setFileName(file.name);
      setFileSize(file.size);
      setProgress(0);
      setCurrentStep("uploading");

      // Simulate upload progress - this would be real progress in a production app
      const uploadInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(uploadInterval);
            return 100;
          }
          return prev + 5;
        });
      }, 50);

      // Give UI time to show the upload animation
      await new Promise(resolve => setTimeout(resolve, 1000));
      clearInterval(uploadInterval);
      
      setProgress(0);
      const content = await processLogFile(file);

      setCurrentStep("processing");
      // Simulate processing delay - this gives users feedback that work is happening
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setCurrentStep("complete");
      onFileProcessed(content);
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Failed to process file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  }, [processFile]);

  const handleButtonClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  if (isUploading) {
    return (
      <div className="p-6 border border-border/60 rounded-lg">
        <div className="mb-4">
          <div className="flex items-center mb-2">
            <File className="mr-2 h-4 w-4 text-primary" />
            <span className="font-medium">{fileName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({(fileSize / 1024).toFixed(1)} KB)
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="mt-2 text-xs text-muted-foreground">
            {currentStep === "uploading" && "Uploading file..."}
            {currentStep === "decompressing" && "Decompressing file..."}
            {currentStep === "processing" && "Processing data..."}
            {currentStep === "complete" && (
              <span className="flex items-center text-primary">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer text-center",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/50"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleButtonClick}
    >
      <div>
        <Input
          type="file"
          onChange={handleFileChange}
          className="hidden"
          ref={fileInputRef}
          accept=".log,.txt,.zip,.gz,.7z"
        />
        <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-2">Upload your log file</h3>
        <p className="text-muted-foreground mb-4 text-sm max-w-md mx-auto">
          Drag & drop your .log, .txt, .zip, .gz, or .7z file
        </p>
        <Button variant="outline" size="sm" className="group">
          <Upload className="mr-2 h-4 w-4 group-hover:translate-y-[-2px] transition-transform" />
          Browse Files
        </Button>
      </div>
    </div>
  );
};

export default FileUploader;
