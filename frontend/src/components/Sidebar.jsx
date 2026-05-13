import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  DollarSign,
  BarChart3,
  Bitcoin,
  Phone,
  Pickaxe,
  Zap,
  Smartphone,
  Cable,
  ChevronLeft,
  ChevronRight,
  Squirrel,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Net Worth", icon: DollarSign },
  { path: "/investments", label: "Investment Overview", icon: BarChart3 },
  { path: "/crypto", label: "Crypto", icon: Bitcoin },
  { path: "/gomining", label: "GoMining", icon: Pickaxe },
  { path: "/integrations", label: "Integrations", icon: Zap },
  { path: "/unity-devices", label: "Unity Devices", icon: Cable },
  { path: "/tello-dashboard", label: "Tello Dashboard", icon: Smartphone },
  { path: "/rollercoin-calculator", label: "Rollercoin Calculator", icon: Squirrel },
];



export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border/40 bg-card transition-all duration-300 ${
        collapsed ? "w-16" : "w-56"
      }`}
      data-testid="sidebar"
    >
      <div className="flex items-center justify-between border-b border-border/40 p-4">
        {!collapsed && (
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Wealth
          </h2>
        )}

        <button
          onClick={() => setCollapsed((value) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border/40 text-muted-foreground hover:bg-white/5 hover:text-foreground"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      </div>

      <nav
        className="flex-1 space-y-1 px-3 py-4"
        data-testid="sidebar-nav"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-md py-2.5 text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              } ${
                isActive
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
              }`
            }
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />

            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}