"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { RewardRule } from "@/lib/types";

interface RewardStripProps {
  label: string | null;
  totalFrames: number;
  currentFrame: number;
  rewardRule: RewardRule;
  fps: number;
}

export function RewardStrip({ label, totalFrames, currentFrame, rewardRule, fps }: RewardStripProps) {
  if (!label || totalFrames <= 0) return null;

  const isSuccess = label === "success";
  const color = isSuccess ? "#7AE6A0" : "#E87070";

  const stepR = rewardRule.step_reward;
  const termR = isSuccess
    ? rewardRule.success_terminal_reward
    : rewardRule.failure_terminal_reward;

  const minReward = Math.min(stepR, termR);
  const maxReward = Math.max(stepR, termR);
  const rewardRange = maxReward - minReward || 1;
  const yPad = rewardRange * 0.15;
  const yDomain: [number, number] = [minReward - yPad, maxReward + yPad];

  const maxFrame = totalFrames - 1;

  // Build per-frame reward data + sentinel for stepAfter hover on last point
  const chartData = useMemo(() => {
    const data: { frame: number; reward: number }[] = [];
    for (let i = 0; i < totalFrames; i++) {
      data.push({
        frame: i,
        reward: i === totalFrames - 1 ? termR : stepR,
      });
    }
    // Sentinel point so stepAfter draws a hoverable segment past the last real frame
    data.push({ frame: totalFrames, reward: termR });
    return data;
  }, [totalFrames, stepR, termR]);

  return (
    <div className="flex items-center gap-3">
      {/* Left spacer — matches Timeline's w-16 time label */}
      <span className="text-xs text-[#474A56] font-mono w-16 text-right">
        reward
      </span>
      {/* Chart — fills flex-1, aligned with Timeline slider */}
      <div className="flex-1" style={{ height: 48 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis
              dataKey="frame"
              type="number"
              domain={[0, totalFrames]}
              hide
            />
            <YAxis
              domain={yDomain}
              ticks={[minReward, maxReward]}
              tick={{ fontSize: 10, fill: "#474A56" }}
              axisLine={false}
              tickLine={false}
              width={1}
              mirror
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0B0B0D",
                border: "1px solid #2a2d38",
                fontSize: 11,
              }}
              labelFormatter={(v: number) => {
                const frame = Math.min(Math.round(v), maxFrame);
                const time = fps > 0 ? (frame / fps).toFixed(2) : "0.00";
                return `frame ${frame} (${time}s)`;
              }}
              formatter={(v: number) => [v, "reward"]}
            />
            <ReferenceLine
              x={currentFrame}
              stroke="#D3D5FD"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
            <Line
              type="stepAfter"
              dataKey="reward"
              stroke={color}
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Right spacers — match Timeline's w-16 time label + frame counter */}
      <span className="text-xs font-mono w-16" />
      <span className="text-xs font-mono invisible">
        {currentFrame}/{maxFrame}
      </span>
    </div>
  );
}
