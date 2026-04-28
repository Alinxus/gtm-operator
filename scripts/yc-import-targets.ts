import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Target = {
  company: string;
  slugCandidates: string[];
};

type EnrichedTarget = {
  company: string;
  resolvedSlug: string;
  sourceUrl: string;
  ycTitle: string;
  oneLiner: string;
  description: string;
  batch: string;
  website: string | null;
  domain: string | null;
  founders: string[];
};

type ContactRecord = {
  company: string;
  batch: string;
  ycSlug: string;
  ycUrl: string;
  oneLiner: string;
  website: string;
  domain: string;
  founderName: string;
  emailGuess: string;
  emailPattern: "first@domain";
  source: "y_combinator";
  emailVerified: false;
};

type ImportResult = {
  account?: { id?: string; name?: string };
  person?: { id?: string; name?: string; email?: string | null };
  signal?: { id?: string; title?: string };
  opportunity?: { id?: string; score?: number };
  sequence?: unknown;
};

const YC_BASE_URL = "https://www.ycombinator.com/companies";
const DEFAULT_BASE_URL = "https://retaindb-gtm-operator.olajidealameen4.workers.dev";
const DEFAULT_WORKSPACE_ID = "workspace_3f6fa54d-9c90-4d55-bdfe-ea1a1c0d9d20";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const args = new Set(process.argv.slice(2));
const shouldIngest = args.has("--ingest");
const shouldGenerateSequences = args.has("--generate-sequences");

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = path.resolve(scriptDir, "..");
  const dataPath = path.join(projectDir, "data", "yc-ai-memory-targets.json");
  const reportsDir = path.join(projectDir, "reports");
  const targets = JSON.parse(await readFile(dataPath, "utf8")) as Target[];

  await mkdir(reportsDir, { recursive: true });

  const enriched: EnrichedTarget[] = [];
  const unresolved: Array<{ company: string; attempts: string[] }> = [];

  for (const target of targets) {
    const resolved = await resolveTarget(target);
    if (resolved) {
      enriched.push(resolved);
    } else {
      unresolved.push({ company: target.company, attempts: target.slugCandidates });
    }
  }

  const contacts = enriched.flatMap(toContacts);
  const csvPath = path.join(reportsDir, "yc-ai-memory-targets.csv");
  const jsonPath = path.join(reportsDir, "yc-ai-memory-targets.json");
  const unresolvedPath = path.join(reportsDir, "yc-ai-memory-targets-unresolved.json");

  await writeFile(csvPath, toCsv(contacts), "utf8");
  await writeFile(jsonPath, JSON.stringify(contacts, null, 2), "utf8");
  await writeFile(unresolvedPath, JSON.stringify(unresolved, null, 2), "utf8");

  const summary = {
    targets: targets.length,
    resolvedCompanies: enriched.length,
    unresolvedCompanies: unresolved.length,
    contacts: contacts.length,
    csvPath,
    jsonPath,
    unresolvedPath,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!shouldIngest) {
    return;
  }

  const baseUrl = process.env.GTM_OPERATOR_BASE_URL || DEFAULT_BASE_URL;
  const workspaceId = process.env.GTM_WORKSPACE_ID || DEFAULT_WORKSPACE_ID;
  const ingestResults = await ingestContacts(baseUrl, workspaceId, contacts, shouldGenerateSequences);
  const ingestPath = path.join(reportsDir, "yc-ai-memory-targets-ingest-results.json");
  await writeFile(ingestPath, JSON.stringify(ingestResults, null, 2), "utf8");
  console.log(JSON.stringify({ ingestPath, ...summarizeIngestResults(ingestResults) }, null, 2));
}

async function resolveTarget(target: Target): Promise<EnrichedTarget | null> {
  for (const slug of target.slugCandidates) {
    const url = `${YC_BASE_URL}/${slug}`;
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      redirect: "follow",
    });
    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const parsed = parseCompanyPage(html, slug);
    if (!parsed) {
      continue;
    }

    return {
      company: parsed.company || target.company,
      resolvedSlug: slug,
      sourceUrl: url,
      ycTitle: parsed.title,
      oneLiner: parsed.oneLiner,
      description: parsed.description,
      batch: parsed.batch,
      website: parsed.website,
      domain: parsed.domain,
      founders: parsed.founders,
    };
  }

  return null;
}

function parseCompanyPage(html: string, slug: string) {
  const titleRaw = matchFirst(html, /<title>([^<]+)\s+\|\s+Y Combinator<\/title>/i);
  if (!titleRaw) {
    return null;
  }

  const description = decodeHtml(matchFirst(html, /<meta content="([^"]+)" name="description"\s*\/?>/i) || "");
  const website = decodeHtml(
    matchFirst(html, /<a href="([^"]+)"[^>]*aria-label="Company website"/i) ||
      matchFirst(html, /data-tooltip-content="(https?:\/\/[^"]+)"[^>]*aria-label="Company website"/i) ||
      "",
  );
  const batch = decodeHtml(matchFirst(html, /<span>Batch:<\/span><span[^>]*>([^<]+)<\/span>/i) || "");

  const title = decodeHtml(titleRaw);
  const [companyPart, ...rest] = title.split(":");
  const company = companyPart.trim();
  const oneLiner = rest.join(":").trim();
  const domain = website ? normalizeDomain(website) : null;
  const founders = extractFounders(description, company);

  if (!company || !oneLiner || !domain) {
    return null;
  }

  return {
    slug,
    title,
    company,
    oneLiner,
    description,
    batch,
    website,
    domain,
    founders,
  };
}

function extractFounders(description: string, company: string): string[] {
  if (!description.includes("Founded in ")) {
    return [];
  }

  const companyMarker = `, ${company} `;
  const companyIndex = description.indexOf(companyMarker);
  let foundersText = "";

  if (companyIndex !== -1) {
    const foundedIndex = description.lastIndexOf("Founded in ", companyIndex);
    const byIndex = description.indexOf(" by ", foundedIndex);
    if (foundedIndex !== -1 && byIndex !== -1 && byIndex < companyIndex) {
      foundersText = description.slice(byIndex + 4, companyIndex).trim();
    }
  }

  if (!foundersText) {
    foundersText =
      matchFirst(description, /Founded in \d{4} by (.+?)(?:, [^.]+ has|\.)/i)?.trim() ||
      "";
  }

  if (!foundersText) {
    return [];
  }

  return foundersText
    .replace(/, and /gi, ",")
    .replace(/\sand\s/gi, ",")
    .split(",")
    .map((founder) => founder.trim())
    .filter(Boolean);
}

function toContacts(target: EnrichedTarget): ContactRecord[] {
  if (!target.domain) {
    return [];
  }

  const founders = target.founders.length ? target.founders : ["Founder"];
  return founders.map((founderName) => ({
    company: target.company,
    batch: target.batch,
    ycSlug: target.resolvedSlug,
    ycUrl: target.sourceUrl,
    oneLiner: target.oneLiner,
    website: target.website || "",
    domain: target.domain || "",
    founderName,
    emailGuess: guessEmail(founderName, target.domain || ""),
    emailPattern: "first@domain",
    source: "y_combinator",
    emailVerified: false,
  }));
}

function guessEmail(founderName: string, domain: string) {
  const firstToken = founderName
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z]/g, ""))
    .find(Boolean);
  const localPart = (firstToken || "founder").toLowerCase();
  return `${localPart}@${domain}`;
}

async function ingestContacts(
  baseUrl: string,
  workspaceId: string,
  contacts: ContactRecord[],
  autoGenerateSequence: boolean,
) {
  const existingEmails = await loadExistingEmails(baseUrl, workspaceId);
  const results: Array<{
    contact: ContactRecord;
    ok: boolean;
    status: number;
    body: ImportResult | { error?: string; details?: unknown } | string;
  }> = [];

  for (const contact of contacts) {
    if (existingEmails.has(contact.emailGuess.toLowerCase())) {
      results.push({
        contact,
        ok: true,
        status: 208,
        body: "Skipped existing person email",
      });
      continue;
    }

    const payload = {
      source: "y_combinator",
      title: `YC founder signal: ${contact.founderName} at ${contact.company}`,
      content: `${contact.company} - ${contact.oneLiner}. Founder: ${contact.founderName}. Suggested email pattern: ${contact.emailGuess} (unverified).`,
      evidenceUrls: [contact.ycUrl],
      account: {
        name: contact.company,
        domain: contact.domain,
        summary: contact.oneLiner,
      },
      person: {
        name: contact.founderName,
        role: "Founder",
        email: contact.emailGuess,
      },
      autoGenerateSequence,
    };

    const response = await fetch(`${baseUrl}/v2/workspaces/${workspaceId}/signals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    let parsedBody: ImportResult | { error?: string; details?: unknown } | string = bodyText;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      parsedBody = bodyText;
    }

    results.push({
      contact,
      ok: response.ok,
      status: response.status,
      body: parsedBody,
    });

    if (response.ok) {
      existingEmails.add(contact.emailGuess.toLowerCase());
    }
  }

  return results;
}

function summarizeIngestResults(
  results: Array<{
    ok: boolean;
    status: number;
  }>,
) {
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const result of results) {
    if (result.status === 208) {
      skipped += 1;
    } else if (result.ok) {
      ok += 1;
    } else {
      failed += 1;
    }
  }

  return { ok, failed, skipped };
}

async function loadExistingEmails(baseUrl: string, workspaceId: string) {
  const response = await fetch(`${baseUrl}/v2/workspaces/${workspaceId}/prospects/people`, {
    headers: { "user-agent": USER_AGENT },
  });

  if (!response.ok) {
    return new Set<string>();
  }

  const body = (await response.json()) as { people?: Array<{ email?: string | null }> };
  return new Set(
    (body.people || [])
      .map((person) => person.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );
}

function normalizeDomain(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchFirst(input: string, pattern: RegExp) {
  return input.match(pattern)?.[1] || null;
}

function decodeHtml(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toCsv(records: ContactRecord[]) {
  const headers = [
    "company",
    "batch",
    "ycSlug",
    "ycUrl",
    "oneLiner",
    "website",
    "domain",
    "founderName",
    "emailGuess",
    "emailPattern",
    "source",
    "emailVerified",
  ];

  const rows = records.map((record) =>
    [
      record.company,
      record.batch,
      record.ycSlug,
      record.ycUrl,
      record.oneLiner,
      record.website,
      record.domain,
      record.founderName,
      record.emailGuess,
      record.emailPattern,
      record.source,
      String(record.emailVerified),
    ].map(csvEscape).join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
