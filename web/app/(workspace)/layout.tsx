"use client";

import { useState } from "react";
import ProjectSidebar from "@/components/workspace/ProjectSidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-full min-h-screen bg-[var(--surface-bg)]">
      <ProjectSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <main
        className={`min-w-0 flex-1 overflow-auto transition-all duration-200 ${
          sidebarCollapsed ? "ml-0" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
