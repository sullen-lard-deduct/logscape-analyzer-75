
import React, { useState } from "react";
import { Save, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { DialogFooter } from "@/components/ui/dialog";

interface PatternFormProps {
  onSave: (name: string, pattern: string, description: string, id?: string) => void;
  pattern?: RegexPattern | null;
  onCancel: () => void;
}

interface RegexPattern {
  id: string;
  name: string;
  pattern: string;
  description?: string;
}

const PatternForm: React.FC<PatternFormProps> = ({ onSave, pattern, onCancel }) => {
  const [name, setName] = useState(pattern?.name || "");
  const [regexPattern, setRegexPattern] = useState(pattern?.pattern || "");
  const [description, setDescription] = useState(pattern?.description || "");

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="CPU Usage"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="pattern">Regular Expression</Label>
          <Badge variant="outline" className="ml-2 font-mono text-xs">
            (Use capturing groups)
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full">
                  <Info className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-xs">
                  Use standard capturing groups with parentheses, e.g., <code>(\\d+)</code>. 
                  Python-style named groups like <code>(?P&lt;name&gt;...)</code> will be 
                  automatically converted to standard groups.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="pattern"
          value={regexPattern}
          onChange={(e) => setRegexPattern(e.target.value)}
          placeholder="CPU: (\d+)%"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Use parentheses to define capturing groups. The first group will be used as the value.
          {regexPattern.includes("?P<") && (
            <span className="text-yellow-600 mt-1 block">
              Note: Named capturing groups will be converted to standard groups.
            </span>
          )}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Extracts CPU usage percentage from logs"
          rows={2}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => onSave(name, regexPattern, description, pattern?.id)}
          disabled={!name || !regexPattern}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Pattern
        </Button>
      </DialogFooter>
    </div>
  );
};

export default PatternForm;
