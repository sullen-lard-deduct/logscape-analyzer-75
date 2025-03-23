
import React, { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, Brush, BarChart, Bar
} from 'recharts';
import { ChartDisplayProps } from '@/types/chartTypes';
import { toast } from 'sonner';

// Custom tooltip component for charts
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

const ChartDisplay: React.FC<ChartDisplayProps> = ({
  containerRef,
  chartType,
  visibleChartData,
  zoomDomain,
  signals,
  onBrushChange
}) => {
  const [chartWidth, setChartWidth] = useState<number>(0);
  const [chartHeight, setChartHeight] = useState<number>(0);

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          setChartWidth(entry.contentRect.width);
          setChartHeight(entry.contentRect.height);
        }
      });
      
      resizeObserver.observe(containerRef.current);
      
      return () => {
        if (containerRef.current) {
          resizeObserver.unobserve(containerRef.current);
        }
      };
    }
  }, [containerRef]);

  const formatXAxis = (tickItem: any) => {
    const date = new Date(tickItem);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // Handle brush change with improved error handling
  const handleBrushChange = (brushData: any) => {
    console.log("Brush event data:", brushData);
    
    try {
      if (!brushData || (!brushData.startIndex && brushData.startIndex !== 0) || (!brushData.endIndex && brushData.endIndex !== 0)) {
        console.log("Invalid brush data received");
        return;
      }
      
      // For Recharts, sometimes the startIndex/endIndex can be undefined or null
      const startIndex = typeof brushData.startIndex === 'number' ? Math.max(0, brushData.startIndex) : 0;
      const endIndex = typeof brushData.endIndex === 'number' ? Math.min(visibleChartData.length - 1, brushData.endIndex) : visibleChartData.length - 1;
      
      // Make sure we have data to work with
      if (!visibleChartData || visibleChartData.length === 0) {
        console.log("No visible chart data available for zooming");
        return;
      }
      
      // Get the actual timestamps from the data
      const startTimestamp = visibleChartData[startIndex]?.timestamp;
      const endTimestamp = visibleChartData[endIndex]?.timestamp;
      
      // Ensure both timestamps exist
      if (startTimestamp === undefined || endTimestamp === undefined) {
        console.log("Missing timestamps in chart data:", startTimestamp, endTimestamp);
        return;
      }
      
      console.log(`Zooming from ${new Date(startTimestamp).toISOString()} to ${new Date(endTimestamp).toISOString()}`);
      
      // Call the parent's onBrushChange with the actual timestamp values
      onBrushChange({
        startIndex: startIndex,
        endIndex: endIndex,
        startValue: startTimestamp,
        endValue: endTimestamp
      });
      
      toast.info("Zoomed in on selected range");
    } catch (error) {
      console.error("Error handling brush change:", error);
      toast.error("Error applying zoom");
    }
  };

  // Show placeholder when no data is available
  if (!visibleChartData || visibleChartData.length === 0) {
    return (
      <div className="bg-card border rounded-md p-3 h-[300px] flex items-center justify-center" ref={containerRef}>
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }
  
  console.log(`Rendering chart with ${visibleChartData.length} data points, chart type: ${chartType}`);
  console.log("Domain settings:", { start: zoomDomain?.start || 'dataMin', end: zoomDomain?.end || 'dataMax' });
  console.log("First few data points:", visibleChartData.slice(0, 3));
  console.log("Last few data points:", visibleChartData.slice(-3));

  // Set domain values for zoom
  const domainStart = zoomDomain?.start || 'dataMin';
  const domainEnd = zoomDomain?.end || 'dataMax';

  // Determine brush indices based on dataset size
  const endBrushIndex = Math.min(50, visibleChartData.length - 1);
  
  return (
    <div className="bg-card border rounded-md p-3 h-[300px]" ref={containerRef}>
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
              domain={[domainStart, domainEnd]}
              scale="time"
              allowDataOverflow={true}
            />
            <YAxis />
            <RechartsTooltip content={<CustomTooltip />} />
            <Legend />
            {signals.map(signal => (
              <Line
                key={signal.id}
                type="monotone"
                dataKey={signal.name}
                name={signal.name}
                stroke={signal.color}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
                dot={visibleChartData.length < 100}
              />
            ))}
            <Brush 
              dataKey="timestamp" 
              height={30} 
              stroke="#8884d8"
              onChange={handleBrushChange}
              travellerWidth={10}
              startIndex={0}
              endIndex={endBrushIndex}
              y={250}
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
              domain={[domainStart, domainEnd]}
              scale="time"
              allowDataOverflow={true}
            />
            <YAxis />
            <RechartsTooltip content={<CustomTooltip />} />
            <Legend />
            {signals.map(signal => (
              <Bar
                key={signal.id}
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
              onChange={handleBrushChange}
              travellerWidth={10}
              startIndex={0}
              endIndex={endBrushIndex}
              y={250}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartDisplay;
