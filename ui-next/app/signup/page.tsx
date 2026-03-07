"use client";

import { auth } from "@ericbutera/kaleido";
import AuthRouter from "../../components/AuthRouter";

export default function SignUpPage() {
  return (
    <AuthRouter>
      <auth.SignUp />
    </AuthRouter>
  );
}
