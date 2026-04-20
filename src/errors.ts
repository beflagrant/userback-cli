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
