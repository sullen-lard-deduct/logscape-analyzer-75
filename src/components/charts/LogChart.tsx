import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, Brush, ReferenceLine, BarChart, Bar
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { 
  Split, Maximize, X, Plus, RefreshCcw, ZoomIn, ZoomOut,
  LineChart as LineChartIcon, BarChart as BarChartIcon,
  Clock, CalendarRange, ChevronRight, ChevronLeft
} from 'lucide-react';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis
} from "@/components/ui/pagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RegexPattern } from "../regex/RegexManager";
import { cn } from "@/lib/utils";
import { format, addHours, subHours, startOfHour, endOfHour, addDays, subDays } from 'date-fns';

interface LogData {
  timestamp: Date;
  values: { [key: string]: number | string };
}

interface Signal {
  id: string;
  name: string;
  pattern: RegexPattern;
  color: string;
  visible: boolean;
}

interface ChartPanel {
  id: string;
  signals: string[];
}

interface LogChartProps {
  logContent: string;
  patterns: RegexPattern[];
  className?: string;
}

const CHART_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F97316', // orange
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F43F5E', // rose
  '#6366F1', // indigo
  '#84CC16', // lime
  '#0EA5E9', // sky
];

// Sampling constants for large datasets
const MAX_CHART_POINTS = 5000; // Increased from 2000 to 5000 default points
const MAX_VISIBLE_POINTS = 1000; // Increased from 500 to 1000 points in a zoomed view
const MAX_CHART_POINTS_LIMIT = 50000; // Maximum points that can be configured

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2 bg-white shadow-md border rounded-md text-xs">
        <p className="font-medium mb-1">{new Date(label).toLocaleString()}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`tooltip-${index}`} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-medium">{entry.name}:</span>
            <span>{typeof entry.payload[`${entry.name}_original`] === 'string' 
              ? entry.payload[`${entry.name}_original`] 
              : entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Time range presets for quick selection
const TIME_RANGE_PRESETS = [
  { label: 'Last hour', value: '1h', getRange: (now: Date) => ({ start: subHours(now, 1), end: now }) },
  { label: 'Last 6 hours', value: '6h', getRange: (now: Date) => ({ start: subHours(now, 6), end: now }) },
  { label: 'Last 12 hours', value: '12h', getRange: (now: Date) => ({ start: subHours(now, 12), end: now }) },
  { label: 'Last 24 hours', value: '24h', getRange: (now: Date) => ({ start: subHours(now, 24), end: now }) },
  { label: 'Last 3 days', value: '3d', getRange: (now: Date) => ({ start: subDays(now, 3), end: now }) },
  { label: 'Last 7 days', value: '7d', getRange: (now: Date) => ({ start: subDays(now, 7), end: now }) },
  { label: 'All data', value: 'all', getRange: () => ({ start: undefined, end: undefined }) },
];

const LogChart: React.FC<LogChartProps> = ({ logContent, patterns, className }) => {
  const [chartData, setChartData] = useState<LogData[]>([]);
  const [formattedChartData, setFormattedChartData] = useState<any[]>([]);
  const [displayedChartData, setDisplayedChartData] = useState<any[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [panels, setPanels] = useState<ChartPanel[]>([{ id: 'panel-1', signals: [] }]);
  const [activeTab, setActiveTab] = useState<string>("panel-1");
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [zoomDomain, setZoomDomain] = useState<{ start?: number, end?: number }>({});
  const [dataStats, setDataStats] = useState<{ total: number, displayed: number, samplingRate: number, currentPage?: number, totalPages?: number }>({ 
    total: 0, 
    displayed: 0, 
    samplingRate: 1 
  });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [maxDisplayPoints, setMaxDisplayPoints] = useState<number>(MAX_CHART_POINTS);
  const [timeRangePreset, setTimeRangePreset] = useState<string>('all');
  const [customTimeRange, setCustomTimeRange] = useState<{ start?: Date, end?: Date }>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawLogSample, setRawLogSample] = useState<string[]>([]);
  const [stringValueMap, setStringValueMap] = useState<Record<string, Record<string, number>>>({});
  const [dataRange, setDataRange] = useState<{ min?: Date, max?: Date }>({});
  const [timeNavigation, setTimeNavigation] = useState<'preset' | 'pagination' | 'window'>('preset');
  const [timeWindowSize, setTimeWindowSize] = useState<number>(24); // Default 24 hours window
  
  // Process log data in chunks using a worker
  useEffect(() => {
    if (!logContent || patterns.length === 0) return;
    
    try {
      setIsProcessing(true);
      setProcessingStatus("Starting to process log data");
      const logLines = logContent.split('\n');
      setRawLogSample(logLines.slice(0, 10));
      
      console.log("Processing log data with patterns:", patterns);
      console.log(`Starting to process ${logLines.length} log lines`);
      
      // Process in chunks to avoid UI freezing
      processLogDataInChunks(logContent, patterns);
      toast.success("Started processing log data");
    } catch (error) {
      console.error("Error processing log data:", error);
      toast.error("Error processing log data");
      setIsProcessing(false);
    }
  }, [logContent, patterns]);

  // Break the processing into chunks to prevent UI freezing
  const processLogDataInChunks = useCallback((content: string, regexPatterns: RegexPattern[]) => {
    const CHUNK_SIZE = 5000; // Increased chunk size for faster processing
    const lines = content.split('\n');
    const totalLines = lines.length;
    const chunks = Math.ceil(totalLines / CHUNK_SIZE);
    
    setChartData([]);
    setFormattedChartData([]);
    
    // Create signals before processing
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
    
    // Process chunks with setTimeout to avoid blocking UI
    const processChunk = () => {
      if (currentChunk >= chunks) {
        finalizeProcessing(parsedData, stringValues);
        return;
      }
      
      setProcessingStatus(`Processing chunk ${currentChunk + 1} of ${chunks} (${Math.round(((currentChunk + 1) / chunks) * 100)}%)`);
      
      const startIdx = currentChunk * CHUNK_SIZE;
      const endIdx = Math.min((currentChunk + 1) * CHUNK_SIZE, totalLines);
      const chunkLines = lines.slice(startIdx, endIdx);
      
      // Process this chunk
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
                  
                  // If string value, track it for numeric mapping
                  if (typeof value === 'string') {
                    if (!stringValues[pattern.name]) {
                      stringValues[pattern.name] = new Set<string>();
                    }
                    stringValues[pattern.name].add(value);
                  }
                  
                  successCount++;
                }
              } catch (error) {
                // Skip errors in regex matching
              }
            });
            
            // Copy last seen values for patterns not found in this line
            regexPatterns.forEach((pattern) => {
              if (!(pattern.name in values) && pattern.name in lastSeenValues) {
                values[pattern.name] = lastSeenValues[pattern.name];
              }
            });
            
            if (Object.keys(values).length > 0 && hasNewValue) {
              parsedData.push({ timestamp, values });
            }
          } catch (error) {
            // Skip errors in line processing
          }
        }
      });
      
      // Update progress
      const progress = Math.round(((currentChunk + 1) / chunks) * 100);
      if (progress % 20 === 0 || progress === 100) {
        toast.info(`Processing: ${progress}% - Found ${parsedData.length.toLocaleString()} data points so far`);
      }
      
      currentChunk++;
      setTimeout(processChunk, 0); // Schedule next chunk, giving UI time to update
    };
    
    // Finalize the processing after all chunks are done
    const finalizeProcessing = (parsedData: LogData[], stringValues: Record<string, Set<string>>) => {
      setProcessingStatus("Finalizing data processing");
      
      // Use setTimeout to prevent UI freeze
      setTimeout(() => {
        try {
          parsedData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          
          // Create numeric mappings for string values
          const newStringValueMap: Record<string, Record<string, number>> = {};
          
          Object.entries(stringValues).forEach(([key, valueSet]) => {
            newStringValueMap[key] = {};
            Array.from(valueSet).sort().forEach((value, index) => {
              newStringValueMap[key][value] = index + 1; // Start from 1 to avoid zero values
            });
          });
          
          console.log("String value mappings:", newStringValueMap);
          setStringValueMap(newStringValueMap);
          
          if (parsedData.length === 0) {
            toast.warning("No matching data found with the provided patterns");
            setIsProcessing(false);
          } else {
            toast.success(`Found ${parsedData.length.toLocaleString()} data points with the selected patterns`);
            setProcessingStatus("Formatting data for display");
            
            // Set chart data in a separate tick to avoid UI freeze
            setChartData(parsedData);
            
            // Format data efficiently without recursive calls
            formatChartDataAsync(parsedData, newStringValueMap);
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
  }, []);

  // Format chart data asynchronously to avoid stack overflow
  // Fixed by passing stringValueMap directly as parameter rather than using from state
  const formatChartDataAsync = useCallback((data: LogData[], valueMap: Record<string, Record<string, number>>) => {
    setProcessingStatus("Formatting data (this may take a moment for large datasets)");
    
    // Use a worker pattern with setTimeout to prevent stack overflow with iterative approach
    const BATCH_SIZE = 5000; // Process data in smaller batches for better responsiveness
    const result: any[] = [];
    let index = 0;
    
    // Define the processBatch function outside of the recursive call
    // This prevents stack overflow by using setTimeout for async processing
    const processBatch = () => {
      const end = Math.min(index + BATCH_SIZE, data.length);
      const progressPercent = Math.round((index / data.length) * 100);
      setProcessingStatus(`Formatting data: ${progressPercent}%`);
      
      // Process this batch
      for (let i = index; i < end; i++) {
        const item = data[i];
        const dataPoint: any = {
          timestamp: item.timestamp.getTime(),
        };
        
        // Process each value, converting strings to their numeric equivalents
        Object.entries(item.values).forEach(([key, value]) => {
          if (typeof value === 'string') {
            // If this is a string value, use its numeric mapping
            if (valueMap[key] && valueMap[key][value] !== undefined) {
              dataPoint[key] = valueMap[key][value];
              // Also store the original string value for tooltip display
              dataPoint[`${key}_original`] = value;
            } else {
              dataPoint[key] = 0;
            }
          } else {
            dataPoint[key] = value;
          }
        });
        
        result.push(dataPoint);
      }
      
      // Move to the next batch or finish
      index = end;
      
      if (index < data.length) {
        // Use window.setTimeout with 0 delay to avoid stack overflow
        // This breaks the call stack chain and yields to the event loop
        window.setTimeout(processBatch, 0);
      } else {
        // All done, prepare data for display with setTimeout to prevent UI freeze
        window.setTimeout(() => {
          if (result.length > 0) {
            const timestamps = result.map(item => item.timestamp);
            const minTime = new Date(Math.min(...timestamps));
            const maxTime = new Date(Math.max(...timestamps));
            setDataRange({ min: minTime, max: maxTime });
            
            setFormattedChartData(result);
            prepareDisplayData(result);
          } else {
            setIsProcessing(false);
            setProcessingStatus("");
          }
        }, 0);
      }
    };
    
    // Start processing the first batch with setTimeout
    window.setTimeout(processBatch, 0);
  }, []);
  
  // Prepare display data with sampling
  const prepareDisplayData = useCallback((data: any[]) => {
    setProcessingStatus("Preparing chart data for display");
    
    // Use setTimeout to prevent UI freezing with an iterative approach
    const prepareData = () => {
      try {
        const total = data.length;
        let sampled;
        let samplingRate = 1;
        
        if (total > maxDisplayPoints) {
          // For large datasets, use sampling to reduce points
          samplingRate = Math.ceil(total / maxDisplayPoints);
          sampled = data.filter((_, i) => i % samplingRate === 0);
          
          console.log(`Sampled data from ${total} to ${sampled.length} points (rate: 1/${samplingRate})`);
          setDataStats({ 
            total, 
            displayed: sampled.length, 
            samplingRate, 
            currentPage: 1, 
            totalPages: Math.ceil(total / maxDisplayPoints) 
          });
          
          // Setup pagination if needed
          if (timeNavigation === 'pagination') {
            setCurrentPage(1);
          }
          
          toast.info(`Displaying ${sampled.length.toLocaleString()} of ${total.toLocaleString()} data points for performance`);
        } else {
          sampled = data;
          setDataStats({ 
            total, 
            displayed: total, 
            samplingRate: 1,
            currentPage: 1,
            totalPages: 1
          });
        }
        
        setDisplayedChartData(sampled);
        setProcessingStatus("");
        setIsProcessing(false);
      } catch (error) {
        console.error("Error preparing chart data:", error);
        toast.error("Error preparing chart data");
        setIsProcessing(false);
        setProcessingStatus("");
      }
    };
    
    // Use window.setTimeout to break the call stack chain
    window.setTimeout(prepareData, 0);
  }, [maxDisplayPoints, timeNavigation]);

  // Apply time range filtering to the data
  const applyTimeRangeFilter = useCallback((data: any[], timeRange: { start?: Date | number, end?: Date | number }) => {
    if (!timeRange.start && !timeRange.end) {
      return data;
    }
    
    const startTime = timeRange.start ? (timeRange.start instanceof Date ? timeRange.start.getTime() : timeRange.start) : undefined;
    const endTime = timeRange.end ? (timeRange.end instanceof Date ? timeRange.end.getTime() : timeRange.end) : undefined;
    
    return data.filter(item => {
      const itemTime = item.timestamp;
      if (startTime && endTime) {
        return itemTime >= startTime && itemTime <= endTime;
      } else if (startTime) {
        return itemTime >= startTime;
      } else if (endTime) {
        return itemTime <= endTime;
      }
      return true;
    });
  }, []);

  // Calculate visible data based on zoom domain and time range
  const getVisibleData = useCallback(() => {
    // Apply time range filter first
    let filteredData = formattedChartData;
    
    if (customTimeRange.start || customTimeRange.end) {
      filteredData = applyTimeRangeFilter(formattedChartData, customTimeRange);
    }
    
    // Then apply zoom if needed
    if (zoomDomain.start && zoomDomain.end) {
      filteredData = filteredData.filter(
        (item) => item.timestamp >= zoomDomain.start! && item.timestamp <= zoomDomain.end!
      );
    }
    
    // Apply additional sampling if the filtered range still has too many points
    if (filteredData.length > MAX_VISIBLE_POINTS) {
      const samplingRate = Math.ceil(filteredData.length / MAX_VISIBLE_POINTS);
      return filteredData.filter((_, i) => i % samplingRate === 0);
    }
    
    return filteredData;
  }, [formattedChartData, zoomDomain, customTimeRange, applyTimeRangeFilter]);

  // Handle pagination
  const handlePageChange = useCallback((page: number) => {
    if (!dataStats.totalPages) return;
    
    if (page < 1) page = 1;
    if (page > dataStats.totalPages) page = dataStats.totalPages;
    
    setCurrentPage(page);
    
    // Calculate the data slice for this page
    const pageSize = maxDisplayPoints;
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, formattedChartData.length);
    
    // Get data for this page
    const pageData = formattedChartData.slice(startIndex, endIndex);
    
    // Update displayed data and stats
    setDisplayedChartData(pageData);
    setDataStats({
      ...dataStats,
      currentPage: page,
      displayed: pageData.length
    });
    
    // If we have time range data, update the custom range
    if (dataRange.min && dataRange.max && formattedChartData.length > 0) {
      // Set custom time range to this page's date range
      const pageStartTime = new Date(pageData[0].timestamp);
      const pageEndTime = new Date(pageData[pageData.length - 1].timestamp);
      setCustomTimeRange({ start: pageStartTime, end: pageEndTime });
    }
    
    // Reset zoom when changing pages
    setZoomDomain({});
  }, [dataStats, maxDisplayPoints, formattedChartData, dataRange]);

  // Function to navigate through time periods
  const navigateTime = useCallback((direction: 'forward' | 'backward') => {
    if (!customTimeRange.start || !customTimeRange.end) return;
    
    const start = customTimeRange.start;
    const end = customTimeRange.end;
    const duration = end.getTime() - start.getTime();
    
    if (direction === 'forward') {
      const newStart = new Date(start.getTime() + duration);
      const newEnd = new Date(end.getTime() + duration);
      // Don't go beyond the available data
      if (dataRange.max && newEnd > dataRange.max) {
        const adjustedEnd = dataRange.max;
        const adjustedStart = new Date(adjustedEnd.getTime() - duration);
        setCustomTimeRange({ start: adjustedStart, end: adjustedEnd });
      } else {
        setCustomTimeRange({ start: newStart, end: newEnd });
      }
    } else {
      const newStart = new Date(start.getTime() - duration);
      const newEnd = new Date(end.getTime() - duration);
      // Don't go before the available data
      if (dataRange.min && newStart < dataRange.min) {
        const adjustedStart = dataRange.min;
        const adjustedEnd = new Date(adjustedStart.getTime() + duration);
        setCustomTimeRange({ start: adjustedStart, end: adjustedEnd });
      } else {
        setCustomTimeRange({ start: newStart, end: newEnd });
      }
    }
  }, [customTimeRange, dataRange]);

  // Handle time window navigation
  const navigateTimeWindow = useCallback((direction: 'forward' | 'backward') => {
    if (!dataRange.min || !dataRange.max) return;
    
    // Calculate window size in milliseconds
    const windowMs = timeWindowSize * 60 * 60 * 1000; // hours to ms
    
    let newStart, newEnd;
    
    if (!customTimeRange.start || !customTimeRange.end) {
      // If no current range, start from the end of data and move backward
      newEnd = dataRange.max;
      newStart = new Date(newEnd.getTime() - windowMs);
    } else {
      // Move window forward or backward
      if (direction === 'forward') {
        newStart = new Date(customTimeRange.end.getTime());
        newEnd = new Date(newStart.getTime() + windowMs);
        
        // Don't go beyond the available data
        if (newEnd > dataRange.max) {
          newEnd = dataRange.max;
          newStart = new Date(newEnd.getTime() - windowMs);
        }
      } else {
        newEnd = new Date(customTimeRange.start.getTime());
        newStart = new Date(newEnd.getTime() - windowMs);
        
        // Don't go before the available data
        if (newStart < dataRange.min) {
          newStart = dataRange.min;
          newEnd = new Date(newStart.getTime() + windowMs);
        }
      }
    }
    
    setCustomTimeRange({ start: newStart, end: newEnd });
    // Reset zoom when changing time window
    setZoomDomain({});
  }, [customTimeRange, dataRange, timeWindowSize]);

  // Effect to update displayed data when time range changes
  useEffect(() => {
    if (timeNavigation === 'window' && customTimeRange.start && customTimeRange.end) {
      // Filter data by current time window
      const filteredData = applyTimeRangeFilter(formattedChartData, customTimeRange);
      
      // Apply sampling if needed
      let sampledData = filteredData;
      let samplingRate = 1;
      
      if (filteredData.length > maxDisplayPoints) {
        samplingRate = Math.ceil(filteredData.length / maxDisplayPoints);
        sampledData = filteredData.filter((_, i) => i % samplingRate === 0);
      }
      
      setDisplayedChartData(sampledData);
      setDataStats({
        total: formattedChartData.length,
        displayed: sampledData.length,
        samplingRate,
        currentPage: 1,
        totalPages: Math.ceil(formattedChartData.length / maxDisplayPoints)
      });
    }
  }, [customTimeRange, timeNavigation, formattedChartData, maxDisplayPoints, applyTimeRangeFilter]);

  // Fixed TypeScript error in timeRangePreset selection
  const handleTimeRangePresetChange = useCallback((preset: string) => {
    setTimeRangePreset(preset);
    setZoomDomain({}); // Reset zoom when changing time range
    
    if (preset === 'all') {
      setTimeNavigation('preset');
      setCustomTimeRange({});
      
      // Show full dataset with sampling
      prepareDisplayData(formattedChartData);
    } else if (preset === 'custom') {
      // Keep current custom range if it exists
      if (!customTimeRange.start || !customTimeRange.end) {
        // Set a default 1-hour range at the end of the data if no custom range exists
        if (dataRange.max) {
          const end = dataRange.max;
          const start = subHours(end, 1);
          setCustomTimeRange({ start, end });
        }
      }
    } else if (preset === 'window') {
      setTimeNavigation('window');
      
      // Set initial window to last N hours of data
      if (dataRange.max) {
        const end = dataRange.max;
        const start = subHours(end, timeWindowSize);
        setCustomTimeRange({ start, end });
      }
    } else if (preset === 'pagination') {
      setTimeNavigation('pagination');
      setCustomTimeRange({});
      
      // Start at page 1
      handlePageChange(1);
    } else {
      // Apply one of the standard presets
      setTimeNavigation('preset');
      const presetConfig = TIME_RANGE_PRESETS.find(p => p.value === preset);
      if (presetConfig && dataRange.max) {
        const range = presetConfig.getRange(dataRange.max);
        // Make sure the range is within our data
        if (dataRange.min && range.start && range.start < dataRange.min) {
          range.start = dataRange.min;
        }
        setCustomTimeRange(range);
      }
    }
  }, [customTimeRange, dataRange, timeWindowSize, formattedChartData, prepareDisplayData, handlePageChange]);

  // Fixed type error with time navigation control
  const getTimeNavigationValue = useCallback(() => {
    if (timeNavigation === 'pagination') return 'pagination';
    if (timeNavigation === 'window') return 'window';
    if (timeNavigation === 'preset') return timeRangePreset;
    return 'custom';
  }, [timeNavigation, timeRangePreset]);

  // Memoize the visible data to improve performance
  const visibleChartData = useMemo(() => {
    // If we're in pagination mode, just use the current displayed data
    if (timeNavigation === 'pagination') {
      return displayedChartData;
    }
    
    // Otherwise, calculate the visible data based on filters
    return getVisibleData();
  }, [getVisibleData, displayedChartData, timeNavigation]);

  const handleAddPanel = useCallback(() => {
    const newPanelId = `panel-${panels.length + 1}`;
    setPanels([...panels, { id: newPanelId, signals: [] }]);
    setActiveTab(newPanelId);
  }, [panels]);

  const handleRemovePanel = useCallback((panelId: string) => {
    if (panels.length <= 1) {
      toast.error("Cannot remove the only panel");
      return;
    }
    
    const updatedPanels = panels.filter(panel => panel.id !== panelId);
    setPanels(updatedPanels);
    
    if (activeTab === panelId) {
      setActiveTab(updatedPanels[0].id);
    }
  }, [panels, activeTab]);

  const handleAddSignalToPanel = useCallback((panelId: string, signalId: string) => {
    setPanels(panels.map(panel => {
      if (panel.id === panelId) {
        if (!panel.signals.includes(signalId)) {
          return { ...panel, signals: [...panel.signals, signalId] };
        }
      }
      return panel;
    }));
  }, [panels]);

  const handleRemoveSignalFromPanel = useCallback((panelId: string, signalId: string) => {
    setPanels(panels.map(panel => {
      if (panel.id === panelId) {
        return { ...panel, signals: panel.signals.filter(id => id !== signalId) };
      }
      return panel;
    }));
  }, [panels]);

  const toggleSignalVisibility = useCallback((signalId: string) => {
    setSignals(signals.map(signal => {
      if (signal.id === signalId) {
        return { ...signal, visible: !signal.visible };
      }
      return signal;
    }));
  }, [signals]);

  const handleZoomReset = useCallback(() => {
    setZoomDomain({});
  }, []);

  const formatXAxis = useCallback((tickItem: any) => {
    const date = new Date(tickItem);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  }, []);

  // Format for longer time labels, used in time navigation
  const formatTimeLabel = useCallback((date: Date) => {
    return format(date, 'MMM dd, HH:mm');
  }, []);

  const getPanelSignals = useCallback((panelId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return [];
    
    return signals.filter(signal => 
      panel.signals.includes(signal.id) && signal.visible
    );
  }, [panels, signals]);

  const handleResetAll = useCallback(() => {
    setChartData([]);
    setFormattedChartData([]);
    setDisplayedChartData([]);
    setSignals([]);
    setPanels([{ id: 'panel-1', signals: [] }]);
    setActiveTab("panel-1");
    setChartType('line');
    setZoomDomain({});
    setStringValueMap({});
    setRawLogSample([]);
    setDataStats({ total: 0, displayed: 0, samplingRate: 1 });
    setCustomTimeRange({});
    setTimeRangePreset('all');
    setTimeNavigation('preset');
    setCurrentPage(1);
    toast.success("Reset all data and settings");
  }, []);

  // Handle max display points change
  const handleMaxPointsChange = useCallback((value: number[]) => {
    const newMaxPoints = value[0];
    if (newMaxPoints !== maxDisplayPoints) {
      setMaxDisplayPoints(newMaxPoints);
      
      // Reapply sampling with the new max points setting
      if (formattedChartData.length > 0) {
        setProcessingStatus("Resampling data...");
        setIsProcessing(true);
        
        // Use setTimeout to prevent UI freezing
        setTimeout(() => {
          try {
            if (timeNavigation === 'pagination') {
              // Update page size and recalculate pages
              const totalPages = Math.ceil
