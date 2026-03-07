"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function ResetPage() {
  return (
    <AuthRouter>
      <auth.Reset />
    </AuthRouter>
  );
}
