import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const urlParam = request.nextUrl.searchParams.get("url");

  if (!urlParam) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    // Normalize Pixeldrain URLs if needed
    let targetUrl = urlParam.trim();
    targetUrl = targetUrl.replace(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i, "pixeldrain.com/api/file/$1");

    // Forward range header for video streaming
    const range = request.headers.get("range");
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    };

    if (range) {
      headers["Range"] = range;
    }

    const upstreamResponse = await fetch(targetUrl, {
      headers,
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      return new NextResponse(`Error fetching resource: ${upstreamResponse.statusText}`, {
        status: upstreamResponse.status,
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    // Pass through video streaming headers
    const contentType = upstreamResponse.headers.get("content-type");
    const contentLength = upstreamResponse.headers.get("content-length");
    const contentRange = upstreamResponse.headers.get("content-range");
    const acceptRanges = upstreamResponse.headers.get("accept-ranges");

    if (contentType) responseHeaders.set("Content-Type", contentType);
    if (contentLength) responseHeaders.set("Content-Length", contentLength);
    if (contentRange) responseHeaders.set("Content-Range", contentRange);
    if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("Proxy route error:", error);
    return new NextResponse(error?.message || "Internal server error", { status: 500 });
  }
}
