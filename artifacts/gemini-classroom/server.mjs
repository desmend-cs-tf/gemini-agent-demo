/**
 * GEMINI CLASSROOM — file 1 of 2. Requires Node.js 22+, no packages.
 * Put this beside index.html, set GEMINI_API_KEY in your environment,
 * and run: node server.mjs
 *
 * Replit: add GEMINI_API_KEY in Secrets, then restart the app.
 * Get a key: https://aistudio.google.com/api-keys
 * This is a classroom demo, not a public, authenticated service.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const base = (process.env.BASE_PATH || "/").replace(/\/?$/, "/");
const port = Number(process.env.PORT || 3000);
const file = (name) => new URL(name, import.meta.url);
let active = 0;
let requests = [];

function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function validate(input) {
  if (!input || typeof input !== "object") throw new Error("Expected a JSON object.");
  const { systemPrompt, userPrompt, model, temperature, maxOutputTokens, topP, responseMimeType } = input;
  if (typeof systemPrompt !== "string" || systemPrompt.length > 10000)
    throw new Error("System prompt must be text, at most 10,000 characters.");
  if (typeof userPrompt !== "string" || !userPrompt.trim() || userPrompt.length > 10000)
    throw new Error("Enter a user prompt, at most 10,000 characters.");
  if (typeof model !== "string" || !/^gemini-[a-zA-Z0-9._-]{1,100}$/.test(model))
    throw new Error("Use a Gemini model ID, such as gemini-2.5-flash.");
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
    throw new Error("Temperature must be between 0 and 2.");
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 128 || maxOutputTokens > 8192)
    throw new Error("Max output tokens must be a whole number between 128 and 8192.");
  if (!Number.isFinite(topP) || topP < 0 || topP > 1)
    throw new Error("Top P must be between 0 and 1.");
  if (!["text/plain", "application/json"].includes(responseMimeType))
    throw new Error("Response format must be text/plain or application/json.");
  return input;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 40000) throw new Error("Request is too large.");
  }
  try { return JSON.parse(body); }
  catch { throw new Error("Send a valid JSON request."); }
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://classroom.local").pathname;
    if (req.method === "GET" && pathname === `${base}status`) {
      // Only return whether a key exists. Never return the key itself.
      return json(res, 200, { configured: Boolean(process.env.GEMINI_API_KEY) });
    }
    if (req.method === "GET" && [base, `${base}index.html`, `${base}source/server.mjs`, `${base}source/index.html`].includes(pathname)) {
      const download = pathname.startsWith(`${base}source/`);
      const name = pathname.endsWith("server.mjs") ? "server.mjs" : "index.html";
      const content = await readFile(file(name));
      res.writeHead(200, {
        "Content-Type": download ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(download ? { "Content-Disposition": `attachment; filename="${name}"` } : {}),
      });
      return res.end(content);
    }
    if (req.method !== "POST" || pathname !== `${base}generate`)
      return json(res, 404, { error: "Not found." });

    // Only accept browser requests from this site, not cross-site form submissions.
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return json(res, 415, { error: "Use Content-Type: application/json." });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return json(res, 403, { error: "Cross-site requests are not allowed." });

    let input;
    try { input = validate(await readJson(req)); }
    catch (error) { return json(res, 400, { error: error.message }); }

    const key = process.env.GEMINI_API_KEY;
    if (!key) return json(res, 503, {
      error: "Add GEMINI_API_KEY in Replit Secrets and restart the app. See the Setup guide. No request was sent to Google.",
    });

    // Small shared classroom limit: at most 10 requests/minute, 2 at once.
    requests = requests.filter((time) => Date.now() - time < 60000);
    if (requests.length >= 10 || active >= 2)
      return json(res, 429, { error: "Classroom request limit reached. Wait a minute and try again." });
    requests.push(Date.now());
    active++;
    const started = Date.now();
    try {
      // 1. SYSTEM PROMPT: instructions about how the model should behave.
      // 2. USER PROMPT: the particular question or task for this request.
      // 3. CONFIG: controls for sampling, output length, and output format.
      const body = {
        ...(input.systemPrompt.trim() ? {
          systemInstruction: { parts: [{ text: input.systemPrompt }] },
        } : {}),
        contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
        generationConfig: {
          temperature: input.temperature,
          maxOutputTokens: input.maxOutputTokens,
          topP: input.topP,
          responseMimeType: input.responseMimeType,
        },
      };
      // The API key is read server-side and sent only to Google's API.
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(60000),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        const messages = {
          400: "Google rejected the request. Check your API key, model settings, and prompt.",
          401: "Google could not authenticate this API key. Replace it in Secrets and restart.",
          403: "Google denied access. Check the key, project permissions, and account or region eligibility.",
          404: "This model is unavailable. Enter a model ID available in Google AI Studio.",
          429: "Google quota or rate limit reached. Check your project's quota and billing, or try later.",
        };
        return json(res, response.status, {
          error: messages[response.status] || `Google API error (${response.status}). Try again later.`,
        });
      }
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text).join("\n");
      if (!text) return json(res, 422, {
        error: data.promptFeedback?.blockReason
          ? `Google blocked this prompt (${data.promptFeedback.blockReason}). Try a different classroom-safe prompt.`
          : `No answer text returned (${candidate?.finishReason || "unknown reason"}). Try a different prompt or increase max output tokens.`,
      });
      const usage = data.usageMetadata || {};
      return json(res, 200, {
        text,
        finishReason: candidate?.finishReason || "UNKNOWN",
        usage: {
          promptTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0,
        },
        elapsedMs: Date.now() - started,
      });
    } catch (error) {
      return json(res, 502, {
        error: error.name === "TimeoutError"
          ? "Google took longer than 60 seconds. Try a shorter prompt."
          : "Unable to reach Google. Check your connection and try again.",
      });
    } finally {
      active--;
    }
  } catch {
    if (!res.headersSent) json(res, 500, { error: "The classroom server could not complete the request." });
    else res.end();
  }
}).listen(port, "0.0.0.0");
