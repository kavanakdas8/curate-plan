
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { LoginPage } from "@/components/auth/LoginPage";

export default function LoginRoute() {
  const router = useRouter();

  const handleAuthSuccess = () => {
    router.replace("/?view=dashboard");
  };

  return (
    <LoginPage
      onNavigateSignup={() => router.push("/signup")}
      onAuthSuccess={handleAuthSuccess}
    />
  );
}
