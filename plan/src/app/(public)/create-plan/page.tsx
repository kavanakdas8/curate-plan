"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CourseSelectionPage } from "@/components/landing/CourseSelectionPage";
import { OnboardingSelection, StudyPlan, SavedPlan } from "@/types/study";
import {
  STORAGE_KEY_PLANS,
  STORAGE_KEY_ACTIVE_ID,
  STORAGE_KEY_ONBOARDING,
  STORAGE_KEY_VIEW_MODE,
  normalizePlanToCurriculum,
} from "@/lib/curriculumAdapter";
import { playChime } from "@/lib/utils";

export default function CreatePlanRoute() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [initialSelection] = useState<OnboardingSelection | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ONBOARDING);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const handleStartLearning = async (selection: OnboardingSelection) => {
    setIsGenerating(true);
    setGenerationError(null);
    playChime("click");

    const dailyHours = Number((selection.dailyMinutes / 60).toFixed(1));
    const payload = {
      topic: selection.subject.trim(),
      timeframe: selection.durationLabel,
      daily_hours: dailyHours,
      experience_level: selection.level || "Beginner",
      goal: `Master ${selection.subject.trim()} (${selection.durationLabel}, ${selection.dailyLabel}/day)`,
    };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || "https://curateplan.onrender.com"}/api/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.detail ||
          `Server error (${res.status}): Failed to generate curricu Please try again.`
        );
      }

      const planData: StudyPlan = await res.json();
      const newSavedPlan: SavedPlan = {
        ...planData,
        id: `draft_${Date.now()}`,
        createdAt: Date.now(),
        daily_hours: payload.daily_hours,
        experience_level: payload.experience_level,
      };

      const normalized = normalizePlanToCurriculum(newSavedPlan);

      // Persist in localStorage and sessionStorage
      // Keep the generated curriculum as a draft locally and in session.
      // It will also sync to MongoDB when the user clicks Save.
      try {
        sessionStorage.setItem(
          "curateplan_pending_draft_v1",
          JSON.stringify(normalized)
        );

        const existingPlansRaw = localStorage.getItem(STORAGE_KEY_PLANS);
        const existingPlans: SavedPlan[] = existingPlansRaw ? JSON.parse(existingPlansRaw) : [];
        const cleanExisting = existingPlans.filter((p) => p.id !== normalized.id && !p.id.startsWith("plan_seed_"));
        localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify([normalized, ...cleanExisting]));
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, normalized.id);

        localStorage.setItem(
          STORAGE_KEY_ONBOARDING,
          JSON.stringify(selection)
        );

        localStorage.setItem(
          "study_planner_active_nav_tab_v1",
          "dashboard"
        );

        sessionStorage.setItem(STORAGE_KEY_VIEW_MODE, "dashboard");
      } catch (storageErr) {
        console.error("Draft storage error:", storageErr);
      }

      playChime("complete");
      router.push("/?view=dashboard");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while generating your plan.";
      console.error("[CuratePlan] Plan generation failed:", msg);
      setGenerationError(msg);
      playChime("click");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <CourseSelectionPage
      onStartLearning={handleStartLearning}
      onBackToLanding={() => router.push("/")}
      initialSelection={initialSelection}
      isGenerating={isGenerating}
      generationError={generationError}
    />
  );
}
