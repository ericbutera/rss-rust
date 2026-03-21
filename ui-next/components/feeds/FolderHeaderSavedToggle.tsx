"use client";

import { faBookmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Props {
  onlySaved?: boolean;
  onToggleSaved?: () => void;
}

export default function FolderHeaderSavedToggle({
  onlySaved,
  onToggleSaved,
}: Props) {
  if (!onToggleSaved) return null;

  return (
    <div
      className="tooltip tooltip-bottom"
      data-tip={onlySaved ? "Show all articles" : "Show saved only"}
    >
      <button
        className={`btn btn-sm btn-circle ${onlySaved ? "btn-primary" : "btn-ghost"}`}
        onClick={onToggleSaved}
      >
        <FontAwesomeIcon icon={faBookmark} />
      </button>
    </div>
  );
}
