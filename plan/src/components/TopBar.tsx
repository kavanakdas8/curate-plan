"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Menu,
  Search,
  RotateCcw,
  MoreVertical,
  Bell,
  ChevronRight,
  Info,
  Sparkles,
  BookOpen,
  X,
  Layers,
} from "lucide-react";
import { SavedPlan } from "@/types/study";

export interface SearchableTopic {
  id: string;
  topicTitle: string;
  moduleTitle: string;
  planId: string;
  planSubject: string;
  description?: string;
  matchedTaskTitle?: string;
  difficulty?: string;
  duration?: number;
  searchFilter: string;
}

interface TopBarProps {
  activePlan: SavedPlan | null;
  allPlans?: SavedPlan[];
  onSelectPlan?: (planId: string) => void;
  onOpenMobileMenu: () => void;
  onOpenCreateModal?: () => void;
  onOpenHistoryModal?: () => void;
  onExportPDF?: () => void;
  onExportMarkdown?: () => void;
  onExportICS?: () => void;
  onClearCompleted: () => void;
  onFocusSearch: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onSelectTopic?: (topicName: string, planId?: string) => void;
  onOpenAbout?: () => void;
  onSave?: () => void;
  saveStatus?: "idle" | "saving" | "saved" | "error";
  onToggleTutor?: () => void;
  isTutorOpen?: boolean;
}

export function TopBar({
  activePlan,
  allPlans = [],
  onSelectPlan,
  onOpenMobileMenu,
  onOpenHistoryModal,
  onClearCompleted,
  onFocusSearch,
  searchQuery = "",
  onSearchChange,
  onSelectTopic,
  onOpenAbout,
  onToggleTutor,
  isTutorOpen = false,
}: TopBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Extract all searchable topics across all courses (or active course)
  const allCourseTopics = useMemo(() => {
    const plansPool = allPlans && allPlans.length > 0 ? allPlans : activePlan ? [activePlan] : [];
    const planMap = new Map<string, SavedPlan>();
    plansPool.forEach((p) => {
      if (p && !p.id.startsWith("plan_seed_")) planMap.set(p.id, p);
    });
    if (activePlan && !activePlan.id.startsWith("plan_seed_")) {
      planMap.set(activePlan.id, activePlan);
    }

    const items: (SearchableTopic & { taskTitles: string[] })[] = [];

    planMap.forEach((plan) => {
      const planSubject = plan.subject || "Course";

      // 1. Check normalized modules with topics
      if (plan.modules && plan.modules.length > 0) {
        plan.modules.forEach((mod, mIdx) => {
          const modTitle = mod.title || `Module ${mIdx + 1}`;
          (mod.topics || []).forEach((top, tIdx) => {
            const rawName = (top.name || "").trim();
            const rawDesc = (top.description || "").trim();
            let displayTitle = rawName;
            if (/^(week|day|module|period)\s*\d+/i.test(rawName) && rawDesc) {
              displayTitle = `${rawName}: ${rawDesc}`;
            } else if (!displayTitle && rawDesc) {
              displayTitle = rawDesc;
            } else if (!displayTitle) {
              displayTitle = `Topic ${mIdx + 1}.${tIdx + 1}`;
            }

            const taskTitles = (top.tasks || []).map((t) => t.title).filter(Boolean);

            const isGenericName = /^(week|day|module|period)\s*\d+/i.test(rawName);
            const cleanFilter = !isGenericName && rawName ? rawName : rawDesc || displayTitle;

            items.push({
              id: `${plan.id}_m${mIdx}_t${tIdx}`,
              topicTitle: displayTitle,
              moduleTitle: modTitle,
              planId: plan.id,
              planSubject,
              description: rawDesc,
              difficulty: top.difficulty || "Intermediate",
              duration: top.estimated_duration_minutes || 45,
              searchFilter: cleanFilter,
              taskTitles,
            });
          });
        });
      } else if (plan.schedule && plan.schedule.length > 0) {
        // 2. Fallback to schedule periods
        plan.schedule.forEach((period, pIdx) => {
          const pLabel = (period.period_label || `Period ${pIdx + 1}`).trim();
          const pSummary = (period.topic_summary || "").trim();
          const displayTitle = pSummary ? `${pLabel}: ${pSummary}` : pLabel;
          const taskTitles = (period.tasks || []).map((t) => t.title).filter(Boolean);
          const duration =
            (period.tasks || []).reduce((acc, t) => acc + (t.duration_minutes || 0), 0) || 60;

          items.push({
            id: `${plan.id}_sched_${pIdx}`,
            topicTitle: displayTitle,
            moduleTitle: pLabel,
            planId: plan.id,
            planSubject,
            description: pSummary,
            difficulty: "Intermediate",
            duration,
            searchFilter: pSummary || pLabel,
            taskTitles,
          });
        });
      }
    });

    return items;
  }, [allPlans, activePlan]);

  // Match topics across title, description, module name, course name, and task names
  const matchingTopics = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();

    const results: (SearchableTopic & { matchedDetail?: string })[] = [];

    for (const item of allCourseTopics) {
      const matchInTitle = item.topicTitle.toLowerCase().includes(q);
      const matchInDesc = item.description?.toLowerCase().includes(q);
      const matchInMod = item.moduleTitle.toLowerCase().includes(q);
      const matchInPlan = item.planSubject.toLowerCase().includes(q);
      const matchedTask = item.taskTitles?.find((t) => t.toLowerCase().includes(q));

      if (matchInTitle || matchInDesc || matchInMod || matchInPlan || matchedTask) {
        let matchedDetail: string | undefined = undefined;
        if (!matchInTitle && matchedTask) {
          matchedDetail = `Task: ${matchedTask}`;
        } else if (!matchInTitle && matchInPlan && allPlans.length > 1) {
          matchedDetail = `Course: ${item.planSubject}`;
        } else if (!matchInTitle && matchInMod) {
          matchedDetail = `Module: ${item.moduleTitle}`;
        }

        results.push({
          ...item,
          matchedDetail,
        });
      }
    }

    return results;
  }, [allCourseTopics, searchQuery, allPlans.length]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-15 px-4 sm:px-6 bg-white/95 border-b border-slate-200 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-3">
      {/* Left: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
          title="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
          <span className="text-slate-400 font-medium hidden sm:inline">Workspace</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline shrink-0" />
          <span className="font-semibold text-slate-800 truncate">
            {activePlan ? activePlan.subject : "Overview"}
          </span>
        </nav>
      </div>

      {/* Middle: Universal Course Topics Search Bar */}
      <div className="flex-1 max-w-md mx-2 hidden sm:block relative" ref={searchContainerRef}>
        <div
          onClick={() => {
            searchInputRef.current?.focus();
            setIsSearchFocused(true);
            onFocusSearch();
          }}
          className="relative flex items-center w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 rounded-lg px-3 py-1.5 transition cursor-text group"
        >
          <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 mr-2 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchFocused(true)}
            onChange={(e) => {
              setIsSearchFocused(true);
              onSearchChange && onSearchChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (matchingTopics.length > 0) {
                  const targetTopic = matchingTopics[0];
                  if (onSelectPlan && targetTopic.planId) {
                    onSelectPlan(targetTopic.planId);
                  }
                  // Retain user's specific search keyword (e.g. "numpy") instead of replacing with generic period
                  const finalFilter = searchQuery.trim() || targetTopic.searchFilter;
                  if (onSelectTopic) {
                    onSelectTopic(finalFilter, targetTopic.planId);
                  } else if (onSearchChange) {
                    onSearchChange(finalFilter);
                  }
                }
                setIsSearchFocused(false);
                searchInputRef.current?.blur();
              } else if (e.key === "Escape") {
                setIsSearchFocused(false);
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search any course topic, task, or module..."
            className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-normal"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSearchChange && onSearchChange("");
                setIsSearchFocused(false);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer mr-1"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded text-slate-400 shadow-2xs">
                /
              </kbd>
            </div>
          )}
        </div>

        {/* Dropdown with matching Course Topics across all curricula */}
        {isSearchFocused && searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 max-h-80 overflow-y-auto space-y-1 animate-fade-in">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span>Matching Course Topics</span>
              <span className="font-mono text-[10px] text-emerald-600 font-semibold">
                {matchingTopics.length} {matchingTopics.length === 1 ? "match" : "matches"}
              </span>
            </div>
            {matchingTopics.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 text-center">
                No course topics found for &quot;{searchQuery}&quot;
              </div>
            ) : (
              matchingTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (onSelectPlan && topic.planId) {
                      onSelectPlan(topic.planId);
                    }
                    // Retain user's specific search keyword (e.g. "numpy") instead of replacing with generic period
                    const finalFilter = searchQuery.trim() || topic.searchFilter;
                    if (onSelectTopic) {
                      onSelectTopic(finalFilter, topic.planId);
                    } else if (onSearchChange) {
                      onSearchChange(finalFilter);
                    }
                    setIsSearchFocused(false);
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-emerald-50/70 border border-transparent hover:border-emerald-200 transition cursor-pointer group flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 group-hover:text-emerald-700 truncate">
                      {topic.topicTitle}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 truncate mt-0.5">
                      <span className="font-medium text-slate-500 truncate">{topic.planSubject}</span>
                      <span>•</span>
                      <span className="truncate">{topic.moduleTitle}</span>
                      {topic.matchedDetail && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 font-medium truncate">{topic.matchedDetail}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {topic.duration && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                        {topic.duration}m
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200/60 text-emerald-700 font-medium">
                      Topic
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right Actions: AI Tutor Button + Notification Bell + Secondary Menu */}
      <div className="flex items-center gap-2 shrink-0">
        {/* AI Tutor Button */}
        {onToggleTutor && (
          <button
            type="button"
            onClick={onToggleTutor}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition cursor-pointer shadow-2xs ${isTutorOpen
              ? "bg-emerald-700 border-emerald-700 text-white"
              : "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
              }`}
            title={isTutorOpen ? "Close AI Tutor" : "Open AI Tutor"}
          >
            <span>AI Tutor</span>
          </button>
        )}
        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            title="Notifications"
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition cursor-pointer relative shadow-2xs"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs text-slate-700 z-50 animate-fade-in">
              <div className="pb-2 border-b border-slate-100">
                <span className="font-semibold text-slate-900">Activity & Alerts</span>
              </div>
              <div className="py-2 space-y-2">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-900">Focus Mode Enabled</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                    Pomodoro intervals and chime notifications are active.
                  </p>
                </div>
                {activePlan && (
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-[11px] font-semibold text-slate-900 truncate">
                      {activePlan.subject}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {activePlan.schedule.length} learning modules · {activePlan.target_timeframe}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Secondary Actions Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 transition cursor-pointer shadow-2xs"
            title="More Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs text-slate-700 z-50 animate-fade-in">
              {onOpenHistoryModal && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenHistoryModal();
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center text-slate-700 hover:text-slate-900 transition cursor-pointer"
                >
                  <span>Study History</span>
                </button>
              )}
              {activePlan && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onClearCompleted();
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-red-50 flex items-center gap-2 text-amber-700 hover:text-red-700 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Checkmarks</span>
                </button>
              )}
              {onOpenAbout && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenAbout();
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-slate-700 hover:text-slate-900 transition cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span>About CuratePlan</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
