const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const dynamic = "force-dynamic";

function resolveApiBase(request: Request): string {
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    return API_BASE_URL.replace(/\/+$/, "");
  }

  return new URL(API_BASE_URL.replace(/\/+$/, "") || "/", request.url).toString().replace(/\/+$/, "");
}

async function proxyApiJson(request: Request, path: string): Promise<Response> {
  const upstream = await fetch(`${resolveApiBase(request)}${path}`, {
    cache: "no-store",
    headers: {
      accept: "application/json"
    }
  });
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "cache-control": "no-store",
      "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8"
    }
  });
}

export async function GET(request: Request): Promise<Response> {
  return proxyApiJson(request, "/runtime-config");
}
