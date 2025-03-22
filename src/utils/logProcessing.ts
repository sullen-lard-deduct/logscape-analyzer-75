
import { toast } from "sonner";
import { RegexPattern } from "@/components/regex/RegexManager";
import { LogData, Signal, CHART_COLORS } from "@/types/chartTypes";

export const processLogDataInChunks = (
  content: string,
  regexPatterns: RegexPattern[],
  setChartData: React.Dispatch<React.SetStateAction<LogData[]>>,
  setFormattedChartData: React.Dispatch<React.SetStateAction<any[]>>,
  setSignals: React.Dispatch<React.SetStateAction<Signal[]>>,
  setPanels: React.Dispatch<React.SetStateAction<{id: string; signals: string[]}[]>>,
  setStringValueMap: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>,
  setProcessingStatus: React.Dispatch<React.SetStateAction<string>>,
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>,
  formatDataCallback: (data: LogData[], valueMap: Record<string, Record<string, number>>) => void
) => {
  const CHUNK_SIZE = 5000; // Increased chunk size for faster processing
  const lines = content.split('\n');
  const totalLines = lines.length;
  const chunks = Math.ceil(totalLines / CHUNK_SIZE);
  
  setChartData([]);
  setFormattedChartData([]);
  
  const newSignals: Signal[] = regexPatterns.map((pattern, index) => ({
    id: `signal-${Date.now()}-${index}`,
    name: pattern.name,
    pattern,
    color: CHART_COLORS[index % CHART_COLORS.length],
    visible: true
  }));
  
  setSignals(newSignals);
  setPanels([{ id: 'panel-1', signals: newSignals.map(s => s.id) }]);
  
  console.log(`Processing ${totalLines} lines in ${chunks} chunks of ${CHUNK_SIZE}`);
  
  let currentChunk = 0;
  const parsedData: LogData[] = [];
  const stringValues: Record<string, Set<string>> = {};
  const lastSeenValues: Record<string, number | string> = {};
  
  const processChunk = () => {
    if (currentChunk >= chunks) {
      finalizeProcessing(parsedData, stringValues);
      return;
    }
    
    setProcessingStatus(`Processing chunk ${currentChunk + 1} of ${chunks} (${Math.round(((currentChunk + 1) / chunks) * 100)}%)`);
    
    const startIdx = currentChunk * CHUNK_SIZE;
    const endIdx = Math.min((currentChunk + 1) * CHUNK_SIZE, totalLines);
    const chunkLines = lines.slice(startIdx, endIdx);
    
    let successCount = 0;
    
    chunkLines.forEach((line) => {
      if (!line.trim()) return;
      
      const timestampMatch = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{6})/);
      
      if (timestampMatch) {
        try {
          const timestampStr = timestampMatch[1];
          const isoTimestamp = timestampStr
            .replace(/\//g, '-')
            .replace(' ', 'T')
            .substring(0, 23);
          
          const timestamp = new Date(isoTimestamp);
          
          if (isNaN(timestamp.getTime())) {
            return;
          }
          
          const values: { [key: string]: number | string } = {};
          let hasNewValue = false;
          
          regexPatterns.forEach((pattern) => {
            try {
              const regex = new RegExp(pattern.pattern);
              const match = line.match(regex);
              
              if (match && match[1] !== undefined) {
                const value = isNaN(Number(match[1])) ? match[1] : Number(match[1]);
                values[pattern.name] = value;
                lastSeenValues[pattern.name] = value;
                hasNewValue = true;
                
                if (typeof value === 'string') {
                  if (!stringValues[pattern.name]) {
                    stringValues[pattern.name] = new Set<string>();
                  }
                  stringValues[pattern.name].add(value);
                }
                
                successCount++;
              }
            } catch (error) {
              // Silently ignore regex errors
            }
          });
          
          regexPatterns.forEach((pattern) => {
            if (!(pattern.name in values) && pattern.name in lastSeenValues) {
              values[pattern.name] = lastSeenValues[pattern.name];
            }
          });
          
          if (Object.keys(values).length > 0 && hasNewValue) {
            parsedData.push({ timestamp, values });
          }
        } catch (error) {
          // Silently ignore date parsing errors
        }
      }
    });
    
    const progress = Math.round(((currentChunk + 1) / chunks) * 100);
    if (progress % 20 === 0 || progress === 100) {
      toast.info(`Processing: ${progress}% - Found ${parsedData.length.toLocaleString()} data points so far`);
    }
    
    currentChunk++;
    
    // Use requestAnimationFrame for smoother UI updates
    requestAnimationFrame(() => {
      setTimeout(processChunk, 0);
    });
  };
  
  const finalizeProcessing = (parsedData: LogData[], stringValues: Record<string, Set<string>>) => {
    setProcessingStatus("Finalizing data processing");
    
    // Use requestAnimationFrame to yield to browser
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          parsedData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          
          const newStringValueMap: Record<string, Record<string, number>> = {};
          
          Object.entries(stringValues).forEach(([key, valueSet]) => {
            newStringValueMap[key] = {};
            Array.from(valueSet).sort().forEach((value, index) => {
              newStringValueMap[key][value] = index + 1;
            });
          });
          
          console.log("String value mappings:", newStringValueMap);
          setStringValueMap(newStringValueMap);
          
          if (parsedData.length === 0) {
            toast.warning("No matching data found with the provided patterns");
            setIsProcessing(false);
            setProcessingStatus("");
          } else {
            toast.success(`Found ${parsedData.length.toLocaleString()} data points with the selected patterns`);
            setProcessingStatus("Formatting data for display");
            
            // Set chart data in a separate tick to avoid UI freeze
            setChartData(parsedData);
            
            // Break large datasets into even smaller chunks for formatting
            formatDataCallback(parsedData, newStringValueMap);
          }
        } catch (error) {
          console.error("Error finalizing data:", error);
          toast.error("Error finalizing data");
          setIsProcessing(false);
          setProcessingStatus("");
        }
      }, 0);
    });
  };
  
  // Start processing the first chunk
  processChunk();
};
