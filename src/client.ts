export class UserbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserbackError";
  }
}

export class ConfigError extends UserbackError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class NetworkError extends UserbackError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export class HTTPError extends UserbackError {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "HTTPError";
  }
}

export class UnauthorizedError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "ValidationError";
  }
}

export class ServerError extends HTTPError {
  constructor(status: number, body: unknown, message: string) {
    super(status, body, message);
    this.name = "ServerError";
  }
}

export interface Feedback {
  id: number;
  projectId?: number;
  feedbackType?: string;
  title?: string;
  description?: string;
  priority?: string;
  category?: string;
  rating?: string;
  created?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface Comment {
  id: number;
  feedbackId?: number;
  comment?: string;
  created?: string;
  [key: string]: unknown;
}

export interface ListFeedbackOptions {
  page?: number;
  limit?: number;
  sort?: string;
  filter?: string;
}

export interface CreateFeedbackAttrs {
  projectId: number;
  email: string;
  feedbackType: "General" | "Bug" | "Idea";
  title: string;
  description: string;
  priority?: "low" | "neutral" | "high" | "urgent";
}

export interface UpdateFeedbackAttrs {
  feedbackType?: "General" | "Bug" | "Idea";
  title?: string;
  description?: string;
  priority?: "low" | "neutral" | "high" | "urgent";
  Workflow?: { id: number } | { name: string };
}

const DEFAULT_BASE_URL = "https://rest.userback.io/1.0";

function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  throw new UserbackError(
    `Expected a list response (array or {data: []}), got: ${typeof raw}`,
  );
}

type HTTPMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export class UserbackClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    const apiKey = process.env.USERBACK_API_KEY;
    if (!apiKey) {
      throw new ConfigError("USERBACK_API_KEY is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = process.env.USERBACK_BASE_URL ?? DEFAULT_BASE_URL;
  }

  async getFeedback(id: number): Promise<Feedback> {
    return this.request<Feedback>("GET", `/feedback/${id}`);
  }

  async listFeedback(options: ListFeedbackOptions): Promise<Feedback[]> {
    const query: Record<string, string | number | undefined> = {
      page: options.page ?? 1,
      limit: options.limit ?? 25,
      sort: options.sort,
      filter: options.filter,
    };
    const raw = await this.request<unknown>("GET", "/feedback", { query });
    return unwrapList<Feedback>(raw);
  }

  async createFeedback(attrs: CreateFeedbackAttrs): Promise<Feedback> {
    return this.request<Feedback>("POST", "/feedback", { body: attrs });
  }

  async updateFeedback(id: number, attrs: UpdateFeedbackAttrs): Promise<Feedback> {
    return this.request<Feedback>("PATCH", `/feedback/${id}`, { body: attrs });
  }

  async createComment(args: { feedbackId: number; comment: string }): Promise<Comment> {
    return this.request<Comment>("POST", "/feedback/comment", { body: args });
  }

  private async request<T>(
    method: HTTPMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query);
    const init: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new NetworkError(message);
    }

    if (!response.ok) {
      const body = await this.readBody(response);
      const message = this.summarizeError(response.status, body);
      throw this.errorForStatus(response.status, body, message);
    }

    return (await response.json()) as T;
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async readBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }
    try {
      return await response.text();
    } catch {
      return null;
    }
  }

  private summarizeError(status: number, body: unknown): string {
    if (typeof body === "string" && body.length > 0) {
      return `HTTP ${status}: ${body.slice(0, 200)}`;
    }
    if (body && typeof body === "object") {
      try {
        return `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`;
      } catch {
        return `HTTP ${status}`;
      }
    }
    return `HTTP ${status}`;
  }

  private errorForStatus(status: number, body: unknown, message: string): HTTPError {
    if (status === 401) return new UnauthorizedError(status, body, message);
    if (status === 404) return new NotFoundError(status, body, message);
    if (status === 422) return new ValidationError(status, body, message);
    if (status >= 500) return new ServerError(status, body, message);
    return new HTTPError(status, body, message);
  }
}
