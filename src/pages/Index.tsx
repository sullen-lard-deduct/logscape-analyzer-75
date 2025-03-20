
import React, { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { FileText, Wand, RefreshCcw } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import FileUploader from "@/components/upload/FileUploader";
import RegexManager, { RegexPattern } from "@/components/regex/RegexManager";
import LogChart from "@/components/charts/LogChart";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [logContent, setLogContent] = useState<string>("");
  const [selectedPatterns, setSelectedPatterns] = useState<RegexPattern[]>([]);
  const [activeTab, setActiveTab] = useState<string>("upload");
  const [isLoaded, setIsLoaded] = useState(false);

  // Mark component as loaded after initial render
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleFileProcessed = useCallback((content: string) => {
    // Reset state when a new file is uploaded
    setLogContent(content);
    setSelectedPatterns([]);
    setActiveTab("patterns");
    toast.success("Log file successfully processed");
  }, []);

  const handleApplyPattern = useCallback((patterns: RegexPattern[]) => {
    setSelectedPatterns(patterns);
    setActiveTab("analysis");
  }, []);

  const handleResetAll = useCallback(() => {
    setLogContent("");
    setSelectedPatterns([]);
    setActiveTab("upload");
    toast.success("All data has been reset");
  }, []);

  // If the component hasn't loaded yet, return an empty div to prevent flash of content
  if (!isLoaded) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <AppLayout>
      <div className="mb-8 text-center max-w-3xl mx-auto">
        <div className="inline-block mb-4 relative">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Wand className="h-4 w-4 text-accent" />
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">LogVision</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Analyze and visualize your log files with ease. Upload logs, define patterns, and gain insights through interactive visualizations.
        </p>
        <div className="mt-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleResetAll}
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Reset All
          </Button>
        </div>
      </div>

      <Tabs defaultValue="upload" value={activeTab} onValueChange={setActiveTab} className="space-y-8">
        <div className="flex justify-center">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="upload" className="relative">
              <span className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground">
                1
              </span>
              Upload
            </TabsTrigger>
            <TabsTrigger value="patterns" className="relative" disabled={!logContent}>
              <span className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground">
                2
              </span>
              Patterns
            </TabsTrigger>
            <TabsTrigger value="analysis" className="relative" disabled={selectedPatterns.length === 0}>
              <span className="absolute -left-1 -top-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] text-primary-foreground">
                3
              </span>
              Analysis
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="upload" className="animate-slide-up">
          <Card className="mx-auto max-w-3xl shadow-sm border-border/50">
            <CardHeader>
              <CardTitle>Upload Log File</CardTitle>
              <CardDescription>
                Upload a log file (.log, .txt, .zip, or .gz) to analyze patterns and visualize data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUploader onFileProcessed={handleFileProcessed} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="patterns" className="animate-slide-up">
          <div className="grid grid-cols-1 gap-8">
            <RegexManager 
              onApplyPattern={handleApplyPattern}
              logSample={logContent} 
            />

            <div className="flex justify-center">
              <Button 
                onClick={() => setActiveTab("upload")}
                variant="outline"
                className="mr-2"
              >
                Back to Upload
              </Button>
              <Button 
                onClick={() => setActiveTab("analysis")}
                disabled={selectedPatterns.length === 0}
              >
                Proceed to Analysis
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="animate-slide-up">
          <LogChart
            logContent={logContent}
            patterns={selectedPatterns}
          />
          
          <div className="flex justify-center mt-8">
            <Button 
              onClick={() => setActiveTab("patterns")}
              variant="outline"
            >
              Back to Patterns
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Index;
