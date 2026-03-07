"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function VerifyPage() {
  return (
    <AuthRouter>
      <auth.Verify />
    </AuthRouter>
  );
}
