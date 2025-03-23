
import { toast } from "sonner";
import { RegexPattern } from "@/components/regex/RegexManager";
import { LogData, Signal, CHART_COLORS } from "@/types/chartTypes";

// Constants for data processing
const MAX_SAFE_BATCH_SIZE = 5000;
const MAX_SAFE_DISPLAYED_POINTS = 10000;
const CHUNK_SIZE = 10000;

/**
 * Main function to process log data in manageable chunks
 */
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
  
  // Split content into lines
  const lines = content.split('\n');
  const totalLines = lines.length;
  const chunks = Math.ceil(totalLines / CHUNK_SIZE);
  
  console.log(`Processing ${totalLines} lines in ${chunks} chunks of ${CHUNK_SIZE}`);
  toast.info(`Processing log with ${totalLines.toLocaleString()} lines`);
  
  let currentChunk = 0;
  const parsedData: LogData[] = [];
  const stringValues: Record<string, Set<string>> = {};
  const lastSeenValues: Record<string, number | string> = {};
  
  // Process chunks sequentially to avoid memory issues
  const processChunk = () => {
    if (currentChunk >= chunks) {
      // All chunks processed, move to finalizing
      finalizeProcessing(parsedData, stringValues);
      return;
    }
    
    const progress = Math.round(((currentChunk + 1) / chunks) * 100);
    setProcessingStatus(`Processing chunk ${currentChunk + 1} of ${chunks} (${progress}%)`);
    
    const startIdx = currentChunk * CHUNK_SIZE;
    const endIdx = Math.min((currentChunk + 1) * CHUNK_SIZE, totalLines);
    const chunkLines = lines.slice(startIdx, endIdx);
    
    // Process each line in this chunk
    chunkLines.forEach((line) => {
      if (!line.trim()) return;
      
      // Match timestamp pattern
      const timestampMatch = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{6})/);
      
      if (timestampMatch) {
        try {
          const timestampStr = timestampMatch[1];
          // Convert to ISO format for parsing
          const isoTimestamp = timestampStr
            .replace(/\//g, '-')
            .replace(' ', 'T')
            .substring(0, 23);
          
          const timestamp = new Date(isoTimestamp);
          
          if (isNaN(timestamp.getTime())) {
            return; // Skip invalid timestamps
          }
          
          const values: { [key: string]: number | string } = {};
          let hasNewValue = false;
          
          // Try each regex pattern
          regexPatterns.forEach((pattern) => {
            try {
              const regex = new RegExp(pattern.pattern);
              const match = line.match(regex);
              
              if (match && match[1] !== undefined) {
                const value = isNaN(Number(match[1])) ? match[1] : Number(match[1]);
                values[pattern.name] = value;
                lastSeenValues[pattern.name] = value;
                hasNewValue = true;
                
                // Track string values for mapping
                if (typeof value === 'string') {
                  if (!stringValues[pattern.name]) {
                    stringValues[pattern.name] = new Set<string>();
                  }
                  stringValues[pattern.name].add(value);
                }
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
          
          // Only add points with values and at least one new value
          if (Object.keys(values).length > 0 && hasNewValue) {
            parsedData.push({ timestamp, values });
          }
        } catch (error) {
          // Silently ignore date parsing errors
        }
      }
    });
    
    // Report progress at 10% intervals
    if (progress % 10 === 0 || progress === 100) {
      toast.info(`Processing: ${progress}% - Found ${parsedData.length.toLocaleString()} data points so far`);
      console.log(`Processing: ${progress}% - Found ${parsedData.length} data points so far`);
    }
    
    currentChunk++;
    
    // Use setTimeout with 0ms to allow UI updates
    setTimeout(processChunk, 0);
  };
  
  // Final processing after all chunks are done
  const finalizeProcessing = (parsedData: LogData[], stringValues: Record<string, Set<string>>) => {
    try {
      setProcessingStatus("Finalizing data processing");
      console.log("Finalizing data processing, found", parsedData.length, "data points");
      
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
      
      // Set the raw chart data
      setChartData(parsedData);
      
      toast.success(`Found ${parsedData.length.toLocaleString()} data points with the selected patterns`);
      setProcessingStatus("Formatting data for display");
      
      // Important: We are now passing all data points directly without sampling
      // This is vital to ensure all data points are displayed in the segmented charts
      formatAllDataPoints(parsedData, newStringValueMap, formatDataCallback, setIsProcessing, setProcessingStatus);
    } catch (error) {
      console.error("Error finalizing data:", error);
      toast.error("Error finalizing data");
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };
  
  // Start processing the first chunk
  processChunk();
};

/**
 * Format all data points without sampling to ensure complete visualization
 */
const formatAllDataPoints = (
  data: LogData[],
  valueMap: Record<string, Record<string, number>>,
  formatDataCallback: (data: LogData[], valueMap: Record<string, Record<string, number>>) => void,
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>,
  setProcessingStatus: React.Dispatch<React.SetStateAction<string>>
) => {
  // Use a worker-like approach with setTimeout to prevent UI freezing
  setTimeout(() => {
    try {
      console.log(`Formatting all ${data.length} data points`);
      setProcessingStatus(`Formatting ${data.length.toLocaleString()} data points`);
      
      // Process in batches to avoid UI freezing
      formatDataInBatches(data, valueMap, formatDataCallback, setIsProcessing, setProcessingStatus);
    } catch (error) {
      console.error("Error in data formatting:", error);
      toast.error("Error formatting data. Trying with reduced dataset...");
      
      // Fall back to sampled data if necessary
      const sampledData = evenlyDistributedSample(data, Math.max(5, Math.ceil(data.length / 5000)));
      try {
        formatDataCallback(sampledData, valueMap);
      } catch (e) {
        console.error("Fatal error in data formatting:", e);
        toast.error("Could not process data. Please try with a smaller dataset or fewer patterns.");
      } finally {
        setIsProcessing(false);
        setProcessingStatus("");
      }
    }
  }, 100);  // Short delay to allow UI to update
};

/**
 * Format data in small batches to avoid UI freezing
 */
const formatDataInBatches = (
  data: LogData[],
  valueMap: Record<string, Record<string, number>>,
  formatDataCallback: (data: LogData[], valueMap: Record<string, Record<string, number>>) => void,
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>,
  setProcessingStatus: React.Dispatch<React.SetStateAction<string>>
) => {
  const batchSize = MAX_SAFE_BATCH_SIZE;
  const batches = Math.ceil(data.length / batchSize);
  
  console.log(`Formatting in ${batches} batches of ${batchSize} points each`);
  
  // Pre-allocate the result array
  const formattedData: any[] = new Array(data.length);
  
  let currentBatch = 0;
  
  const processBatch = () => {
    if (currentBatch >= batches) {
      console.log("All batches processed, returning result");
      try {
        // We now have all data points formatted
        console.log(`Successfully formatted all ${data.length} data points`);
        
        // Call the callback with the formatted data
        formatDataCallback(data, valueMap);
        setProcessingStatus("");
        setIsProcessing(false);
        return;
      } catch (error) {
        console.error("Error in final callback:", error);
        toast.error("Error preparing chart. Trying with smaller dataset...");
        
        // Extreme fallback - try with much smaller dataset
        const reducedData = evenlyDistributedSample(data, Math.max(20, Math.ceil(data.length / 1000)));
        try {
          formatDataCallback(reducedData, valueMap);
        } catch (e) {
          console.error("Fatal error in reduced data formatting:", e);
          toast.error("Could not display chart data");
        } finally {
          setIsProcessing(false);
          setProcessingStatus("");
        }
      }
      return;
    }
    
    const startIdx = currentBatch * batchSize;
    const endIdx = Math.min((currentBatch + 1) * batchSize, data.length);
    const progress = Math.round(((currentBatch + 1) / batches) * 100);
    
    setProcessingStatus(`Formatting data (${progress}%)`);
    
    for (let i = startIdx; i < endIdx; i++) {
      const item = data[i];
      const dataPoint: any = {
        timestamp: item.timestamp.getTime(),
      };
      
      Object.entries(item.values).forEach(([key, value]) => {
        if (typeof value === 'string') {
          if (valueMap[key] && valueMap[key][value] !== undefined) {
            dataPoint[key] = valueMap[key][value];
            dataPoint[`${key}_original`] = value;
          } else {
            dataPoint[key] = 0;
          }
        } else {
          dataPoint[key] = value;
        }
      });
      
      formattedData[i] = dataPoint;
    }
    
    currentBatch++;
    
    // Report progress at meaningful intervals
    if (progress % 25 === 0 || progress === 100) {
      console.log(`Formatting: ${progress}%`);
    }
    
    // Continue with next batch
    setTimeout(processBatch, 0);
  };
  
  // Start processing the first batch
  processBatch();
};

/**
 * Get an appropriate sampling rate based on dataset size
 */
const getSafeDataSampleRate = (dataLength: number): number => {
  if (dataLength <= MAX_SAFE_DISPLAYED_POINTS) return 1; // No sampling needed
  
  // Calculate sampling rate to get approximately MAX_SAFE_DISPLAYED_POINTS
  const baseSamplingRate = Math.ceil(dataLength / MAX_SAFE_DISPLAYED_POINTS);
  
  // Adjust based on data size
  if (dataLength > 1000000) return Math.max(baseSamplingRate, 50);
  if (dataLength > 500000) return Math.max(baseSamplingRate, 25);
  if (dataLength > 100000) return Math.max(baseSamplingRate, 10);
  if (dataLength > 50000) return Math.max(baseSamplingRate, 5);
  
  return baseSamplingRate;
};

/**
 * Creates an evenly distributed sample that preserves the shape of the data
 */
export const evenlyDistributedSample = (data: LogData[], sampleRate: number): LogData[] => {
  if (sampleRate <= 1 || data.length <= 1) return data;
  
  const result: LogData[] = [];
  
  // Always include first point
  result.push(data[0]);
  
  // Add evenly distributed points
  for (let i = sampleRate; i < data.length - 1; i += sampleRate) {
    const index = Math.floor(i);
    result.push(data[index]);
  }
  
  // Always include last point
  if (data.length > 1) {
    result.push(data[data.length - 1]);
  }
  
  return result;
};

/**
 * Legacy functions for backward compatibility
 */
export const formatDataWithProgressUpdates = formatAllDataPoints;
export const formatLargeDatasetInBatches = formatDataInBatches;
export const safelyFormatData = formatAllDataPoints;
