"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../../components/AuthRouter";

export default function AuthCallbackPage() {
  return (
    <AuthRouter>
      <auth.OAuthCallback />
    </AuthRouter>
  );
}
