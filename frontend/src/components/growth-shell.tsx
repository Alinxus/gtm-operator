"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BellRing,
  BriefcaseBusiness,
  CalendarDays,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  Rocket,
  Search,
  Send,
  UsersRound,
  X,
} from "lucide-react";
import type { Workspace, WorkspaceDashboard } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const navigation = [
  { name: "Chat", href: "chat", icon: MessageSquare, description: "Natural language operator" },
  { name: "Today", href: "today", icon: Activity, description: "Top prospects queue" },
  { name: "Outreach", href: "outreach", icon: Mail, description: "Cold email queue" },
  { name: "Accounts", href: "accounts", icon: UsersRound, description: "Every account remembered" },
  { name: "Approvals", href: "approvals", icon: BellRing, description: "Approval before send" },
  { name: "Social", href: "social", icon: Megaphone, description: "Brand presence lane" },
  { name: "SEO / GEO", href: "seo", icon: Search, description: "Compounding lane" },
  { name: "Campaigns", href: "campaigns", icon: Rocket, description: "Burst orchestration" },
  { name: "Publishing", href: "publishing", icon: Send, description: "GitHub + webhook jobs" },
  { name: "Outcomes", href: "outcomes", icon: BriefcaseBusiness, description: "Signal to paid" },
] as const;

function isActivePath(pathname: string, workspaceId: string, href: string) {
  const path = `/workspaces/${workspaceId}/${href}`;
  if (href === "chat") {
    return pathname === path || pathname === `/workspaces/${workspaceId}`;
  }
  return pathname.startsWith(path);
}

interface GrowthShellProps {
  workspaces: Workspace[];
  workspace: Workspace;
  dashboard?: WorkspaceDashboard;
  children: React.ReactNode;
}

export function GrowthShell({ workspaces, workspace, dashboard, children }: GrowthShellProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const sidebarContent = (
    <>
      <div className="dashboard-sidebar-logo">
        <Link href="/workspaces" onClick={() => setOpen(false)}>
          <span className="dashboard-logo-text">
            retain<b>db</b>
          </span>
        </Link>
        {/* Close button — mobile only */}
        <button
          className="sidebar-close-btn"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="dashboard-sidebar-nav">
        <p className="dashboard-section-label">Growth Operator</p>
        {navigation.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, workspace.id, item.href);
          return (
            <Link
              key={item.href}
              href={`/workspaces/${workspace.id}/${item.href}`}
              className={`dashboard-nav-item ${active ? "is-active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="dashboard-sidebar-footer">
        <div className="dashboard-user-row">
          <div className="dashboard-user-avatar">{workspace.name.slice(0, 1).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <p className="dashboard-user-name truncate">{workspace.name}</p>
            <p className="dashboard-user-email truncate">{workspace.primaryIcp}</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="dashboard-shell">
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Permanent sidebar (desktop) */}
      <aside className="dashboard-sidebar">
        {sidebarContent}
      </aside>

      {/* Drawer sidebar (mobile) */}
      <aside className={`dashboard-sidebar sidebar-drawer ${open ? "is-open" : ""}`} aria-hidden={!open}>
        {sidebarContent}
      </aside>

      <div className="dashboard-main">
        <header className="dashboard-topbar">
          {/* Hamburger — mobile only */}
          <button
            className="sidebar-hamburger"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <div className="dashboard-breadcrumb">
            <span>RetainDB Growth Operator</span>
            <strong>·</strong>
            <span>{workspace.name}</span>
            {dashboard ? (
              <>
                <strong>·</strong>
                <span>{formatNumber(dashboard.today.length)} in queue</span>
              </>
            ) : null}
          </div>

          <div className="dashboard-inline">
            <CalendarDays className="h-4 w-4" color="var(--faint)" />
            <select
              className="dashboard-workspace-select"
              value={workspace.id}
              onChange={(event) => router.push(`/workspaces/${event.target.value}/today`)}
            >
              {workspaces.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
