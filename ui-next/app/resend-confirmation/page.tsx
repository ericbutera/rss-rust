"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function ResendConfirmationPage() {
  return (
    <AuthRouter>
      <auth.ResendConfirmation />
    </AuthRouter>
  );
}
