"use client";

import { useMemo } from "react";

interface DimensionGroup {
  suffix: string;
  dims: { fullName: string; shortName: string; colorIndex: number }[];
}

interface DimensionFilterProps {
  dimNames: string[];
  hiddenDims: Set<string>;
  colors: string[];
  onToggleDim: (name: string) => void;
  onToggleGroup: (names: string[]) => void;
}

/**
 * Auto-detect groups by common suffix (last `.`-delimited segment).
 * Returns grouped view if ≥2 groups with ≥2 members each, otherwise flat.
 * Orphan dimensions (single-member suffixes) are collected into an "other" group.
 */
function detectGroups(dimNames: string[]): DimensionGroup[] | null {
  const bySuffix = new Map<string, { fullName: string; index: number }[]>();

  for (let i = 0; i < dimNames.length; i++) {
    const name = dimNames[i];
    const dotIdx = name.lastIndexOf(".");
    const suffix = dotIdx >= 0 ? name.slice(dotIdx + 1) : "";
    if (!bySuffix.has(suffix)) bySuffix.set(suffix, []);
    bySuffix.get(suffix)!.push({ fullName: name, index: i });
  }

  const multiMemberGroups: [string, { fullName: string; index: number }[]][] = [];
  const orphans: { fullName: string; index: number }[] = [];

  for (const [suffix, members] of bySuffix) {
    if (members.length >= 2) {
      multiMemberGroups.push([suffix, members]);
    } else {
      orphans.push(...members);
    }
  }

  // Need ≥2 real groups to justify grouped view
  if (multiMemberGroups.length < 2) return null;

  const groups: DimensionGroup[] = multiMemberGroups.map(([suffix, members]) => ({
    suffix,
    dims: members.map((m) => {
      const dotIdx = m.fullName.lastIndexOf(".");
      return {
        fullName: m.fullName,
        shortName: dotIdx >= 0 ? m.fullName.slice(0, dotIdx) : m.fullName,
        colorIndex: m.index,
      };
    }),
  }));

  // Include orphan dimensions so they remain toggleable
  if (orphans.length > 0) {
    groups.push({
      suffix: "other",
      dims: orphans.map((m) => ({
        fullName: m.fullName,
        shortName: m.fullName,
        colorIndex: m.index,
      })),
    });
  }

  return groups;
}

export function DimensionFilter({
  dimNames,
  hiddenDims,
  colors,
  onToggleDim,
  onToggleGroup,
}: DimensionFilterProps) {
  const groups = useMemo(() => detectGroups(dimNames), [dimNames]);

  if (dimNames.length <= 1) return null;

  // Grouped view
  if (groups) {
    return (
      <div className="flex flex-col gap-1 pt-2">
        {groups.map((group) => {
          const allHidden = group.dims.every((d) => hiddenDims.has(d.fullName));
          const someHidden = group.dims.some((d) => hiddenDims.has(d.fullName));
          const groupNames = group.dims.map((d) => d.fullName);

          return (
            <div key={group.suffix} className="flex items-center gap-1.5 flex-wrap">
              {/* Group header toggle */}
              <button
                onClick={() => onToggleGroup(groupNames)}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors shrink-0 min-w-[48px] text-left hover:bg-[#1e2028] ${
                  allHidden
                    ? "text-[#474A56] hover:text-[#929AAB]"
                    : someHidden
                      ? "text-[#929AAB] hover:text-[#D3D5FD]"
                      : "text-[#D3D5FD] hover:text-[#D3D5FD]"
                }`}
                title={allHidden ? `Show all ${group.suffix}` : `Hide all ${group.suffix}`}
              >
                {group.suffix}
              </button>

              {/* Individual dim chips */}
              {group.dims.map((dim) => {
                const hidden = hiddenDims.has(dim.fullName);
                const color = colors[dim.colorIndex % colors.length];
                return (
                  <button
                    key={dim.fullName}
                    onClick={() => onToggleDim(dim.fullName)}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                      hidden
                        ? "text-[#474A56] hover:text-[#929AAB]"
                        : "text-[#929AAB] hover:text-[#D3D5FD]"
                    }`}
                    title={dim.fullName}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0 transition-opacity"
                      style={{
                        backgroundColor: color,
                        opacity: hidden ? 0.2 : 1,
                      }}
                    />
                    {dim.shortName}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // Flat view (no meaningful groups detected)
  return (
    <div className="flex items-center gap-1 flex-wrap pt-2">
      {dimNames.map((name, i) => {
        const hidden = hiddenDims.has(name);
        const color = colors[i % colors.length];
        return (
          <button
            key={name}
            onClick={() => onToggleDim(name)}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              hidden
                ? "text-[#474A56] hover:text-[#929AAB]"
                : "text-[#929AAB] hover:text-[#D3D5FD]"
            }`}
            title={name}
          >
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0 transition-opacity"
              style={{
                backgroundColor: color,
                opacity: hidden ? 0.2 : 1,
              }}
            />
            {name}
          </button>
        );
      })}
    </div>
  );
}
