
import React, { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, File, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  readAsText, 
  decompressZip, 
  decompressGzip, 
  isValidFileType 
} from "@/utils/fileHandlers";

interface FileUploaderProps {
  onFileProcessed: (content: string) => void;
}

const FileUploader: React.FC<FileUploaderProps> = ({ onFileProcessed }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<"uploading" | "decompressing" | "processing" | "complete" | "error">("uploading");
  const [fileName, setFileName] = useState<string>("");
  const [fileSize, setFileSize] = useState<number>(0);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processLogFile = async (file: File): Promise<string> => {
    const fileName = file.name.toLowerCase();
    let content = "";

    try {
      if (fileName.endsWith('.gz')) {
        setCurrentStep("decompressing");
        setProgress(10);
        content = await decompressGzip(file);
      } else if (fileName.endsWith('.zip')) {
        setCurrentStep("decompressing");
        setProgress(10);
        content = await decompressZip(file);
      } else if (fileName.endsWith('.7z')) {
        // For now, we'll show a friendly message about 7z support
        toast.error("7z file support is temporarily unavailable. Please use .zip, .gz, .log, or .txt files instead.");
        setCurrentStep("error");
        throw new Error("7z support temporarily unavailable");
      } else {
        // Regular .log or .txt file - Just read without decompressing
        setCurrentStep("processing");
        setProgress(40);
        content = await readAsText(file);
      }
      
      setProgress(70);
      return content;
    } catch (error) {
      console.error("Error processing file:", error);
      setCurrentStep("error");
      toast.error(error instanceof Error ? error.message : "Failed to process file");
      throw error;
    }
  };

  const processFile = async (file: File) => {
    if (!isValidFileType(file.name) && !file.name.toLowerCase().endsWith('.7z')) {
      toast.error("Invalid file type. Please upload a .log, .txt, .zip, or .gz file");
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
          return Math.min(prev + 5, 30); // Cap at 30% for upload phase
        });
      }, 50);

      // Give UI time to show the upload animation
      await new Promise(resolve => setTimeout(resolve, 800));
      clearInterval(uploadInterval);
      
      // Handle 7z files with a friendly message
      if (file.name.toLowerCase().endsWith('.7z')) {
        toast.error("7z file support is temporarily unavailable. Please use .zip, .gz, .log, or .txt files instead.");
        setIsUploading(false);
        setCurrentStep("error");
        return;
      }
      
      const content = await processLogFile(file);

      setCurrentStep("processing");
      setProgress(80);
      
      // Simulate processing delay - this gives users feedback that work is happening
      await new Promise(resolve => setTimeout(resolve, 500));
      setProgress(100);
      
      setCurrentStep("complete");
      onFileProcessed(content);
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Failed to process file. Please try again with a different format.");
      setCurrentStep("error");
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
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  }, []);

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
            {currentStep === "error" && (
              <span className="flex items-center text-destructive">
                <AlertCircle className="mr-1 h-3 w-3" /> Error processing file
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
          accept=".log,.txt,.zip,.gz"
        />
        <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium mb-2">Upload your log file</h3>
        <p className="text-muted-foreground mb-4 text-sm max-w-md mx-auto">
          Drag & drop your .log, .txt, .zip, or .gz file
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
