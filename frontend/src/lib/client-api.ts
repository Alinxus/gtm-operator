"use client";

const operatorApiBaseUrl =
  process.env.NEXT_PUBLIC_OPERATOR_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

function buildUrl(path: string) {
  return `${operatorApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text || `Request failed (${response.status})`;
  }
}

export async function postJson(path: string, payload?: unknown) {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return response.json().catch(() => null);
}
