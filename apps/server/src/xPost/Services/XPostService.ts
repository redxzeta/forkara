import type {
  XBeginConnectResult,
  XConnectionStatus,
  XCreatePostInput,
  XCreatePostResult,
  XPostError,
} from "@forkara/contracts";
import { Effect, ServiceMap } from "effect";

export interface XOAuthCallbackInput {
  readonly state: string | null;
  readonly code: string | null;
  readonly error: string | null;
}

export interface XPostServiceShape {
  /** Keep loopback callback URLs correct when a test/embedded server binds port zero. */
  readonly setListeningPort: (port: number) => void;
  readonly getConnectionStatus: Effect.Effect<XConnectionStatus, XPostError>;
  readonly beginConnect: Effect.Effect<XBeginConnectResult, XPostError>;
  readonly completeConnect: (
    input: XOAuthCallbackInput,
  ) => Effect.Effect<XConnectionStatus, XPostError>;
  readonly disconnect: Effect.Effect<XConnectionStatus, XPostError>;
  readonly createPost: (input: XCreatePostInput) => Effect.Effect<XCreatePostResult, XPostError>;
}

export class XPostService extends ServiceMap.Service<XPostService, XPostServiceShape>()(
  "synara/xPost/Services/XPostService",
) {}
