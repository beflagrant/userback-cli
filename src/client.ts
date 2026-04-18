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
  createdAt?: string;
  [key: string]: unknown;
}

export interface Comment {
  id: number;
  feedbackId?: number;
  comment?: string;
  createdAt?: string;
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
