"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function LoginPage() {
  return (
    <AuthRouter>
      <auth.Login />
    </AuthRouter>
  );
}
