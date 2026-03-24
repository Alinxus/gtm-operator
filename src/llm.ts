import { z } from "zod";

export interface LanguageModelProvider {
  readonly enabled: boolean;
  readonly provider: "disabled" | "openai";
  generateText(input: {
    system: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string>;
  generateObject<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<T>;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  if (Array.isArray(payload?.output)) {
    const chunks = payload.output.flatMap((item: any) => {
      if (!Array.isArray(item?.content)) return [];
      return item.content
        .map((part: any) => {
          if (typeof part?.text === "string") return part.text;
          if (typeof part?.output_text === "string") return part.output_text;
          if (typeof part?.content === "string") return part.content;
          return "";
        })
        .filter(Boolean);
    });

    if (chunks.length > 0) return chunks.join("\n").trim();
  }

  return "";
}

function extractJsonCandidate(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);

  return text.trim();
}

export class DisabledLanguageModelProvider implements LanguageModelProvider {
  readonly enabled = false as const;
  readonly provider = "disabled" as const;

  async generateText(_: {
    system: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string> {
    throw new Error("Language model provider is disabled.");
  }

  async generateObject<T>(_: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<T> {
    throw new Error("Language model provider is disabled.");
  }
}

export class OpenAIResponsesLanguageModelProvider implements LanguageModelProvider {
  readonly enabled = true as const;
  readonly provider = "openai" as const;

  constructor(
    private readonly options: {
      apiKey: string;
      baseUrl: string;
      model: string;
    },
  ) {}

  async generateText(input: {
    system: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  }) {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: input.system }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: input.prompt }],
          },
        ],
        temperature: input.temperature ?? 0.2,
        max_output_tokens: input.maxOutputTokens ?? 1200,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`OpenAI responses request failed: ${response.status} ${response.statusText}${message ? ` - ${message}` : ""}`);
    }

    const payload = await response.json().catch(() => ({} as Record<string, unknown>));
    const text = extractOutputText(payload);
    if (!text) {
      throw new Error("OpenAI responses request returned no output text.");
    }
    return text;
  }

  async generateObject<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxOutputTokens?: number;
  }) {
    const text = await this.generateText({
      system: input.system,
      prompt: `${input.prompt}\n\nReturn valid JSON only.`,
      temperature: input.temperature,
      maxOutputTokens: input.maxOutputTokens,
    });

    const candidate = extractJsonCandidate(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (error) {
      throw new Error(`Model returned invalid JSON: ${(error as Error).message}`);
    }

    return input.schema.parse(parsed);
  }
}

export function createLanguageModelProvider(options: {
  provider: "disabled" | "openai";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}): LanguageModelProvider {
  if (options.provider === "openai") {
    if (!options.apiKey || !options.baseUrl || !options.model) {
      throw new Error("OpenAI language model provider requires apiKey, baseUrl, and model.");
    }
    return new OpenAIResponsesLanguageModelProvider({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      model: options.model,
    });
  }

  return new DisabledLanguageModelProvider();
}
