export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function asHttpError(error) {
  if (error instanceof HttpError) return error;
  return new HttpError(500, "INTERNAL_ERROR", "Unexpected server error");
}
