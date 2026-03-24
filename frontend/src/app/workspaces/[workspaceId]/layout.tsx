import { notFound } from "next/navigation";
import { GrowthShell } from "@/components/growth-shell";
import { operatorApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  params,
  children,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
  children: React.ReactNode;
}>) {
  const { workspaceId } = await params;
  const [workspaces, dashboard] = await Promise.all([
    operatorApi.listWorkspaces(),
    operatorApi.getWorkspaceDashboard(workspaceId),
  ]);

  const workspace = workspaces.find((entry) => entry.id === workspaceId) ?? dashboard.workspace;
  if (!workspace) notFound();

  return (
    <GrowthShell workspaces={workspaces} workspace={workspace} dashboard={dashboard}>
      {children}
    </GrowthShell>
  );
}
