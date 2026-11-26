
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { SignupPage } from "@/components/auth/SignupPage";

export default function SignupRoute() {
  const router = useRouter();

  const handleAuthSuccess = () => {
    router.replace("/?view=dashboard");
  };

  return (
    <SignupPage
      onNavigateLogin={() => router.push("/login")}
      onAuthSuccess={handleAuthSuccess}
    />
  );
}
