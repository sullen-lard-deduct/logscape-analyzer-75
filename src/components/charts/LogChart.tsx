import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart as LineChartIcon, BarChart as BarChartIcon,
  RefreshCcw
} from 'lucide-react';
import { RegexPattern } from "@/components/regex/RegexManager";
import { cn } from "@/lib/utils";
import ChartControls from "./chart-components/ChartControls";
import PanelTabsManager from "./chart-components/PanelTabsManager";
import ChartDisplay from "./chart-components/ChartDisplay";
import TimeSegmentedCharts from "./chart-components/TimeSegmentedCharts";
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
const TIME_SEGMENT_DURATION = 30; // minutes

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
  const [timeNavigation, setTimeNavigation] = useState<'preset' | 'pagination' | 'window' | 'segmented'>('segmented');
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

    setProcessingStatus("Formatting data for display");
    console.log(`Formatting ${data.length} data points for chart display`);
    
    try {
      // Extract timestamps for min/max calculations
      const timestamps = data.map(item => item.timestamp.getTime());
      const minTime = new Date(Math.min(...timestamps));
      const maxTime = new Date(Math.max(...timestamps));
      
      // Set data range for time navigation
      setDataRange({ min: minTime, max: maxTime });
      console.log(`Data time range: ${minTime.toISOString()} to ${maxTime.toISOString()}`);
      
      // Pre-format the data with a single pass
      const formattedPoints = data.map(item => {
        const dataPoint: any = {
          timestamp: item.timestamp.getTime(),
        };
        
        // Process all values
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
        
        return dataPoint;
      });
      
      // Sort by timestamp to ensure chronological order
      formattedPoints.sort((a, b) => a.timestamp - b.timestamp);
      
      // Store in state
      setFormattedChartData(formattedPoints);
      
      // Prepare display data
      setDisplayedChartData(formattedPoints);
      
      // Update stats
      setDataStats({
        total: formattedPoints.length,
        displayed: formattedPoints.length,
        samplingRate: 1,
        currentPage: 1,
        totalPages: 1
      });
      
      // Ensure we're using segmented view by default for large datasets
      setTimeNavigation('segmented');
      
      // Success!
      toast.success(`Chart data ready with ${data.length.toLocaleString()} data points`);
    } catch (error) {
      console.error("Error formatting chart data:", error);
      toast.error("Error formatting chart data");
      setIsProcessing(false);
      setProcessingStatus("");
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  }, []);

  const handleBrushChange = useCallback((brushData: any) => {
    console.log("Brush change in LogChart:", brushData);
    
    if (!brushData || (!brushData.startValue && !brushData.endValue)) {
      console.log("No valid brush data");
      return;
    }
    
    try {
      // Ensure we have valid start and end values
      if (brushData.startValue !== undefined && brushData.endValue !== undefined) {
        setZoomDomain({
          start: brushData.startValue,
          end: brushData.endValue
        });
        
        console.log(`Setting zoom domain: ${new Date(brushData.startValue).toISOString()} to ${new Date(brushData.endValue).toISOString()}`);
      }
    } catch (error) {
      console.error("Error handling brush change:", error);
    }
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomDomain({});
    console.log("Zoom reset");
    toast.info("Zoom reset");
  }, []);

  const handleTimeRangePresetChange = useCallback((preset: string) => {
    setTimeRangePreset(preset);
    
    if (preset === 'segmented') {
      setTimeNavigation('segmented');
      setZoomDomain({});
    } else if (preset === 'all') {
      setTimeNavigation('preset');
      setCustomTimeRange({});
      
      prepareDisplayData(formattedChartData);
    } else if (preset === 'custom') {
      if (!customTimeRange.start || !customTimeRange.end) {
        if (dataRange.max) {
          const end = dataRange.max;
          const start = new Date(end.getTime() - (60 * 60 * 1000)); // 1 hour before
          setCustomTimeRange({ start, end });
        }
      }
    } else if (preset === 'window') {
      setTimeNavigation('window');
      
      if (dataRange.max) {
        const end = dataRange.max;
        const start = new Date(end.getTime() - (timeWindowSize * 60 * 60 * 1000));
        setCustomTimeRange({ start, end });
      }
    } else if (preset === 'pagination') {
      setTimeNavigation('pagination');
      setCustomTimeRange({});
      
      handlePageChange(1);
    } else {
      setTimeNavigation('preset');
      // Handle other time range presets
      const presetConfig = TIME_RANGE_PRESETS.find(p => p.value === preset);
      if (presetConfig && dataRange.max) {
        const range = presetConfig.getRange(dataRange.max);
        if (dataRange.min && range.start && range.start < dataRange.min) {
          range.start = dataRange.min;
        }
        setCustomTimeRange(range);
      }
    }
  }, [customTimeRange, dataRange, timeWindowSize, formattedChartData]);

  // TIME_RANGE_PRESETS definition
  const TIME_RANGE_PRESETS = [
    { label: 'Last hour', value: '1h', getRange: (now: Date) => ({ start: new Date(now.getTime() - 60 * 60 * 1000), end: now }) },
    { label: 'Last 6 hours', value: '6h', getRange: (now: Date) => ({ start: new Date(now.getTime() - 6 * 60 * 60 * 1000), end: now }) },
    { label: 'Last 12 hours', value: '12h', getRange: (now: Date) => ({ start: new Date(now.getTime() - 12 * 60 * 60 * 1000), end: now }) },
    { label: 'Last 24 hours', value: '24h', getRange: (now: Date) => ({ start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now }) },
    { label: 'Last 3 days', value: '3d', getRange: (now: Date) => ({ start: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), end: now }) },
    { label: 'Last 7 days', value: '7d', getRange: (now: Date) => ({ start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now }) },
    { label: 'All data', value: 'all', getRange: () => ({ start: undefined, end: undefined }) },
  ];

  const prepareDisplayData = useCallback((data: any[]) => {
    setProcessingStatus("Preparing chart data for display");
    console.log(`Preparing display data from ${data.length} points`);
    
    try {
      const total = data.length;
      let sampled;
      let samplingRate = 1;
      
      if (total > maxDisplayPoints) {
        samplingRate = Math.ceil(total / maxDisplayPoints);
        
        // Use evenly distributed sampling to maintain data shape
        sampled = [];
        for (let i = 0; i < total; i += samplingRate) {
          sampled.push(data[i]);
        }
        
        // Always include the last point if not already included
        if (sampled[sampled.length - 1] !== data[total - 1]) {
          sampled.push(data[total - 1]);
        }
        
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
      
      console.log(`Setting ${sampled.length} points for display`);
      setDisplayedChartData(sampled);
    } catch (error) {
      console.error("Error preparing display data:", error);
      toast.error("Error preparing chart display");
      
      // Fallback to the original data
      setDisplayedChartData(data);
    }
    
    setProcessingStatus("");
    setIsProcessing(false);
  }, [maxDisplayPoints, timeNavigation]);

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
    if (formattedChartData.length === 0) {
      return [];
    }
    
    let filteredData = formattedChartData;
    
    // Apply time range filter if specified
    if (customTimeRange.start || customTimeRange.end) {
      filteredData = applyTimeRangeFilter(formattedChartData, customTimeRange);
    }
    
    // Apply zoom filter if specified
    if (zoomDomain.start && zoomDomain.end) {
      filteredData = filteredData.filter(
        (item) => item.timestamp >= zoomDomain.start! && item.timestamp <= zoomDomain.end!
      );
    }
    
    // Apply sampling for better performance
    if (filteredData.length > MAX_VISIBLE_POINTS) {
      const samplingRate = Math.ceil(filteredData.length / MAX_VISIBLE_POINTS);
      const sampled = [];
      
      // Use stride sampling
      for (let i = 0; i < filteredData.length; i += samplingRate) {
        sampled.push(filteredData[i]);
      }
      
      // Always include last point if not already included
      if (filteredData.length > 0 && sampled[sampled.length - 1] !== filteredData[filteredData.length - 1]) {
        sampled.push(filteredData[filteredData.length - 1]);
      }
      
      return sampled;
    }
    
    return filteredData;
  }, [formattedChartData, zoomDomain, customTimeRange, applyTimeRangeFilter]);

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

  const getTimeNavigationValue = useCallback(() => {
    if (timeNavigation === 'pagination') return 'pagination';
    if (timeNavigation === 'window') return 'window';
    if (timeNavigation === 'segmented') return 'segmented';
    if (timeNavigation === 'preset') return timeRangePreset;
    return 'custom';
  }, [timeNavigation, timeRangePreset]);

  const visibleChartData = useMemo(() => {
    if (timeNavigation === 'pagination') {
      return displayedChartData;
    }
    
    const data = getVisibleData();
    console.log(`Visible chart data: ${data.length} points`);
    
    if (data.length > 0) {
      const first = new Date(data[0].timestamp);
      const last = new Date(data[data.length - 1].timestamp);
      console.log(`Visible time range: ${first.toISOString()} to ${last.toISOString()}`);
    }
    
    return data;
  }, [getVisibleData, displayedChartData, timeNavigation]);

  const getPanelSignals = useCallback((panelId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return [];
    
    return signals.filter(signal => 
      panel.signals.includes(signal.id) && signal.visible
    );
  }, [panels, signals]);

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
      <div className="flex justify-center mt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => handlePageChange(currentPage - 1)}
        >
          Previous
        </Button>
        <div className="mx-4 flex items-center">
          Page {currentPage} of {dataStats.totalPages}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= dataStats.totalPages}
          onClick={() => handlePageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    );
  }, [currentPage, dataStats.totalPages, handlePageChange]);

  const renderChartContent = useCallback(() => {
    // Get visible signals for active panel
    const visibleSignals = getPanelSignals(activeTab);
    
    if (timeNavigation === 'segmented') {
      return (
        <TimeSegmentedCharts
          formattedChartData={formattedChartData}
          chartType={chartType} 
          signals={visibleSignals}
          segmentDurationMinutes={TIME_SEGMENT_DURATION}
          onBrushChange={handleBrushChange}
          onZoomReset={handleZoomReset}
          zoomDomain={zoomDomain}
        />
      );
    }
    
    // For other navigation modes, use the original ChartDisplay
    return (
      <ChartDisplay
        containerRef={containerRef}
        chartType={chartType}
        visibleChartData={displayedChartData}
        zoomDomain={zoomDomain}
        signals={visibleSignals}
        onBrushChange={handleBrushChange}
      />
    );
  }, [
    activeTab, 
    timeNavigation, 
    formattedChartData, 
    displayedChartData, 
    chartType, 
    zoomDomain, 
    getPanelSignals, 
    handleBrushChange, 
    handleZoomReset
  ]);

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
                setTimeNavigation('segmented');
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
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <Button
                  variant={chartType === 'line' ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChartType('line')}
                  className="flex items-center gap-1"
                >
                  <LineChartIcon className="h-4 w-4" />
                  Line
                </Button>
                <Button
                  variant={chartType === 'bar' ? "default" : "outline"}
                  size="sm"
                  onClick={() => setChartType('bar')}
                  className="flex items-center gap-1"
                >
                  <BarChartIcon className="h-4 w-4" />
                  Bar
                </Button>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleZoomReset}
                className="flex items-center gap-1"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Reset Zoom
              </Button>
            </div>
            
            <div className="text-xs flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <div>Total data points: <span className="font-medium">{dataStats.total.toLocaleString()}</span></div>
              <div>Time segments: <span className="font-medium">{TIME_SEGMENT_DURATION} minute intervals</span></div>
              {zoomDomain.start && zoomDomain.end && (
                <div>
                  Zoom: <span className="font-medium">
                    {new Date(zoomDomain.start).toLocaleString()} - {new Date(zoomDomain.end).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
            
            {timeNavigation === 'segmented' ? (
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
                renderChartDisplay={() => renderChartContent()}
              />
            ) : (
              renderChartContent()
            )}
            
            <LogSample rawLogSample={rawLogSample} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LogChart;
