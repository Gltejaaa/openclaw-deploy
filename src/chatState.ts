export interface ChatUiMessageLike {
  id: string;
  role: string;
  text: string;
  timestamp?: string;
  status?: "sending" | "sent" | "failed";
}

export interface ChatPreviewMeta {
  text: string;
  time: string;
}

function isRemoteConfirmedChatMessage(message: ChatUiMessageLike): boolean {
  if (!message) return false;
  if ((message.timestamp || "").trim()) return true;
  return typeof message.id === "string" && message.id.startsWith("local-assistant-bg-");
}

export function isSameChatMessage(a: ChatUiMessageLike, b: ChatUiMessageLike): boolean {
  return (
    a.id === b.id &&
    a.role === b.role &&
    (a.text || "") === (b.text || "") &&
    (a.timestamp || "") === (b.timestamp || "") &&
    (a.status || "sent") === (b.status || "sent")
  );
}

export function isSameChatMessageList(a: ChatUiMessageLike[], b: ChatUiMessageLike[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!isSameChatMessage(a[i]!, b[i]!)) return false;
  }
  return true;
}

export function normalizeChatText(text: string): string {
  return (text || "").trim().replace(/\s+/g, " ");
}

export function sanitizeChatMessageForCache<T extends ChatUiMessageLike>(message: T): T {
  return {
    ...message,
    id: String(message.id || ""),
    role: String(message.role || "assistant"),
    text: String(message.text || ""),
    timestamp: message.timestamp ? String(message.timestamp) : undefined,
    status: message.status === "failed" ? "failed" : "sent",
  };
}

export function formatChatPreviewTime(timestamp?: string): string {
  const raw = String(timestamp || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function buildChatPreviewFromMessages(messages: ChatUiMessageLike[]): ChatPreviewMeta {
  const list = messages || [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i];
    if (!item || !isRemoteConfirmedChatMessage(item)) continue;
    const text = normalizeChatText(item.text).slice(0, 42);
    if (!text) continue;
    return {
      text,
      time: formatChatPreviewTime(item.timestamp),
    };
  }
  return { text: "", time: "" };
}

export function appendDeltaUniqueMessages<T extends ChatUiMessageLike>(
  current: T[],
  delta: T[],
  options?: { removeMessageId?: string }
): T[] {
  const base = options?.removeMessageId ? current.filter((m) => m.id !== options.removeMessageId) : current.slice();
  const seenIds = new Set(base.map((m) => m.id));
  const seenUserTexts = new Set(base.filter((m) => m.role === "user").map((m) => normalizeChatText(m.text)));
  const appended: T[] = [];
  for (const msg of delta) {
    if (seenIds.has(msg.id)) continue;
    if (msg.role === "user") {
      const normalized = normalizeChatText(msg.text);
      if (normalized && seenUserTexts.has(normalized)) continue;
      if (normalized) seenUserTexts.add(normalized);
    }
    seenIds.add(msg.id);
    appended.push(msg);
  }
  if (appended.length === 0) return base;
  return [...base, ...appended];
}

export function trimChatMessagesForUi<T>(messages: T[], max = 320): T[] {
  if (messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}
