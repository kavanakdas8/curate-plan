"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  BarChart3,
  ChevronLeft,
  Plus,
  BookOpen,
  Trash2,
  X,
  CheckCircle2,
  History,
  Info,
  LogIn,
  UserPlus,
} from "lucide-react";
import { SavedPlan, ActiveTimer } from "@/types/study";
import { BrandLogo } from "@/components/BrandLogo";

function UserProfileIcon({ className = "w-6 h-6 text-[#38bdf8]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="9.2" r="3.2" />
      <path d="M6.2 18.2a6.8 6.8 0 0 1 11.6 0" />
    </svg>
  );
}

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  savedPlans: SavedPlan[];
  activePlanId: string | null;
  onSelectPlan: (plan: SavedPlan) => void;
  onDeletePlan: (planId: string) => void;
  onOpenCreateModal: () => void;
  onOpenHistoryModal?: () => void;
  onOpenAbout?: () => void;
  onReturnHome?: () => void;
  activeTimer: ActiveTimer | null;
  completedTasksMap: Record<string, boolean>;
  activeNavTab?: string;
  onSelectNavTab?: (tab: string) => void;
}

export function AppSidebar({
  collapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  savedPlans,
  activePlanId,
  onSelectPlan,
  onDeletePlan,
  onOpenCreateModal,
  onOpenHistoryModal,
  onOpenAbout,
  onReturnHome,
  activeTimer,
  completedTasksMap,
  activeNavTab = "dashboard",
  onSelectNavTab,
}: AppSidebarProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isAuthPromptOpen, setIsAuthPromptOpen] = useState(false);
  const authPromptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        authPromptRef.current &&
        !authPromptRef.current.contains(event.target as Node)
      ) {
        setIsAuthPromptOpen(false);
      }
    }
    if (isAuthPromptOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isAuthPromptOpen]);

  const isExpanded = !collapsed || isHovered;
  // Active plan stats for the sidebar
  const activePlan = savedPlans.find((p) => p.id === activePlanId);
  let activePlanProgress = 0;
  if (activePlan) {
    let total = 0;
    let completed = 0;
    activePlan.schedule.forEach((period, pIdx) => {
      period.tasks.forEach((_, tIdx) => {
        total++;
        if (completedTasksMap[`${activePlan.id}_${pIdx}_${tIdx}`]) completed++;
      });
    });
    if (total > 0) activePlanProgress = Math.round((completed / total) * 100);
  }

  const isMac = typeof window !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcutKey = isMac ? "⌘K" : "Ctrl+K";

  const handleNavClick = (tabId: string) => {
    if (onSelectNavTab) {
      onSelectNavTab(tabId);
    }
    onCloseMobile();
  };

  const workspaceNavItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "curriculum", label: "Curriculum Roadmap", icon: MapPin },
    { id: "analytics", label: "Analytics & Progress", icon: BarChart3 },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 text-slate-700 select-none transition-all duration-200">
      {/* Brand & Workspace Header */}
      <div
        className={`h-15 flex items-center border-b border-slate-200 shrink-0 ${isExpanded ? "justify-between px-4" : "justify-center px-2"
          }`}
      >
        <div
          onClick={onReturnHome}
          className={`flex items-center gap-2.5 overflow-hidden ${onReturnHome ? "cursor-pointer group hover:opacity-90 transition" : ""
            }`}
          title="Return to Home"
        >
          {/* Brand Logo */}
          <BrandLogo className="w-9 h-6" />

          {isExpanded && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-slate-900 tracking-tight leading-none truncate whitespace-nowrap group-hover:text-emerald-700 transition">
                CuratePlan
              </span>
              <span className="text-[10px] text-slate-400 font-medium tracking-normal mt-0.5 whitespace-nowrap">
                Plan Smarter. Learn Better.
              </span>
            </div>
          )}
        </div>

        {/* Mobile Close Button */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Action Button: Create / Generate Plan */}
      <div className="p-3 border-b border-slate-100">
        <button
          type="button"
          onClick={() => {
            onOpenCreateModal();
            onCloseMobile();
          }}
          title={`Create Plan (${shortcutKey})`}
          className={`w-full group flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs transition-all shadow-xs cursor-pointer ${!isExpanded ? "justify-center px-0" : ""
            }`}
        >
          <span className="flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            {isExpanded && <span className="font-semibold text-white whitespace-nowrap">Create Plan</span>}
          </span>
          {isExpanded && (
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-700/60 border border-emerald-500/40 rounded text-emerald-100">
              {shortcutKey}
            </kbd>
          )}
        </button>
      </div>

      {/* Main Navigation List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-5 scrollbar-thin">
        {/* Section: WORKSPACE */}
        <div className="space-y-0.5">
          {isExpanded && (
            <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
              Workspace
            </div>
          )}

          {workspaceNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNavTab === item.id;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={item.label}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition cursor-pointer ${isActive
                  ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/70"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium"
                  } ${!isExpanded ? "justify-center px-0" : ""}`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"
                    }`}
                />
                {isExpanded && <span className="truncate whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Section: Study History */}
        {isExpanded && (
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="px-2.5 pb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5">
                <span>Study History</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 border border-slate-200 text-slate-500 font-semibold">
                  {savedPlans.length}
                </span>
                {onOpenHistoryModal && (
                  <button
                    type="button"
                    onClick={onOpenHistoryModal}
                    title="Manage Study History"
                    className="p-0.5 text-slate-400 hover:text-emerald-700 rounded hover:bg-slate-100 transition cursor-pointer"
                  >
                    <History className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {savedPlans.length === 0 ? (
              <div className="px-2.5 py-3 text-[11px] text-slate-400 italic">
                No study history yet.
              </div>
            ) : (
              <div className="space-y-1 max-h-44 overflow-y-auto scrollbar-thin pr-1">
                {savedPlans.map((plan) => {
                  const isActive = plan.id === activePlanId;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => {
                        onSelectPlan(plan);
                        onCloseMobile();
                      }}
                      className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition cursor-pointer border ${isActive
                        ? "bg-emerald-50/60 text-emerald-800 border-emerald-200 font-semibold shadow-xs"
                        : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <BookOpen
                          className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-emerald-600" : "text-slate-400"
                            }`}
                        />
                        <span className="truncate">{plan.subject}</span>
                        {plan.isArchived && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                            Archived
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 group-hover:hidden">
                          {plan.target_timeframe}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Are you sure you want to permanently delete "${plan.subject}"? This action cannot be undone.`)) {
                              onDeletePlan(plan.id);
                            }
                          }}
                          className="hidden group-hover:flex p-1 text-slate-400 hover:text-red-600 rounded transition"
                          title="Delete plan"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Focus Mode Card Widget */}
        {activeTimer && isExpanded && (
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-800">
              <span>Active Focus Session</span>
              <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">
                {activeTimer.isRunning ? "Running" : "Paused"}
              </span>
            </div>
            <p className="text-[11px] text-slate-700 font-medium truncate">
              {activeTimer.taskTitle}
            </p>
          </div>
        )}

        {/* Active Plan Progress Mini Gauge */}
        {isExpanded && activePlan && (
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
              <span className="flex items-center gap-1.5 text-slate-700">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Curriculum Progress
              </span>
              <span className="font-mono text-emerald-700 font-bold">
                {activePlanProgress}%
              </span>
            </div>
            <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${activePlanProgress}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 truncate font-medium">
              {activePlan.subject}
            </div>
          </div>
        )}
      </div>

      {/* Bottom User Profile & Workspace Info */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/80 relative">
        {/* Auth Prompt Popover */}
        {isAuthPromptOpen && (
          <div
            ref={authPromptRef}
            className={`absolute z-50 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 animate-fade-in ${isExpanded
              ? "bottom-full mb-2 left-2 right-2 w-[calc(100%-16px)]"
              : "bottom-1 left-16 w-72"
              }`}
          >
            <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                  <UserProfileIcon className="w-5.5 h-5.5 text-[#38bdf8]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-slate-900 leading-tight">User</h4>
                  <p className="text-[10px] text-slate-400">Guest Session</p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAuthPromptOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="py-3 space-y-1">
              <p className="text-xs font-semibold text-slate-800 leading-snug">
                Sign in to save progress or create new account
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Save your curricula, progress, and study sessions across devices.
              </p>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsAuthPromptOpen(false);
                  router.push("/login");
                }}
                className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in to save progress</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAuthPromptOpen(false);
                  router.push("/signup");
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create new account</span>
              </button>
            </div>
          </div>
        )}

        {isExpanded ? (
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsAuthPromptOpen((prev) => !prev)}
              className="flex items-center gap-2.5 min-w-0 text-left rounded-xl p-1 -m-1 hover:bg-slate-100/80 transition cursor-pointer group flex-1"
              title="User (Click to sign in or create new account)"
            >
              {/* User Profile Icon */}
              <div className="w-8 h-8 rounded-full bg-sky-50/80 border border-sky-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                <UserProfileIcon className="w-5.5 h-5.5 text-[#38bdf8]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate whitespace-nowrap group-hover:text-emerald-700 transition">
                  User
                </div>
                <div className="text-[10px] text-slate-500 truncate whitespace-nowrap flex items-center gap-1">
                  <span>Sign in to save</span>
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1">
              {onOpenAbout && (
                <button
                  type="button"
                  onClick={onOpenAbout}
                  className="text-slate-400 hover:text-emerald-700 transition p-1 cursor-pointer"
                  title="About CuratePlan"
                >
                  <Info className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="hidden md:flex p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              title="User (Click to sign in or create new account)"
              onClick={() => setIsAuthPromptOpen((prev) => !prev)}
              className="w-8 h-8 rounded-full bg-sky-50/80 border border-sky-100 flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-sky-300 hover:scale-105 transition"
            >
              <UserProfileIcon className="w-5.5 h-5.5 text-[#38bdf8]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Rail - Fixed to viewport so it never scrolls away */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`hidden md:block transition-all duration-300 ease-in-out h-screen fixed top-0 left-0 z-40 ${isExpanded ? "w-64" : "w-16"
          }`}
      >
        {sidebarContent}
      </aside>

      {/* Structural Spacer: preserves layout flow beside fixed sidebar */}
      <div
        aria-hidden="true"
        className={`hidden md:block shrink-0 transition-all duration-300 ease-in-out ${isExpanded ? "w-64" : "w-16"
          }`}
      />

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 md:hidden bg-slate-900/40 backdrop-blur-xs flex"
          onClick={onCloseMobile}
        >
          <div
            className="w-72 max-w-[80vw] h-full shadow-xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
          <div className="flex-1" onClick={onCloseMobile} />
        </div>
      )}
    </>
  );
}
