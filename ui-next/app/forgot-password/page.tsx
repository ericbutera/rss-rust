"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function ForgotPasswordPage() {
  return (
    <AuthRouter>
      <auth.ForgotPassword />
    </AuthRouter>
  );
}
