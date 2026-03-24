"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";

interface PublishEntityButtonProps {
  entityType: "asset" | "touch";
  entityId: string;
  destinationId?: string;
}

export function PublishEntityButton({ entityType, entityId, destinationId }: PublishEntityButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function onPublish() {
    setMessage("");
    startTransition(async () => {
      try {
        const endpoint =
          entityType === "asset"
            ? `/v2/assets/${encodeURIComponent(entityId)}/publish`
            : `/v2/touches/${encodeURIComponent(entityId)}/publish`;
        await postJson(endpoint, { destinationId: destinationId || undefined });
        setMessage("Publish job created.");
        router.refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    });
  }

  return (
    <div className="dashboard-inline">
      <button className="dashboard-btn dashboard-btn-sm" type="button" onClick={onPublish} disabled={isPending}>
        {isPending ? "Publishing..." : "Publish"}
      </button>
      {message ? <span className="dashboard-subtle">{message}</span> : null}
    </div>
  );
}
