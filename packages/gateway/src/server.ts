import "dotenv/config";
import express, { type Request, type Response } from "express";
import { recordUsage } from "./usageLogger.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PORT: number = Number(process.env.PORT) || 8080;

const app = express();
app.use(express.json({ limit: "10mb" }));

// Basic request logging — without this, "nothing printed" is ambiguous
// between "no requests arrived" and "requests arrived and succeeded
// silently." This makes that distinction visible.
app.use((req: Request, _res: Response, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "pixa-gateway", mode: "byok" });
});

function parseSseChunk(buffer: string): { events: string[]; rest: string } {
  const events: string[] = [];
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    for (const line of part.split(/\r?\n/)) {
      if (line.startsWith("data: ")) {
        events.push(line.slice(6));
      } else if (line.startsWith("data:")) {
        events.push(line.slice(5).trimStart());
      }
    }
  }
  return { events, rest };
}

app.post("/v1/chat", async (req: Request, res: Response): Promise<void> => {
  const auth = req.header("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    res.status(401).json({
      error: { message: "Missing OpenRouter API key. Send Authorization: Bearer <key>." },
    });
    return;
  }
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim();
  const identityLabel = req.header("x-pixa-identity") || null;
  const model = typeof req.body?.model === "string" ? req.body.model : "unknown";

  // Abort upstream only when the *client* drops the connection mid-flight.
  // Do NOT use req.on("close") for this: after express.json() consumes the
  // POST body, Node emits "close" on the IncomingMessage even though the
  // client is still waiting for a response. That was aborting OpenRouter
  // immediately, sending nothing back, and making the extension time out
  // at 90s on every model (free and paid).
  const upstreamController = new AbortController();
  const abortUpstreamIfClientGone = () => {
    if (!res.writableFinished) upstreamController.abort();
  };
  res.on("close", abortUpstreamIfClientGone);

  console.log(`[DEBUG] Connecting to OpenRouter for model=${model}...`);

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: upstreamController.signal,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pixa.dev",
        "X-Title": "Pixa Gateway",
      },
      body: JSON.stringify(req.body),
    });
    console.log(`[DEBUG] OpenRouter responded with status ${upstream.status}`);
  } catch (err: unknown) {
    if (upstreamController.signal.aborted) {
      console.log(`[DEBUG] Request aborted before OpenRouter responded (client disconnected or timed out).`);
      return;
    }
    console.error("Failed to reach OpenRouter:", err);
    res.status(502).json({ error: { message: "Gateway could not reach OpenRouter." } });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    console.log(`[DEBUG] OpenRouter returned a non-OK response: ${upstream.status} ${text.slice(0, 300)}`);
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text || JSON.stringify({ error: { message: `Upstream error ${upstream.status}` } }));
    return;
  }

  console.log(`[DEBUG] Starting to stream response back to client...`);

  res.writeHead(upstream.status, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let estimatedCostUsd: number | null = null;
  let sawUsage = false;

  // Set only when the upstream reader naturally reports done:true.
  // res.on("close") also fires after a normal successful finish, so we
  // gate cancellation on !writableFinished via abortUpstreamIfClientGone.
  let completedNormally = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        completedNormally = true;
        console.log(`[DEBUG] Stream completed normally. promptTokens=${promptTokens} completionTokens=${completionTokens} sawUsage=${sawUsage}`);
        break;
      }

      // Pass raw bytes through to the client untouched.
      res.write(value);

      sseBuffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(sseBuffer);
      sseBuffer = rest;

      for (const ev of events) {
        if (ev === "[DONE]") continue;
        let parsed: any;
        try {
          parsed = JSON.parse(ev);
        } catch {
          continue;
        }
        const u = parsed?.usage;
        if (u && typeof u === "object") {
          sawUsage = true;
          if (typeof u.prompt_tokens === "number") promptTokens = u.prompt_tokens;
          if (typeof u.completion_tokens === "number") completionTokens = u.completion_tokens;
          if (typeof u.cost === "number") estimatedCostUsd = u.cost;
        }
      }
    }
  } catch (err) {
    if (!completedNormally) console.error("[DEBUG] Error while streaming upstream response (stream did NOT complete normally):", err);
  } finally {
    if (!res.writableEnded) res.end();
  }

  console.log(`[DEBUG] Handler exiting. completedNormally=${completedNormally}`);

  if (completedNormally) {
    recordUsage({
      apiKey,
      identityLabel,
      provider: "openrouter",
      model,
      promptTokens,
      completionTokens,
      estimatedCostUsd: sawUsage ? estimatedCostUsd : null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Pixa gateway (BYOK) listening on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
});