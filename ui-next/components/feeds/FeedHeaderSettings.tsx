"use client";

import {
  faClockRotateLeft,
  faEllipsisH,
  faPencil,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Props {
  onStartRename: () => void;
  onShowHistory: () => void;
  onUnsubscribe: () => void;
}

export default function FeedHeaderSettings({
  onStartRename,
  onShowHistory,
  onUnsubscribe,
}: Props) {
  return (
    <div className="dropdown dropdown-end">
      <details>
        <summary className="btn btn-ghost btn-sm btn-circle list-none">
          <FontAwesomeIcon icon={faEllipsisH} />
        </summary>
        <ul className="dropdown-content menu p-2 shadow bg-base-200 rounded-box w-52 z-[1] mt-2">
          <li>
            <button onClick={onStartRename}>
              <FontAwesomeIcon icon={faPencil} />
              Rename
            </button>
          </li>
          <li>
            <button onClick={onShowHistory}>
              <FontAwesomeIcon icon={faClockRotateLeft} />
              Fetch History
            </button>
          </li>
          <li>
            <button onClick={onUnsubscribe} className="text-error">
              <FontAwesomeIcon icon={faTrash} />
              Unsubscribe
            </button>
          </li>
        </ul>
      </details>
    </div>
  );
}
