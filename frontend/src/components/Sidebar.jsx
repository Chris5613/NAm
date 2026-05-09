import { NavLink } from "react-router-dom";
import { DollarSign, BarChart3, Bitcoin, Phone, Pickaxe, Zap } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Net Worth", icon: DollarSign },
  { path: "/investments", label: "Investment Overview", icon: BarChart3 },
  { path: "/crypto", label: "Crypto", icon: Bitcoin },
  { path: "/gomining", label: "GoMining", icon: Pickaxe },

  // NEW PAGE
  { path: "/unity-devices", label: "Unity Devices", icon: Phone},

  { path: "/integrations", label: "Integrations", icon: Zap },
  { path: "/phone-list", label: "Phone List", icon: Phone },
];

export default function Sidebar() {
  return (
    <aside
      className="fixed top-0 left-0 h-screen w-56 bg-card border-r border-border/40 flex flex-col z-40"
      data-testid="sidebar"
    >
      <div className="p-5 border-b border-border/40">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Wealth</h2>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1" data-testid="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`
            }
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
