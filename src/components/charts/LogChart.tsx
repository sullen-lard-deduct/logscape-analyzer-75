
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, Brush, ReferenceLine, BarChart, Bar
} from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Split, Maximize, X, Plus, RefreshCcw,
  ZoomIn, LineChart as LineChartIcon, BarChart as BarChartIcon
} from 'lucide-react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { RegexPattern } from "../regex/RegexManager";
import { cn } from "@/lib/utils";

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
const MAX_CHART_POINTS = 2000;
const MAX_VISIBLE_POINTS = 500;

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

const LogChart: React.FC<LogChartProps> = ({ logContent, patterns, className }) => {
  const [chartData, setChartData] = useState<LogData[]>([]);
  const [formattedChartData, setFormattedChartData] = useState<any[]>([]);
  const [displayedChartData, setDisplayedChartData] = useState<any[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [panels, setPanels] = useState<ChartPanel[]>([{ id: 'panel-1', signals: [] }]);
  const [activeTab, setActiveTab] = useState<string>("panel-1");
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [zoomDomain, setZoomDomain] = useState<{ start?: number, end?: number }>({});
  const [dataStats, setDataStats] = useState<{ total: number, displayed: number }>({ total: 0, displayed: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawLogSample, setRawLogSample] = useState<string[]>([]);
  const [stringValueMap, setStringValueMap] = useState<Record<string, Record<string, number>>>({});
  
  // Memoize the chart data to improve performance
  const memoizedChartData = useMemo(() => displayedChartData, [displayedChartData]);

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

  // Create a sampled version of the data for display when data is large
  useEffect(() => {
    if (formattedChartData.length > 0) {
      setProcessingStatus("Preparing chart data for display");
      
      // Use setTimeout to prevent UI freezing
      setTimeout(() => {
        try {
          const total = formattedChartData.length;
          let sampled;
          
          if (total > MAX_CHART_POINTS) {
            // For large datasets, use sampling to reduce points
            const samplingRate = Math.ceil(total / MAX_CHART_POINTS);
            sampled = formattedChartData.filter((_, i) => i % samplingRate === 0);
            
            console.log(`Sampled data from ${total} to ${sampled.length} points (rate: 1/${samplingRate})`);
            setDataStats({ total, displayed: sampled.length });
            
            toast.info(`Displaying ${sampled.length.toLocaleString()} of ${total.toLocaleString()} data points for performance`);
          } else {
            sampled = formattedChartData;
            setDataStats({ total, displayed: total });
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
      }, 100);
    }
  }, [formattedChartData]);

  const formatChartData = useCallback((data: LogData[]) => {
    const formattedData = data.map(item => {
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

      return dataPoint;
    });

    console.log(`Formatted ${formattedData.length} data points`);
    return formattedData;
  }, [stringValueMap]);

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
            
            // Schedule formatting in a separate tick
            setTimeout(() => {
              const formatted = formatChartData(parsedData);
              setFormattedChartData(formatted);
            }, 100);
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
  }, [formatChartData]);

  // Calculate visible data based on zoom domain
  const getVisibleData = useCallback(() => {
    if (!zoomDomain.start || !zoomDomain.end) {
      // If no zoom is applied, return the displayed chart data
      return memoizedChartData;
    }
    
    // Filter data to show only the zoomed range
    const visibleData = memoizedChartData.filter(
      (item) => item.timestamp >= zoomDomain.start! && item.timestamp <= zoomDomain.end!
    );
    
    // Apply additional sampling if the zoomed range still has too many points
    if (visibleData.length > MAX_VISIBLE_POINTS) {
      const samplingRate = Math.ceil(visibleData.length / MAX_VISIBLE_POINTS);
      return visibleData.filter((_, i) => i % samplingRate === 0);
    }
    
    return visibleData;
  }, [memoizedChartData, zoomDomain]);

  // Memoize the visible data to improve performance
  const visibleChartData = useMemo(() => getVisibleData(), [getVisibleData]);

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
    setDataStats({ total: 0, displayed: 0 });
    toast.success("Reset all data and settings");
  }, []);

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
            if (e.startIndex !== undefined && e.endIndex !== undefined && formattedChartData.length > 0) {
              const data = formattedChartData;
              setZoomDomain({
                start: data[e.startIndex]?.timestamp,
                end: data[e.endIndex]?.timestamp
              });
            }
          }}
        />
      </LineChart>
    );
  }, [visibleChartData, zoomDomain, formatXAxis, getPanelSignals, formattedChartData]);

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
            if (e.startIndex !== undefined && e.endIndex !== undefined && formattedChartData.length > 0) {
              const data = formattedChartData;
              setZoomDomain({
                start: data[e.startIndex]?.timestamp,
                end: data[e.endIndex]?.timestamp
              });
            }
          }}
        />
      </BarChart>
    );
  }, [visibleChartData, zoomDomain, formatXAxis, getPanelSignals, formattedChartData]);

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
        
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Signal Visualization</h3>
            <div className="flex items-center gap-2">
              {dataStats.total > 0 && dataStats.total !== dataStats.displayed && (
                <div className="text-xs text-muted-foreground">
                  Showing {dataStats.displayed.toLocaleString()} of {dataStats.total.toLocaleString()} points
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
