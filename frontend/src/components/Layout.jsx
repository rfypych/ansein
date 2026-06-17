import { NavLink, useNavigate, Outlet } from "react-router-dom";
import {
  ShieldCheck,
  LayoutDashboard,
  FolderSearch,
  Bot,
  Settings as SettingsIcon,
  LogOut,
  Plus,
} from "lucide-react";
import { useAuthStore } from "../contexts/AuthContext";
import { clsx } from "../lib/utils";

const navItems = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/investigations", label: "Investigations", icon: FolderSearch },
  { to: "/app/copilot", label: "Copilot", icon: Bot },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon },
];

export function Layout() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-800 bg-slate-900/50 backdrop-blur-sm flex flex-col">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold tracking-tight">AnseIn</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                Threat Intelligence
              </div>
            </div>
          </div>
        </div>

        <div className="px-3 py-4">
          <NavLink
            to="/app/investigations/new"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Investigation
          </NavLink>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-slate-800 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                )
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-xs font-bold">
              {(user?.email || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{user?.email || "user"}</div>
              <div className="text-xs text-slate-500">
                {user?.is_superuser ? "Administrator" : "Analyst"}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
