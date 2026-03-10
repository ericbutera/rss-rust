"use client";

import { admin } from "@ericbutera/kaleido";
import { Suspense } from "react";
import AuthRouter from "../../../components/AuthRouter";
import AdminMaintenancePanel from "../../../components/admin/AdminMaintenancePanel";

export default function AdminMaintenancePage() {
  return (
    <admin.Layout title="Maintenance">
      <Suspense>
        <AuthRouter>
          <AdminMaintenancePanel />
        </AuthRouter>
      </Suspense>
    </admin.Layout>
  );
}
