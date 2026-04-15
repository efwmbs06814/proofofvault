import { API_CONFIG, API_ENDPOINTS } from "./config";

export { API_ENDPOINTS };

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: object;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: object
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildUrl(endpoint: string): string {
  if (endpoint.startsWith("http")) {
    return endpoint;
  }

  return `${API_CONFIG.baseUrl}${endpoint}`;
}

function isWrappedResponse(payload: unknown): payload is ApiResponse<unknown> {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "success" in payload &&
      typeof (payload as { success?: unknown }).success === "boolean"
  );
}

async function handleResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();

  if (!response.ok) {
    const normalizedError =
      payload && typeof payload === "object"
        ? {
            code:
              (payload as { code?: string; error?: string }).code ??
              (payload as { error?: string }).error ??
              "UNKNOWN_ERROR",
            message:
              (payload as { message?: string }).message ??
              (payload as { error?: string }).error ??
              "Request failed",
            details: (payload as { details?: object }).details
          }
        : {
            code: "UNKNOWN_ERROR",
            message: "Request failed"
          };

    throw new ApiError(normalizedError.message, normalizedError.code, response.status, normalizedError.details);
  }

  if (isWrappedResponse(payload)) {
    return payload as T;
  }

  return {
    success: true,
    data: payload
  } as T;
}

type RequestOptions = {
  headers?: Record<string, string>;
};

function mergeHeaders(headers?: Record<string, string>): HeadersInit {
  return {
    ...API_CONFIG.headers,
    ...(headers ?? {})
  };
}

export async function get<T>(
  endpoint: string,
  params?: Record<string, string | number | undefined>,
  options?: RequestOptions
): Promise<T> {
  let url = buildUrl(endpoint);

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: mergeHeaders(options?.headers)
  });

  return handleResponse<T>(response);
}

export async function post<T>(endpoint: string, body?: object, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(endpoint), {
    method: "POST",
    headers: mergeHeaders(options?.headers),
    body: body ? JSON.stringify(body) : undefined
  });

  return handleResponse<T>(response);
}

export async function put<T>(endpoint: string, body?: object, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(endpoint), {
    method: "PUT",
    headers: mergeHeaders(options?.headers),
    body: body ? JSON.stringify(body) : undefined
  });

  return handleResponse<T>(response);
}

export async function del<T>(endpoint: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(endpoint), {
    method: "DELETE",
    headers: mergeHeaders(options?.headers)
  });

  return handleResponse<T>(response);
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    await get<ApiResponse<{ ok: boolean }>>(API_ENDPOINTS.health);
    return true;
  } catch {
    return false;
  }
}
