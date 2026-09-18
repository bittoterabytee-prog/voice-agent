export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(message: string, statusCode = 500, code = "INTERNAL_ERROR", expose = false) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }
}

export class ExternalServiceError extends AppError {
  readonly service: string;

  constructor(service: string, message = "External service is unavailable") {
    super(message, 502, "EXTERNAL_SERVICE_UNAVAILABLE", true);
    this.name = "ExternalServiceError";
    this.service = service;
  }
}

export class InvalidRelationshipError extends AppError {
  constructor(message = "The referenced record does not exist") {
    super(message, 400, "INVALID_RELATIONSHIP", true);
    this.name = "InvalidRelationshipError";
  }
}

export function isPostgresForeignKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23503"
  );
}
