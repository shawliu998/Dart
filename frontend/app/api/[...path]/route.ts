import { NextRequest } from "next/server";

const backendUrl = process.env.BIDEVIDENCE_BACKEND_URL;
const desktopToken = process.env.BIDEVIDENCE_DESKTOP_TOKEN;

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  if (!backendUrl || !desktopToken) return Response.json({ detail: "Desktop backend is unavailable" }, { status: 503 });
  const { path } = await context.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, backendUrl);
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("authorization", `Bearer ${desktopToken}`);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    // Next must preserve multipart streams without trying to buffer them.
    // @ts-expect-error Node fetch supports duplex for request streams.
    duplex: "half",
  });
  const responseHeaders = new Headers();
  const responseContentType = response.headers.get("content-type");
  const disposition = response.headers.get("content-disposition");
  if (responseContentType) responseHeaders.set("content-type", responseContentType);
  if (disposition) responseHeaders.set("content-disposition", disposition);
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
