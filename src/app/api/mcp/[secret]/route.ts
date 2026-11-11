// Admin MCP endpoint (Streamable HTTP, stateless, JSON responses).
// The URL path carries a long secret (MCP_SECRET); without it nothing is reachable.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { tools } from "@/lib/mcp-tools";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SERVER_INFO = { name: "indieinterviewer-admin", version: "1.0.0" };
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

function authorized(secret: string) {
  const expected = process.env.MCP_SECRET || "";
  if (expected.length < 32) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: Rpc) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });
  switch (msg.method) {
    case "initialize": {
      const requested = String(msg.params?.protocolVersion ?? "");
      return reply({
        protocolVersion: SUPPORTED.includes(requested) ? requested : SUPPORTED[0],
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: "Admin of IndieInterviewer: founder interviews for Indie Hustle and Founders Struggles. Use list_interviews or publication_queue to see the state, get_interview for details. Actions that email founders: create_interview (with send_invitation), resend_invitation, send_for_approval, set_publication_date.",
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, ...(annotations ? { annotations } : {}) })) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const tool = tools.find((t) => t.name === name);
      if (!tool) return fail(-32602, `Unknown tool: ${name}`);
      try {
        const out = await tool.run((msg.params?.arguments as Record<string, unknown>) ?? {});
        const isError = typeof out === "object" && out !== null && "ok" in out && (out as { ok: boolean }).ok === false;
        return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError });
      } catch (err) {
        return reply({ content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!authorized(secret)) return new NextResponse("Not found", { status: 404 });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const batch = Array.isArray(body) ? (body as Rpc[]) : [body as Rpc];
  const responses = [];
  for (const m of batch) {
    if (m && typeof m === "object" && m.id === undefined) continue; // notification
    responses.push(await handle(m));
  }
  if (responses.length === 0) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? responses : responses[0]);
}

export async function GET(_req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!authorized(secret)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse("Method not allowed", { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405 });
}
