"use client";

import React from "react";
import { Plus, ArrowRight } from "lucide-react";

interface EmptyStateHeroProps {
  onOpenModal: () => void;
  onOpenAbout?: () => void;
}

export function EmptyStateHero({
  onOpenModal,
  onOpenAbout,
}: EmptyStateHeroProps) {
  return (
    <div className="py-14 sm:py-20 px-4 max-w-lg mx-auto text-center animate-fade-in">

      {/* Primary Empty State Heading */}
      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
        Your learning journey starts here.
      </h2>

      {/* Explanatory Subtext */}
      <p className="text-xs sm:text-sm text-slate-600 mt-2.5 leading-relaxed max-w-md mx-auto">
        You haven&apos;t created a study plan yet. Choose something you want to learn, and CuratePlan will turn it into a structured roadmap.
      </p>

      {/* Call to Actions */}
      <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={onOpenModal}
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition hover:scale-[1.01] cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Create Your First Plan</span>
        </button>

        {onOpenAbout && (
          <button
            type="button"
            onClick={onOpenAbout}
            className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs sm:text-sm text-slate-500 hover:text-emerald-700 transition flex items-center justify-center gap-1.5 cursor-pointer font-medium hover:bg-slate-50"
          >
            <span>Explore how CuratePlan works</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
