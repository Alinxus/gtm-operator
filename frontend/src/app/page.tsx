import { redirect } from "next/navigation";
import { operatorApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const workspaces = await operatorApi.listWorkspaces();
  if (workspaces.length > 0) {
    redirect(`/workspaces/${workspaces[0].id}/today`);
  }
  redirect("/workspaces");
}
