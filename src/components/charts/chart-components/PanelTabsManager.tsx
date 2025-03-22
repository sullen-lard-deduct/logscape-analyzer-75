
import React from 'react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Plus } from 'lucide-react';
import { PanelTabsManagerProps } from '@/types/chartTypes';

const PanelTabsManager: React.FC<PanelTabsManagerProps> = ({
  panels,
  activeTab,
  signals,
  onActiveTabChange,
  onAddPanel,
  onRemovePanel,
  onAddSignal,
  onRemoveSignal,
  onToggleSignalVisibility,
  renderChartDisplay
}) => {
  return (
    <Tabs value={activeTab} onValueChange={onActiveTabChange} className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <TabsList>
          {panels.map(panel => (
            <TabsTrigger key={panel.id} value={panel.id} className="relative">
              Panel {panel.id.split('-')[1]}
              {panels.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePanel(panel.id);
                  }}
                  className="ml-1 rounded-full hover:bg-muted p-0.5 absolute -top-1 -right-1"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={onAddPanel}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Panel
        </Button>
      </div>
      
      {panels.map(panel => (
        <TabsContent key={panel.id} value={panel.id} className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-3">
              <div className="bg-card border rounded-md p-3">
                <h3 className="text-sm font-medium mb-2">Available Signals</h3>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-1.5 pr-3">
                    {signals.map(signal => {
                      const isInPanel = panel.signals.includes(signal.id);
                      
                      return (
                        <div
                          key={signal.id}
                          className={`
                            flex items-center justify-between p-2 text-sm rounded-md cursor-pointer
                            ${isInPanel ? 'bg-muted' : 'hover:bg-muted/50'}
                          `}
                          onClick={() => {
                            if (isInPanel) {
                              onRemoveSignal(panel.id, signal.id);
                            } else {
                              onAddSignal(panel.id, signal.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: signal.color }}
                            />
                            <span>{signal.name}</span>
                          </div>
                          {isInPanel && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSignalVisibility(signal.id);
                              }}
                            >
                              <div className={`w-2 h-2 rounded-full ${signal.visible ? 'bg-green-500' : 'bg-red-500'}`} />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>
            
            <div className="lg:col-span-9">
              {renderChartDisplay(panel.id)}
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default PanelTabsManager;
