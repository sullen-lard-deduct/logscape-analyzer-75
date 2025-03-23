
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
  onBrushChange,
  timeSegment, // Optional time segment for multi-chart display
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

  // Show placeholder when no data is available
  if (!visibleChartData || visibleChartData.length === 0) {
    return (
      <div className="bg-card border rounded-md p-3 h-[300px] flex items-center justify-center" ref={containerRef}>
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }
  
  console.log(`Rendering chart with ${visibleChartData.length} data points, chart type: ${chartType}`);
  
  // Log first and last data points to help with debugging
  const firstPoint = visibleChartData[0];
  const lastPoint = visibleChartData[visibleChartData.length - 1];
  
  console.log("Domain settings:", { 
    start: zoomDomain?.start ? new Date(zoomDomain.start).toISOString() : 'dataMin', 
    end: zoomDomain?.end ? new Date(zoomDomain.end).toISOString() : 'dataMax' 
  });
  
  console.log("First data point:", firstPoint ? {
    time: new Date(firstPoint.timestamp).toISOString(),
    ...firstPoint
  } : 'none');
  
  console.log("Last data point:", lastPoint ? {
    time: new Date(lastPoint.timestamp).toISOString(),
    ...lastPoint
  } : 'none');

  // Set domain values for zoom
  const domainStart = zoomDomain?.start || 'dataMin';
  const domainEnd = zoomDomain?.end || 'dataMax';

  // Determine brush indices based on dataset size
  const startBrushIndex = 0;
  const endBrushIndex = Math.min(Math.floor(visibleChartData.length * 0.2), visibleChartData.length - 1);
  
  // Format the time for the X axis
  const formatXAxis = (tickItem: any) => {
    try {
      const date = new Date(tickItem);
      return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch (e) {
      return '';
    }
  };

  // Handle brush change with robust error handling
  const handleBrushChange = (brushData: any) => {
    try {
      console.log("Brush event data:", brushData);
      
      if (!brushData) {
        console.log("No brush data received");
        return;
      }
      
      // For Recharts, sometimes the startIndex/endIndex can be undefined or null
      // Also for 'dataMin'/'dataMax' zoom reset, we don't get startIndex/endIndex
      if (brushData.startIndex === undefined && brushData.endIndex === undefined && 
          brushData.startValue === undefined && brushData.endValue === undefined) {
        console.log("No indices or values in brush data");
        return;
      }
      
      // If we have start/end values directly, use them
      if (brushData.startValue !== undefined && brushData.endValue !== undefined) {
        console.log(`Zooming directly from ${new Date(brushData.startValue).toISOString()} to ${new Date(brushData.endValue).toISOString()}`);
        
        // Ensure these are numbers, not Date objects
        const startValue = typeof brushData.startValue === 'number' 
          ? brushData.startValue 
          : brushData.startValue.getTime();
          
        const endValue = typeof brushData.endValue === 'number' 
          ? brushData.endValue 
          : brushData.endValue.getTime();
        
        onBrushChange({
          startValue,
          endValue,
          timeSegment // Pass the time segment if provided
        });
        return;
      }
      
      // Make sure we have data to work with
      if (!visibleChartData || visibleChartData.length === 0) {
        console.log("No visible chart data available for zooming");
        return;
      }
      
      // Normalize startIndex and endIndex to valid ranges
      const startIndex = Math.max(0, Math.min(visibleChartData.length - 1, brushData.startIndex || 0));
      const endIndex = Math.max(0, Math.min(visibleChartData.length - 1, brushData.endIndex || visibleChartData.length - 1));
      
      // Ensure we have a reasonable range (don't zoom to a single point)
      if (startIndex === endIndex) {
        console.log("Brush range too small, ignoring");
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
        startIndex,
        endIndex,
        startValue: startTimestamp,
        endValue: endTimestamp,
        timeSegment // Pass the time segment if provided
      });
      
      toast.info("Zoomed to selected range");
    } catch (error) {
      console.error("Error handling brush change:", error);
    }
  };
  
  // Create chart content based on the chart type
  const renderChartContent = () => {
    const commonProps = {
      data: visibleChartData,
      margin: { top: 5, right: 20, left: 10, bottom: 5 }
    };
    
    // Fixed XAxis props with correct typing for domain
    const commonAxisProps = {
      dataKey: "timestamp",
      type: "number" as const,
      domain: [domainStart, domainEnd] as [any, any], // This cast allows the string or number values
      scale: "time" as const,
      tickFormatter: formatXAxis,
      allowDataOverflow: true
    };
    
    const commonComponents = (
      <>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis {...commonAxisProps} />
        <YAxis />
        <RechartsTooltip content={<CustomTooltip />} />
        <Legend />
        {visibleChartData.length > 5 && (
          <Brush 
            dataKey="timestamp" 
            height={30} 
            stroke="#8884d8"
            onChange={handleBrushChange}
            travellerWidth={10}
            startIndex={startBrushIndex}
            endIndex={endBrushIndex > startBrushIndex ? endBrushIndex : startBrushIndex + 1}
            y={250}
          />
        )}
      </>
    );
    
    if (chartType === 'line') {
      return (
        <LineChart {...commonProps}>
          {commonComponents}
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
        </LineChart>
      );
    } else {
      return (
        <BarChart {...commonProps}>
          {commonComponents}
          {signals.map(signal => (
            <Bar
              key={signal.id}
              dataKey={signal.name}
              name={signal.name}
              fill={signal.color}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      );
    }
  };
  
  return (
    <div className="bg-card border rounded-md p-3 h-[300px]" ref={containerRef}>
      {timeSegment && (
        <div className="pb-2 text-sm font-medium">
          {new Date(timeSegment.start).toLocaleString()} - {new Date(timeSegment.end).toLocaleString()}
        </div>
      )}
      <ResponsiveContainer width="100%" height={timeSegment ? "90%" : "100%"}>
        {renderChartContent()}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartDisplay;
