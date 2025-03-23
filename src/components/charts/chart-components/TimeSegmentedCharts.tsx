
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Button } from "@/components/ui/button";
import { RefreshCcw } from 'lucide-react';
import ChartDisplay from './ChartDisplay';
import { Signal } from '@/types/chartTypes';
import { toast } from 'sonner';

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
    
    console.log(`Creating time segments from ${formattedChartData.length} data points`);
    
    const segmentMs = segmentDurationMinutes * 60 * 1000;
    const sortedData = [...formattedChartData].sort((a, b) => a.timestamp - b.timestamp);
    
    const firstTimestamp = sortedData[0].timestamp;
    const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
    
    console.log(`Time range: ${new Date(firstTimestamp).toISOString()} to ${new Date(lastTimestamp).toISOString()}`);
    
    // Calculate segment boundaries
    const segmentBoundaries: { start: number; end: number }[] = [];
    
    // Start from the nearest round segment time
    const firstSegmentStart = Math.floor(firstTimestamp / segmentMs) * segmentMs;
    let currentSegmentStart = firstSegmentStart;
    
    while (currentSegmentStart <= lastTimestamp) {
      const segmentEnd = currentSegmentStart + segmentMs;
      segmentBoundaries.push({
        start: currentSegmentStart,
        end: segmentEnd
      });
      currentSegmentStart = segmentEnd;
    }
    
    console.log(`Created ${segmentBoundaries.length} time segments`);
    
    // Filter out empty segments and add data points
    const populatedSegments = segmentBoundaries.map(segment => {
      const segmentData = sortedData.filter(
        point => point.timestamp >= segment.start && point.timestamp < segment.end
      );
      
      return {
        ...segment,
        data: segmentData,
        isEmpty: segmentData.length === 0
      };
    }).filter(segment => !segment.isEmpty);
    
    console.log(`${populatedSegments.length} segments have data`);
    
    // Log the number of data points in each segment to help with debugging
    populatedSegments.forEach((segment, index) => {
      console.log(`Segment ${index + 1}: ${segment.data.length} points, ${new Date(segment.start).toLocaleString()} - ${new Date(segment.end).toLocaleString()}`);
    });
    
    return populatedSegments;
  }, [formattedChartData, segmentDurationMinutes]);
  
  if (!timeSegments.length) {
    // Display a more helpful message if no segments were created
    return (
      <div className="bg-card border rounded-md p-3 h-[300px] flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No data segments to display</p>
          <p className="text-xs text-muted-foreground">
            {formattedChartData.length > 0 
              ? `${formattedChartData.length} data points exist but couldn't be segmented.` 
              : "No data points available."}
          </p>
        </div>
      </div>
    );
  }
  
  const handleSegmentBrushChange = (brushData: any) => {
    // Add segment info to the brush data
    if (brushData && brushData.timeSegment) {
      console.log(`Brush change in segment: ${new Date(brushData.timeSegment.start).toLocaleString()} - ${new Date(brushData.timeSegment.end).toLocaleString()}`);
    }
    
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
      
      <div className="text-xs text-muted-foreground">
        Displaying {formattedChartData.length.toLocaleString()} total data points across all segments
      </div>
      
      {timeSegments.map((segment, index) => (
        <div key={`segment-${segment.start}`} className="relative">
          <div className="w-full">
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
          <div className="mt-1 text-xs text-muted-foreground">
            {segment.data.length.toLocaleString()} data points in this segment
          </div>
        </div>
      ))}
    </div>
  );
};

export default TimeSegmentedCharts;
