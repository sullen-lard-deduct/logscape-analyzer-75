
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

  // Handle brush change with robust error handling
  const handleBrushChange = (brushData: any) => {
    console.log("Brush event data:", brushData);
    
    try {
      // Check if brush data is valid
      if (!brushData) {
        console.log("No brush data received");
        return;
      }
      
      // For Recharts, sometimes the startIndex/endIndex can be undefined or null
      // so we need to safely check for their existence
      const startIndex = typeof brushData.startIndex === 'number' ? brushData.startIndex : undefined;
      const endIndex = typeof brushData.endIndex === 'number' ? brushData.endIndex : undefined;
      
      if (startIndex === undefined || endIndex === undefined) {
        console.log("Invalid brush indices:", startIndex, endIndex);
        return;
      }
      
      // Make sure we have data to work with
      if (!visibleChartData || visibleChartData.length === 0) {
        console.log("No visible chart data available for zooming");
        return;
      }
      
      // Ensure indices are within bounds
      const safeStartIndex = Math.max(0, startIndex);
      const safeEndIndex = Math.min(visibleChartData.length - 1, endIndex);
      
      // Require at least 2 points difference to avoid micro-zooms
      if (safeEndIndex - safeStartIndex < 2) {
        console.log("Selected range too small, need at least 2 points");
        return;
      }
      
      // Get the actual timestamps from the data
      const startTimestamp = visibleChartData[safeStartIndex]?.timestamp;
      const endTimestamp = visibleChartData[safeEndIndex]?.timestamp;
      
      // Ensure both timestamps exist
      if (startTimestamp === undefined || endTimestamp === undefined) {
        console.log("Missing timestamps in chart data:", startTimestamp, endTimestamp);
        return;
      }
      
      console.log(`Zooming from ${new Date(startTimestamp).toISOString()} to ${new Date(endTimestamp).toISOString()}`);
      
      // Call the parent's onBrushChange with the actual timestamp values
      onBrushChange({
        startIndex: safeStartIndex,
        endIndex: safeEndIndex,
        startValue: startTimestamp,
        endValue: endTimestamp
      });
      
      toast.info("Zoomed in on selected range");
    } catch (error) {
      console.error("Error handling brush change:", error);
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

  console.log("Chart data summary:", {
    chartType,
    dataPoints: visibleChartData.length,
    firstPoint: visibleChartData[0],
    lastPoint: visibleChartData[visibleChartData.length - 1],
    signals: signals.length,
    zoomDomain
  });

  // Set domain values for zoom
  const domainStart = zoomDomain?.start || 'dataMin';
  const domainEnd = zoomDomain?.end || 'dataMax';

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
                dot={false}
              />
            ))}
            <Brush 
              dataKey="timestamp" 
              height={30} 
              stroke="#8884d8"
              onChange={handleBrushChange}
              travellerWidth={10}
              startIndex={0}
              endIndex={Math.min(100, visibleChartData.length - 1)}
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
              endIndex={Math.min(100, visibleChartData.length - 1)}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartDisplay;
