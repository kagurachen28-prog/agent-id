import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { generateProfile } from "./profile.js";

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  setCorsHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";

  const timestamp = new Date().toISOString();
  console.log(`${timestamp} ${method} ${url}`);

  // CORS preflight
  if (method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  // Route: GET /api/profile/:username
  const match = url.match(/^\/api\/profile\/([a-zA-Z0-9_-]+)\/?$/);
  if (match && method === "GET") {
    const username = match[1];
    try {
      const profile = await generateProfile(username);
      jsonResponse(res, 200, profile);
    } catch (err: any) {
      const msg = err.message ?? String(err);

      if (msg.includes("rate limit")) {
        jsonResponse(res, 429, { error: "GitHub API rate limit exceeded", detail: msg });
      } else if (msg.includes("not found")) {
        jsonResponse(res, 404, { error: "User not found", username });
      } else {
        console.error(`Error generating profile for ${username}:`, msg);
        jsonResponse(res, 500, { error: "Internal server error" });
      }
    }
    return;
  }

  // Health check
  if (url === "/health" && method === "GET") {
    jsonResponse(res, 200, { status: "ok" });
    return;
  }

  // 404 for everything else
  jsonResponse(res, 404, { error: "Not found" });
}

export function startServer(port: number): void {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("Unhandled error:", err);
      jsonResponse(res, 500, { error: "Internal server error" });
    });
  });

  server.listen(port, () => {
    console.log(`🚀 agent-id server listening on http://localhost:${port}`);
    console.log(`   GET /api/profile/{username} — fetch a profile`);
    console.log(`   GET /health — health check`);
  });
}
