
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { RefreshCcw } from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { Signal } from '@/types/chartTypes';

interface TimeSegmentedChartsProps {
  formattedChartData: any[];
  chartType: 'line' | 'bar';
  signals: Signal[];
  segmentDurationMinutes?: number;
  onBrushChange: (brushData: any) => void;
  onZoomReset: () => void;
  zoomDomain: { start?: number, end?: number };
}

const TimeSegmentedCharts: React.FC<TimeSegmentedChartsProps> = ({
  formattedChartData,
  chartType,
  signals,
  segmentDurationMinutes = 30,
  onBrushChange,
  onZoomReset,
  zoomDomain
}) => {
  // Create time segments based on data
  const timeSegments = useMemo(() => {
    if (!formattedChartData.length) return [];
    
    const segmentMs = segmentDurationMinutes * 60 * 1000;
    const sortedData = [...formattedChartData].sort((a, b) => a.timestamp - b.timestamp);
    
    const firstTimestamp = sortedData[0].timestamp;
    const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
    
    // Calculate segment boundaries
    const segmentBoundaries: { start: number; end: number }[] = [];
    
    // Start from the nearest round segment time
    const firstSegmentStart = Math.floor(firstTimestamp / segmentMs) * segmentMs;
    let currentSegmentStart = firstSegmentStart;
    
    while (currentSegmentStart < lastTimestamp) {
      const segmentEnd = currentSegmentStart + segmentMs;
      segmentBoundaries.push({
        start: currentSegmentStart,
        end: segmentEnd
      });
      currentSegmentStart = segmentEnd;
    }
    
    // Filter out empty segments and add data points
    return segmentBoundaries.map(segment => {
      const segmentData = sortedData.filter(
        point => point.timestamp >= segment.start && point.timestamp <= segment.end
      );
      
      return {
        ...segment,
        data: segmentData,
        isEmpty: segmentData.length === 0
      };
    }).filter(segment => !segment.isEmpty);
  }, [formattedChartData, segmentDurationMinutes]);
  
  if (!timeSegments.length) {
    return (
      <div className="bg-card border rounded-md p-3 h-[300px] flex items-center justify-center">
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }
  
  const handleSegmentBrushChange = (brushData: any) => {
    // Forward the brush data to the parent
    onBrushChange(brushData);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">
          {timeSegments.length} Time Segments ({segmentDurationMinutes} min each)
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onZoomReset}
          className="flex items-center gap-1"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Reset Zoom
        </Button>
      </div>
      
      {timeSegments.map((segment, index) => (
        <div key={`segment-${segment.start}`} className="relative">
          <div ref={el => el} className="w-full">
            <ChartDisplay
              containerRef={{ current: null }}
              chartType={chartType}
              visibleChartData={segment.data}
              zoomDomain={zoomDomain}
              signals={signals}
              onBrushChange={handleSegmentBrushChange}
              timeSegment={segment}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default TimeSegmentedCharts;
