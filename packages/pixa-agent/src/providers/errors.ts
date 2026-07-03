/** Thrown when a provider is rate-limited (HTTP 429). Carries the server's suggested wait. */
export class RateLimitError extends Error {
  constructor(
    public retryAfterSeconds: number,
    message: string
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}
