
import React from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { TimeNavigationControlsProps } from '@/types/chartTypes';
import { format } from 'date-fns';

const TimeNavigationControls: React.FC<TimeNavigationControlsProps> = ({
  timeNavigation,
  timeRangePreset,
  timeWindowSize,
  customTimeRange,
  onTimeRangePresetChange,
  onTimeWindowSizeChange,
  onNavigateTimeWindow,
  onNavigateTime,
  isProcessing
}) => {
  const formatTimeLabel = (date: Date) => {
    return format(date, 'MMM dd, HH:mm');
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
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
    </div>
  );
};

export default TimeNavigationControls;
