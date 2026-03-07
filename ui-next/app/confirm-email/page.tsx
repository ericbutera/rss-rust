"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function ConfirmEmailPage() {
  return (
    <AuthRouter>
      <auth.ConfirmEmail />
    </AuthRouter>
  );
}
