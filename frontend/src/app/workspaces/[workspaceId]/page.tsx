import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function WorkspaceRootPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  redirect(`/workspaces/${workspaceId}/chat`);
}
