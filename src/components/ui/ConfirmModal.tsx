"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onConfirm, onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative bg-[#161821] border border-[#2a2d38] rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <h3 className="text-sm font-semibold text-[#D3D5FD] mb-2">{title}</h3>
          <p className="text-xs text-[#929AAB] leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        <div className="flex border-t border-[#2a2d38]">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-xs text-[#929AAB] hover:text-[#D3D5FD] hover:bg-[#1e2028] transition-all"
          >
            {cancelLabel}
          </button>
          <div className="w-px bg-[#2a2d38]" />
          <button
            onClick={onConfirm}
            autoFocus
            className="flex-1 px-4 py-2.5 text-xs text-[#D3D5FD] font-medium hover:bg-[#D3D5FD]/10 transition-all"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
