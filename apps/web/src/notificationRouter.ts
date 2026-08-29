// FILE: notificationRouter.ts
// Purpose: Routes the existing toast-manager call surface to portals or session history.
// Layer: Web state

import type { ReactNode } from "react";

import type {
  StatusHistoryAction,
  StatusHistoryEntryInput,
  StatusHistoryManager,
  StatusHistoryTone,
} from "./statusHistory";

export interface RoutedNotificationData {
  readonly stableKey?: string | undefined;
  readonly eventType?: string | undefined;
  readonly threadId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly terminalId?: string | null | undefined;
  readonly branch?: string | null | undefined;
  readonly providerVersionState?: string | null | undefined;
  readonly repository?: string | null | undefined;
  readonly pullRequest?: string | number | null | undefined;
  readonly projectId?: string | null | undefined;
  readonly copyText?: string | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly secondaryActionProps?: RoutedButtonProps | undefined;
  readonly archiveUndo?: {
    readonly onUndo: () => boolean | Promise<boolean>;
    readonly onViewArchived: () => void | Promise<void>;
  };
}

export interface RoutedButtonProps {
  readonly children?: ReactNode;
  readonly onClick?: (() => void) | undefined;
  readonly "aria-label"?: string | undefined;
}

export interface RoutedNotificationInput {
  readonly id?: string | undefined;
  readonly type?: string | undefined;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly timeout?: number | undefined;
  readonly actionProps?: RoutedButtonProps | undefined;
  readonly data?: RoutedNotificationData | undefined;
  readonly onClose?: (() => void) | undefined;
}

export type RoutedNotificationUpdate = Partial<RoutedNotificationInput>;

export interface PortalNotificationManager {
  readonly add: (input: RoutedNotificationInput) => string;
  readonly update: (id: string, input: RoutedNotificationUpdate) => void;
  readonly close: (id?: string) => void;
  readonly promise: <Value>(
    promise: Promise<Value>,
    options: RoutedNotificationPromiseOptions<Value>,
  ) => Promise<Value>;
}

export interface RoutedNotificationPromiseOptions<Value> {
  readonly loading: string | RoutedNotificationUpdate;
  readonly success:
    | string
    | RoutedNotificationUpdate
    | ((value: Value) => string | RoutedNotificationUpdate);
  readonly error:
    | string
    | RoutedNotificationUpdate
    | ((error: unknown) => string | RoutedNotificationUpdate);
}

export interface NotificationRouter extends PortalNotificationManager {
  readonly setFocusMode: (enabled: boolean) => void;
}

function textFromNode(value: ReactNode): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return undefined;
}

function statusTone(type: string | undefined): StatusHistoryTone {
  if (type === "success" || type === "warning" || type === "error" || type === "loading") {
    return type;
  }
  return "info";
}

function keyPart(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "-");
  return normalized.length > 0 ? normalized.slice(0, 160) : null;
}

export function deriveNotificationStableKey(input: RoutedNotificationInput): string {
  if (input.data?.stableKey) return input.data.stableKey;
  const context = [
    input.data?.taskId,
    input.data?.terminalId,
    input.data?.branch,
    input.data?.providerVersionState,
    input.data?.repository,
    input.data?.pullRequest,
    input.data?.projectId,
    input.data?.threadId,
  ]
    .map(keyPart)
    .filter((part): part is string => part !== null)
    .join(":");
  const eventType = keyPart(input.data?.eventType) ?? keyPart(input.type) ?? "info";
  const title = keyPart(textFromNode(input.title)) ?? "notification";
  return ["notification", eventType, context || null, title].filter(Boolean).join(":");
}

function actionFromButton(
  id: string,
  props: RoutedButtonProps | undefined,
  kind: StatusHistoryAction["kind"] = "action",
): StatusHistoryAction | null {
  const label = textFromNode(props?.children);
  if (!label || !props?.onClick) return null;
  return {
    id,
    label,
    ...(props["aria-label"] ? { ariaLabel: props["aria-label"] } : {}),
    kind,
    onAction: props.onClick,
  };
}

function toHistoryEntry(input: RoutedNotificationInput): StatusHistoryEntryInput {
  const actions: StatusHistoryAction[] = [];
  const primary = actionFromButton("primary", input.actionProps);
  const secondary = actionFromButton("secondary", input.data?.secondaryActionProps);
  if (primary) actions.push(primary);
  if (secondary) actions.push(secondary);
  if (input.data?.archiveUndo) {
    actions.push({
      id: "undo",
      label: "Undo",
      kind: "undo",
      onAction: async () => {
        await input.data?.archiveUndo?.onUndo();
      },
    });
    actions.push({
      id: "view-archived",
      label: "View archived",
      onAction: async () => {
        await input.data?.archiveUndo?.onViewArchived();
      },
    });
  }
  const summary = textFromNode(input.description);
  return {
    stableKey: deriveNotificationStableKey(input),
    tone: statusTone(input.type),
    title: textFromNode(input.title) ?? "Notification",
    ...(summary ? { summary } : {}),
    ...(input.data?.copyText ? { copyText: input.data.copyText } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(input.data?.onClose || input.onClose
      ? { onDismiss: input.data?.onClose ?? input.onClose }
      : {}),
  };
}

function resolvePromiseState<Value>(
  state: string | RoutedNotificationUpdate | ((value: Value) => string | RoutedNotificationUpdate),
  value: Value,
): RoutedNotificationUpdate {
  const resolved = typeof state === "function" ? state(value) : state;
  return typeof resolved === "string" ? { title: resolved } : resolved;
}

export function createNotificationRouter(input: {
  readonly portal: PortalNotificationManager;
  readonly history: StatusHistoryManager;
}): NotificationRouter {
  let focusMode = false;
  let nextId = 1;
  const historyIdByNotificationId = new Map<string, string>();
  const latestInputByNotificationId = new Map<string, RoutedNotificationInput>();

  const add = (notification: RoutedNotificationInput): string => {
    if (!focusMode) return input.portal.add(notification);
    const id = notification.id ?? `focus-notification-${nextId++}`;
    const historyId = input.history.add(toHistoryEntry(notification));
    historyIdByNotificationId.set(id, historyId);
    latestInputByNotificationId.set(id, notification);
    return id;
  };

  const update = (id: string, patch: RoutedNotificationUpdate): void => {
    const historyId = historyIdByNotificationId.get(id);
    if (!historyId) {
      input.portal.update(id, patch);
      return;
    }
    const next = { ...latestInputByNotificationId.get(id), ...patch } as RoutedNotificationInput;
    latestInputByNotificationId.set(id, next);
    input.history.update(historyId, toHistoryEntry(next));
  };

  const close = (id?: string): void => {
    if (id === undefined) {
      input.portal.close();
      for (const historyId of historyIdByNotificationId.values()) input.history.dismiss(historyId);
      historyIdByNotificationId.clear();
      latestInputByNotificationId.clear();
      return;
    }
    if (id !== undefined && !historyIdByNotificationId.has(id)) {
      input.portal.close(id);
      return;
    }
    const historyId = historyIdByNotificationId.get(id);
    if (!historyId) return;
    input.history.dismiss(historyId);
    historyIdByNotificationId.delete(id);
    latestInputByNotificationId.delete(id);
  };

  const promise = async <Value>(
    promiseValue: Promise<Value>,
    options: RoutedNotificationPromiseOptions<Value>,
  ): Promise<Value> => {
    if (!focusMode) return input.portal.promise(promiseValue, options);
    const loading =
      typeof options.loading === "string" ? { title: options.loading } : options.loading;
    const id = add({ ...loading, type: loading.type ?? "loading" });
    try {
      const value = await promiseValue;
      const success = resolvePromiseState(options.success, value);
      update(id, { ...success, type: success.type ?? "success" });
      return value;
    } catch (error) {
      const failure = resolvePromiseState(options.error, error);
      update(id, { ...failure, type: failure.type ?? "error" });
      throw error;
    }
  };

  return {
    add,
    update,
    close,
    promise,
    setFocusMode: (enabled) => {
      if (focusMode === enabled) return;
      focusMode = enabled;
    },
  };
}
