"use client";

import { admin } from "@ericbutera/kaleido";
import { Suspense } from "react";
import AuthRouter from "../../../components/AuthRouter";
import AdminFeedsPanel from "../../../components/admin/AdminFeedsPanel";
export default function AdminFeedsPage() {
  return (
    <admin.Layout title="Feeds">
      <Suspense>
        <AuthRouter>
          <AdminFeedsPanel />
        </AuthRouter>
      </Suspense>
    </admin.Layout>
  );
}
