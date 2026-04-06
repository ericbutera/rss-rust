"use client";

import { faBookmark, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Props {
  onlySaved?: boolean;
  onToggleSaved?: () => void;
  icon?: "saved" | "unread";
  activeLabel?: string;
  inactiveLabel?: string;
}

export default function FolderHeaderSavedToggle({
  onlySaved,
  onToggleSaved,
  icon = "saved",
  activeLabel,
  inactiveLabel,
}: Props) {
  if (!onToggleSaved) return null;

  const defaultActive =
    icon === "unread" ? "Show all articles" : "Show all articles";
  const defaultInactive =
    icon === "unread" ? "Show unread only" : "Show saved only";
  const tipLabel = onlySaved
    ? (activeLabel ?? defaultActive)
    : (inactiveLabel ?? defaultInactive);

  return (
    <div className="tooltip tooltip-bottom" data-tip={tipLabel}>
      <button
        className={`btn btn-sm btn-circle ${onlySaved ? "btn-primary" : "btn-ghost"}`}
        onClick={onToggleSaved}
      >
        <FontAwesomeIcon icon={icon === "unread" ? faEye : faBookmark} />
      </button>
    </div>
  );
}
