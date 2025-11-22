"use client";

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        <SignUp afterSignUpUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"/>
      </div>
    </div>
  );
}
