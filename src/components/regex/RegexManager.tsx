
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { PlusCircle, Save, Trash2, Check, X, Edit, Play, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogFooter, DialogTrigger 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import PatternForm from "./PatternForm";

export interface RegexPattern {
  id: string;
  name: string;
  pattern: string;
  description?: string;
}

interface RegexManagerProps {
  onApplyPattern: (patterns: RegexPattern[]) => void;
  logSample?: string;
}

const RegexManager: React.FC<RegexManagerProps> = ({ onApplyPattern, logSample }) => {
  const [patterns, setPatterns] = useState<RegexPattern[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [newPatternOpen, setNewPatternOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<RegexPattern | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [testPattern, setTestPattern] = useState<RegexPattern | null>(null);

  // Load saved patterns from localStorage on initial render
  useEffect(() => {
    const savedPatterns = localStorage.getItem("regexPatterns");
    if (savedPatterns) {
      try {
        setPatterns(JSON.parse(savedPatterns));
      } catch (e) {
        console.error("Error loading saved patterns:", e);
      }
    } else {
      // Add some default patterns if none exist
      const defaultPatterns: RegexPattern[] = [
        {
          id: "default-cpu",
          name: "CPU Usage",
          pattern: "CPU_USAGE cpu=(\\d+)%",
          description: "Extracts CPU usage percentage"
        },
        {
          id: "default-memory",
          name: "Memory Usage",
          pattern: "MEMORY_USAGE memory=(\\d+)MB",
          description: "Extracts memory usage in MB"
        },
        {
          id: "default-http",
          name: "HTTP Status",
          pattern: "HTTP_REQUEST .* status=(\\d+) .*",
          description: "Extracts HTTP status codes"
        },
        {
          id: "default-response-time",
          name: "Response Time",
          pattern: "HTTP_REQUEST .* time=(\\d+)ms",
          description: "Extracts HTTP response time"
        }
      ];
      setPatterns(defaultPatterns);
      localStorage.setItem("regexPatterns", JSON.stringify(defaultPatterns));
    }
  }, []);

  // Save patterns to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("regexPatterns", JSON.stringify(patterns));
  }, [patterns]);

  const handleSavePattern = (name: string, pattern: string, description: string, id?: string) => {
    try {
      // Convert Python-style named capturing groups (?P<name>...) to standard capturing groups (...)
      const normalizedPattern = pattern.replace(/\(\?P<[^>]+>([^)]+)\)/g, '($1)');
      
      // Validate the regex by creating a RegExp object
      new RegExp(normalizedPattern);
      
      if (id) {
        // Update existing pattern
        setPatterns(patterns.map(p => 
          p.id === id ? { ...p, name, pattern: normalizedPattern, description } : p
        ));
        toast.success("Pattern updated successfully");
      } else {
        // Add new pattern
        const newPattern: RegexPattern = {
          id: Date.now().toString(),
          name,
          pattern: normalizedPattern,
          description
        };
        setPatterns([...patterns, newPattern]);
        toast.success("Pattern saved successfully");
      }
      setNewPatternOpen(false);
      setEditingPattern(null);
    } catch (error) {
      toast.error("Invalid regular expression. Please check your syntax.");
    }
  };

  const handleDeletePattern = (id: string) => {
    setPatterns(patterns.filter(p => p.id !== id));
    setSelectedPatterns(selectedPatterns.filter(patternId => patternId !== id));
    toast.success("Pattern deleted");
  };

  const handleApplySelected = () => {
    const patternsToApply = patterns.filter(p => selectedPatterns.includes(p.id));
    if (patternsToApply.length === 0) {
      toast.error("Please select at least one pattern");
      return;
    }
    onApplyPattern(patternsToApply);
    toast.success(`Applied ${patternsToApply.length} patterns`);
  };

  const togglePatternSelection = (id: string) => {
    if (selectedPatterns.includes(id)) {
      setSelectedPatterns(selectedPatterns.filter(patternId => patternId !== id));
    } else {
      setSelectedPatterns([...selectedPatterns, id]);
    }
  };

  const testRegexPattern = (pattern: RegexPattern) => {
    if (!logSample) {
      toast.error("No log sample available for testing");
      return;
    }

    try {
      // Convert Python-style named capturing groups if present
      const normalizedPattern = pattern.pattern.replace(/\(\?P<[^>]+>([^)]+)\)/g, '($1)');
      
      const regex = new RegExp(normalizedPattern, "g");
      const lines = logSample.split("\n");
      const results: string[] = [];

      // Process up to 10 matches for preview
      let matchCount = 0;
      for (const line of lines) {
        regex.lastIndex = 0; // Reset regex before each test
        const match = regex.exec(line);
        if (match && match[1]) {
          results.push(`${match[1]} (from: ${line.substring(0, 60)}...)`);
          matchCount++;
          if (matchCount >= 10) break;
        }
      }

      setTestResults(results.length > 0 ? results : ["No matches found"]);
      setTestPattern(pattern);
      setTestDialogOpen(true);
    } catch (error) {
      toast.error("Error testing pattern: " + (error instanceof Error ? error.message : "Invalid regex"));
    }
  };

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Regular Expression Patterns</CardTitle>
          <Dialog open={newPatternOpen} onOpenChange={setNewPatternOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-1" 
                onClick={() => setEditingPattern(null)}
              >
                <PlusCircle className="h-4 w-4" />
                <span>New Pattern</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingPattern ? "Edit Pattern" : "Create New Pattern"}
                </DialogTitle>
              </DialogHeader>
              <PatternForm 
                onSave={handleSavePattern} 
                pattern={editingPattern} 
                onCancel={() => {
                  setNewPatternOpen(false);
                  setEditingPattern(null);
                }} 
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No patterns defined yet. Create a new one to get started.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 mb-4">
              {patterns.map((pattern) => (
                <div
                  key={pattern.id}
                  className={`
                    p-3 rounded-md border transition-all
                    ${selectedPatterns.includes(pattern.id) 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border/50 hover:border-border hover:bg-secondary/50'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 w-6 p-0 rounded-full ${
                          selectedPatterns.includes(pattern.id) ? 'bg-primary text-primary-foreground' : ''
                        }`}
                        onClick={() => togglePatternSelection(pattern.id)}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                      <div>
                        <div className="font-medium text-sm">{pattern.name}</div>
                        <div className="text-xs font-mono text-muted-foreground truncate max-w-[150px] sm:max-w-[280px]">
                          {pattern.pattern}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => testRegexPattern(pattern)}
                              disabled={!logSample}
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Test pattern</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setEditingPattern(pattern);
                                setNewPatternOpen(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit pattern</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive/80"
                              onClick={() => handleDeletePattern(pattern.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete pattern</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2">
              <div className="text-sm text-muted-foreground">
                {selectedPatterns.length} pattern{selectedPatterns.length !== 1 && 's'} selected
              </div>
              <Button 
                variant="default" 
                size="sm" 
                disabled={selectedPatterns.length === 0}
                onClick={handleApplySelected}
              >
                Apply Selected
              </Button>
            </div>
          </>
        )}

        {/* Test pattern dialog */}
        <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Test Results: {testPattern?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Pattern</Label>
                <div className="p-2 bg-muted rounded text-sm font-mono overflow-auto">
                  {testPattern?.pattern}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Matches (max 10 shown)</Label>
                <ScrollArea className="h-[200px] rounded border p-2">
                  {testResults.map((result, i) => (
                    <div 
                      key={i} 
                      className="py-1 border-b last:border-0 text-sm"
                    >
                      {result}
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setTestDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default RegexManager;
