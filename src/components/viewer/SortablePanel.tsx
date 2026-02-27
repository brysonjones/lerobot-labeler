"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortablePanelProps {
  id: string;
  title: string;
  /** If true, panel spans 2 columns in the grid */
  fullWidth?: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
}

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </svg>
  );
}

export function SortablePanel({
  id,
  title,
  fullWidth,
  onRemove,
  children,
}: SortablePanelProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    gridColumn: fullWidth ? "1 / -1" : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-[#0B0B0D] overflow-hidden ${
        isDragging ? "border-[#D3D5FD] shadow-lg shadow-[#D3D5FD]/10" : "border-[#2a2d38]"
      }`}
    >
      {/* Drag handle header */}
      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#161821]/50 border-b border-[#2a2d38]/50">
        <button
          {...attributes}
          {...listeners}
          className="text-[#474A56] hover:text-[#929AAB] cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-[#2a2d38]/50 transition-colors"
          title="Drag to reorder"
        >
          <DragHandleIcon className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] text-[#929AAB] flex-1 truncate">{title}</span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-[#474A56] hover:text-[#D3D5FD] text-xs px-1 rounded hover:bg-[#2a2d38]/50 transition-colors"
            title="Remove"
          >
            ✕
          </button>
        )}
      </div>
      {/* Panel content */}
      <div className="p-0">{children}</div>
    </div>
  );
}
