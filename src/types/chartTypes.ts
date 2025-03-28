
// Add the timeSegment property to ChartDisplayProps
import { RegexPattern } from "@/components/regex/RegexManager";

export const CHART_COLORS = [
  "#4f46e5", // indigo-600
  "#0891b2", // cyan-600 
  "#16a34a", // green-600
  "#ca8a04", // yellow-600
  "#dc2626", // red-600
  "#d946ef", // fuchsia-500
  "#6366f1", // indigo-500
  "#0d9488", // teal-600
  "#c026d3", // purple-600
  "#ea580c", // orange-600
  "#4338ca", // indigo-700
  "#64748b", // slate-500
];

// Data structures for log processing
export interface LogData {
  timestamp: Date;
  values: {
    [key: string]: number | string;
  };
}

// Structure for signal definitions
export interface Signal {
  id: string;
  name: string;
  pattern: RegexPattern;
  color: string;
  visible: boolean;
}

// Structure for chart panels
export interface ChartPanel {
  id: string;
  signals: string[];
}

// Component props
export interface LogChartProps {
  logContent: string;
  patterns: RegexPattern[];
  className?: string;
}

export interface ChartDisplayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  chartType: 'line' | 'bar';
  visibleChartData: any[];
  zoomDomain: { start?: number, end?: number };
  signals: Signal[];
  onBrushChange: (brushData: any) => void;
  timeSegment?: { start: number; end: number }; // Optional time segment for multi-chart display
}

export interface PanelTabsManagerProps {
  panels: ChartPanel[];
  activeTab: string;
  signals: Signal[];
  onActiveTabChange: (tabId: string) => void;
  onAddPanel: () => void;
  onRemovePanel: (panelId: string) => void;
  onAddSignal: (panelId: string, signalId: string) => void;
  onRemoveSignal: (panelId: string, signalId: string) => void;
  onToggleSignalVisibility: (signalId: string) => void;
  renderChartDisplay: (panelId: string) => React.ReactNode;
}

// Add missing type definitions to fix build errors
export interface ChartControlsProps {
  dataStats: {
    total: number;
    displayed: number;
    samplingRate: number;
    currentPage?: number;
    totalPages?: number;
  };
  timeNavigation: 'preset' | 'pagination' | 'window' | 'segmented';
  timeRangePreset: string;
  timeWindowSize: number;
  customTimeRange: { start?: Date; end?: Date };
  maxDisplayPoints: number;
  chartType: 'line' | 'bar';
  zoomDomain: { start?: number; end?: number };
  formattedChartData: any[];
  currentPage: number;
  isProcessing: boolean;
  onTimeRangePresetChange: (preset: string) => void;
  onTimeWindowSizeChange: (size: number) => void;
  onNavigateTimeWindow: (direction: 'forward' | 'backward') => void;
  onNavigateTime: (direction: 'forward' | 'backward') => void;
  onMaxPointsChange: (value: number[]) => void;
  onChartTypeChange: (type: 'line' | 'bar') => void;
  onZoomReset: () => void;
  renderPaginationControls: () => React.ReactNode;
}

export interface LogSampleProps {
  rawLogSample: string[];
}

export interface TimeNavigationControlsProps {
  timeNavigation: 'preset' | 'pagination' | 'window' | 'segmented';
  timeRangePreset: string;
  timeWindowSize: number;
  customTimeRange: { start?: Date; end?: Date };
  dataRange: { min?: Date; max?: Date };
  onTimeRangePresetChange: (preset: string) => void;
  onTimeWindowSizeChange: (size: number) => void;
  onNavigateTimeWindow: (direction: 'forward' | 'backward') => void;
  onNavigateTime: (direction: 'forward' | 'backward') => void;
  isProcessing: boolean;
  renderPaginationControls: () => React.ReactNode;
}
