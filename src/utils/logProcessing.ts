
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
  // Adaptive chunk size based on device memory
  const CHUNK_SIZE = 10000; // Increased for faster processing on capable machines
  const lines = content.split('\n');
  const totalLines = lines.length;
  const chunks = Math.ceil(totalLines / CHUNK_SIZE);
  
  // Clear previous data
  setChartData([]);
  setFormattedChartData([]);
  
  // Create signals for each pattern
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
          
          // Add last seen values for patterns not found in this line
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
    if (progress % 10 === 0 || progress === 100) {
      toast.info(`Processing: ${progress}% - Found ${parsedData.length.toLocaleString()} data points so far`);
    }
    
    currentChunk++;
    
    // Use setTimeout with 0 ms for smoother UI updates
    setTimeout(processChunk, 0);
  };
  
  const finalizeProcessing = (parsedData: LogData[], stringValues: Record<string, Set<string>>) => {
    setProcessingStatus("Finalizing data processing");
    console.log("Finalizing data processing, found", parsedData.length, "data points");
    
    // Use setTimeout to yield to browser
    setTimeout(() => {
      try {
        if (parsedData.length === 0) {
          toast.warning("No matching data found with the provided patterns");
          setIsProcessing(false);
          setProcessingStatus("");
          return;
        }
        
        // Sort data chronologically
        parsedData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Create mapping for string values
        const newStringValueMap: Record<string, Record<string, number>> = {};
        
        Object.entries(stringValues).forEach(([key, valueSet]) => {
          newStringValueMap[key] = {};
          Array.from(valueSet).sort().forEach((value, index) => {
            newStringValueMap[key][value] = index + 1;
          });
        });
        
        console.log("String value mappings:", newStringValueMap);
        setStringValueMap(newStringValueMap);
        
        // Set the chart data
        setChartData(parsedData);
        
        toast.success(`Found ${parsedData.length.toLocaleString()} data points with the selected patterns`);
        setProcessingStatus("Formatting data for display");
        
        // Process the complete dataset directly if under threshold
        if (parsedData.length < 100000) {
          formatDataCallback(parsedData, newStringValueMap);
        } else {
          // For larger datasets, apply appropriate sampling
          console.log(`Large dataset with ${parsedData.length} points detected, applying adaptive processing`);
          formatLargeDatasetInBatches(parsedData, newStringValueMap, formatDataCallback, setProcessingStatus, setIsProcessing);
        }
      } catch (error) {
        console.error("Error finalizing data:", error);
        toast.error("Error finalizing data");
        setIsProcessing(false);
        setProcessingStatus("");
      }
    }, 0);
  };
  
  // Start processing the first chunk
  processChunk();
};

// Helper function for formatting data with better progress updates for very large datasets
export const formatDataWithProgressUpdates = (
  data: LogData[],
  valueMap: Record<string, Record<string, number>>,
  formatDataCallback: (data: LogData[], valueMap: Record<string, Record<string, number>>) => void,
  setProcessingStatus: React.Dispatch<React.SetStateAction<string>>,
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>
) => {
  // For very large datasets, show explicit progress to avoid appearing stuck
  if (data.length > 50000) {
    toast.info(`Preparing to format ${data.length.toLocaleString()} data points. This may take a moment...`);
    
    // For large datasets, use the batched approach for better UI responsiveness
    formatLargeDatasetInBatches(data, valueMap, formatDataCallback, setProcessingStatus, setIsProcessing);
  } else {
    // For smaller datasets, proceed normally
    console.log("Processing smaller dataset with", data.length, "points");
    formatDataCallback(data, valueMap);
  }
};

// Improved helper function to format very large datasets in batches with enhanced error handling
const formatLargeDatasetInBatches = (
  data: LogData[],
  valueMap: Record<string, Record<string, number>>,
  formatDataCallback: (data: LogData[], valueMap: Record<string, Record<string, number>>) => void,
  setProcessingStatus: React.Dispatch<React.SetStateAction<string>>,
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>
) => {
  console.log(`Formatting ${data.length.toLocaleString()} data points in batches for better performance`);
  
  // For extremely large datasets, subsample intelligently to preserve data characteristics
  let dataToProcess = data;
  
  // More conservative sampling that preserves data characteristics
  const getSamplingRate = (size: number) => {
    if (size > 1000000) return 5;
    if (size > 500000) return 3;  
    if (size > 200000) return 2;
    return 1; // No sampling for datasets under 200k
  };
  
  const samplingRate = getSamplingRate(data.length);
  
  // Apply sampling for large datasets - using a more intelligent approach
  if (samplingRate > 1) {
    // Ensure we pick a representative sample across the entire dataset
    dataToProcess = [];
    
    // For very large datasets, take more points from areas with high variability
    // This simple approach takes every Nth point but guarantees first/last points are included
    dataToProcess.push(data[0]); // Always include first point
    
    for (let i = 1; i < data.length - 1; i += samplingRate) {
      dataToProcess.push(data[i]);
    }
    
    dataToProcess.push(data[data.length - 1]); // Always include last point
    
    console.log(`Intelligent sampling from ${data.length} to ${dataToProcess.length} points (strategy: ${samplingRate})`);
    toast.info(`Processing ${dataToProcess.length.toLocaleString()} representative data points from your dataset of ${data.length.toLocaleString()}.`);
  }
  
  // Update status frequently to show progress
  const progressInterval = setInterval(() => {
    setProcessingStatus(prevStatus => {
      if (prevStatus.includes("Formatting")) {
        return prevStatus + " (still working...)";
      }
      return prevStatus || "Processing dataset...";
    });
  }, 2000);
  
  // Small delay to let UI update before heavy processing
  setTimeout(() => {
    try {
      console.log(`Starting data formatting with ${dataToProcess.length} points`);
      // Actual data formatting
      formatDataCallback(dataToProcess, valueMap);
    } catch (error) {
      console.error("Error in data formatting:", error);
      toast.error("Error formatting chart data. Trying with a smaller dataset...");
      
      // On error, try with an even smaller sample but retain important points
      if (dataToProcess.length > 5000) {
        const emergencySamplingRate = Math.max(5, Math.ceil(dataToProcess.length / 5000));
        
        // More aggressive sampling while preserving key points
        const emergencyData = [dataToProcess[0]]; // Always keep first point
        
        // Take fewer points but ensure good distribution
        for (let i = emergencySamplingRate; i < dataToProcess.length - emergencySamplingRate; i += emergencySamplingRate) {
          emergencyData.push(dataToProcess[i]);
        }
        
        emergencyData.push(dataToProcess[dataToProcess.length - 1]); // Always keep last point
        
        console.log(`Error recovery: Sampling down from ${dataToProcess.length} to ${emergencyData.length} points (1:${emergencySamplingRate})`);
        toast.warning(`Processing a reduced dataset of ${emergencyData.length} points for compatibility`);
        
        setTimeout(() => {
          try {
            formatDataCallback(emergencyData, valueMap);
          } catch (secondError) {
            console.error("Second error in data formatting:", secondError);
            toast.error("Could not format chart data");
            setIsProcessing(false);
            setProcessingStatus("");
          }
        }, 100);
      } else {
        setIsProcessing(false);
        setProcessingStatus("");
      }
    } finally {
      clearInterval(progressInterval);
    }
  }, 100);
};
