import { useState } from "react";
import { NavLink } from "react-router-dom";

import ImportDataDialog from "@/components/ImportDataDialog";
import { useAuth } from "@/lib/AuthContext";

import {
  TrendingUp,
  CalendarDays,
  CreditCard,
  Download,
  LogOut,
  UserRound,
  Bike,
} from "lucide-react";

const NAV_ITEMS = [
  {
    path: "/",
    label: "Net Worth",
    icon: TrendingUp,
  },
  {
    path: "/yield-farming",
    label: "Passive Income",
    icon: CalendarDays,
  },
  {
    path: "/doordash",
    label: "DoorDash",
    icon: Bike,
  },
  {
    path: "/spending",
    label: "Spending",
    icon: CreditCard,
  },
];

export default function Sidebar() {
  const [importOpen, setImportOpen] =
    useState(false);

  const { user, logout } = useAuth();

  return (
    <>
      <aside
        className="
          fixed
          left-0
          top-0
          z-40
          flex
          h-screen
          w-[244px]
          flex-col
          border-r
          border-slate-800/80
          bg-[#0c141a]
        "
        data-testid="sidebar"
      >
        {/* =========================================
            LOGO / BRAND
        ========================================= */}

        <div className="flex h-[82px] items-center gap-3 px-7">
          <div className="flex items-end gap-[4px]">
            <span className="h-3 w-1 rounded-full bg-teal-400" />
            <span className="h-5 w-1 rounded-full bg-teal-400" />
            <span className="h-7 w-1 rounded-full bg-teal-400" />
          </div>

          <span className="text-[24px] font-semibold tracking-[-0.02em] text-white">
            Wealth
          </span>
        </div>

        {/* =========================================
            NAVIGATION
        ========================================= */}

        <nav
          className="space-y-2 px-4"
          data-testid="sidebar-nav"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                data-testid={`nav-${item.label
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `
                  flex
                  h-[52px]
                  items-center
                  gap-4
                  rounded-lg
                  px-4
                  text-[16px]
                  font-medium
                  transition-all
                  duration-200

                  ${
                    isActive
                      ? `
                        bg-gradient-to-r
                        from-teal-500/15
                        to-teal-400/10
                        text-white
                        shadow-[inset_0_0_0_1px_rgba(45,212,191,0.05)]
                      `
                      : `
                        text-slate-300
                        hover:bg-white/[0.04]
                        hover:text-white
                      `
                  }
                `
                }
              >
                <Icon
                  className="h-5 w-5 shrink-0"
                  strokeWidth={1.7}
                />

                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* =========================================
            SPACER
        ========================================= */}

        <div className="flex-1" />

        {/* =========================================
            USER SECTION
        ========================================= */}

        <div className="px-5 pb-6">
          {user && (
            <div className="mb-5 flex items-center gap-4 px-2">
              <UserRound
                className="h-5 w-5 shrink-0 text-slate-300"
                strokeWidth={1.6}
              />

              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  Signed in as
                </p>

                <p className="mt-0.5 truncate text-sm font-medium text-white">
                  {user.username}
                </p>
              </div>
            </div>
          )}

          {/* Divider */}

          <div className="border-t border-slate-800/90 pt-4">
            {/* IMPORT DATA */}

            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="
                flex
                w-full
                items-center
                gap-4
                rounded-lg
                px-3
                py-3
                text-[15px]
                font-medium
                text-slate-300
                transition-all
                duration-200
                hover:bg-white/[0.04]
                hover:text-white
              "
            >
              <Download
                className="h-5 w-5 shrink-0"
                strokeWidth={1.6}
              />

              <span>Import data</span>
            </button>

            {/* SIGN OUT */}

            <button
              type="button"
              onClick={logout}
              className="
                mt-1
                flex
                w-full
                items-center
                gap-4
                rounded-lg
                px-3
                py-3
                text-[15px]
                font-medium
                text-slate-300
                transition-all
                duration-200
                hover:bg-white/[0.04]
                hover:text-white
              "
            >
              <LogOut
                className="h-5 w-5 shrink-0"
                strokeWidth={1.6}
              />

              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================
          IMPORT DIALOG
      ========================================= */}

      <ImportDataDialog
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </>
  );
}