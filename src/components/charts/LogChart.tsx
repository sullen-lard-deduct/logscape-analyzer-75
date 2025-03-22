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
  
  useEffect(() => {
    if (!logContent || patterns.length === 0) return;
    
    try {
      setIsProcessing(true);
      setProcessingStatus("Starting to process log data");
      const logLines = logContent.split('\n');
      setRawLogSample(logLines.slice(0, 10));
      
      console.log("Processing log data with patterns:", patterns);
      console.log(`Starting to process ${logLines.length} log lines`);
      
      processLogDataInChunks(logContent, patterns);
      toast.success("Started processing log data");
    } catch (error) {
      console.error("Error processing log data:", error);
      toast.error("Error processing log data");
      setIsProcessing(false);
    }
  }, [logContent, patterns]);

  const processLogDataInChunks = useCallback((content: string, regexPatterns: RegexPattern[]) => {
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
          }
        }
      });
      
      const progress = Math.round(((currentChunk + 1) / chunks) * 100);
      if (progress % 20 === 0 || progress === 100) {
        toast.info(`Processing: ${progress}% - Found ${parsedData.length.toLocaleString()} data points so far`);
      }
      
      currentChunk++;
      
      // Use requestAnimationFrame instead of setTimeout for smoother UI updates
      // This helps prevent the browser from getting stuck in long processing loops
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
              optimizedFormatChartData(parsedData, newStringValueMap);
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
  }, []);

  // Replace the original formatChartDataAsync with a more optimized version
  const optimizedFormatChartData = useCallback((data: LogData[], valueMap: Record<string, Record<string, number>>) => {
    if (data.length === 0) {
      setIsProcessing(false);
      setProcessingStatus("");
      return;
    }

    setProcessingStatus("Formatting data (0%)");
    
    // Determine optimal batch size based on data size
    const getBatchSize = () => {
      if (data.length > 500000) return 1000;
      if (data.length > 100000) return 2000;
      if (data.length > 50000) return 5000;
      return 10000;
    };
    
    const BATCH_SIZE = getBatchSize();
    const totalBatches = Math.ceil(data.length / BATCH_SIZE);
    const result: any[] = [];
    
    // Pre-process min/max timestamps to set data range early
    const timestamps = data.map(item => item.timestamp.getTime());
    const minTime = new Date(Math.min(...timestamps));
    const maxTime = new Date(Math.max(...timestamps));
    setDataRange({ min: minTime, max: maxTime });
    
    // Process data in batches
    let batchIndex = 0;
    
    const processBatch = () => {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min((batchIndex + 1) * BATCH_SIZE, data.length);
      
      for (let i = startIdx; i < endIdx; i++) {
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
      
      // Update progress
      const progress = Math.round(((batchIndex + 1) / totalBatches) * 100);
      setProcessingStatus(`Formatting data (${progress}%)`);
      
      batchIndex++;
      
      if (batchIndex < totalBatches) {
        // Continue with next batch
        setTimeout(processBatch, 0);
      } else {
        // All batches processed, finalize
        finalizeBatches();
      }
    };
    
    const finalizeBatches = () => {
      setProcessingStatus("Finalizing chart data");
      // Small delay to allow UI to update before setting data
      setTimeout(() => {
        // Set formatted data
        setFormattedChartData(result);
        
        // Prepare display data
        prepareDisplayData(result);
        
        setIsProcessing(false);
        setProcessingStatus("");
        toast.success("Chart data ready");
      }, 10);
    };
    
    // Start processing the first batch
    setTimeout(processBatch, 0);
  }, []);

  const prepareDisplayData = useCallback((data: any[]) => {
    setProcessingStatus("Preparing chart data for display");
    
    const prepareData = () => {
      try {
        const total = data.length;
        let sampled;
        let samplingRate = 1;
        
        if (total > maxDisplayPoints) {
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
    
    window.setTimeout(prepareData, 0);
  }, [maxDisplayPoints, timeNavigation]);

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

  const handlePageChange = useCallback((page: number) => {
    if (!dataStats.totalPages) return;
    
    if (page < 1) page = 1;
    if (page > dataStats.totalPages) page = dataStats.totalPages;
    
    setCurrentPage(page);
    
    const pageSize = maxDisplayPoints;
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, formattedChartData.length);
    
    const pageData = formattedChartData.slice(startIndex, endIndex);
    
    setDisplayedChartData(pageData);
    setDataStats({
      ...dataStats,
      currentPage: page,
      displayed: pageData.length
    });
    
    if (dataRange.min && dataRange.max && formattedChartData.length > 0) {
      const pageStartTime = new Date(pageData[0].timestamp);
      const pageEndTime = new Date(pageData[pageData.length - 1].timestamp);
      setCustomTimeRange({ start: pageStartTime, end: pageEndTime });
    }
    
    setZoomDomain({});
  }, [dataStats, maxDisplayPoints, formattedChartData, dataRange]);

  const navigateTime = useCallback((direction: 'forward' | 'backward') => {
    if (!customTimeRange.start || !customTimeRange.end) return;
    
    const start = customTimeRange.start;
    const end = customTimeRange.end;
    const duration = end.getTime() - start.getTime();
    
    if (direction === 'forward') {
      const newStart = new Date(start.getTime() + duration);
      const newEnd = new Date(end.getTime() + duration);
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
      if (dataRange.min && newStart < dataRange.min) {
        const adjustedStart = dataRange.min;
        const adjustedEnd = new Date(adjustedStart.getTime() + duration);
        setCustomTimeRange({ start: adjustedStart, end: adjustedEnd });
      } else {
        setCustomTimeRange({ start: newStart, end: newEnd });
      }
    }
  }, [customTimeRange, dataRange]);

  const navigateTimeWindow = useCallback((direction: 'forward' | 'backward') => {
    if (!dataRange.min || !dataRange.max) return;
    
    const windowMs = timeWindowSize * 60 * 60 * 1000;
    
    let newStart, newEnd;
    
    if (!customTimeRange.start || !customTimeRange.end) {
      newEnd = dataRange.max;
      newStart = new Date(newEnd.getTime() - windowMs);
    } else {
      if (direction === 'forward') {
        newStart = new Date(customTimeRange.end.getTime());
        newEnd = new Date(newStart.getTime() + windowMs);
        
        if (newEnd > dataRange.max) {
          newEnd = dataRange.max;
          newStart = new Date(newEnd.getTime() - windowMs);
        }
      } else {
        newEnd = new Date(customTimeRange.start.getTime());
        newStart = new Date(newEnd.getTime() - windowMs);
        
        if (newStart < dataRange.min) {
          newStart = dataRange.min;
          newEnd = new Date(newStart.getTime() + windowMs);
        }
      }
    }
    
    setCustomTimeRange({ start: newStart, end: newEnd });
    setZoomDomain({});
  }, [customTimeRange, dataRange, timeWindowSize]);

  useEffect(() => {
    if (timeNavigation === 'window' && customTimeRange.start && customTimeRange.end) {
      const filteredData = applyTimeRangeFilter(formattedChartData, customTimeRange);
      
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

  const handleTimeRangePresetChange = useCallback((preset: string) => {
    setTimeRangePreset(preset);
    setZoomDomain({});
    
    if (preset === 'all') {
      setTimeNavigation('preset');
      setCustomTimeRange({});
      
      prepareDisplayData(formattedChartData);
    } else if (preset === 'custom') {
      if (!customTimeRange.start || !customTimeRange.end) {
        if (dataRange.max) {
          const end = dataRange.max;
          const start = subHours(end, 1);
          setCustomTimeRange({ start, end });
        }
      }
    } else if (preset === 'window') {
      setTimeNavigation('window');
      
      if (dataRange.max) {
        const end = dataRange.max;
        const start = subHours(end, timeWindowSize);
        setCustomTimeRange({ start, end });
      }
    } else if (preset === 'pagination') {
      setTimeNavigation('pagination');
      setCustomTimeRange({});
      
      handlePageChange(1);
    } else {
      setTimeNavigation('preset');
      const presetConfig = TIME_RANGE_PRESETS.find(p => p.value === preset);
      if (presetConfig && dataRange.max) {
        const range = presetConfig.getRange(dataRange.max);
        if (dataRange.min && range.start && range.start < dataRange.min) {
          range.start = dataRange.min;
        }
        setCustomTimeRange(range);
      }
    }
  }, [customTimeRange, dataRange, timeWindowSize, formattedChartData, prepareDisplayData, handlePageChange]);

  const getTimeNavigationValue = useCallback(() => {
    if (timeNavigation === 'pagination') return 'pagination';
    if (timeNavigation === 'window') return 'window';
    if (timeNavigation === 'preset') return timeRangePreset;
    return 'custom';
  }, [timeNavigation, timeRangePreset]);

  const visibleChartData = useMemo(() => {
    if (timeNavigation === 'pagination') {
      return displayedChartData;
    }
    
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

  const handleMaxPointsChange = useCallback((value: number[]) => {
    const newMaxPoints = value[0];
    if (newMaxPoints !== maxDisplayPoints) {
      setMaxDisplayPoints(newMaxPoints);
      
      if (formattedChartData.length > 0) {
        setProcessingStatus("Resampling data...");
        setIsProcessing(true);
        
        setTimeout(() => {
          try {
            if (timeNavigation === 'pagination') {
              const totalPages = Math.ceil(formattedChartData.length / newMaxPoints);
              setDataStats({
                ...dataStats,
                totalPages
              });
              handlePageChange(currentPage);
            } else {
              prepareDisplayData(formattedChartData);
            }
            setIsProcessing(false);
          } catch (error) {
            console.error("Error updating display points:", error);
            toast.error("Error updating display settings");
            setIsProcessing(false);
            setProcessingStatus("");
          }
        }, 0);
      }
    }
  }, [maxDisplayPoints, formattedChartData, timeNavigation, dataStats, currentPage, handlePageChange, prepareDisplayData]);

  const renderPaginationControls = useCallback(() => {
    if (!dataStats.totalPages || dataStats.totalPages <= 1) return null;
    
    return (
      <Pagination className="mt-0">
        <PaginationContent>
          <PaginationItem>
            {currentPage <= 1 ? (
              <span className="flex h-10 items-center gap-1 pl-2.5 pr-2.5 text-muted-foreground">
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </span>
            ) : (
              <PaginationPrevious 
                onClick={() => handlePageChange(currentPage - 1)} 
                tabIndex={0}
              />
            )}
          </PaginationItem>
          
          {currentPage > 2 && (
            <PaginationItem>
              <PaginationLink onClick={() => handlePageChange(1)}>
                1
              </PaginationLink>
            </PaginationItem>
          )}
          
          {currentPage > 3 && <PaginationEllipsis />}
          
          {currentPage > 1 && (
            <PaginationItem>
              <PaginationLink onClick={() => handlePageChange(currentPage - 1)}>
                {currentPage - 1}
              </PaginationLink>
            </PaginationItem>
          )}
          
          <PaginationItem>
            <PaginationLink isActive onClick={() => handlePageChange(currentPage)}>
              {currentPage}
            </PaginationLink>
          </PaginationItem>
          
          {currentPage < dataStats.totalPages && (
            <PaginationItem>
              <PaginationLink onClick={() => handlePageChange(currentPage + 1)}>
                {currentPage + 1}
              </PaginationLink>
            </PaginationItem>
          )}
          
          {currentPage < dataStats.totalPages - 2 && <PaginationEllipsis />}
          
          {currentPage < dataStats.totalPages - 1 && (
            <PaginationItem>
              <PaginationLink onClick={() => handlePageChange(dataStats.totalPages)}>
                {dataStats.totalPages}
              </PaginationLink>
            </PaginationItem>
          )}
          
          <PaginationItem>
            {currentPage >= (dataStats.totalPages || 1) ? (
              <span className="flex h-10 items-center gap-1 pl-2.5 pr-2.5 text-muted-foreground">
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </span>
            ) : (
              <PaginationNext 
                onClick={() => handlePageChange(currentPage + 1)}
                tabIndex={0}
              />
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  }, [currentPage, dataStats.totalPages, handlePageChange]);

  return (
    <Card className={cn("shadow-sm border-border/50", className)}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon className="h-5 w-5" /> 
              Log Visualization
            </CardTitle>
            <CardDescription>
              Visualize patterns from your log data
            </CardDescription>
          </div>
          
          <div className="flex gap-2 items-center">
            {isProcessing && (
              <div className="flex items-center text-sm text-muted-foreground">
                <div className="w-4 h-4 mr-2 rounded-full border-2 border-t-primary animate-spin" />
                {processingStatus}
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              disabled={isProcessing || formattedChartData.length === 0}
              title="Reset chart"
              onClick={handleResetAll}
            >
              <RefreshCcw className="h-4 w-4 mr-1" /> Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isProcessing && chartData.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-10 h-10 mb-4 rounded-full border-4 border-t-primary animate-spin" />
            <h3 className="text-lg font-medium mb-1">Processing log data</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {processingStatus || "Extracting patterns from your log file..."}
            </p>
          </div>
        )}
        
        {!isProcessing && chartData.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <LineChartIcon className="w-12 h-12 mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-medium mb-1">No visualization data yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Select patterns to extract data from your logs.
            </p>
          </div>
        )}
        
        {chartData.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-8 flex flex-wrap gap-2 items-center">
                <Select value={getTimeNavigationValue()} onValueChange={handleTimeRangePresetChange}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Time range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All data</SelectItem>
                    <SelectItem value="pagination">Pagination</SelectItem>
                    <SelectItem value="window">Sliding window</SelectItem>
                    {TIME_RANGE_PRESETS.filter(p => p.value !== 'all').map(preset => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {timeNavigation === 'window' && (
                  <>
                    <Select 
                      value={timeWindowSize.toString()} 
                      onValueChange={(val) => setTimeWindowSize(Number(val))}
                    >
                      <SelectTrigger className="w-32">
                        <Clock className="w-4 h-4 mr-2" /> {timeWindowSize}h
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 4, 6, 12, 24, 48, 72].map(hours => (
                          <SelectItem key={hours} value={hours.toString()}>
                            {hours} hours
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateTimeWindow('backward')}
                        disabled={isProcessing}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateTimeWindow('forward')}
                        disabled={isProcessing}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
                
                {timeNavigation === 'preset' && customTimeRange.start && customTimeRange.end && (
                  <div className="text-sm flex items-center gap-2">
                    <CalendarRange className="w-4 h-4" />
                    <span>
                      {formatTimeLabel(customTimeRange.start)} - {formatTimeLabel(customTimeRange.end)}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateTime('backward')}
                        disabled={isProcessing}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateTime('forward')}
                        disabled={isProcessing}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
                
                {timeNavigation === 'pagination' && renderPaginationControls()}
              </div>
              
              <div className="lg:col-span-4 flex flex-wrap items-center gap-3 justify-end">
                <div className="flex flex-col gap-1 min-w-[150px]">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Display limit:</span>
                    <span className="text-xs font-medium">{maxDisplayPoints.toLocaleString()}</span>
                  </div>
                  <Slider
                    defaultValue={[maxDisplayPoints]}
                    min={1000}
                    max={MAX_CHART_POINTS_LIMIT}
                    step={1000}
                    onValueChange={handleMaxPointsChange}
                    disabled={isProcessing}
                  />
                </div>
                
                <div className="flex border rounded-md overflow-hidden">
                  <Button
                    variant={chartType === 'line' ? 'default' : 'outline'} 
                    size="sm"
                    className={`rounded-none ${chartType === 'line' ? '' : 'border-0'}`}
                    onClick={() => setChartType('line')}
                  >
                    <LineChartIcon className="h-4 w-4 mr-1" /> Line
                  </Button>
                  <Button
                    variant={chartType === 'bar' ? 'default' : 'outline'}
                    size="sm"
                    className={`rounded-none ${chartType === 'bar' ? '' : 'border-0'}`}
                    onClick={() => setChartType('bar')}
                  >
                    <BarChartIcon className="h-4 w-4 mr-1" /> Bar
                  </Button>
                </div>
                
                {zoomDomain.start && zoomDomain.end && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleZoomReset}
                  >
                    <ZoomOut className="h-4 w-4 mr-1" /> Reset Zoom
                  </Button>
                )}
              </div>
            </div>
            
            <div className="text-xs flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <div>Total data points: <span className="font-medium">{dataStats.total.toLocaleString()}</span></div>
              <div>Currently displayed: <span className="font-medium">{dataStats.displayed.toLocaleString()}</span></div>
              {dataStats.samplingRate > 1 && (
                <div>Sampling rate: <span className="font-medium">1/{dataStats.samplingRate}</span></div>
              )}
              {customTimeRange.start && customTimeRange.end && (
                <div>Range: <span className="font-medium">
                  {formatTimeLabel(customTimeRange.start)} - {formatTimeLabel(customTimeRange.end)}
                </span></div>
              )}
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <TabsList>
                  {panels.map(panel => (
                    <TabsTrigger key={panel.id} value={panel.id} className="relative">
                      Panel {panel.id.split('-')[1]}
                      {panels.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePanel(panel.id);
                          }}
                          className="ml-1 rounded-full hover:bg-muted p-0.5 absolute -top-1 -right-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleAddPanel}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Panel
                </Button>
              </div>
              
              {panels.map(panel => (
                <TabsContent key={panel.id} value={panel.id} className="mt-0">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-3">
                      <div className="bg-card border rounded-md p-3">
                        <h3 className="text-sm font-medium mb-2">Available Signals</h3>
                        <ScrollArea className="h-[300px]">
                          <div className="space-y-1.5 pr-3">
                            {signals.map(signal => {
                              const isInPanel = panel.signals.includes(signal.id);
                              
                              return (
                                <div
                                  key={signal.id}
                                  className={`
                                    flex items-center justify-between p-2 text-sm rounded-md cursor-pointer
                                    ${isInPanel ? 'bg-muted' : 'hover:bg-muted/50'}
                                  `}
                                  onClick={() => {
                                    if (isInPanel) {
                                      handleRemoveSignalFromPanel(panel.id, signal.id);
                                    } else {
                                      handleAddSignalToPanel(panel.id, signal.id);
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: signal.color }}
                                    />
                                    <span>{signal.name}</span>
                                  </div>
                                  {isInPanel && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSignalVisibility(signal.id);
                                      }}
                                    >
                                      <div className={`w-2 h-2 rounded-full ${signal.visible ? 'bg-green-500' : 'bg-red-500'}`} />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                    
                    <div className="lg:col-span-9" ref={containerRef}>
                      <div className="bg-card border rounded-md p-3 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === 'line' ? (
                            <LineChart
                              data={visibleChartData}
                              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="timestamp" 
                                tickFormatter={formatXAxis} 
                                type="number"
                                domain={zoomDomain.start && zoomDomain.end ? [zoomDomain.start, zoomDomain.end] : ['dataMin', 'dataMax']}
                                scale="time"
                              />
                              <YAxis />
                              <RechartsTooltip content={<CustomTooltip />} />
                              <Legend />
                              {getPanelSignals(panel.id).map(signal => (
                                <Line
                                  key={signal.id}
                                  type="monotone"
                                  dataKey={signal.name}
                                  name={signal.name}
                                  stroke={signal.color}
                                  activeDot={{ r: 6 }}
                                  isAnimationActive={false}
                                />
                              ))}
                              <Brush 
                                dataKey="timestamp" 
                                height={30} 
                                stroke="#8884d8"
                                onChange={(brushData) => {
                                  if (brushData.startIndex === brushData.endIndex) return;
                                  if (visibleChartData.length === 0) return;
                                  
                                  // Fix: Store the complete timestamp values, not indices
                                  const startTimestamp = visibleChartData[brushData.startIndex].timestamp;
                                  const endTimestamp = visibleChartData[brushData.endIndex].timestamp;
                                  
                                  console.log("Brush zoom:", startTimestamp, endTimestamp);
                                  
                                  setZoomDomain({
                                    start: startTimestamp,
                                    end: endTimestamp
                                  });
                                }}
                              />
                            </LineChart>
                          ) : (
                            <BarChart
                              data={visibleChartData}
                              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                dataKey="timestamp" 
                                tickFormatter={formatXAxis} 
                                type="number"
                                domain={zoomDomain.start && zoomDomain.end ? [zoomDomain.start, zoomDomain.end] : ['dataMin', 'dataMax']}
                                scale="time"
                              />
                              <YAxis />
                              <RechartsTooltip content={<CustomTooltip />} />
                              <Legend />
                              {getPanelSignals(panel.id).map(signal => (
                                <Bar
                                  key={signal.id}
                                  type="monotone"
                                  dataKey={signal.name}
                                  name={signal.name}
                                  fill={signal.color}
                                  isAnimationActive={false}
                                />
                              ))}
                              <Brush 
                                dataKey="timestamp" 
                                height={30} 
                                stroke="#8884d8"
                                onChange={(brushData) => {
                                  if (brushData.startIndex === brushData.endIndex) return;
                                  if (visibleChartData.length === 0) return;
                                  
                                  // Fix: Store the complete timestamp values, not indices
                                  const startTimestamp = visibleChartData[brushData.startIndex].timestamp;
                                  const endTimestamp = visibleChartData[brushData.endIndex].timestamp;
                                  
                                  console.log("Brush zoom:", startTimestamp, endTimestamp);
                                  
                                  setZoomDomain({
                                    start: startTimestamp,
                                    end: endTimestamp
                                  });
                                }}
                              />
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
            
            {rawLogSample.length > 0 && (
              <div className="mt-8 border rounded-md">
                <div className="px-4 py-2 bg-muted font-medium text-sm border-b flex justify-between items-center">
                  <span>Sample Log Lines</span>
                </div>
                <div className="p-3 text-xs font-mono whitespace-pre-wrap bg-black text-green-400 overflow-x-auto max-h-[200px]">
                  {rawLogSample.join('\n')}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LogChart;
