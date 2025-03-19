import React, { useState, useEffect, useRef } from 'react';
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, Brush, ReferenceLine
} from 'recharts';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Split, Maximize, X, Plus, 
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

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2 bg-white shadow-md border rounded-md text-xs">
        <p className="font-medium mb-1">{new Date(label).toLocaleString()}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`tooltip-${index}`} className="flex items-center gap-2 py-0.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-medium">{entry.name}:</span>
            <span>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const LogChart: React.FC<LogChartProps> = ({ logContent, patterns, className }) => {
  const [chartData, setChartData] = useState<LogData[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [panels, setPanels] = useState<ChartPanel[]>([{ id: 'panel-1', signals: [] }]);
  const [activeTab, setActiveTab] = useState<string>("panel-1");
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [zoomDomain, setZoomDomain] = useState<{ start?: number, end?: number }>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawLogSample, setRawLogSample] = useState<string[]>([]);

  useEffect(() => {
    if (!logContent || patterns.length === 0) return;
    
    try {
      const logLines = logContent.split('\n');
      setRawLogSample(logLines.slice(0, 10));
      
      console.log("Processing log data with patterns:", patterns);
      console.log("First 5 log lines:", logLines.slice(0, 5));
      
      processLogData(logContent, patterns);
      toast.success("Log data processed successfully");
    } catch (error) {
      console.error("Error processing log data:", error);
      toast.error("Error processing log data");
    }
  }, [logContent, patterns]);

  const processLogData = (content: string, regexPatterns: RegexPattern[]) => {
    setChartData([]);
    
    const lines = content.split('\n');
    const parsedData: LogData[] = [];
    
    const newSignals: Signal[] = regexPatterns.map((pattern, index) => ({
      id: `signal-${Date.now()}-${index}`,
      name: pattern.name,
      pattern,
      color: CHART_COLORS[index % CHART_COLORS.length],
      visible: true
    }));
    
    setSignals(newSignals);
    setPanels([{ id: 'panel-1', signals: newSignals.map(s => s.id) }]);
    
    let successCount = 0;
    let failCount = 0;
    
    console.log(`Processing ${lines.length} log lines with ${regexPatterns.length} patterns`);
    
    lines.forEach((line, lineIndex) => {
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
            console.warn(`Invalid timestamp at line ${lineIndex + 1}: ${timestampStr}`);
            return;
          }
          
          const values: { [key: string]: number | string } = {};
          
          regexPatterns.forEach((pattern) => {
            try {
              const regex = new RegExp(pattern.pattern);
              const match = line.match(regex);
              
              if (match && match[1] !== undefined) {
                const value = isNaN(Number(match[1])) ? match[1] : Number(match[1]);
                values[pattern.name] = value;
                successCount++;
              }
            } catch (error) {
              console.error(`Error applying regex pattern "${pattern.name}" to line: ${line}`, error);
              failCount++;
            }
          });
          
          if (Object.keys(values).length > 0) {
            parsedData.push({ timestamp, values });
          }
        } catch (error) {
          console.error(`Error processing line ${lineIndex + 1}: ${line}`, error);
        }
      } else if (lineIndex < 10) {
        console.warn(`No timestamp match at line ${lineIndex + 1}: ${line}`);
      }
    });
    
    console.log(`Parsing complete. Success: ${successCount}, Failed: ${failCount}, Total data points: ${parsedData.length}`);
    
    parsedData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (parsedData.length === 0) {
      toast.warning("No matching data found with the provided patterns");
    } else {
      toast.success(`Found ${parsedData.length} data points with the selected patterns`);
    }
    
    setChartData(parsedData);
  };

  const handleAddPanel = () => {
    const newPanelId = `panel-${panels.length + 1}`;
    setPanels([...panels, { id: newPanelId, signals: [] }]);
    setActiveTab(newPanelId);
  };

  const handleRemovePanel = (panelId: string) => {
    if (panels.length <= 1) {
      toast.error("Cannot remove the only panel");
      return;
    }
    
    const updatedPanels = panels.filter(panel => panel.id !== panelId);
    setPanels(updatedPanels);
    
    if (activeTab === panelId) {
      setActiveTab(updatedPanels[0].id);
    }
  };

  const handleAddSignalToPanel = (panelId: string, signalId: string) => {
    setPanels(panels.map(panel => {
      if (panel.id === panelId) {
        if (!panel.signals.includes(signalId)) {
          return { ...panel, signals: [...panel.signals, signalId] };
        }
      }
      return panel;
    }));
  };

  const handleRemoveSignalFromPanel = (panelId: string, signalId: string) => {
    setPanels(panels.map(panel => {
      if (panel.id === panelId) {
        return { ...panel, signals: panel.signals.filter(id => id !== signalId) };
      }
      return panel;
    }));
  };

  const toggleSignalVisibility = (signalId: string) => {
    setSignals(signals.map(signal => {
      if (signal.id === signalId) {
        return { ...signal, visible: !signal.visible };
      }
      return signal;
    }));
  };

  const handleZoomReset = () => {
    setZoomDomain({});
  };

  const formatXAxis = (tickItem: any) => {
    const date = new Date(tickItem);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const getPanelSignals = (panelId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return [];
    
    return signals.filter(signal => 
      panel.signals.includes(signal.id) && signal.visible
    );
  };

  const getFormattedChartData = () => {
    return chartData.map(item => ({
      timestamp: item.timestamp.getTime(),
      ...Object.fromEntries(
        Object.entries(item.values).map(([key, value]) => [key, value])
      )
    }));
  };

  return (
    <div className={cn("space-y-4", className)} ref={containerRef}>
      {signals.length > 0 ? (
        <>
          {chartData.length === 0 && (
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
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={getFormattedChartData()}
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
                            
                            {getPanelSignals(panel.id).map((signal) => (
                              <Line
                                key={signal.id}
                                name={signal.name}
                                type="monotone"
                                dataKey={signal.name}
                                stroke={signal.color}
                                activeDot={{ r: 5, onClick: (e) => console.log(e) }}
                                strokeWidth={2}
                                dot={false}
                                animationDuration={500}
                              />
                            ))}
                            
                            <Brush 
                              dataKey="timestamp" 
                              height={40} 
                              stroke="hsl(var(--primary))"
                              fill="hsla(var(--primary), 0.1)"
                              onChange={(e) => {
                                if (e.startIndex !== undefined && e.endIndex !== undefined) {
                                  const data = getFormattedChartData();
                                  setZoomDomain({
                                    start: data[e.startIndex]?.timestamp,
                                    end: data[e.endIndex]?.timestamp
                                  });
                                }
                              }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
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
