import { NextRequest, NextResponse } from "next/server";
import { removeSubscription } from "@/lib/subscriptions";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const removed = id ? removeSubscription(id) : false;

  const message = removed
    ? "You've been unsubscribed from Cineboxd alerts."
    : "This unsubscribe link has already been used or is invalid.";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed — Cineboxd</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { text-align: center; max-width: 420px; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; }
    p { color: #888; margin: 0; }
    a { color: #10b981; text-decoration: none; display: inline-block; margin-top: 1.5rem; font-size: 0.875rem; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${removed ? "Unsubscribed" : "Link invalid"}</h1>
    <p>${message}</p>
    <a href="/">Back to Cineboxd</a>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
