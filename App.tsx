import React from 'react';
import { Experience } from './components/Experience';

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-gray-900 relative overflow-hidden">
      
      {/* Header */}
      <div className="absolute top-0 left-0 p-6 text-white z-10 pointer-events-none select-none">
        <h1 className="text-4xl font-black tracking-tighter italic text-red-500 drop-shadow-[0_2px_10px_rgba(239,68,68,0.5)]">
          TAG: ELIMINATION
        </h1>
        <p className="text-gray-300 text-sm font-mono mt-1">
          <span className="text-red-400 font-bold">HUNTER</span> vs <span className="text-blue-400 font-bold">SWARM</span>
        </p>
      </div>

      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Experience />
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 w-full text-center pointer-events-none select-none">
        <div className="inline-block bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <p className="text-white/50 text-xs font-mono tracking-widest uppercase">
            Last One Standing Wins
            </p>
        </div>
      </div>
    </div>
  );
};

export default App;