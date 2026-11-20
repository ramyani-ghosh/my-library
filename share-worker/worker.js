/*
 * My Library: short share links.
 *
 * The site packs a library into a compressed, URL-safe string. Posting that
 * string here stores it in Workers KV and returns a short ID; the share link
 * then carries only the ID (…/my-library/#s=ID). The ID is derived from the
 * content, so sharing the same library twice gives the same link and stores
 * it once.
 *
 *   POST /s        body: the packed library   → { "id": "Ab3dE9xQk2Lm" }
 *   GET  /s/:id                               → the packed library
 */

const ALLOWED_ORIGINS = [
  "https://ramyani-ghosh.github.io",   // the live site
  "http://127.0.0.1:8738",             // local preview
  "http://localhost:8738",
];
const MAX_BYTES = 300_000;              // ~10x a 200-book library with reviews
const PACKED = /^[A-Za-z0-9_-]+$/;      // base64url, as the site produces
const ID = /^[A-Za-z0-9]{12}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const reply = (body, status = 200, extra = {}) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": typeof body === "string" ? "text/plain" : "application/json", ...cors, ...extra },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // Store a library.
    if (request.method === "POST" && url.pathname === "/s") {
      if (!ALLOWED_ORIGINS.includes(origin)) return reply({ error: "Not allowed from this site." }, 403);
      const len = Number(request.headers.get("Content-Length") || 0);
      if (len > MAX_BYTES) return reply({ error: "Library too large to share." }, 413);
      const packed = (await request.text()).trim();
      if (!packed || packed.length > MAX_BYTES || !PACKED.test(packed)) {
        return reply({ error: "That doesn't look like a packed library." }, 400);
      }
      const id = await contentId(packed);
      if ((await env.SHARES.get(id)) === null) await env.SHARES.put(id, packed);
      return reply({ id }, 201);
    }

    // Fetch a library. Stored libraries never change, so they cache well.
    const m = url.pathname.match(/^\/s\/([^/]+)$/);
    if (request.method === "GET" && m) {
      if (!ID.test(m[1])) return reply({ error: "Bad link." }, 400);
      const packed = await env.SHARES.get(m[1]);
      if (packed === null) return reply({ error: "No library found for that link." }, 404);
      return reply(packed, 200, { "Cache-Control": "public, max-age=31536000, immutable" });
    }

    return reply({ error: "Not found." }, 404);
  },
};

// 12 base62 characters from SHA-256 of the content (~71 bits).
async function contentId(text) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let n = 0n;
  for (const b of digest.slice(0, 12)) n = (n << 8n) | BigInt(b);
  let id = "";
  for (let i = 0; i < 12; i++) { id += alphabet[Number(n % 62n)]; n /= 62n; }
  return id;
}
