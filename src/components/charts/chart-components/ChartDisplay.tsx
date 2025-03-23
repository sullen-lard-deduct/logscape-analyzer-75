
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
  console.log("First data point:", visibleChartData[0]);
  console.log("Last data point:", visibleChartData[visibleChartData.length - 1]);

  // Set domain values for zoom
  // Fix Type Error: Ensure domain is of type AxisDomain
  // Use proper typing for the domain property as expected by recharts
  const domainStart = zoomDomain?.start || 'dataMin';
  const domainEnd = zoomDomain?.end || 'dataMax';

  // Determine brush indices based on dataset size
  let startBrushIndex = 0;
  let endBrushIndex = Math.min(Math.floor(visibleChartData.length * 0.2), visibleChartData.length - 1);
  
  // Format the time for the X axis
  const formatXAxis = (tickItem: any) => {
    const date = new Date(tickItem);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  // Handle brush change with robust error handling
  const handleBrushChange = (brushData: any) => {
    console.log("Brush event data:", brushData);
    
    if (!brushData) {
      console.log("No brush data received");
      return;
    }
    
    // For Recharts, sometimes the startIndex/endIndex can be undefined or null
    // Also for 'dataMin'/'dataMax' zoom reset, we don't get startIndex/endIndex
    const hasIndices = (
      (brushData.startIndex !== undefined && brushData.startIndex !== null) || 
      (brushData.endIndex !== undefined && brushData.endIndex !== null)
    );
    
    if (!hasIndices) {
      // If we don't have indices but have values, it's probably a direct domain selection
      if (brushData.startValue !== undefined && brushData.endValue !== undefined) {
        console.log(`Zooming directly from ${new Date(brushData.startValue).toISOString()} to ${new Date(brushData.endValue).toISOString()}`);
        
        onBrushChange({
          startValue: brushData.startValue,
          endValue: brushData.endValue
        });
        return;
      }
      
      console.log("Invalid brush data - missing indices and values");
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
      endValue: endTimestamp
    });
    
    toast.info("Zoomed to selected range");
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
      // Fix: Use a proper AxisDomain type
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
        <Brush 
          dataKey="timestamp" 
          height={30} 
          stroke="#8884d8"
          onChange={handleBrushChange}
          travellerWidth={10}
          startIndex={startBrushIndex}
          endIndex={endBrushIndex}
          y={250}
        />
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
      <ResponsiveContainer width="100%" height="100%">
        {renderChartContent()}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartDisplay;
