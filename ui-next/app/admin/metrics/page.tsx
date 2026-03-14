"use client";

import RssMetricsSection from "@/components/admin/RssMetricsSection";
import { useAdminAggregates } from "@/lib/queries";
import { admin } from "@ericbutera/kaleido";
import { Suspense } from "react";
import AuthRouter from "../../../components/AuthRouter";

export default function AdminMetricsPage() {
  return (
    <Suspense>
      <AuthRouter>
        <admin.Layout title="Metrics">
          <MetricsContent />
        </admin.Layout>
      </AuthRouter>
    </Suspense>
  );
}

function MetricsContent() {
  const { data, isLoading } = useAdminAggregates();

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <>
      <admin.AuthMetricsSection data={data} />
      <RssMetricsSection data={data} />
    </>
  );
}
