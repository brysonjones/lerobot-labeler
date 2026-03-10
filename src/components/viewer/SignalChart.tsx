"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { DimensionFilter } from "./DimensionFilter";

const COLORS = [
  "#D3D5FD", "#7AE6A0", "#E8C170", "#E87070", "#70C8E8",
  "#C4A8E0", "#A8ABE0", "#929AAB", "#70E8B0", "#E8A870",
];

export interface ZoomDomain {
  left: number;
  right: number;
}

interface SignalChartProps {
  signalKey: string;
  timestamps: number[];
  values: number[][];
  currentFrameIndex: number;
  dimensionNames: string[] | null;
  defaultHeight: number;
  /** Controlled zoom domain (synced across charts). null = full range. */
  zoomDomain: ZoomDomain | null;
  onZoomChange: (domain: ZoomDomain | null) => void;
  onRemove?: () => void;
}

export function SignalChart({
  signalKey,
  timestamps,
  values,
  currentFrameIndex,
  dimensionNames,
  defaultHeight,
  zoomDomain,
  onZoomChange,
  onRemove,
}: SignalChartProps) {
  const numDims = values.length > 0 ? (values[0]?.length ?? 0) : 0;

  // Use real feature names if available, fall back to dim_0, dim_1, etc.
  const dimNames = useMemo(() => {
    return Array.from({ length: numDims }, (_, d) =>
      dimensionNames && d < dimensionNames.length ? dimensionNames[d] : `dim_${d}`
    );
  }, [numDims, dimensionNames]);

  const chartData = useMemo(() => {
    return timestamps.map((ts, i) => {
      const point: Record<string, number> = { timestamp: ts };
      const dims = values[i] || [];
      dims.forEach((v, d) => {
        point[dimNames[d]] = v;
      });
      return point;
    });
  }, [timestamps, values, dimNames]);

  const dataMin = timestamps[0] ?? 0;
  const dataMax = timestamps[timestamps.length - 1] ?? 1;
  const currentTimestamp = timestamps[currentFrameIndex] ?? 0;

  // Brush zoom state
  const [brushStart, setBrushStart] = useState<number | null>(null);
  const [brushEnd, setBrushEnd] = useState<number | null>(null);
  const isDragging = useRef(false);

  // Legend toggle
  const [hiddenDims, setHiddenDims] = useState<Set<string>>(new Set());

  // Track cursor x for wheel zoom
  const cursorXRef = useRef<number | null>(null);

  // Brush zoom handlers
  const handleMouseDown = useCallback((e: any) => {
    if (e?.activeLabel != null) {
      isDragging.current = true;
      setBrushStart(Number(e.activeLabel));
      setBrushEnd(null);
    }
  }, []);

  const handleMouseMove = useCallback((e: any) => {
    if (e?.activeLabel != null) {
      cursorXRef.current = Number(e.activeLabel);
      if (isDragging.current) {
        setBrushEnd(Number(e.activeLabel));
      }
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (isDragging.current && brushStart != null && brushEnd != null) {
      const left = Math.min(brushStart, brushEnd);
      const right = Math.max(brushStart, brushEnd);
      if (right - left > (dataMax - dataMin) * 0.005) {
        onZoomChange({ left, right });
      }
    }
    isDragging.current = false;
    setBrushStart(null);
    setBrushEnd(null);
  }, [brushStart, brushEnd, dataMin, dataMax, onZoomChange]);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    setBrushStart(null);
    setBrushEnd(null);
  }, []);

  // Wheel zoom
  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      const center = cursorXRef.current;
      if (center == null) return;

      const domain = zoomDomain ?? { left: dataMin, right: dataMax };
      const range = domain.right - domain.left;
      const factor = e.deltaY > 0 ? 1.3 : 1 / 1.3;
      const newRange = range * factor;

      // If zooming out past full range, reset
      if (newRange >= dataMax - dataMin) {
        onZoomChange(null);
        return;
      }

      // Zoom around cursor position
      const ratio = (center - domain.left) / range;
      let newLeft = center - newRange * ratio;
      let newRight = center + newRange * (1 - ratio);

      // Clamp to data bounds
      if (newLeft < dataMin) {
        newLeft = dataMin;
        newRight = Math.min(dataMax, newLeft + newRange);
      }
      if (newRight > dataMax) {
        newRight = dataMax;
        newLeft = Math.max(dataMin, newRight - newRange);
      }

      onZoomChange({ left: newLeft, right: newRight });
    },
    [zoomDomain, dataMin, dataMax, onZoomChange]
  );

  // Double-click to reset zoom
  const handleDoubleClick = useCallback(() => {
    onZoomChange(null);
  }, [onZoomChange]);

  // Toggle a single dimension's visibility
  const handleToggleDim = useCallback((name: string) => {
    setHiddenDims((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        // Don't allow hiding all dimensions
        if (next.size < numDims - 1) {
          next.add(name);
        }
      }
      return next;
    });
  }, [numDims]);

  // Toggle an entire group of dimensions
  const handleToggleGroup = useCallback((names: string[]) => {
    setHiddenDims((prev) => {
      const allHidden = names.every((n) => prev.has(n));
      const next = new Set(prev);
      if (allHidden) {
        // Show all in group
        for (const n of names) next.delete(n);
      } else {
        // Hide all in group, but keep at least one dim visible overall
        for (const n of names) {
          if (next.size < numDims - 1) {
            next.add(n);
          }
        }
      }
      return next;
    });
  }, [numDims]);

  const isZoomed = zoomDomain != null;
  const xDomain: [number, number] = zoomDomain
    ? [zoomDomain.left, zoomDomain.right]
    : [dataMin, dataMax];

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isZoomed && (
            <button
              onClick={() => onZoomChange(null)}
              className="text-[10px] text-[#A8ABE0] hover:text-[#D3D5FD] px-1.5 py-0.5 rounded border border-[#D3D5FD]/30 hover:border-[#D3D5FD]/50 transition-colors"
              title="Reset zoom (double-click chart)"
            >
              Reset zoom
            </button>
          )}
        </div>
      </div>
      <div
        ref={chartWrapperRef}
        className="overflow-hidden select-none"
        style={{ height: defaultHeight, resize: "vertical", cursor: "crosshair" }}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d38" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={xDomain}
              allowDataOverflow
              tick={{ fontSize: 10, fill: "#929AAB" }}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}s`}
            />
            <YAxis tick={{ fontSize: 10, fill: "#929AAB" }} tickLine={false} width={50} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0B0B0D",
                border: "1px solid #2a2d38",
                fontSize: 11,
              }}
              labelFormatter={(v: number) => `${Number(v).toFixed(2)}s`}
            />
            {/* Legend removed; DimensionFilter renders below the chart */}
            <ReferenceLine
              x={currentTimestamp}
              stroke="#D3D5FD"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            {/* Brush selection overlay */}
            {brushStart != null && brushEnd != null && (
              <ReferenceArea
                x1={brushStart}
                x2={brushEnd}
                strokeOpacity={0.3}
                fill="#D3D5FD"
                fillOpacity={0.15}
              />
            )}
            {dimNames.map((name, d) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                name={name}
                stroke={COLORS[d % COLORS.length]}
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
                hide={hiddenDims.has(name)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DimensionFilter
        dimNames={dimNames}
        hiddenDims={hiddenDims}
        colors={COLORS}
        onToggleDim={handleToggleDim}
        onToggleGroup={handleToggleGroup}
      />
      {isZoomed && (
        <div className="mt-1 text-[10px] text-[#474A56] text-center">
          Scroll to zoom &middot; Drag to select range &middot; Double-click to reset
        </div>
      )}
    </div>
  );
}
