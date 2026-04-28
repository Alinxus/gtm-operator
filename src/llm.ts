import { z } from "zod";

// ---------------------------------------------------------------------------
// Tool calling types (OpenAI Chat Completions compatible)
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Internal message format for the agent loop (OpenAI Chat Completions shape) */
export type AgentMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface GenerateWithToolsResult {
  type: "text" | "tool_calls";
  text?: string;
  toolCalls?: ToolCall[];
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface LanguageModelProvider {
  readonly enabled: boolean;
  readonly provider: "disabled" | "openai" | "anthropic";
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
  generateWithTools(input: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<GenerateWithToolsResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Disabled provider
// ---------------------------------------------------------------------------

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

  async generateWithTools(_: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<GenerateWithToolsResult> {
    throw new Error("Language model provider is disabled.");
  }
}

// ---------------------------------------------------------------------------
// OpenAI provider (Responses API for text/object, Chat Completions for tools)
// ---------------------------------------------------------------------------

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

  async generateWithTools(input: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<GenerateWithToolsResult> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: [{ role: "system", content: input.system }, ...input.messages],
        tools: input.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxOutputTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`OpenAI chat/completions request failed: ${response.status} ${response.statusText}${message ? ` - ${message}` : ""}`);
    }

    const payload = await response.json() as any;
    const choice = payload?.choices?.[0];
    if (!choice) throw new Error("OpenAI chat/completions returned no choices.");

    const msg = choice.message;
    if (msg?.tool_calls?.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: msg.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments ?? "{}"),
        })),
      };
    }

    return { type: "text", text: msg?.content ?? "" };
  }
}

// ---------------------------------------------------------------------------
// Anthropic provider (Messages API with native tool use)
// ---------------------------------------------------------------------------

export class AnthropicLanguageModelProvider implements LanguageModelProvider {
  readonly enabled = true as const;
  readonly provider = "anthropic" as const;

  private readonly baseUrl = "https://api.anthropic.com/v1";
  private readonly anthropicVersion = "2023-06-01";

  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
    },
  ) {}

  private async callMessages(body: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.options.apiKey,
        "anthropic-version": this.anthropicVersion,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(`Anthropic request failed: ${response.status} ${response.statusText}${message ? ` - ${message}` : ""}`);
    }

    return response.json();
  }

  async generateText(input: {
    system: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string> {
    const payload = await this.callMessages({
      model: this.options.model,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxOutputTokens ?? 1200,
    });

    const block = payload?.content?.find((b: any) => b.type === "text");
    if (!block?.text) throw new Error("Anthropic returned no text content.");
    return block.text;
  }

  async generateObject<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<T> {
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

  async generateWithTools(input: {
    system: string;
    messages: AgentMessage[];
    tools: ToolDefinition[];
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<GenerateWithToolsResult> {
    // Convert AgentMessage[] to Anthropic format
    const anthropicMessages: any[] = [];
    for (const msg of input.messages) {
      if (msg.role === "user") {
        anthropicMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        if (msg.tool_calls?.length) {
          anthropicMessages.push({
            role: "assistant",
            content: msg.tool_calls.map((tc) => ({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments ?? "{}"),
            })),
          });
        } else {
          anthropicMessages.push({ role: "assistant", content: msg.content ?? "" });
        }
      } else if (msg.role === "tool") {
        // Tool results go as user messages in Anthropic format
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        const resultBlock = { type: "tool_result", tool_use_id: msg.tool_call_id, content: msg.content };
        if (lastMsg?.role === "user" && Array.isArray(lastMsg.content)) {
          lastMsg.content.push(resultBlock);
        } else {
          anthropicMessages.push({ role: "user", content: [resultBlock] });
        }
      }
    }

    const payload = await this.callMessages({
      model: this.options.model,
      system: input.system,
      messages: anthropicMessages,
      tools: input.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxOutputTokens ?? 2048,
    });

    const toolUseBlocks = (payload?.content ?? []).filter((b: any) => b.type === "tool_use");
    if (toolUseBlocks.length > 0) {
      return {
        type: "tool_calls",
        toolCalls: toolUseBlocks.map((b: any) => ({
          id: b.id,
          name: b.name,
          arguments: b.input ?? {},
        })),
      };
    }

    const textBlock = (payload?.content ?? []).find((b: any) => b.type === "text");
    return { type: "text", text: textBlock?.text ?? "" };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLanguageModelProvider(options: {
  provider: "disabled" | "openai" | "anthropic";
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

  if (options.provider === "anthropic") {
    if (!options.apiKey || !options.model) {
      throw new Error("Anthropic language model provider requires apiKey and model.");
    }
    return new AnthropicLanguageModelProvider({
      apiKey: options.apiKey,
      model: options.model,
    });
  }

  return new DisabledLanguageModelProvider();
}
