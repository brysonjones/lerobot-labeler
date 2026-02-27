"use client";

interface SignalSelectorProps {
  availableKeys: string[];
  selectedKeys: string[];
  onAdd: (key: string) => void;
}

export function SignalSelector({ availableKeys, selectedKeys, onAdd }: SignalSelectorProps) {
  const unselected = availableKeys.filter((k) => !selectedKeys.includes(k));

  if (unselected.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <select
        className="bg-[#161821] border border-[#2a2d38] rounded px-2 py-1 text-sm text-[#D3D5FD] focus:outline-none focus:border-[#D3D5FD]/50"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onAdd(e.target.value);
            e.target.value = "";
          }
        }}
      >
        <option value="" disabled>
          + Add signal plot...
        </option>
        {unselected.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </div>
  );
}
