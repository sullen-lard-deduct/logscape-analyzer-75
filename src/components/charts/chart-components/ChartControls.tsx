
import React from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { 
  LineChart as LineChartIcon, 
  BarChart as BarChartIcon,
  Clock, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight 
} from 'lucide-react';
import { ChartControlsProps } from '@/types/chartTypes';
import { format } from 'date-fns';

const ChartControls: React.FC<ChartControlsProps> = ({
  dataStats,
  timeNavigation,
  timeRangePreset,
  timeWindowSize,
  customTimeRange,
  maxDisplayPoints,
  chartType,
  zoomDomain,
  formattedChartData,
  currentPage,
  isProcessing,
  onTimeRangePresetChange,
  onTimeWindowSizeChange,
  onNavigateTimeWindow,
  onNavigateTime,
  onMaxPointsChange,
  onChartTypeChange,
  onZoomReset,
  renderPaginationControls
}) => {
  const formatTimeLabel = (date: Date) => {
    return format(date, 'MMM dd, HH:mm');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-8 flex flex-wrap gap-2 items-center">
        <Select 
          value={
            timeNavigation === 'pagination' 
              ? 'pagination' 
              : timeNavigation === 'window' 
                ? 'window' 
                : timeRangePreset
          } 
          onValueChange={onTimeRangePresetChange}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All data</SelectItem>
            <SelectItem value="pagination">Pagination</SelectItem>
            <SelectItem value="window">Sliding window</SelectItem>
            <SelectItem value="1h">Last hour</SelectItem>
            <SelectItem value="6h">Last 6 hours</SelectItem>
            <SelectItem value="12h">Last 12 hours</SelectItem>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="3d">Last 3 days</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
          </SelectContent>
        </Select>
        
        {timeNavigation === 'window' && (
          <>
            <Select 
              value={timeWindowSize.toString()} 
              onValueChange={(val) => onTimeWindowSizeChange(Number(val))}
            >
              <SelectTrigger className="w-32">
                <Clock className="w-4 h-4 mr-2" /> {timeWindowSize}h
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 6, 12, 24, 48, 72].map(hours => (
                  <SelectItem key={hours} value={hours.toString()}>
                    {hours} hours
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTimeWindow('backward')}
                disabled={isProcessing}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTimeWindow('forward')}
                disabled={isProcessing}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
        
        {timeNavigation === 'preset' && customTimeRange.start && customTimeRange.end && (
          <div className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>
              {formatTimeLabel(customTimeRange.start)} - {formatTimeLabel(customTimeRange.end)}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTime('backward')}
                disabled={isProcessing}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTime('forward')}
                disabled={isProcessing}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {timeNavigation === 'pagination' && renderPaginationControls()}
      </div>
      
      <div className="lg:col-span-4 flex flex-wrap items-center gap-3 justify-end">
        <div className="flex flex-col gap-1 min-w-[150px]">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Display limit:</span>
            <span className="text-xs font-medium">{maxDisplayPoints.toLocaleString()}</span>
          </div>
          <Slider
            defaultValue={[maxDisplayPoints]}
            min={1000}
            max={50000}
            step={1000}
            onValueChange={onMaxPointsChange}
            disabled={isProcessing}
          />
        </div>
        
        <div className="flex border rounded-md overflow-hidden">
          <Button
            variant={chartType === 'line' ? 'default' : 'outline'} 
            size="sm"
            className={`rounded-none ${chartType === 'line' ? '' : 'border-0'}`}
            onClick={() => onChartTypeChange('line')}
          >
            <LineChartIcon className="h-4 w-4 mr-1" /> Line
          </Button>
          <Button
            variant={chartType === 'bar' ? 'default' : 'outline'}
            size="sm"
            className={`rounded-none ${chartType === 'bar' ? '' : 'border-0'}`}
            onClick={() => onChartTypeChange('bar')}
          >
            <BarChartIcon className="h-4 w-4 mr-1" /> Bar
          </Button>
        </div>
        
        {(zoomDomain.start || zoomDomain.end) && (
          <Button
            variant="outline"
            size="sm"
            onClick={onZoomReset}
          >
            <ZoomOut className="h-4 w-4 mr-1" /> Reset Zoom
          </Button>
        )}
      </div>
    </div>
  );
};

export default ChartControls;
