// Error Handling Utilities

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class NetworkError extends Error {
  constructor(message: string = "Network request failed") {
    super(message);
    this.name = "NetworkError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public fields?: Record<string, string>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Get user-friendly error message from error object
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    return error.message;
  }

  if (error instanceof NetworkError) {
    return "Unable to connect to the server. Please check your internet connection.";
  }

  if (error instanceof ValidationError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred. Please try again.";
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    shouldRetry = (error) => {
      // Retry on network errors and 5xx server errors
      if (error instanceof NetworkError) return true;
      if (error instanceof APIError && error.statusCode && error.statusCode >= 500) return true;
      return false;
    },
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this is the last attempt or if we shouldn't retry this error
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * backoffFactor, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Handle API errors and convert to appropriate error types
 */
export function handleAPIError(response: Response, data: any): never {
  const message = data?.message || response.statusText || "API request failed";

  if (response.status >= 400 && response.status < 500) {
    // Client errors (4xx)
    if (response.status === 400 && data?.fields) {
      throw new ValidationError(message, data.fields);
    }
    throw new APIError(message, response.status, data?.code);
  }

  if (response.status >= 500) {
    // Server errors (5xx)
    throw new APIError(
      "Server error occurred. Please try again later.",
      response.status,
      data?.code
    );
  }

  throw new APIError(message, response.status, data?.code);
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof APIError && error.statusCode && error.statusCode >= 500) return true;
  return false;
}

/**
 * Log error to console (and optionally to error reporting service)
 */
export function logError(error: unknown, context?: Record<string, any>) {
  console.error("Error occurred:", error, context);

  // In production, send to error reporting service (e.g., Sentry)
  if (import.meta.env.PROD) {
    // Example: Sentry.captureException(error, { extra: context });
  }
}

