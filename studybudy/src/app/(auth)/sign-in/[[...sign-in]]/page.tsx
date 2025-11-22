"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-md">
        <SignIn afterSignInUrl="/dashboard"
        fallbackRedirectUrl="/dashboard"/>
      </div>
    </div>
  );
}
