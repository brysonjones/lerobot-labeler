"use client";

import { useState } from "react";

interface DatasetSelectorProps {
  onLoad: (path: string, saveTo?: string) => void;
  loading: boolean;
  error: string | null;
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 6a2 2 0 0 1 2-2h3.172a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 10.828 6H16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
      <path d="M10 3a7 7 0 0 1 7 7" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638l-3.96-3.56a.75.75 0 0 1 1.004-1.115l5.25 4.72a.75.75 0 0 1 0 1.115l-5.25 4.72a.75.75 0 1 1-1.004-1.115l3.96-3.56H3.75A.75.75 0 0 1 3 10z" clipRule="evenodd" />
    </svg>
  );
}

export function DatasetSelector({ onLoad, loading, error }: DatasetSelectorProps) {
  const [path, setPath] = useState("");
  const [saveToNew, setSaveToNew] = useState(false);
  const [saveTo, setSaveTo] = useState("");

  const handleBrowse = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI?.selectDirectory) {
      const selected = await (window as any).electronAPI.selectDirectory();
      if (selected) {
        setPath(selected);
      }
    }
  };

  const canSubmit = path.trim() && (!saveToNew || saveTo.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onLoad(path.trim(), saveToNew ? saveTo.trim() : undefined);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <SpinnerIcon className="w-8 h-8 text-[#D3D5FD]" />
        <div className="text-center">
          <div className="text-sm text-[#D3D5FD] font-medium">
            {saveToNew ? "Copying dataset..." : "Loading dataset..."}
          </div>
          <div className="text-xs text-[#929AAB] mt-1">
            {saveToNew
              ? "Creating a copy with symlinked videos"
              : "Reading metadata and episodes"}
          </div>
        </div>
        {/* Indeterminate progress bar */}
        <div className="w-full h-1 bg-[#161821] rounded-full overflow-hidden">
          <div className="h-full w-1/3 bg-[#D3D5FD] rounded-full animate-[slide_1.5s_ease-in-out_infinite]" />
        </div>
        <style>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/dataset"
            className="w-full bg-[#161821] border border-[#2a2d38] rounded-lg px-3 py-2.5 text-sm text-[#D3D5FD] placeholder-[#474A56] focus:outline-none focus:border-[#D3D5FD]/50 focus:ring-1 focus:ring-[#D3D5FD]/15 transition-all"
          />
        </div>
        <button
          type="button"
          onClick={handleBrowse}
          className="flex items-center gap-1.5 bg-[#161821] hover:bg-[#1e2028] border border-[#2a2d38] text-[#929AAB] hover:text-[#D3D5FD] px-3 py-2.5 rounded-lg text-sm transition-all"
          title="Browse for dataset directory"
        >
          <FolderIcon className="w-4 h-4" />
          <span className="text-xs">Browse</span>
        </button>
      </div>

      {/* Save-to-new toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none group">
        <div className="relative">
          <input
            type="checkbox"
            checked={saveToNew}
            onChange={(e) => setSaveToNew(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-8 h-[18px] bg-[#2a2d38] rounded-full peer-checked:bg-[#D3D5FD]/50 transition-colors" />
          <div className="absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-[#929AAB] rounded-full peer-checked:translate-x-[14px] peer-checked:bg-white transition-all" />
        </div>
        <span className="text-xs text-[#929AAB] group-hover:text-[#D3D5FD] transition-colors">
          Save to new dataset
        </span>
      </label>

      {/* Output path — shown when toggled */}
      {saveToNew && (
        <div>
          <div className="text-[11px] text-[#929AAB] mb-1.5">
            Output path (relative to dataset parent directory)
          </div>
          <input
            type="text"
            value={saveTo}
            onChange={(e) => setSaveTo(e.target.value)}
            placeholder="my_dataset_labeled"
            className="w-full bg-[#161821] border border-[#2a2d38] rounded-lg px-3 py-2.5 text-sm text-[#D3D5FD] placeholder-[#474A56] focus:outline-none focus:border-[#D3D5FD]/50 focus:ring-1 focus:ring-[#D3D5FD]/15 transition-all"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex items-center justify-center gap-2 bg-[#D3D5FD] hover:bg-[#A8ABE0] disabled:bg-[#161821] disabled:border-[#2a2d38] disabled:text-[#474A56] text-[#0B0B0D] px-4 py-2.5 rounded-lg text-sm font-medium transition-all border border-transparent disabled:border"
      >
        Open Dataset
        <ArrowRightIcon className="w-4 h-4" />
      </button>

      {error && (
        <div className="flex items-start gap-2 bg-[#E87070]/10 border border-[#E87070]/20 rounded-lg px-3 py-2">
          <svg className="w-4 h-4 text-[#E87070] mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zM8.94 6.94a.75.75 0 1 1-1.06-1.06.75.75 0 0 1 1.06 1.06zM10 8.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75z" clipRule="evenodd" />
          </svg>
          <p className="text-[#E87070] text-xs leading-relaxed">{error}</p>
        </div>
      )}
    </form>
  );
}
