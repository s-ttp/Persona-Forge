import { NextRequest, NextResponse } from "next/server";

// No timeout cap — LLM synthesis can take 30-120 seconds
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BACKEND = "http://127.0.0.1:5000";

async function proxy(
  req: NextRequest,
  { params }: { params: { projectId: string; action: string } }
) {
  const search = new URL(req.url).search;
  const target = `${BACKEND}/output/${params.projectId}/${params.action}${search}`;

  const upstreamHeaders = new Headers();
  req.headers.forEach((v, k) => {
    // strip hop-by-hop headers that would confuse the upstream
    if (!["host", "connection", "transfer-encoding"].includes(k.toLowerCase())) {
      upstreamHeaders.set(k, v);
    }
  });

  const upstream = await fetch(target, {
    method: req.method,
    headers: upstreamHeaders,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error duplex required for streaming request bodies
    duplex: "half",
  });

  const downstreamHeaders = new Headers();
  upstream.headers.forEach((v, k) => {
    if (!["transfer-encoding", "connection"].includes(k.toLowerCase())) {
      downstreamHeaders.set(k, v);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: downstreamHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
