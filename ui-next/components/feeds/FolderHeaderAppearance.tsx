"use client";

import type { Density, TextSize } from "@/lib/useViewPreferences";
import { faTableCells, faTableList } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Props {
  viewMode?: string;
  onViewModeChange?: (mode: string) => void;
  density?: Density;
  onDensityChange?: (d: Density) => void;
  textSize?: TextSize;
  onTextSizeChange?: (s: TextSize) => void;
  onlyUnread?: boolean;
  onToggleUnread?: () => void;
}

export default function FolderHeaderAppearance({
  viewMode = "list",
  onViewModeChange,
  density = "default",
  onDensityChange,
  textSize = "base",
  onTextSizeChange,
  onlyUnread,
  onToggleUnread,
}: Props) {
  if (
    !onViewModeChange &&
    !onTextSizeChange &&
    !onDensityChange &&
    !onToggleUnread
  )
    return null;

  return (
    <div className="dropdown dropdown-end">
      <details>
        <summary className="btn btn-ghost btn-sm list-none px-2 font-bold">
          Aa
        </summary>
        <div className="dropdown-content bg-base-200 rounded-box shadow p-3 w-56 z-[1] mt-2 flex flex-col gap-4">
          {onViewModeChange && (
            <div>
              <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                Layout
              </p>
              <div className="join w-full">
                <button
                  className={`btn btn-xs join-item flex-1 gap-1 ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => onViewModeChange("list")}
                >
                  <FontAwesomeIcon icon={faTableList} /> List
                </button>
                <button
                  className={`btn btn-xs join-item flex-1 gap-1 ${viewMode === "cards" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => onViewModeChange("cards")}
                >
                  <FontAwesomeIcon icon={faTableCells} /> Cards
                </button>
                <button
                  className={`btn btn-xs join-item flex-1 gap-1 ${viewMode === "magazine" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => onViewModeChange("magazine")}
                >
                  Mag
                </button>
              </div>
            </div>
          )}

          {onTextSizeChange && (
            <div>
              <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                Text
              </p>
              <div className="join w-full">
                {(["sm", "base", "lg"] as TextSize[]).map((s) => (
                  <button
                    key={s}
                    className={`btn btn-xs join-item flex-1 ${textSize === s ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => onTextSizeChange(s)}
                  >
                    {s === "sm" ? "Small" : s === "base" ? "Medium" : "Large"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onDensityChange && (
            <div>
              <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                Density
              </p>
              <div className="join w-full">
                {(["compact", "default", "cozy"] as Density[]).map((d) => (
                  <button
                    key={d}
                    className={`btn btn-xs join-item flex-1 ${density === d ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => onDensityChange(d)}
                  >
                    {d === "compact"
                      ? "Compact"
                      : d === "default"
                        ? "Normal"
                        : "Cozy"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onToggleUnread !== undefined && (
            <div>
              <p className="text-xs font-semibold opacity-50 uppercase tracking-wider mb-1.5">
                Filter
              </p>
              <button
                className={`btn btn-xs w-full ${onlyUnread ? "btn-primary" : "btn-ghost"}`}
                onClick={onToggleUnread}
              >
                Unread only
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
