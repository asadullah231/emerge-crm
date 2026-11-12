import { eq } from "drizzle-orm";
import { apiKeys, withWorkspace } from "@emerge/db";
import { hashApiKey } from "@/server/api-keys";
import { db } from "@/server/db";
import { MCP_TOOLS, callMcpTool } from "@/server/mcp";
import { clientIp, rateLimit } from "@/server/rate-limit";

/**
 * MCP server endpoint (streamable HTTP, stateless). Claude connects with
 * https://crm.../api/mcp/<api key>; the key lives in the path because
 * claude.ai custom connectors cannot send custom headers without OAuth.
 * The key must carry the "mcp" scope (Settings > API keys). Every tool call
 * runs inside the key's workspace RLS transaction, acting as the key creator.
 */

export const dynamic = "force-dynamic";

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

const SERVER_INFO = { name: "emerge-crm", version: "1.0.0" };
const INSTRUCTIONS =
  "Emerge CRM assistant. Find and manage candidates, job openings and clients, " +
  "move candidates through the pipeline, log notes/calls, create tasks, and pull " +
  "today/week/month reports. Use the find tools first to get record ids.";

function rpcResult(id: number | string | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: number | string | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function authenticateKey(key: string) {
  if (!/^emk_[a-f0-9]{40}$/i.test(key)) return null;
  const [row] = await db
    .select({
      id: apiKeys.id,
      workspaceId: apiKeys.workspaceId,
      scopes: apiKeys.scopes,
      revokedAt: apiKeys.revokedAt,
      createdById: apiKeys.createdById
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(key)));
  if (!row || row.revokedAt || !row.scopes.includes("mcp")) return null;
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch(() => {});
  return row;
}

async function handleMessage(
  msg: JsonRpcMessage,
  auth: { workspaceId: string; createdById: string | null }
): Promise<Record<string, unknown> | null> {
  const id = msg.id ?? null;
  // Notifications (no id) need no response body.
  if (msg.id === undefined || msg.method?.startsWith("notifications/")) return null;

  switch (msg.method) {
    case "initialize": {
      const requested = (msg.params?.protocolVersion as string) ?? "2025-03-26";
      return rpcResult(id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: MCP_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
      try {
        const result = await withWorkspace(db, auth.workspaceId, (tx) =>
          callMcpTool({ tx, workspaceId: auth.workspaceId, actorId: auth.createdById }, name, args)
        );
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool call failed";
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true
        });
      }
    }
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  if (!rateLimit(`mcp:${clientIp(req)}`, 120, 60_000)) {
    return Response.json(rpcError(null, -32000, "Too many requests"), { status: 429 });
  }
  const { key } = await ctx.params;
  const auth = await authenticateKey(key);
  if (!auth) {
    return Response.json(rpcError(null, -32000, "Invalid API key or missing mcp scope"), {
      status: 401
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const messages = Array.isArray(body) ? (body as JsonRpcMessage[]) : [body as JsonRpcMessage];
  const responses: Record<string, unknown>[] = [];
  for (const msg of messages) {
    const res = await handleMessage(msg, auth);
    if (res) responses.push(res);
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  const payload = Array.isArray(body) ? responses : responses[0];
  return Response.json(payload);
}

/** No server-initiated stream: stateless JSON responses only. */
export function GET() {
  return new Response("Method Not Allowed", { status: 405 });
}

export function DELETE() {
  return new Response(null, { status: 202 });
}
