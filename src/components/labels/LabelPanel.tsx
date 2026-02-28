"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RewardRule } from "@/lib/types";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

const PRESET_DISPLAY_NAMES: Record<string, string> = {
  sparse_binary: "Sparse Binary",
  step_penalty: "Step Penalty",
  terminal_signed: "Terminal Signed",
};

function getPresetName(
  rule: RewardRule,
  presets: Record<string, RewardRule>
): string | null {
  for (const [name, preset] of Object.entries(presets)) {
    if (
      rule.step_reward === preset.step_reward &&
      rule.success_terminal_reward === preset.success_terminal_reward &&
      rule.failure_terminal_reward === preset.failure_terminal_reward
    ) {
      return name;
    }
  }
  return null;
}

// ── Pending confirm state ──

interface PendingConfirm {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

// ── LabelPanel ──

interface LabelPanelProps {
  episodeIndex: number | null;
  currentLabel: string | null;
  totalEpisodes: number;
  labeledCount: number;
  onSetLabel: (label: "success" | "failure") => void;
  onRemoveLabel: () => void;
  onBulkLabel: (label: "success" | "failure") => void;
  onBulkClear: () => void;
  saving: boolean;
  error: string | null;
  rewardRule: RewardRule;
  rewardPresets: Record<string, RewardRule>;
  onRewardRuleChange: (rule: RewardRule, reapply: boolean) => void;
  rewardRuleSaving: boolean;
}

export function LabelPanel({
  episodeIndex,
  currentLabel,
  totalEpisodes,
  labeledCount,
  onSetLabel,
  onRemoveLabel,
  onBulkLabel,
  onBulkClear,
  saving,
  error,
  rewardRule,
  rewardPresets,
  onRewardRuleChange,
  rewardRuleSaving,
}: LabelPanelProps) {
  const [applyAll, setApplyAll] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showCustomEditor, setShowCustomEditor] = useState(false);
  const [customValues, setCustomValues] = useState<RewardRule>(rewardRule);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPresetMenu(false);
      }
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setShowCustomEditor(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingConfirm) {
        setShowPresetMenu(false);
        setShowCustomEditor(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pendingConfirm]);

  // Sync custom values when rule changes externally
  useEffect(() => {
    setCustomValues(rewardRule);
  }, [rewardRule]);

  const confirm = useCallback((opts: PendingConfirm) => {
    setPendingConfirm(opts);
  }, []);

  const handleLabel = (label: "success" | "failure") => {
    if (applyAll) {
      confirm({
        title: `Label all episodes as ${label}`,
        message: `This will label all ${totalEpisodes} episodes as ${label}, overwriting any existing labels.`,
        confirmLabel: `Label All ${label === "success" ? "Success" : "Failure"}`,
        onConfirm: () => {
          onBulkLabel(label);
          setApplyAll(false);
        },
      });
    } else {
      onSetLabel(label);
    }
  };

  const handleClear = () => {
    if (applyAll) {
      confirm({
        title: "Clear all labels",
        message: `This will remove labels from all ${totalEpisodes} episodes.`,
        confirmLabel: "Clear All",
        onConfirm: () => {
          onBulkClear();
          setApplyAll(false);
        },
      });
    } else {
      onRemoveLabel();
    }
  };

  const handlePresetSelect = useCallback(
    (preset: RewardRule) => {
      setShowPresetMenu(false);
      // Merge preset reward values with current column names
      const merged: RewardRule = {
        ...preset,
        reward_column_name: rewardRule.reward_column_name,
        is_done_column_name: rewardRule.is_done_column_name,
      };
      if (labeledCount > 0) {
        confirm({
          title: "Re-apply reward function",
          message: `Re-apply reward function to ${labeledCount} labeled episode${labeledCount === 1 ? "" : "s"}?\n\nThis will rewrite reward values in the parquet files.`,
          confirmLabel: "Re-apply",
          onConfirm: () => onRewardRuleChange(merged, true),
        });
      } else {
        onRewardRuleChange(merged, false);
      }
    },
    [labeledCount, onRewardRuleChange, confirm, rewardRule.reward_column_name, rewardRule.is_done_column_name]
  );

  const handleCustomApply = useCallback(() => {
    setShowCustomEditor(false);
    if (labeledCount > 0) {
      confirm({
        title: "Apply custom reward function",
        message: `Re-apply custom reward function to ${labeledCount} labeled episode${labeledCount === 1 ? "" : "s"}?\n\nThis will rewrite reward values in the parquet files.`,
        confirmLabel: "Apply",
        onConfirm: () => onRewardRuleChange(customValues, true),
      });
    } else {
      onRewardRuleChange(customValues, false);
    }
  }, [labeledCount, customValues, onRewardRuleChange, confirm]);

  if (episodeIndex === null) return null;

  const clearEnabled = applyAll || !!currentLabel;
  const currentPresetName = getPresetName(rewardRule, rewardPresets);
  const ruleDisplayName = currentPresetName
    ? PRESET_DISPLAY_NAMES[currentPresetName] || currentPresetName
    : "Custom";

  return (
    <>
      <div className="relative flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5 bg-[#161821]/60 rounded-lg px-1.5 py-1.5">
          {/* Episode context */}
          <span className="text-[13px] text-[#929AAB] px-2.5 select-none tabular-nums">
            {applyAll ? `All ${totalEpisodes}` : `Ep ${episodeIndex + 1}/${totalEpisodes}`}
          </span>

          <div className="w-px h-5 bg-[#2a2d38]" />

          {/* Success button */}
          <button
            onClick={() => handleLabel("success")}
            disabled={saving}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all ${
              currentLabel === "success"
                ? "bg-[#7AE6A0]/15 text-[#7AE6A0]"
                : "text-[#929AAB] hover:bg-[#1e2028] hover:text-[#7AE6A0]"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
            </svg>
            Success
            <kbd className="ml-0.5 text-[11px] text-[#474A56] font-normal">S</kbd>
          </button>

          {/* Failure button */}
          <button
            onClick={() => handleLabel("failure")}
            disabled={saving}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all ${
              currentLabel === "failure"
                ? "bg-[#E87070]/15 text-[#E87070]"
                : "text-[#929AAB] hover:bg-[#1e2028] hover:text-[#E87070]"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
            Failure
            <kbd className="ml-0.5 text-[11px] text-[#474A56] font-normal">F</kbd>
          </button>

          <div className="w-px h-5 bg-[#2a2d38]" />

          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={saving || !clearEnabled}
            className={`px-2.5 py-2 rounded-md text-sm transition-all ${
              clearEnabled
                ? "text-[#929AAB] hover:text-[#D3D5FD] hover:bg-[#1e2028]"
                : "text-transparent pointer-events-none"
            }`}
          >
            Clear
          </button>

          <div className="w-px h-5 bg-[#2a2d38]" />

          {/* Apply-all toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none group px-1.5 py-1.5">
            <div className="relative">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-7 h-[16px] bg-[#2a2d38] rounded-full peer-checked:bg-[#A8ABE0]/50 transition-colors" />
              <div className="absolute top-[2px] left-[2px] w-[12px] h-[12px] bg-[#929AAB] rounded-full peer-checked:translate-x-[11px] peer-checked:bg-white transition-all" />
            </div>
            <span className="text-xs text-[#929AAB] group-hover:text-[#D3D5FD] transition-colors">
              All
            </span>
          </label>

          <div className="w-px h-5 bg-[#2a2d38]" />

          {/* Reward rule selector */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setShowPresetMenu((v) => !v); setShowCustomEditor(false); }}
              disabled={rewardRuleSaving}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-[#929AAB] hover:bg-[#1e2028] hover:text-[#D3D5FD] transition-all"
              title="Reward function"
            >
              {/* Reward curve icon */}
              <svg className="w-3.5 h-3.5 text-[#474A56]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2,12 10,12 14,4" />
              </svg>
              <span className="flex flex-col items-start leading-tight">
                <span>{rewardRuleSaving ? "Applying..." : ruleDisplayName}</span>
                {(rewardRule.reward_column_name !== "reward" || rewardRule.is_done_column_name !== "is_done") && (
                  <span className="text-[9px] text-[#474A56] font-mono">
                    {rewardRule.reward_column_name}, {rewardRule.is_done_column_name}
                  </span>
                )}
              </span>
              <svg className="w-3 h-3 text-[#474A56]" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 1l4 4 4-4" />
              </svg>
            </button>

            {showPresetMenu && (
              <div className="absolute bottom-full mb-1 left-0 bg-[#161821] border border-[#2a2d38] rounded-lg py-1 shadow-xl z-50 min-w-[200px]">
                {Object.entries(rewardPresets).map(([name, preset]) => (
                  <button
                    key={name}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#1e2028] transition-all ${
                      currentPresetName === name ? "text-[#D3D5FD]" : "text-[#929AAB]"
                    }`}
                  >
                    <div>{PRESET_DISPLAY_NAMES[name] || name}</div>
                    <div className="text-[9px] text-[#474A56] mt-0.5 font-mono">
                      step={preset.step_reward} succ={preset.success_terminal_reward} fail={preset.failure_terminal_reward}
                    </div>
                  </button>
                ))}
                <div className="border-t border-[#2a2d38] my-1" />
                <button
                  onClick={() => {
                    setShowPresetMenu(false);
                    setCustomValues(rewardRule);
                    setShowCustomEditor(true);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#929AAB] hover:bg-[#1e2028]"
                >
                  Custom...
                </button>
              </div>
            )}

            {/* Custom editor popover */}
            {showCustomEditor && (
              <div
                ref={editorRef}
                className="absolute bottom-full mb-1 right-0 bg-[#161821] border border-[#2a2d38] rounded-lg p-3 shadow-xl z-50 min-w-[320px]"
              >
                <div className="text-[10px] text-[#929AAB] mb-2 font-medium">Custom Reward Rule</div>
                {([
                  { key: "step_reward" as const, label: "Step reward (r_t, t < T)" },
                  { key: "success_terminal_reward" as const, label: "Success terminal (r_T)" },
                  { key: "failure_terminal_reward" as const, label: "Failure terminal (r_T)" },
                ]).map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-[10px] text-[#929AAB]">{label}</span>
                    <input
                      type="number"
                      step="any"
                      value={customValues[key]}
                      onChange={(e) =>
                        setCustomValues((v) => ({
                          ...v,
                          [key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-20 bg-[#0B0B0D] border border-[#2a2d38] rounded px-1.5 py-0.5 text-[11px] text-[#D3D5FD] text-right focus:outline-none focus:border-[#D3D5FD]/50"
                    />
                  </label>
                ))}
                {/* Column name section */}
                <div className="border-t border-[#2a2d38] mt-2.5 pt-2.5">
                  <div className="text-[10px] text-[#929AAB] mb-2 font-medium">Output Column Names</div>
                  {([
                    { key: "reward_column_name" as const, label: "Reward column" },
                    { key: "is_done_column_name" as const, label: "Done column" },
                  ]).map(({ key, label }) => (
                    <label key={key} className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="text-[10px] text-[#929AAB]">{label}</span>
                      <input
                        type="text"
                        value={customValues[key]}
                        onChange={(e) =>
                          setCustomValues((v) => ({
                            ...v,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-32 bg-[#0B0B0D] border border-[#2a2d38] rounded px-1.5 py-0.5 text-[11px] text-[#D3D5FD] focus:outline-none focus:border-[#D3D5FD]/50 font-mono"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setShowCustomEditor(false)}
                    className="flex-1 px-2 py-1 text-[10px] text-[#929AAB] hover:text-[#D3D5FD] rounded transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCustomApply}
                    className="flex-1 px-2 py-1 text-[10px] bg-[#D3D5FD]/10 text-[#D3D5FD] rounded hover:bg-[#D3D5FD]/20 transition-all"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {(saving || error) && (
          <span className="absolute right-0 text-xs truncate max-w-48">
            {saving ? <span className="text-[#929AAB]">Saving...</span> : <span className="text-[#E87070]/70">{error}</span>}
          </span>
        )}
      </div>

      {/* Themed confirm modal */}
      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          message={pendingConfirm.message}
          confirmLabel={pendingConfirm.confirmLabel}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </>
  );
}
