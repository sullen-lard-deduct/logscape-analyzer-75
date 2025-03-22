
import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  Legend, ResponsiveContainer, Brush, BarChart, Bar
} from 'recharts';
import { ChartDisplayProps } from '@/types/chartTypes';

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
  const formatXAxis = (tickItem: any) => {
    const date = new Date(tickItem);
    return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

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
              domain={zoomDomain.start && zoomDomain.end ? [zoomDomain.start, zoomDomain.end] : ['dataMin', 'dataMax']}
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
              />
            ))}
            <Brush 
              dataKey="timestamp" 
              height={30} 
              stroke="#8884d8"
              onChange={onBrushChange}
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
            {signals.map(signal => (
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
              onChange={onBrushChange}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};

export default ChartDisplay;
