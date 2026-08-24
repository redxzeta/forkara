// FILE: xPost/httpRoute.ts
// Purpose: Receive the user-driven X OAuth redirect and hand its one-shot state/code to the
// server-owned X service. This route is intentionally unauthenticated: OAuth state + PKCE are the
// callback credential, and the external browser does not carry Forkara's app session.

import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { X_OAUTH_CALLBACK_PATH } from "./Layers/XPostService";
import { XPostService } from "./Services/XPostService";

const CALLBACK_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export function xOAuthCallbackHtml(success: boolean): string {
  const title = success ? "X account connected" : "X connection failed";
  const detail = success
    ? "Your X account is connected. You can close this page and return to Forkara."
    : "Forkara could not complete this connection. Close this page and retry from Settings.";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:2rem;color:#18181b;background:#fafafa}main{border:1px solid #d4d4d8;border-radius:1rem;padding:1.5rem;background:white}h1{font-size:1.35rem;margin:0 0 .75rem}p{line-height:1.55;margin:0;color:#52525b}</style></head><body><main><h1>${title}</h1><p>${detail}</p></main></body></html>`;
}

export const xPostRouteLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const xPostService = yield* XPostService;
    yield* router.add(
      "GET",
      X_OAUTH_CALLBACK_PATH,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = HttpServerRequest.toURL(request);
        const success = url
          ? yield* xPostService
              .completeConnect({
                state: url.searchParams.get("state"),
                code: url.searchParams.get("code"),
                error: url.searchParams.get("error"),
              })
              .pipe(
                Effect.as(true),
                // The browser gets only a generic result. Typed details remain in the app's
                // connection status and never place provider payloads or credentials in HTML.
                Effect.catch(() => Effect.succeed(false)),
              )
          : false;
        return HttpServerResponse.text(xOAuthCallbackHtml(success), {
          status: success ? 200 : 400,
          contentType: "text/html; charset=utf-8",
          headers: CALLBACK_HEADERS,
        });
      }),
    );
  }),
);
