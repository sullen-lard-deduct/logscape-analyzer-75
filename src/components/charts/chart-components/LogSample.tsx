
import React from 'react';
import { LogSampleProps } from '@/types/chartTypes';

const LogSample: React.FC<LogSampleProps> = ({ rawLogSample }) => {
  if (rawLogSample.length === 0) return null;
  
  return (
    <div className="mt-8 border rounded-md">
      <div className="px-4 py-2 bg-muted font-medium text-sm border-b flex justify-between items-center">
        <span>Sample Log Lines</span>
      </div>
      <div className="p-3 text-xs font-mono whitespace-pre-wrap bg-black text-green-400 overflow-x-auto max-h-[200px]">
        {rawLogSample.join('\n')}
      </div>
    </div>
  );
};

export default LogSample;
