import { ExternalServiceError } from "../utils/errors";

export type HttpRequestOptions = {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
};

export async function requestJson<T>(options: HttpRequestOptions): Promise<T> {
  const { url, method = "GET", body, headers } = options;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ExternalServiceError("http", `Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ExternalServiceError) {
      throw error;
    }

    throw new ExternalServiceError("http", "External service is unavailable");
  }
}
