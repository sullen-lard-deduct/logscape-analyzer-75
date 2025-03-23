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
import { RegexPattern } from "@/components/regex/RegexManager";
import { cn } from "@/lib/utils";
import { format, addHours, subHours, startOfHour, endOfHour, addDays, subDays } from 'date-fns';
import ChartControls from "./chart-components/ChartControls";
import TimeNavigationControls from "./chart-components/TimeNavigationControls";
import PanelTabsManager from "./chart-components/PanelTabsManager";
import ChartDisplay from "./chart-components/ChartDisplay";
import LogSample from "./chart-components/LogSample";
import { processLogDataInChunks } from "@/utils/logProcessing";

// Types moved to separate file for clarity
import { 
  LogData, 
  Signal, 
  ChartPanel, 
  LogChartProps 
} from "@/types/chartTypes";

// Constants
const MAX_CHART_POINTS = 5000;
const MAX_VISIBLE_POINTS = 1000; 
const MAX_CHART_POINTS_LIMIT = 50000;

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
      
      // Call the refactored processing function from utils
      processLogDataInChunks(
        logContent, 
        patterns, 
        setChartData, 
        setFormattedChartData, 
        setSignals, 
        setPanels, 
        setStringValueMap, 
        setProcessingStatus, 
        setIsProcessing,
        optimizedFormatChartData
      );
      
      toast.success("Started processing log data");
    } catch (error) {
      console.error("Error processing log data:", error);
      toast.error("Error processing log data");
      setIsProcessing(false);
    }
  }, [logContent, patterns]);

  const optimizedFormatChartData = useCallback((data: LogData[], valueMap: Record<string, Record<string, number>>) => {
    if (data.length === 0) {
      setIsProcessing(false);
      setProcessingStatus("");
      return;
    }

    setProcessingStatus("Formatting data (0%)");
    
    const getBatchSize = () => {
      if (data.length > 500000) return 1000;
      if (data.length > 100000) return 2000;
      if (data.length > 50000) return 5000;
      return 10000;
    };
    
    const BATCH_SIZE = getBatchSize();
    const totalBatches = Math.ceil(data.length / BATCH_SIZE);
    const result: any[] = [];
    
    const timestamps = data.map(item => item.timestamp.getTime());
    const minTime = new Date(Math.min(...timestamps));
    const maxTime = new Date(Math.max(...timestamps));
    setDataRange({ min: minTime, max: maxTime });
    
    let batchIndex = 0;
    
    const processBatch = () => {
      const isLastBatch = batchIndex === totalBatches - 1;
      
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min((batchIndex + 1) * BATCH_SIZE, data.length);
      
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
        
        result.push(dataPoint);
      }
      
      const progress = Math.round(((batchIndex + 1) / totalBatches) * 100);
      if (progress < 99 || isLastBatch) {
        setProcessingStatus(`Formatting data (${progress}%)`);
      }
      
      batchIndex++;
      
      if (batchIndex < totalBatches) {
        setTimeout(processBatch, 0);
      } else {
        finalizeBatches();
      }
    };
    
    const finalizeBatches = () => {
      setFormattedChartData(result);
      prepareDisplayData(result);
      setIsProcessing(false);
      setProcessingStatus("");
      toast.success("Chart data ready");
    };
    
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
    let filteredData = formattedChartData;
    
    if (customTimeRange.start || customTimeRange.end) {
      filteredData = applyTimeRangeFilter(formattedChartData, customTimeRange);
    }
    
    if (zoomDomain.start && zoomDomain.end) {
      filteredData = filteredData.filter(
        (item) => item.timestamp >= zoomDomain.start! && item.timestamp <= zoomDomain.end!
      );
    }
    
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

  const handleBrushChange = useCallback((brushData: any) => {
    if (!brushData.startIndex && brushData.startIndex !== 0) return;
    if (!brushData.endIndex && brushData.endIndex !== 0) return;
    if (brushData.startIndex === brushData.endIndex) return;
    if (visibleChartData.length === 0) return;
    
    const startIndex = Math.max(0, brushData.startIndex);
    const endIndex = Math.min(visibleChartData.length - 1, brushData.endIndex);
    
    const startTimestamp = visibleChartData[startIndex]?.timestamp;
    const endTimestamp = visibleChartData[endIndex]?.timestamp;
    
    if (!startTimestamp || !endTimestamp) {
      console.error("Invalid brush data timestamps:", startTimestamp, endTimestamp);
      return;
    }
    
    console.log("Brush zoom applied:", new Date(startTimestamp).toISOString(), new Date(endTimestamp).toISOString());
    
    setZoomDomain({
      start: startTimestamp,
      end: endTimestamp
    });
  }, [visibleChartData]);

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
              onClick={() => {
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
                toast.success("All data has been reset");
              }}
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
            <ChartControls 
              dataStats={dataStats}
              timeNavigation={timeNavigation}
              timeRangePreset={timeRangePreset}
              timeWindowSize={timeWindowSize}
              customTimeRange={customTimeRange}
              maxDisplayPoints={maxDisplayPoints}
              chartType={chartType}
              zoomDomain={zoomDomain}
              formattedChartData={formattedChartData}
              currentPage={currentPage}
              isProcessing={isProcessing}
              onTimeRangePresetChange={(preset) => handleTimeRangePresetChange(preset)}
              onTimeWindowSizeChange={(size) => setTimeWindowSize(size)}
              onNavigateTimeWindow={(direction) => navigateTimeWindow(direction)}
              onNavigateTime={(direction) => navigateTime(direction)}
              onMaxPointsChange={(points) => handleMaxPointsChange(points)}
              onChartTypeChange={(type) => setChartType(type)}
              onZoomReset={() => handleZoomReset()}
              renderPaginationControls={renderPaginationControls}
            />
            
            <div className="text-xs flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <div>Total data points: <span className="font-medium">{dataStats.total.toLocaleString()}</span></div>
              <div>Displayed: <span className="font-medium">{dataStats.displayed.toLocaleString()}</span></div>
              {dataStats.samplingRate > 1 && (
                <div>Sampling: <span className="font-medium">1:{dataStats.samplingRate}</span></div>
              )}
              {customTimeRange.start && customTimeRange.end && (
                <div>Range: <span className="font-medium">{formatTimeLabel(customTimeRange.start)} - {formatTimeLabel(customTimeRange.end)}</span></div>
              )}
            </div>
            
            <PanelTabsManager
              panels={panels}
              activeTab={activeTab}
              signals={signals}
              onActiveTabChange={setActiveTab}
              onAddPanel={handleAddPanel}
              onRemovePanel={handleRemovePanel}
              onAddSignal={handleAddSignalToPanel}
              onRemoveSignal={handleRemoveSignalFromPanel}
              onToggleSignalVisibility={toggleSignalVisibility}
              renderChartDisplay={(panelId) => (
                <ChartDisplay
                  containerRef={containerRef}
                  chartType={chartType}
                  visibleChartData={visibleChartData}
                  zoomDomain={zoomDomain}
                  signals={getPanelSignals(panelId)}
                  onBrushChange={handleBrushChange}
                />
              )}
            />
            
            <LogSample rawLogSample={rawLogSample} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LogChart;
