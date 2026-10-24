import { useState } from "react";
import { NavLink } from "react-router-dom";
import ImportDataDialog from "@/components/ImportDataDialog";
import { useAuth } from "@/lib/AuthContext";
import { Home, CreditCard, CalendarDays, Bike, Download, LogOut } from "lucide-react";

const mainLinks = [{ to: "/", label: "Home", Icon: Home }, { to: "/spending", label: "Spending", Icon: CreditCard }];
const financeLinks = [{ to: "/yield-farming", label: "Passive Income", Icon: CalendarDays }, { to: "/doordash", label: "Delivery", Icon: Bike }];

export default function Sidebar() {
  const [importOpen, setImportOpen] = useState(false);
  const { user, logout } = useAuth();
  const linkStyle = ({ isActive }) => "flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors " + (isActive ? "bg-[#1c1d20] font-medium text-white" : "text-[#999da6] hover:bg-white/[0.05] hover:text-white");
  const renderNavLink = ({to,label,Icon}) => <NavLink key={to} end={to === "/"} to={to} className={linkStyle} data-testid={"nav-" + (label === "Home" ? "net-worth" : label.toLowerCase().replace(/\s+/g,"-"))}><Icon className="h-4 w-4 shrink-0" strokeWidth={1.65}/>{label}</NavLink>;
  return <>
    <aside data-testid="sidebar" className="fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-[#23252a] bg-[#090a0b]">
      <div className="flex h-[88px] shrink-0 items-center gap-3 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-[6px] border-white"><span className="h-1.5 w-1.5 rounded-full bg-[#090a0b]"/></div>
        <span className="font-serif text-[25px] tracking-tight text-white">Wealth</span>
        <span className="ml-auto text-[9px] uppercase tracking-widest text-[#626670]">NAm</span>
      </div>
      <nav data-testid="sidebar-nav" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
        <div className="space-y-0.5">{mainLinks.map(renderNavLink)}</div>
        <div className="my-4 border-t border-white/[0.08]"/>
        <div className="space-y-0.5">{financeLinks.map(renderNavLink)}</div>
      </nav>
      <div className="shrink-0 border-t border-[#25272c] px-3 py-3">
        {user && <div className="mb-2 flex items-center gap-2.5 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#666374] text-[11px] text-white">{String(user.username || "U").slice(0,2).toUpperCase()}</div>
          <div className="min-w-0"><p className="text-[10px] text-[#848892]">Signed in</p><p className="truncate text-xs font-medium text-white">{user.username}</p></div>
        </div>}
        <button type="button" onClick={() => setImportOpen(true)} className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs text-[#a2a6af] hover:bg-white/[0.055] hover:text-white"><Download className="h-4 w-4"/>Import data</button>
        <button type="button" onClick={logout} className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-xs text-[#a2a6af] hover:bg-white/[0.055] hover:text-white"><LogOut className="h-4 w-4"/>Sign out</button>
      </div>
    </aside>
    <ImportDataDialog open={importOpen} onOpenChange={setImportOpen}/>
  </>;
}
