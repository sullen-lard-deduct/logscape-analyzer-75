
import { RegexPattern } from "@/components/regex/RegexManager";

export interface LogData {
  timestamp: Date;
  values: { [key: string]: number | string };
}

export interface Signal {
  id: string;
  name: string;
  pattern: RegexPattern;
  color: string;
  visible: boolean;
}

export interface ChartPanel {
  id: string;
  signals: string[];
}

export interface LogChartProps {
  logContent: string;
  patterns: RegexPattern[];
  className?: string;
}

export interface ChartControlsProps {
  dataStats: {
    total: number;
    displayed: number;
    samplingRate: number;
    currentPage?: number;
    totalPages?: number;
  };
  timeNavigation: 'preset' | 'pagination' | 'window';
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
  onMaxPointsChange: (points: number[]) => void;
  onChartTypeChange: (type: 'line' | 'bar') => void;
  onZoomReset: () => void;
  renderPaginationControls: () => React.ReactNode;
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

export interface ChartDisplayProps {
  containerRef: React.RefObject<HTMLDivElement>;
  chartType: 'line' | 'bar';
  visibleChartData: any[];
  zoomDomain: { start?: number; end?: number };
  signals: Signal[];
  onBrushChange: (brushData: any) => void;
}

export interface LogSampleProps {
  rawLogSample: string[];
}

export interface TimeNavigationControlsProps {
  timeNavigation: 'preset' | 'pagination' | 'window';
  timeRangePreset: string;
  timeWindowSize: number;
  customTimeRange: { start?: Date; end?: Date };
  onTimeRangePresetChange: (preset: string) => void;
  onTimeWindowSizeChange: (size: number) => void;
  onNavigateTimeWindow: (direction: 'forward' | 'backward') => void;
  onNavigateTime: (direction: 'forward' | 'backward') => void;
  isProcessing: boolean;
}

export const CHART_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F97316', // orange
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F43F5E', // rose
  '#6366F1', // indigo
  '#84CC16', // lime
  '#0EA5E9', // sky
];
