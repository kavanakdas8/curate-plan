"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { StudyPlan, SavedPlan, ActiveTimer, Task, StudySession, UserSettings, AppViewMode, OnboardingSelection } from "@/types/study";
import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/TopBar";
import { HeaderKPI } from "@/components/HeaderKPI";
import { FocusTimer } from "@/components/FocusTimer";
import { PlanHistorySidebar } from "@/components/PlanHistorySidebar";
import { EmptyStateHero } from "@/components/EmptyStateHero";
import { CurriculumRoadmapView } from "@/components/CurriculumRoadmapView";
import { AnalyticsView } from "@/components/AnalyticsView";
import { AboutModal } from "@/components/AboutModal";
import { LandingPage } from "@/components/landing/LandingPage";
import { CourseSelectionPage } from "@/components/landing/CourseSelectionPage";
import { LoginPage } from "@/components/auth/LoginPage";
import { SignupPage } from "@/components/auth/SignupPage";
import { exportPlanToMarkdown, downloadFile, generateICS, playChime } from "@/lib/utils";
import { TutorPanel } from "@/components/TutorPanel";
import { exportCurriculumToPDF } from "@/lib/pdfGenerator";
import {
  fetchCurricula,
  createCurriculum,
  updateCurriculum,
  deleteCurriculum,
} from "@/lib/curriculumApi";
import {
  STORAGE_KEY_PLANS,
  STORAGE_KEY_ACTIVE_ID,
  STORAGE_KEY_PROGRESS,
  STORAGE_KEY_SIDEBAR_COLLAPSED,
  STORAGE_KEY_ACTIVE_TIMER,
  STORAGE_KEY_SESSIONS,
  STORAGE_KEY_SETTINGS,
  STORAGE_KEY_VIEW_MODE,
  STORAGE_KEY_ONBOARDING,
  DEFAULT_USER_SETTINGS,
  normalizePlanToCurriculum,
} from "@/lib/curriculumAdapter";
import {
  Clock,
  Play,
  Check,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const handleAuthSuccess = () => {
    console.log("AUTH SUCCESS CALLBACK TRIGGERED");

    setActiveNavTab("dashboard");
    setViewMode("dashboard");

    try {
      sessionStorage.setItem(STORAGE_KEY_VIEW_MODE, "dashboard");
    } catch { }

    router.replace("/?view=dashboard");
  };
  // App Shell Navigation State: default to collapsed (only logos shown on open)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activeNavTab, setActiveNavTab] = useState("dashboard");

  // Core Data State
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [completedTasksMap, setCompletedTasksMap] = useState<Record<string, boolean>>({});
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);

  // UI View & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<number | null>(null);

  // Drawers & Modals
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  // Focus Timer State
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null);
  const [isTutorOpen, setIsTutorOpen] = useState(false);

  // Landing & Onboarding Flow State
  const [viewMode, setViewMode] = useState<AppViewMode>("landing");
  const [returnViewMode, setReturnViewMode] = useState<"landing" | "dashboard">("landing");
  const [createPlanInitialSelection, setCreatePlanInitialSelection] = useState<OnboardingSelection | null>(null);
  const [onboardingSelection, setOnboardingSelection] = useState<OnboardingSelection | null>(null);
  const [isOnboardingGenerating, setIsOnboardingGenerating] = useState(false);
  const [onboardingGenerationError, setOnboardingGenerationError] = useState<string | null>(null);

  // Export PDF State
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Load saved curricula from MongoDB & local storage, and restore temporary drafts from this session.
  // Other lightweight UI preferences and progress remain in browser storage.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        if (typeof document !== "undefined") {
          document.documentElement.classList.remove("dark");
          document.documentElement.classList.add("light");
        }

        const storedActiveId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
        const storedProgress = localStorage.getItem(STORAGE_KEY_PROGRESS);
        const storedTimer = localStorage.getItem(STORAGE_KEY_ACTIVE_TIMER);
        const storedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
        const storedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
        const storedOnboarding = localStorage.getItem(STORAGE_KEY_ONBOARDING);
        const sessionViewMode = sessionStorage.getItem(STORAGE_KEY_VIEW_MODE) as AppViewMode | null;
        const pendingDraftRaw = sessionStorage.getItem("curateplan_pending_draft_v1");

        let pendingDraft: SavedPlan | null = null;
        if (pendingDraftRaw) {
          try {
            const parsedDraft = JSON.parse(pendingDraftRaw) as SavedPlan;
            if (parsedDraft && !parsedDraft.id.startsWith("plan_seed_")) {
              pendingDraft = normalizePlanToCurriculum(parsedDraft);
            }
          } catch (error) {
            console.warn("Could not restore the pending curriculum draft:", error);
            sessionStorage.removeItem("curateplan_pending_draft_v1");
          }
        }

        let localPlans: SavedPlan[] = [];
        const storedPlans = localStorage.getItem(STORAGE_KEY_PLANS);
        if (storedPlans) {
          try {
            const parsed = JSON.parse(storedPlans) as SavedPlan[];
            if (Array.isArray(parsed)) {
              localPlans = parsed
                .filter((p) => p && !p.id.startsWith("plan_seed_"))
                .map((p) => normalizePlanToCurriculum(p));
            }
          } catch (e) {
            console.warn("Could not parse local plans:", e);
          }
        }

        let remotePlans: SavedPlan[] = [];
        try {
          const fetched = await fetchCurricula();
          remotePlans = (fetched || [])
            .filter((p) => p && !p.id.startsWith("plan_seed_"))
            .map((p) => normalizePlanToCurriculum(p));
        } catch (fetchErr) {
          console.warn("[CuratePlan] Backend fetchCurricula failed, using local plans:", fetchErr);
        }

        if (cancelled) return;

        // Merge: local plans + remote plans (preserve user-added revisions and milestones)
        const planMap = new Map<string, SavedPlan>();
        localPlans.forEach((p) => planMap.set(p.id, p));
        remotePlans.forEach((remoteP) => {
          const localP = planMap.get(remoteP.id);
          if (localP) {
            const mergedMilestones =
              remoteP.milestones && remoteP.milestones.length > 0
                ? remoteP.milestones
                : localP.milestones || [];
            const mergedRevisions =
              remoteP.revisions && remoteP.revisions.length > 0
                ? remoteP.revisions
                : localP.revisions || [];
            planMap.set(remoteP.id, {
              ...remoteP,
              milestones: mergedMilestones,
              revisions: mergedRevisions,
            });
          } else {
            planMap.set(remoteP.id, remoteP);
          }
        });
        if (pendingDraft) {
          planMap.set(pendingDraft.id, pendingDraft);
        }

        let plans = Array.from(planMap.values());
        if (pendingDraft) {
          plans = [pendingDraft, ...plans.filter((p) => p.id !== pendingDraft!.id)];
        }

        let progress: Record<string, boolean> = {};
        if (storedProgress) {
          try {
            const parsedProgress = JSON.parse(storedProgress) as Record<string, boolean>;
            Object.entries(parsedProgress).forEach(([key, isDone]) => {
              if (isDone && !key.startsWith("plan_seed_")) {
                const parts = key.split("_");
                if (parts.length >= 3) {
                  const planId = parts.slice(0, parts.length - 2).join("_");
                  if (plans.some((p) => p.id === planId)) {
                    progress[key] = true;
                  }
                }
              }
            });
          } catch {
            progress = {};
          }
        }

        setSavedPlans(plans);
        setCompletedTasksMap(progress);

        if (storedActiveId && plans.some((plan) => plan.id === storedActiveId)) {
          setActivePlanId(storedActiveId);
        } else if (pendingDraft) {
          setActivePlanId(pendingDraft.id);
        } else if (plans.length > 0) {
          setActivePlanId(plans[0].id);
        } else {
          setActivePlanId(null);
        }

        if (storedSessions) {
          try {
            const parsed = JSON.parse(storedSessions) as StudySession[];
            if (Array.isArray(parsed)) {
              setSessions(
                parsed.filter(
                  (s) => s && !s.planId?.startsWith("plan_seed_") && plans.some((p) => p.id === s.planId)
                )
              );
            } else {
              setSessions([]);
            }
          } catch {
            setSessions([]);
          }
        } else {
          setSessions([]);
        }

        if (storedSettings) setUserSettings(JSON.parse(storedSettings));

        const storedNavTab = localStorage.getItem("study_planner_active_nav_tab_v1");
        if (storedNavTab && ["dashboard", "curriculum", "analytics"].includes(storedNavTab)) {
          setActiveNavTab(storedNavTab);
        }

        if (storedOnboarding) {
          try { setOnboardingSelection(JSON.parse(storedOnboarding)); } catch { /* ignore invalid preference */ }
        }

        const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const urlView = urlParams?.get("view") as AppViewMode | null;
        if (urlView && ["landing", "login", "signup", "dashboard"].includes(urlView)) {
          setViewMode(urlView);
          sessionStorage.setItem(STORAGE_KEY_VIEW_MODE, urlView);
        } else if (sessionViewMode && ["landing", "login", "signup", "dashboard"].includes(sessionViewMode)) {
          setViewMode(sessionViewMode);
        } else {
          setViewMode("landing");
        }

        setSidebarCollapsed(true);

        if (storedTimer) {
          const parsedTimer = JSON.parse(storedTimer) as ActiveTimer;
          setActiveTimer({ ...parsedTimer, isRunning: false });
        }
      } catch (error) {
        console.error("[CuratePlan] Failed to initialize curricula:", error);
        if (!cancelled) {
          setSavedPlans([]);
          setActivePlanId(null);
          setSessions([]);
          setViewMode("landing");
        }
      } finally {
        if (!cancelled) {
          setMounted(true);
        }
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, []);

  // Sync saved plans to localStorage so guest / offline plans persist
  useEffect(() => {
    if (!mounted) return;
    try {
      const cleanPlans = savedPlans.filter((p) => !p.id.startsWith("plan_seed_"));
      localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(cleanPlans));
    } catch { }
  }, [savedPlans, mounted]);

  // Persist only the selected curriculum ID locally; curriculum documents live in MongoDB.
  useEffect(() => {
    if (!mounted) return;
    try {
      if (activePlanId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activePlanId);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
      }
    } catch { }
  }, [activePlanId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const validPlanIds = new Set(savedPlans.map((p) => p.id));
      const cleanProgress: Record<string, boolean> = {};
      Object.entries(completedTasksMap).forEach(([key, val]) => {
        if (!key.startsWith("plan_seed_")) {
          const parts = key.split("_");
          if (parts.length >= 3) {
            const planId = parts.slice(0, parts.length - 2).join("_");
            if (validPlanIds.has(planId)) {
              cleanProgress[key] = val;
            }
          }
        }
      });
      localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(cleanProgress));
    } catch { }
  }, [completedTasksMap, savedPlans, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch { }
  }, [sessions, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(userSettings));
    } catch { }
  }, [userSettings, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, String(sidebarCollapsed));
    } catch { }
  }, [sidebarCollapsed, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      if (activeTimer) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_TIMER, JSON.stringify(activeTimer));
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_TIMER);
      }
    } catch { }
  }, [activeTimer, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      sessionStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode);
    } catch { }
  }, [viewMode, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem("study_planner_active_nav_tab_v1", activeNavTab);
    } catch { }
  }, [activeNavTab, mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      if (onboardingSelection) {
        localStorage.setItem(STORAGE_KEY_ONBOARDING, JSON.stringify(onboardingSelection));
      } else {
        localStorage.removeItem(STORAGE_KEY_ONBOARDING);
      }
    } catch { }
  }, [onboardingSelection, mounted]);

  // Open Create Plan UI (matching "Build My Learning Plan")
  const handleOpenCreatePlan = React.useCallback(
    (initial?: OnboardingSelection | null) => {
      setOnboardingGenerationError(null);
      if (initial) {
        try {
          localStorage.setItem(STORAGE_KEY_ONBOARDING, JSON.stringify(initial));
        } catch { }
      } else {
        try {
          localStorage.removeItem(STORAGE_KEY_ONBOARDING);
        } catch { }
      }
      setCreatePlanInitialSelection(initial || null);
      setReturnViewMode(savedPlans.length > 0 ? "dashboard" : "landing");
      router.push("/create-plan");
    },
    [savedPlans.length, router]
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K -> Create Plan
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenCreatePlan();
        return;
      }

      // [ or Cmd/Ctrl + B -> Toggle sidebar collapse
      if (
        (e.key === "[" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b")
      ) {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
        return;
      }

      // / -> Focus search
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOpenCreatePlan]);

  // Handle browser back/forward or direct URL view updates
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlView = urlParams.get("view") as AppViewMode | null;
      if (urlView && ["landing", "login", "signup", "dashboard"].includes(urlView)) {
        setViewMode(urlView);
        try {
          sessionStorage.setItem(STORAGE_KEY_VIEW_MODE, urlView);
        } catch { }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Active Plan Resolution
  const activePlan = useMemo(() => {
    const found = savedPlans.find((p) => p.id === activePlanId);
    if (!found) return null;
    return normalizePlanToCurriculum(found, completedTasksMap);
  }, [savedPlans, activePlanId, completedTasksMap]);

  // Debugging Log: Curriculum loaded by dashboard
  useEffect(() => {
    if (viewMode === "dashboard" && activePlan) {
      console.log("[CuratePlan] Curriculum loaded by dashboard:", {
        id: activePlan.id,
        subject: activePlan.subject,
        modulesCount: activePlan.modules?.length || 0,
        tasksCount: activePlan.schedule?.reduce((acc, p) => acc + p.tasks.length, 0) || 0,
      });
    }
  }, [viewMode, activePlan]);

  // Aggregate KPI stats for current plan
  const { totalCount, completedCount, totalMinutes } = useMemo(() => {
    if (!activePlan) return { totalCount: 0, completedCount: 0, totalMinutes: 0 };

    let total = 0;
    let completed = 0;
    let minutes = 0;

    activePlan.schedule.forEach((period, pIdx) => {
      period.tasks.forEach((task, tIdx) => {
        total++;
        minutes += task.duration_minutes || 0;
        const key = `${activePlan.id}_${pIdx}_${tIdx}`;
        if (completedTasksMap[key]) {
          completed++;
        }
      });
    });

    return { totalCount: total, completedCount: completed, totalMinutes: minutes };
  }, [activePlan, completedTasksMap]);

  const totalAllCompletedTasks = useMemo(() => {
    let count = 0;
    savedPlans.forEach((plan) => {
      plan.schedule?.forEach((period, pIdx) => {
        period.tasks?.forEach((_, tIdx) => {
          if (completedTasksMap[`${plan.id}_${pIdx}_${tIdx}`]) {
            count++;
          }
        });
      });
    });
    return count;
  }, [savedPlans, completedTasksMap]);

  const totalStudyMinutes = useMemo(() => {
    const validPlanIds = new Set(savedPlans.map((p) => p.id));
    return sessions
      .filter((s) => validPlanIds.has(s.planId))
      .reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
  }, [sessions, savedPlans]);

  // Next pending tasks for today's schedule and upcoming section
  const pendingTasksList = useMemo(() => {
    if (!activePlan) return [];
    const list: Array<{ task: Task; taskId: string; periodLabel: string; periodIdx: number; taskIdx: number }> = [];
    activePlan.schedule.forEach((period, pIdx) => {
      period.tasks.forEach((task, tIdx) => {
        const taskId = `${activePlan.id}_${pIdx}_${tIdx}`;
        if (!completedTasksMap[taskId]) {
          list.push({ task, taskId, periodLabel: period.period_label, periodIdx: pIdx, taskIdx: tIdx });
        }
      });
    });
    return list;
  }, [activePlan, completedTasksMap]);

  // Today's priority task
  const todayPriorityTask = pendingTasksList[0] || null;
  const upcomingTasksSlice = pendingTasksList.slice(1, 5);

  // Generate curriculum with AI & transition into the CuratePlan dashboard
  const handleOnboardingStartLearning = async (selection: OnboardingSelection) => {
    setIsOnboardingGenerating(true);
    setOnboardingGenerationError(null);

    // Debugging Log: Selected subject and preferences
    console.log("[CuratePlan] Selected subject and preferences:", {
      subject: selection.subject,
      dailyMinutes: selection.dailyMinutes,
      dailyLabel: selection.dailyLabel,
      durationDays: selection.durationDays,
      durationLabel: selection.durationLabel,
      level: selection.level,
      totalEstimatedHours: selection.totalEstimatedHours,
    });

    const dailyHours = Number((selection.dailyMinutes / 60).toFixed(1));
    const payload = {
      topic: selection.subject.trim(),
      timeframe: selection.durationLabel,
      daily_hours: dailyHours,
      experience_level: selection.level || "Beginner",
      goal: `Master ${selection.subject.trim()} (${selection.durationLabel}, ${selection.dailyLabel}/day)`,
    };

    // Debugging Log: API request payload
    console.log("[CuratePlan] API request payload:", payload);

    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(
          errJson?.detail || `Server error (${res.status}): "Failed to generate curriculum. Please check your connection and try again."`
        );
      }

      const planData: StudyPlan = await res.json();

      // Debugging Log: API response subject
      console.log("[CuratePlan] API response subject:", planData.subject);

      const newSavedPlan: SavedPlan = {
        ...planData,
        id: `draft_${Date.now()}`,
        createdAt: Date.now(),
        daily_hours: payload.daily_hours,
        experience_level: payload.experience_level,
      };

      const normalized = normalizePlanToCurriculum(newSavedPlan);

      // Generated plans remain temporary until the user explicitly clicks Save.
      setSavedPlans((prev) => [normalized, ...prev.filter((p) => p.id !== normalized.id)]);
      setActivePlanId(normalized.id);
      setSaveStatus("idle");
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_ID, normalized.id);
        localStorage.setItem(STORAGE_KEY_ONBOARDING, JSON.stringify(selection));
      } catch { /* storage is optional */ }

      // Reset selection view and navigate into dashboard
      setSelectedPeriodIndex(null);
      setOnboardingSelection(selection);
      setActiveNavTab("dashboard");
      setViewMode("dashboard");
      playChime("complete");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred while generating your plan.";
      console.error("[CuratePlan] Plan generation failed:", msg);
      setOnboardingGenerationError(msg);
      playChime("click");
    } finally {
      setIsOnboardingGenerating(false);
    }
  };

  // Toggle single task completion
  const handleToggleTask = (taskId: string) => {
    const nextIsDone = !completedTasksMap[taskId];
    setCompletedTasksMap((prev) => ({
      ...prev,
      [taskId]: nextIsDone,
    }));

    if (nextIsDone && activePlan) {
      const newSession: StudySession = {
        id: `session_${Date.now()}`,
        planId: activePlan.id,
        taskId,
        taskTitle: "Curriculum task completed",
        subject: activePlan.subject,
        periodLabel: activePlan.schedule[0]?.period_label || "Active Milestone",
        startedAt: Date.now() - 35 * 60000,
        completedAt: Date.now(),
        durationMinutes: 35,
        mode: "manual",
        completed: true,
      };
      setSessions((prev) => [newSession, ...prev]);
      playChime("complete");
    } else {
      playChime("click");
    }
  };

  // Start Focus Session
  const handleStartFocus = (task: Task, taskId: string, periodLabel: string) => {
    playChime("click");
    const minutes = userSettings.timer.pomodoroDurationMinutes || task.duration_minutes || 25;
    const seconds = minutes * 60;
    setActiveTimer({
      taskId,
      taskTitle: task.title,
      periodLabel,
      totalSeconds: seconds,
      remainingSeconds: seconds,
      isRunning: true,
      lastTickAt: Date.now(),
    });
  };

  // Update the in-memory plan and automatically persist changes locally and to backend
  const handleUpdatePlan = (updatedPlan: SavedPlan) => {
    setSavedPlans((prev) => {
      const next = prev.map((p) => (p.id === updatedPlan.id ? updatedPlan : p));
      try {
        const cleanPlans = next.filter((p) => !p.id.startsWith("plan_seed_"));
        localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(cleanPlans));
      } catch { }
      return next;
    });

    // Auto-sync plan updates (revisions, milestones, schedule) to MongoDB backend
    if (updatedPlan.id && !updatedPlan.id.startsWith("draft_") && !updatedPlan.id.startsWith("plan_seed_")) {
      updateCurriculum(updatedPlan.id, updatedPlan).catch((err) => {
        console.warn("[CuratePlan] Auto-syncing plan to backend failed:", err);
      });
    }

    setSaveStatus("idle");
  };

  // Manually create or update the active curriculum in MongoDB.
  const handleSavePlan = async () => {
    if (!activePlan) return;

    setSaveStatus("saving");
    try {
      const isDraft = activePlan.id.startsWith("draft_");
      const savedPlan = isDraft
        ? await createCurriculum(activePlan)
        : await updateCurriculum(activePlan.id, activePlan);

      const normalizedSavedPlan = normalizePlanToCurriculum(savedPlan, completedTasksMap);

      if (isDraft) {
        const oldId = activePlan.id;
        const newId = normalizedSavedPlan.id;

        // Task completion keys and study-session references include the plan ID.
        setCompletedTasksMap((prev) => {
          const next = { ...prev };
          Object.entries(prev).forEach(([key, value]) => {
            if (key.startsWith(`${oldId}_`)) {
              next[`${newId}_${key.slice(oldId.length + 1)}`] = value;
              delete next[key];
            }
          });
          return next;
        });

        setSessions((prev) => prev.map((session) =>
          session.planId === oldId
            ? { ...session, planId: newId, taskId: session.taskId.startsWith(`${oldId}_`) ? `${newId}_${session.taskId.slice(oldId.length + 1)}` : session.taskId }
            : session
        ));

        setActiveTimer((prev) => prev && prev.taskId.startsWith(`${oldId}_`)
          ? { ...prev, taskId: `${newId}_${prev.taskId.slice(oldId.length + 1)}` }
          : prev
        );

        try { sessionStorage.removeItem("curateplan_pending_draft_v1"); } catch { /* ignore */ }
      }

      setSavedPlans((prev) => [
        normalizedSavedPlan,
        ...prev.filter((plan) => plan.id !== activePlan.id && plan.id !== normalizedSavedPlan.id),
      ]);
      setActivePlanId(normalizedSavedPlan.id);
      try { localStorage.setItem(STORAGE_KEY_ACTIVE_ID, normalizedSavedPlan.id); } catch { /* ignore */ }
      setSaveStatus("saved");
      playChime("complete");
    } catch (error) {
      console.error("[CuratePlan] Failed to save curriculum:", error);
      setSaveStatus("error");
    }
  };

  // Export Plan to Professional PDF Document
  const handleExportPDF = async () => {
    if (!activePlan) return;
    setIsExportingPDF(true);
    setExportFeedback(null);
    playChime("click");
    try {
      // Small pause to allow the React loading spinner to render
      await new Promise((resolve) => setTimeout(resolve, 80));
      exportCurriculumToPDF(activePlan, completedTasksMap);
      playChime("complete");
      const cleanName = (activePlan.subject || "curriculum")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
      setExportFeedback({
        type: "success",
        message: `Curriculum report exported successfully as [${cleanName || "curriculum"}_study_plan.pdf]!`,
      });
      setTimeout(() => setExportFeedback(null), 5000);
    } catch (err) {
      console.error("PDF export error:", err);
      setExportFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to generate curriculum PDF. Please try again.",
      });
      setTimeout(() => setExportFeedback(null), 6000);
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Export Plan to Markdown
  const handleExportMarkdown = () => {
    if (!activePlan) return;
    playChime("click");
    const md = exportPlanToMarkdown(activePlan, activePlan.daily_hours, completedTasksMap);
    const safeName = activePlan.subject.toLowerCase().replace(/[^a-z0-9]/g, "-");
    downloadFile(`${safeName}-study-plan.md`, md, "text/markdown;charset=utf-8");
  };

  // Export Plan to ICS Calendar
  const handleExportICS = () => {
    if (!activePlan) return;
    const ics = generateICS(activePlan);
    const safeName = activePlan.subject.toLowerCase().replace(/[^a-z0-9]/g, "-");
    downloadFile(`${safeName}-curriculum.ics`, ics, "text/calendar;charset=utf-8");
  };

  // Reset Completed checkmarks for active plan
  const handleClearCompleted = () => {
    if (!activePlan) return;
    if (confirm("Reset all completed task checkmarks for this curriculum?")) {
      playChime("click");
      setCompletedTasksMap((prev) => {
        const next = { ...prev };
        activePlan.schedule.forEach((_, pIdx) => {
          activePlan.schedule[pIdx].tasks.forEach((_, tIdx) => {
            delete next[`${activePlan.id}_${pIdx}_${tIdx}`];
          });
        });
        return next;
      });
    }
  };

  // Delete a saved MongoDB curriculum, or discard a local draft.
  const handleDeletePlan = async (planId: string) => {
    playChime("click");
    const planToDelete = savedPlans.find((plan) => plan.id === planId);
    if (!planToDelete) return;

    try {
      if (!planId.startsWith("draft_")) {
        await deleteCurriculum(planId);
      }

      const remaining = savedPlans.filter((plan) => plan.id !== planId);
      setSavedPlans(remaining);
      if (activePlanId === planId) {
        setActivePlanId(remaining.length > 0 ? remaining[0].id : null);
      }
      setSaveStatus("idle");
    } catch (error) {
      console.error("[CuratePlan] Failed to delete curriculum:", error);
      setSaveStatus("error");
    }
  };

  // Rename plan
  const handleRenamePlan = (planId: string, newSubject: string) => {
    if (!newSubject.trim()) return;
    setSavedPlans((prev) =>
      prev.map((p) =>
        p.id === planId ? { ...p, subject: newSubject.trim(), lastModifiedAt: Date.now() } : p
      )
    );
    setSaveStatus("idle");
  };

  // Toggle archive status of a curriculum
  const handleToggleArchivePlan = (planId: string) => {
    setSavedPlans((prev) =>
      prev.map((p) =>
        p.id === planId ? { ...p, isArchived: !p.isArchived, lastModifiedAt: Date.now() } : p
      )
    );
    setSaveStatus("idle");
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center text-slate-400 font-mono text-xs">
      </div>
    );
  }

  // 1. Premium EdTech Landing Page
  if (viewMode === "landing") {
    return (
      <LandingPage
        onBuildPlan={() => router.push("/create-plan")}
        onNavigateLogin={() => router.push("/login")}
        onNavigateSignup={() => router.push("/signup")}
        onOpenDashboard={() => setViewMode("dashboard")}
        hasExistingWorkspace={savedPlans.length > 0}
      />
    );
  }

  // 2. Dedicated Course Selection Page ("What do you want to study today?")
  if (viewMode === "course-selection") {
    return (
      <CourseSelectionPage
        onStartLearning={handleOnboardingStartLearning}
        onBackToLanding={() => {
          setOnboardingGenerationError(null);
          if (typeof window !== "undefined") {
            const stateIdx = window.history.state?.idx;
            const hasInternalHistory =
              typeof stateIdx === "number" ? stateIdx > 0 : window.history.length > 1;
            if (hasInternalHistory) {
              router.back();
              return;
            }
          }
          if (returnViewMode === "dashboard" || savedPlans.length > 0) {
            setViewMode("dashboard");
          } else {
            setViewMode("landing");
          }
        }}
        initialSelection={createPlanInitialSelection}
        isGenerating={isOnboardingGenerating}
        generationError={onboardingGenerationError}
      />
    );
  }

  if (viewMode === "login") {
    return (
      <LoginPage
        onBackToLanding={() => {
          if (typeof window !== "undefined") {
            const stateIdx = window.history.state?.idx;
            const hasInternalHistory =
              typeof stateIdx === "number" ? stateIdx > 0 : window.history.length > 1;
            if (hasInternalHistory) {
              router.back();
              return;
            }
          }
          setViewMode("landing");
        }}
        onNavigateSignup={() => router.push("/signup")}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  if (viewMode === "signup") {
    return (
      <SignupPage
        onBackToLanding={() => {
          if (typeof window !== "undefined") {
            const stateIdx = window.history.state?.idx;
            const hasInternalHistory =
              typeof stateIdx === "number" ? stateIdx > 0 : window.history.length > 1;
            if (hasInternalHistory) {
              router.back();
              return;
            }
          }
          setViewMode("landing");
        }}
        onNavigateLogin={() => router.push("/login")}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] flex selection:bg-emerald-100 selection:text-emerald-900">
      {/* Subtle Ambient Radial Glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% -10%, rgba(5,150,105,0.06), transparent 70%)",
        }}
      />

      {/* Primary Fixed Left Rail Sidebar */}
      <AppSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        savedPlans={savedPlans}
        activePlanId={activePlanId}
        onSelectPlan={(p) => {
          setActivePlanId(p.id);
          setSelectedPeriodIndex(null);
        }}
        onDeletePlan={handleDeletePlan}
        onOpenCreateModal={() => handleOpenCreatePlan()}
        onOpenHistoryModal={() => setIsHistoryDrawerOpen(true)}
        onOpenAbout={() => setIsAboutModalOpen(true)}
        onReturnHome={() => {
          setViewMode("landing");
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", "/");
          }
        }}
        activeTimer={activeTimer}
        completedTasksMap={completedTasksMap}
        activeNavTab={activeNavTab}
        onSelectNavTab={setActiveNavTab}
      />

      {/* Main Content Workspace Shell */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen relative z-10 overflow-x-hidden">
        {/* Global Top Navbar */}
        <TopBar
          activePlan={activePlan}
          allPlans={savedPlans}
          onSelectPlan={(planId) => {
            setActivePlanId(planId);
            setActiveNavTab("curriculum");
          }}
          onSave={handleSavePlan}
          saveStatus={saveStatus}
          onToggleTutor={() => setIsTutorOpen((prev) => !prev)}
          isTutorOpen={isTutorOpen}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onOpenCreateModal={() => handleOpenCreatePlan()}
          onOpenHistoryModal={() => setIsHistoryDrawerOpen(true)}
          onExportPDF={handleExportPDF}
          onExportMarkdown={handleExportMarkdown}
          onExportICS={handleExportICS}
          onClearCompleted={handleClearCompleted}
          onFocusSearch={() => searchInputRef.current?.focus()}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (q.trim() && activeNavTab !== "curriculum") {
              setActiveNavTab("curriculum");
            }
          }}
          onSelectTopic={(topicName, planId) => {
            if (planId && planId !== activePlanId) {
              setActivePlanId(planId);
            }
            setSearchQuery(topicName);
            setActiveNavTab("curriculum");
          }}
          onOpenAbout={() => setIsAboutModalOpen(true)}
        />

        {/* Dynamic Section Translation */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          {/* SECTION 1: CURRICULUM ROADMAP */}
          {activeNavTab === "curriculum" && activePlan ? (
            <CurriculumRoadmapView
              plan={activePlan}
              completedTasksMap={completedTasksMap}
              onToggleTask={handleToggleTask}
              onStartFocus={handleStartFocus}
              activeTimerTaskId={activeTimer ? activeTimer.taskId : null}
              onUpdatePlan={handleUpdatePlan}
              userSettings={userSettings}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          ) : activeNavTab === "analytics" ? (
            /* SECTION 2: ANALYTICS & PROGRESS */
            <AnalyticsView
              sessions={sessions}
              plan={activePlan}
              completedTasksMap={completedTasksMap}
              userSettings={userSettings}
              onStartFocus={() => {
                if (activePlan?.schedule[0]?.tasks[0]) {
                  handleStartFocus(
                    activePlan.schedule[0].tasks[0],
                    `${activePlan.id}_0_0`,
                    activePlan.schedule[0].period_label
                  );
                }
              }}
            />
          ) : (
            /* DEFAULT: DASHBOARD VIEW */
            <div className="space-y-6">
              {savedPlans.length === 0 ? (
                /* SECTION 1: Empty State */
                <EmptyStateHero
                  onOpenModal={() => handleOpenCreatePlan()}
                  onOpenAbout={() => setIsAboutModalOpen(true)}
                />
              ) : (
                /* SECTION 2: When Courses Exist */
                <>
                  {/* Quick Stats Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <div className="text-xs text-slate-500 font-medium">Active Plans</div>
                      <div className="text-lg font-bold text-slate-900 mt-1">{savedPlans.filter((p) => !p.isArchived).length}</div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <div className="text-xs text-slate-500 font-medium">Tasks Completed</div>
                      <div className="text-lg font-bold text-slate-900 mt-1">{totalAllCompletedTasks}</div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
                      <div className="text-xs text-slate-500 font-medium">Total Study Time</div>
                      <div className="text-lg font-bold text-slate-900 mt-1">
                        {totalStudyMinutes >= 60 ? `${(totalStudyMinutes / 60).toFixed(1)} hrs` : `${totalStudyMinutes} mins`}
                      </div>
                    </div>
                  </div>

                  {/* Your Learning Plans Grid */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 tracking-tight">Your Learning Plans</h2>
                        <p className="text-xs text-slate-500">Pick up where you left off or switch between your curricula.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenCreatePlan()}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>New Plan</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedPlans.map((plan) => {
                        const isActive = plan.id === activePlanId;
                        let planTotalTasks = 0;
                        let planCompletedTasks = 0;
                        plan.schedule?.forEach((period, pIdx) => {
                          period.tasks?.forEach((_, tIdx) => {
                            planTotalTasks++;
                            if (completedTasksMap[`${plan.id}_${pIdx}_${tIdx}`]) {
                              planCompletedTasks++;
                            }
                          });
                        });
                        const pct = planTotalTasks > 0 ? Math.round((planCompletedTasks / planTotalTasks) * 100) : 0;
                        const moduleCount = plan.modules?.length || plan.schedule?.length || 0;
                        const dateStr = plan.createdAt ? new Date(plan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently";

                        return (
                          <div
                            key={plan.id}
                            className={`bg-white border rounded-xl p-5 shadow-2xs flex flex-col justify-between transition relative ${isActive ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-200 hover:border-slate-300"
                              }`}
                          >
                            <div className="space-y-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400">
                                  {plan.target_timeframe || "Self-Paced"} • {moduleCount} {moduleCount === 1 ? "Module" : "Modules"}
                                </span>
                              </div>
                              <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
                                {plan.subject}
                              </h3>
                              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                                {plan.overview || `Structured curriculum for mastering ${plan.subject}.`}
                              </p>
                            </div>

                            <div className="pt-4 mt-3 border-t border-slate-100 space-y-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                  <span>{planCompletedTasks} of {planTotalTasks} tasks done</span>
                                  <span className="font-semibold text-slate-700">{pct}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <span className="text-[10px] text-slate-400">Created {dateStr}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePlanId(plan.id);
                                    setSelectedPeriodIndex(null);
                                    setActiveNavTab("curriculum");
                                  }}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                                >
                                  <span>Continue Learning</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Plan Workspace (Today's Focus & KPI) */}
                  {activePlan && (
                    <div className="space-y-6 pt-4 border-t border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-bold text-slate-900 tracking-tight">Active Curriculum Workspace</h2>
                          <p className="text-xs text-slate-500">
                            Focused workspace for <span className="font-semibold text-slate-700">{activePlan.subject}</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveNavTab("curriculum")}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                        >
                          <span>View Full Roadmap</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Onboarding Context Banner (if user transitioned from onboarding) */}
                      {onboardingSelection && (
                        <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-3 shadow-2xs animate-fade-in">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-emerald-800">Selected Goal:</span>
                            <span className="font-semibold">{onboardingSelection.subject}</span>
                            <span className="text-emerald-300">•</span>
                            <span>{onboardingSelection.dailyLabel} / day</span>
                            <span className="text-emerald-300">•</span>
                            <span>{onboardingSelection.durationLabel}</span>
                            {onboardingSelection.level && (
                              <>
                                <span className="text-emerald-300">•</span>
                                <span>{onboardingSelection.level}</span>
                              </>
                            )}
                            <span className="text-emerald-300">•</span>
                            <span className="font-mono text-emerald-700 font-semibold">
                              {onboardingSelection.totalEstimatedHours}h total
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOnboardingSelection(null)}
                            className="text-emerald-600 hover:text-emerald-900 p-1 cursor-pointer"
                            title="Dismiss summary"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* PDF Export Feedback Alert */}
                      {exportFeedback && (
                        <div
                          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 shadow-2xs transition animate-fade-in ${exportFeedback.type === "success"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                            : "bg-red-50 border-red-200 text-red-900"
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {exportFeedback.type === "success" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                            )}
                            <span className="font-medium">{exportFeedback.message}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExportFeedback(null)}
                            className="text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Header KPI & Metric Cards */}
                      <HeaderKPI
                        plan={activePlan}
                        completedCount={completedCount}
                        totalCount={totalCount}
                        totalMinutes={totalMinutes}
                        onExportPDF={handleExportPDF}
                        isExportingPDF={isExportingPDF}
                        onExportMarkdown={handleExportMarkdown}
                        selectedPeriodLabel={
                          selectedPeriodIndex !== null
                            ? activePlan.schedule[selectedPeriodIndex]?.period_label
                            : "All Periods"
                        }
                        onSelectPeriodLabel={(label) => {
                          if (label === "All Periods") {
                            setSelectedPeriodIndex(null);
                          } else {
                            const idx = activePlan.schedule.findIndex((p) => p.period_label === label);
                            if (idx !== -1) setSelectedPeriodIndex(idx);
                          }
                        }}
                      />

                      {/* Today's Focus Schedule */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                            Today&apos;s Focus Schedule
                          </h2>
                        </div>

                        {todayPriorityTask ? (
                          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 block">
                                  Next In Queue • {todayPriorityTask.periodLabel}
                                </span>
                                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                                  {todayPriorityTask.task.title}
                                </h3>
                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                  {todayPriorityTask.task.description}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  handleStartFocus(
                                    todayPriorityTask.task,
                                    todayPriorityTask.taskId,
                                    todayPriorityTask.periodLabel
                                  )
                                }
                                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs shrink-0"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Start Focus</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                {todayPriorityTask.task.duration_minutes} minutes
                              </span>
                              <span>•</span>
                              <span className="text-[11px] font-medium">
                                {todayPriorityTask.task.resource_type}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleTask(todayPriorityTask.taskId)}
                                className="ml-auto text-xs text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Mark Done</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-6 text-center rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                            All scheduled tasks for this curriculum are complete!
                          </div>
                        )}

                        {/* Upcoming Tasks Section */}
                        {upcomingTasksSlice.length > 0 && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                              <span>Upcoming In Roadmap</span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                {pendingTasksList.length} total pending
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              {upcomingTasksSlice.map((item) => (
                                <div
                                  key={item.taskId}
                                  className="p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100/70 border border-slate-200 flex items-center justify-between gap-3 text-xs transition"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleTask(item.taskId)}
                                      className="w-4 h-4 rounded border border-slate-300 hover:border-emerald-500 bg-white flex items-center justify-center transition cursor-pointer shrink-0"
                                    >
                                      <span className="sr-only">Complete task</span>
                                    </button>
                                    <div className="min-w-0">
                                      <span className="font-semibold text-slate-900 truncate block">
                                        {item.task.title}
                                      </span>
                                      <span className="text-[10px] text-slate-400 truncate block">
                                        {item.periodLabel}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="font-mono text-[10px] text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                                      {item.task.duration_minutes}m
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleStartFocus(
                                          item.task,
                                          item.taskId,
                                          item.periodLabel
                                        )
                                      }
                                      className="p-1 text-slate-400 hover:text-emerald-700 rounded transition cursor-pointer"
                                      title="Start focus"
                                    >
                                      <Play className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Floating Focus Timer Companion */}
      <FocusTimer
        timer={activeTimer}
        onUpdate={setActiveTimer}
        onCompleteTask={(taskId) => {
          handleToggleTask(taskId);
        }}
        onClose={() => setActiveTimer(null)}
      />
      {/* AI Tutor - Groq-powered study assistant */}
      {viewMode === "dashboard" && (
        <TutorPanel
          currentPlan={
            activePlan
              ? (activePlan as unknown as Record<string, unknown>)
              : null
          }
          isOpen={isTutorOpen}
          onClose={() => setIsTutorOpen(false)}
        />
      )}
      {/* Slide-out Plan History Drawer */}
      <PlanHistorySidebar
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        savedPlans={savedPlans}
        activePlanId={activePlanId}
        onSelectPlan={(p) => {
          setActivePlanId(p.id);
          setSelectedPeriodIndex(null);
        }}
        onDeletePlan={handleDeletePlan}
        onRenamePlan={handleRenamePlan}
        onToggleArchivePlan={handleToggleArchivePlan}
        completedTasksMap={completedTasksMap}
      />

      {/* About CuratePlan Modal */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />
    </div>
  );
}
