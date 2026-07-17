import "dotenv/config";
import express, { type Request, type Response } from "express";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const PORT: number = Number(process.env.PORT) || 8080;

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "pixa-gateway", mode: "byok" });
});

/**
 * Stateless BYOK proxy: forwards the client's Authorization bearer (their
 * OpenRouter key) upstream. No server-side keys or gateway tokens.
 */
app.post("/v1/chat", async (req: Request, res: Response): Promise<void> => {
  const auth = req.header("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth)) {
    res.status(401).json({
      error: { message: "Missing OpenRouter API key. Send Authorization: Bearer <key>." },
    });
    return;
  }

  const upstreamController = new AbortController();

  // If the client (extension) disconnects or hits Stop, cancel the
  // upstream request immediately rather than leaving it running.
  req.on("close", () => upstreamController.abort());

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
  } catch (err: unknown) {
    if (upstreamController.signal.aborted) return; // client already gone
    console.error("Failed to reach OpenRouter:", err);
    res.status(502).json({ error: { message: "Gateway could not reach OpenRouter." } });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text || JSON.stringify({ error: { message: `Upstream error ${upstream.status}` } }));
    return;
  }

  res.writeHead(upstream.status, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const nodeStream = Readable.fromWeb(upstream.body as NodeWebReadableStream<Uint8Array>);
  nodeStream.pipe(res);

  req.on("close", () => {
    if (!nodeStream.destroyed) nodeStream.destroy();
  });
});

app.listen(PORT, () => {
  console.log(`Pixa gateway (BYOK) listening on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
});
