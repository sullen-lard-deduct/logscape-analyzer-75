
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
        
        // For larger datasets, take a distributed sampling to provide a better overview
        if (parsedData.length > 100000) {
          const sampledData = getDistributedSample(parsedData, 100000);
          console.log(`Large dataset detected (${parsedData.length} points), using distributed sampling for better visualization (${sampledData.length} points)`);
          formatDataCallback(sampledData, newStringValueMap);
        } else {
          formatDataCallback(parsedData, newStringValueMap);
        }
      } catch (error) {
        console.error("Error finalizing data:", error);
        toast.error("Error finalizing data");
        setIsProcessing(false);
        setProcessingStatus("");
      }
    }, 0);
  };
  
  // Take a distributed sample that preserves the overall time distribution
  const getDistributedSample = (data: LogData[], targetSize: number): LogData[] => {
    if (data.length <= targetSize) return data;
    
    const result: LogData[] = [];
    const step = data.length / targetSize;
    
    // Always include the first and last data points
    result.push(data[0]);
    
    // Add evenly distributed samples
    for (let i = 1; i < data.length - 1; i += step) {
      const index = Math.floor(i);
      if (index < data.length) {
        result.push(data[index]);
      }
    }
    
    // Always include the last data point
    if (data.length > 1) {
      result.push(data[data.length - 1]);
    }
    
    return result;
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
  const totalPoints = data.length;
  console.log(`Starting to format ${totalPoints.toLocaleString()} data points...`);
  
  // For very large datasets, show explicit progress to avoid appearing stuck
  if (totalPoints > 50000) {
    toast.info(`Preparing to format ${totalPoints.toLocaleString()} data points. This may take a moment...`);
    
    // For large datasets, update UI to show progress
    setProcessingStatus(`Formatting large dataset (${totalPoints.toLocaleString()} points)...`);
    
    // Small delay to let UI update
    setTimeout(() => {
      try {
        console.log("Beginning full-dataset formatting");
        formatDataCallback(data, valueMap);
      } catch (error) {
        console.error("Error in data formatting:", error);
        toast.error("Error formatting chart data");
        
        // Attempt a second pass with reduced dataset if very large
        if (totalPoints > 200000) {
          const samplingRate = Math.ceil(totalPoints / 100000);
          console.log(`Attempting with reduced dataset (1:${samplingRate} sampling)`);
          
          const sampledData = [];
          for (let i = 0; i < totalPoints; i += samplingRate) {
            sampledData.push(data[i]);
          }
          
          toast.info(`Trying with a reduced dataset of ${sampledData.length.toLocaleString()} points`);
          
          setTimeout(() => {
            try {
              formatDataCallback(sampledData, valueMap);
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
      }
    }, 100);
  } else {
    // For smaller datasets, proceed normally
    console.log("Processing smaller dataset");
    formatDataCallback(data, valueMap);
  }
};

// Improved function to format very large datasets with better error handling
export const formatLargeDatasetInBatches = (
  data: LogData[],
  valueMap: Record<string, Record<string, number>>,
  formatDataCallback: (data: LogData[], valueMap: Record<string, Record<string, number>>) => void,
  setProcessingStatus: React.Dispatch<React.SetStateAction<string>>,
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>
) => {
  console.log(`Formatting ${data.length.toLocaleString()} data points using batch processing`);
  
  // For extremely large datasets, use adaptive sampling
  const samplingRate = getSamplingRate(data.length);
  const sampledData = getAdaptiveSample(data, samplingRate);
  
  console.log(`Using ${sampledData.length} sampled points from original ${data.length} (sampling: 1:${samplingRate})`);
  toast.info(`Processing ${sampledData.length.toLocaleString()} data points from your dataset`);
  
  // Update status frequently to show progress
  const progressInterval = setInterval(() => {
    setProcessingStatus(prevStatus => {
      return prevStatus + " (processing...)";
    });
  }, 2000);
  
  // Small delay to let UI update before heavy processing
  setTimeout(() => {
    try {
      formatDataCallback(sampledData, valueMap);
    } catch (error) {
      console.error("Error in data formatting:", error);
      toast.error("Error formatting chart data. Trying with a smaller dataset...");
      
      // On error, try with an even smaller sample
      if (sampledData.length > 10000) {
        const reducedData = getAdaptiveSample(sampledData, 5);
        console.log(`Retry with further reduced dataset: ${reducedData.length} points`);
        
        setTimeout(() => {
          try {
            formatDataCallback(reducedData, valueMap);
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

// Get adaptive sampling rate based on dataset size
const getSamplingRate = (size: number): number => {
  if (size > 1000000) return 20;
  if (size > 500000) return 10;
  if (size > 200000) return 5;
  if (size > 100000) return 3;
  if (size > 50000) return 2;
  return 1; // No sampling for datasets under 50k
};

// Take an adaptive sample that preserves time distribution and interesting features
const getAdaptiveSample = (data: LogData[], samplingRate: number): LogData[] => {
  if (data.length <= 5000 || samplingRate <= 1) return data;
  
  const result: LogData[] = [];
  
  // Always include first and last points
  result.push(data[0]);
  
  // Use regular sampling for the bulk of points
  for (let i = 1; i < data.length - 1; i += samplingRate) {
    result.push(data[i]);
  }
  
  // Add the last point
  if (data.length > 1) {
    result.push(data[data.length - 1]);
  }
  
  return result;
};
