import type { NamedStat } from "@/lib/queries";
import { admin } from "@ericbutera/kaleido";
import {
  faArrowUpFromBracket,
  faCircleExclamation,
  faDatabase,
  faRss,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";

const ICON_MAP: Record<string, ReactNode> = {
  feeds_fetched_last_30d: (
    <FontAwesomeIcon icon={faRss} className="text-secondary" />
  ),
  articles_added_last_30d: (
    <FontAwesomeIcon icon={faArrowUpFromBracket} className="text-secondary" />
  ),
  content_size_last_30d: (
    <FontAwesomeIcon icon={faDatabase} className="text-secondary" />
  ),
  parse_errors_last_30d: (
    <FontAwesomeIcon icon={faCircleExclamation} className="text-secondary" />
  ),
};

function formatBytes(bytes?: number) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value = value / 1024;
    index += 1;
  }
  return `${value.toFixed(2)} ${units[index]}`;
}

function formatValue(stat: NamedStat): string {
  if (stat.key === "content_size_last_30d") return formatBytes(stat.value);
  return stat.value.toLocaleString();
}

export default function RssMetricsSection({
  stats,
}: {
  stats?: NamedStat[] | null;
}) {
  if (!stats?.length) return null;
  return (
    <section className="mb-6">
      <h3 className="text-lg font-semibold mb-3">RSS Activity</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <admin.StatItem
            key={stat.key}
            icon={ICON_MAP[stat.key]}
            title={stat.label}
            value={formatValue(stat)}
            desc={stat.desc}
            error={stat.error}
          />
        ))}
      </div>
    </section>
  );
}
