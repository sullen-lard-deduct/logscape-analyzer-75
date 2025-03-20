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
            formatChartDataAsync(parsedData);
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
  const formatChartDataAsync = useCallback((data: LogData[]) => {
    setProcessingStatus("Formatting data (this may take a moment for large datasets)");
    
    // Use a worker pattern with setTimeout to prevent stack overflow with iterative approach
    const BATCH_SIZE = 10000; // Process data in smaller batches
    const result: any[] = [];
    let index = 0;
    
    // Define the processBatch function outside of the recursive call
    // This prevents stack overflow by using setTimeout for async processing
    const processBatch = () => {
      const end = Math.min(index + BATCH_SIZE, data.length);
      
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
            if (stringValueMap[key]) {
              dataPoint[key] = stringValueMap[key][value];
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
      
      // Update progress
      const progress = Math.round((end / data.length) * 100);
      setProcessingStatus(`Formatting data: ${progress}%`);
      
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
  }, [stringValueMap]);
  
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

  // Handle time range preset selection
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
              const totalPages = Math.ceil(formattedChartData.length / newMaxPoints);
              setDataStats(prev => ({ ...prev, totalPages }));
              
              // Stay on current page but adjust the data window
              handlePageChange(currentPage);
            } else {
              // Just resample the currently displayed data
              prepareDisplayData(formattedChartData);
            }
          } catch (error) {
            console.error("Error resampling data:", error);
            toast.error("Error resampling data");
            setIsProcessing(false);
            setProcessingStatus("");
          }
        }, 0);
      }
    }
  }, [maxDisplayPoints, formattedChartData, timeNavigation, handlePageChange, currentPage, prepareDisplayData]);

  // Handle time window size change
  const handleWindowSizeChange = useCallback((value: number[]) => {
    const newSize = value[0];
    setTimeWindowSize(newSize);
    
    // Update the time window with the new size
    if (timeNavigation === 'window' && customTimeRange.end) {
      const end = customTimeRange.end;
      const start = subHours(end, newSize);
      setCustomTimeRange({ start, end });
    }
  }, [timeNavigation, customTimeRange]);

  // Memoize the line chart component to improve performance
  const renderLineChart = useCallback((panelId: string) => {
    const panelSignals = getPanelSignals(panelId);
    
    return (
      <LineChart
        data={visibleChartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis}
          type="number"
          domain={zoomDomain.start && zoomDomain.end ? 
            [zoomDomain.start, zoomDomain.end] : 
            ['dataMin', 'dataMax']}
          scale="time"
          tick={{ fontSize: 12 }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <RechartsTooltip content={<CustomTooltip />} />
        <Legend verticalAlign="top" height={36} />
        
        {panelSignals.map((signal) => (
          <Line
            key={signal.id}
            name={signal.name}
            type="stepAfter"
            dataKey={signal.name}
            stroke={signal.color}
            activeDot={{ r: 5 }}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false} // Disable animation for better performance
          />
        ))}
        
        <Brush 
          dataKey="timestamp" 
          height={40} 
          stroke="hsl(var(--primary))"
          fill="hsla(var(--primary), 0.1)"
          onChange={(e) => {
            if (e.startIndex !== undefined && e.endIndex !== undefined && visibleChartData.length > 0) {
              const data = visibleChartData;
              setZoomDomain({
                start: data[e.startIndex]?.timestamp,
                end: data[e.endIndex]?.timestamp
              });
            }
          }}
        />
      </LineChart>
    );
  }, [visibleChartData, zoomDomain, formatXAxis, getPanelSignals]);

  // Memoize the bar chart component to improve performance
  const renderBarChart = useCallback((panelId: string) => {
    const panelSignals = getPanelSignals(panelId);
    
    return (
      <BarChart
        data={visibleChartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis}
          type="number"
          domain={zoomDomain.start && zoomDomain.end ? 
            [zoomDomain.start, zoomDomain.end] : 
            ['dataMin', 'dataMax']}
          scale="time"
          tick={{ fontSize: 12 }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <RechartsTooltip content={<CustomTooltip />} />
        <Legend verticalAlign="top" height={36} />
        
        {panelSignals.map((signal) => (
          <Bar
            key={signal.id}
            name={signal.name}
            dataKey={signal.name}
            fill={signal.color}
            isAnimationActive={false} // Disable animation for better performance
          />
        ))}
        
        <Brush 
          dataKey="timestamp" 
          height={40} 
          stroke="hsl(var(--primary))"
          fill="hsla(var(--primary), 0.1)"
          onChange={(e) => {
            if (e.startIndex !== undefined && e.endIndex !== undefined && visibleChartData.length > 0) {
              const data = visibleChartData;
              setZoomDomain({
                start: data[e.startIndex]?.timestamp,
                end: data[e.endIndex]?.timestamp
              });
            }
          }}
        />
      </BarChart>
    );
  }, [visibleChartData, zoomDomain, formatXAxis, getPanelSignals]);

  // Rendering pagination controls
  const renderPagination = useCallback(() => {
    if (!dataStats.totalPages || dataStats.totalPages <= 1) return null;
    
    // Calculate the page numbers to display
    const currentPage = dataStats.currentPage || 1;
    const totalPages = dataStats.totalPages;
    
    let pageNumbers = [];
    if (totalPages <= 7) {
      // Show all pages if there are 7 or fewer
      pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      // Show first, last, current, and pages around current
      if (currentPage <= 3) {
        // Near start
        pageNumbers = [1, 2, 3, 4, 5, 'ellipsis', totalPages];
      } else if (currentPage >= totalPages - 2) {
        // Near end
        pageNumbers = [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      } else {
        // Somewhere in the middle
        pageNumbers = [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
      }
    }
    
    return (
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                handlePageChange(currentPage - 1);
              }} 
            />
          </PaginationItem>
          
          {pageNumbers.map((page, i) => (
            <PaginationItem key={i}>
              {page === 'ellipsis' ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink 
                  href="#" 
                  isActive={page === currentPage}
                  onClick={(e) => {
                    e.preventDefault();
                    handlePageChange(page as number);
                  }}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}
          
          <PaginationItem>
            <PaginationNext 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                handlePageChange(currentPage + 1);
              }} 
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  }, [dataStats, handlePageChange]);

  return (
    <div className={cn("space-y-4", className)} ref={containerRef}>
      {signals.length > 0 ? (
        <>
          {isProcessing && (
            <Card className="p-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-start gap-2">
                <div className="text-blue-500">⏳</div>
                <div>
                  <h3 className="font-medium">Processing log data</h3>
                  <p className="text-sm text-muted-foreground">
                    {processingStatus || "This may take a few moments, please wait..."}
                  </p>
                </div>
              </div>
            </Card>
          )}
          
          {!isProcessing && chartData.length === 0 && (
            <Card className="p-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
              <div className="flex items-start gap-2">
                <div className="text-yellow-500">⚠️</div>
                <div>
                  <h3 className="font-medium">No matching data found</h3>
                  <p className="text-sm text-muted-foreground">The regex patterns didn't match any data in the log file.</p>
                  <div className="mt-2">
                    <p className="text-sm font-medium">Sample log lines:</p>
                    <div className="mt-1 p-2 bg-black/5 rounded text-xs font-mono overflow-x-auto max-h-40">
                      {rawLogSample.map((line, i) => (
                        <div key={i} className="whitespace-nowrap">{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h3 className="text-lg font-medium">Signal Visualization</h3>
            <div className="flex flex-wrap items-center gap-2">
              {dataStats.total > 0 && (
                <div className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                  {dataStats.samplingRate > 1 ? (
                    <>Showing {dataStats.displayed.toLocaleString()} of {dataStats.total.toLocaleString()} points (1:{dataStats.samplingRate})</>
                  ) : (
                    <>Showing all {dataStats.total.toLocaleString()} points</>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetAll}
                className="h-8"
              >
                <RefreshCcw className="h-4 w-4 mr-1" />
                Reset All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomReset}
                className="h-8"
              >
                <Maximize className="h-4 w-4 mr-1" />
                Reset Zoom
              </Button>
              <Select 
                value={chartType} 
                onValueChange={(value) => setChartType(value as 'line' | 'bar')}
              >
                <SelectTrigger className="w-[130px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">
                    <div className="flex items-center gap-2">
                      <LineChartIcon className="h-4 w-4" />
                      <span>Line Chart</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="bar">
                    <div className="flex items-center gap-2">
                      <BarChartIcon className="h-4 w-4" />
                      <span>Bar Chart</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Time Navigation Controls */}
          <Card className="p-4 border border-border/50">
            <CardHeader className="p-0 pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-medium">Time Range Selection</CardTitle>
                <div className="flex items-center gap-2">
                  <Select 
                    value={timeNavigation === 'preset' ? timeRangePreset : 
                           timeNavigation === 'pagination' ? 'pagination' : 
                           timeNavigation === 'window' ? 'window' : 'custom'} 
                    onValueChange={(value) => {
                      if (value === 'pagination') {
                        handleTimeRangePresetChange('pagination');
                      } else if (value === 'window') {
                        handleTimeRangePresetChange('window');
                      } else {
                        handleTimeRangePresetChange(value);
                      }
                    }}
                  >
                    <SelectTrigger className="w-[150px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Data</SelectItem>
                      <SelectItem value="1h">Last Hour</SelectItem>
                      <SelectItem value="6h">Last 6 Hours</SelectItem>
                      <SelectItem value="12h">Last 12 Hours</SelectItem>
                      <SelectItem value="24h">Last 24 Hours</SelectItem>
                      <SelectItem value="3d">Last 3 Days</SelectItem>
                      <SelectItem value="7d">Last 7 Days</SelectItem>
                      <SelectItem value="window">Sliding Window</SelectItem>
                      <SelectItem value="pagination">Page by Page</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="font-medium">Data Points</p>
                    <p className="text-xs text-muted-foreground">
                      Configure how many points to display for large datasets
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fewer (faster)</span>
                    <span>More (detailed)</span>
                  </div>
                  <Slider
                    value={[maxDisplayPoints]}
                    min={500}
                    max={MAX_CHART_POINTS_LIMIT}
                    step={500}
                    onValueChange={handleMaxPointsChange}
                  />
                  <div className="text-xs text-center text-muted-foreground">
                    Maximum: {maxDisplayPoints.toLocaleString()} points
                  </div>
                </div>
              </div>
              
              {timeNavigation === 'window' && (
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm">
                        <p className="font-medium">Time Window Size</p>
                        <p className="text-xs text-muted-foreground">
                          Set how many hours to show at once
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Slider
                        value={[timeWindowSize]}
                        min={1}
                        max={72}
                        step={1}
                        onValueChange={handleWindowSizeChange}
                      />
                      <div className="text-xs text-center text-muted-foreground">
                        Window size: {timeWindowSize} hour{timeWindowSize > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateTimeWindow('backward')}
                        className="h-8"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                    </div>
                    
                    {customTimeRange.start && customTimeRange.end && (
                      <div className="text-xs text-center">
                        {formatTimeLabel(customTimeRange.start)} - {formatTimeLabel(customTimeRange.end)}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateTimeWindow('forward')}
                        className="h-8"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
              {timeNavigation === 'pagination' && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      Page Navigation
                    </div>
                    
                    {dataStats.currentPage && dataStats.totalPages && (
                      <div className="text-xs text-muted-foreground">
                        Page {dataStats.currentPage} of {dataStats.totalPages}
                      </div>
                    )}
                  </div>
                  
                  {renderPagination()}
                </div>
              )}
              
              {(timeNavigation === 'preset' || timeNavigation === 'custom') && customTimeRange.start && customTimeRange.end && (
                <div className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Custom Time Range</span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => navigateTime('backward')}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => navigateTime('forward')}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <div className="px-2 py-1 bg-accent/10 rounded">
                      From: {formatTimeLabel(customTimeRange.start)}
                    </div>
                    <div className="px-2 py-1 bg-accent/10 rounded">
                      To: {formatTimeLabel(customTimeRange.end)}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <Card className="h-full">
                <CardContent className="p-4">
                  <h4 className="text-sm font-medium mb-3">Available Signals</h4>
                  <ScrollArea className="h-[300px] pr-3">
                    {signals.map((signal) => (
                      <div 
                        key={signal.id}
                        className={`
                          mb-2 p-2 rounded border flex items-center justify-between
                          transition-colors hover:bg-accent/10
                          ${signal.visible ? 'border-border' : 'border-border/30 opacity-60'}
                        `}
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: signal.color }}
                          />
                          <span className="text-sm">{signal.name}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleSignalVisibility(signal.id)}
                          >
                            {signal.visible ? (
                              <X className="h-3 w-3" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                          </Button>
                          <Select 
                            onValueChange={(value) => handleAddSignalToPanel(value, signal.id)}
                          >
                            <SelectTrigger className="h-6 w-6 p-0">
                              <Split className="h-3 w-3" />
                            </SelectTrigger>
                            <SelectContent>
                              {panels.map((panel) => (
                                <SelectItem key={panel.id} value={panel.id}>
                                  Add to {panel.id.replace('panel-', 'Panel ')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <div className="md:col-span-3">
              <Card className="h-full border border-border/50">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
                  <div className="flex justify-between items-center border-b p-1">
                    <TabsList>
                      {panels.map((panel) => (
                        <TabsTrigger 
                          key={panel.id} 
                          value={panel.id}
                          className="relative px-4 py-1.5"
                        >
                          {panel.id.replace('panel-', 'Panel ')}
                          {panels.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 absolute -top-1 -right-1 rounded-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemovePanel(panel.id);
                              }}
                            >
                              <X className="h-2 w-2" />
                            </Button>
                          )}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={handleAddPanel}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {panels.map((panel) => (
                    <TabsContent key={panel.id} value={panel.id} className="p-0 h-[400px] mt-0">
                      {getPanelSignals(panel.id).length === 0 ? (
                        <div className="h-full flex items-center justify-center text-muted-foreground">
                          <div className="text-center">
                            <p>No signals added to this panel</p>
                            <p className="text-sm">Add signals from the list on the left</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {visibleChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              {chartType === 'line' 
                                ? renderLineChart(panel.id) 
                                : renderBarChart(panel.id)
                              }
                            </ResponsiveContainer>
                          ) : isProcessing ? (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-center animate-pulse">
                                <p>Preparing chart data...</p>
                                <p className="text-sm text-muted-foreground">This may take a moment for large datasets</p>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-center">
                                <p>No data to display</p>
                                <p className="text-sm text-muted-foreground">Try selecting different signals or patterns</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </Card>
            </div>
          </div>

          {activeTab && (
            <Card className="border border-border/50">
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-3">
                  Signals in {activeTab.replace('panel-', 'Panel ')}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {getPanelSignals(activeTab).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No signals added to this panel</p>
                  ) : (
                    getPanelSignals(activeTab).map((signal) => (
                      <div 
                        key={signal.id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary"
                      >
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: signal.color }}
                        />
                        <span className="text-xs">{signal.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 rounded-full ml-1 hover:bg-secondary-foreground/10"
                          onClick={() => handleRemoveSignalFromPanel(activeTab, signal.id)}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-6 text-center">
          <div className="py-8">
            <LineChartIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-2">No Visualization Data</h3>
            <p className="text-muted-foreground mb-4">
              Please upload a log file and select regex patterns to extract data
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default LogChart;
