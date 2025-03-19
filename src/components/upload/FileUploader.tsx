import React, { useState, useRef } from "react";
import { toast } from "sonner";
import { Upload, X, FileArchive, FileText, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  onFileProcessed: (content: string) => void;
  className?: string;
}

type UploadStatus = "idle" | "uploading" | "processing" | "error" | "success";
type ProcessStep = "uploading" | "validating" | "extracting" | "analyzing";

const FileUploader: React.FC<FileUploaderProps> = ({ onFileProcessed, className }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<ProcessStep>("uploading");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCompressedFile = (file: File): boolean => {
    const compressedExtensions = [".zip", ".tar", ".gz", ".7z", ".rar"];
    return compressedExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
  };

  const isLogFile = (fileName: string): boolean => {
    const logExtensions = [".log", ".txt"];
    return logExtensions.some(ext => 
      fileName.toLowerCase().endsWith(ext)
    );
  };

  const resetUpload = () => {
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setCurrentStep("uploading");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const processLogFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      
      reader.onerror = () => {
        reject(new Error("Error reading file"));
      };
      
      reader.readAsText(file);
    });
  };

  const simulateFileProcessing = async (file: File) => {
    try {
      setStatus("uploading");
      setCurrentStep("uploading");
      
      // Simulate upload progress
      for (let i = 0; i <= 100; i += 5) {
        setProgress(i);
        await new Promise(r => setTimeout(r, 50));
      }
      
      setCurrentStep("validating");
      await new Promise(r => setTimeout(r, 500));
      
      // Check if file is a compressed archive
      if (!isCompressedFile(file) && !isLogFile(file.name)) {
        throw new Error("Please upload a log file (.log/.txt) or a compressed archive");
      }
      
      if (isCompressedFile(file)) {
        setCurrentStep("extracting");
        await new Promise(r => setTimeout(r, 800));
        
        // In a real app with a backend, we would extract the archive here
        // For this front-end demo, we'll just simulate it
        toast.warning("Compressed file extraction is simulated in this demo");
        throw new Error("For this demo, please upload a .log or .txt file directly");
      }
      
      setCurrentStep("analyzing");
      await new Promise(r => setTimeout(r, 700));
      
      // Actually read the file content
      const content = await processLogFile(file);
      
      // Validate that the file has the expected timestamp format
      const lines = content.split('\n');
      const hasValidTimestampFormat = lines.some(line => 
        /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{6}/.test(line)
      );
      
      if (!hasValidTimestampFormat) {
        throw new Error("The file does not contain logs with the expected timestamp format (YYYY/MM/DD HH:mm:ss.SSSSSS)");
      }
      
      setStatus("success");
      onFileProcessed(content);
      
      toast.success("File processed successfully");
    } catch (error) {
      setStatus("error");
      toast.error(error instanceof Error ? error.message : "Error processing file");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
      const droppedFile = e.dataTransfer.files[0];
      setFile(droppedFile);
      simulateFileProcessing(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      simulateFileProcessing(selectedFile);
    }
  };

  const getStepLabel = () => {
    switch (currentStep) {
      case "uploading": return "Uploading file...";
      case "validating": return "Validating file format...";
      case "extracting": return "Extracting archive...";
      case "analyzing": return "Analyzing log data...";
      default: return "Processing...";
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {status === "idle" ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-border rounded-lg p-8 
            transition-all hover:border-primary/50 hover:bg-primary/5 
            cursor-pointer text-center flex flex-col items-center"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            onChange={handleFileChange}
            className="hidden"
            ref={fileInputRef}
            accept=".log,.txt,.zip,.tar,.gz,.7z,.rar"
          />
          <div className="w-16 h-16 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium mb-2">Upload your log file</h3>
          <p className="text-muted-foreground mb-4 text-sm max-w-md mx-auto">
            Drag & drop your .log/.txt file or compressed archive (.zip, .tar, .gz, etc.)
          </p>
          <Button variant="outline" size="sm" className="group">
            <Upload className="mr-2 h-4 w-4 group-hover:translate-y-[-2px] transition-transform" />
            Select File
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-6 animate-scale-in">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              {isCompressedFile(file!) ? (
                <FileArchive className="h-8 w-8 text-primary" />
              ) : (
                <FileText className="h-8 w-8 text-primary" />
              )}
              <div className="overflow-hidden">
                <p className="font-medium truncate max-w-[200px] sm:max-w-[300px]">
                  {file?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(file?.size ? (file.size / 1024).toFixed(1) : "0") + " KB"}
                </p>
              </div>
            </div>
            {status !== "uploading" && status !== "processing" && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={resetUpload}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm mb-1">
              <span>{getStepLabel()}</span>
              {status === "uploading" && <span>{progress}%</span>}
            </div>
            <div className="relative">
              <Progress value={progress} className="h-2" />
            </div>
            
            {(status === "uploading" || status === "processing") && (
              <div className="flex justify-center pt-2">
                <LoaderCircle className="h-5 w-5 text-muted-foreground animate-spin" />
              </div>
            )}
            
            {status === "error" && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={resetUpload}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
