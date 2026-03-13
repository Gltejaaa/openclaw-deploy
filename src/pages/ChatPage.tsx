import { memo, useCallback, useDeferredValue, useMemo, useState, type RefObject, type UIEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, Loader2, Play } from "lucide-react";
import { isSameChatMessage, type ChatPreviewMeta } from "../chatState";

interface AgentListItem {
  id: string;
  name?: string;
  default: boolean;
  workspace?: string;
  model?: string;
}

interface GatewayBinding {
  gateway_id: string;
  agent_id: string;
  instance_id: string;
  channel: string;
  enabled: boolean;
  health?: {
    status?: string;
    detail?: string;
  };
}

interface ChatUiMessage {
  id: string;
  role: string;
  text: string;
  status?: "sending" | "sent" | "failed";
  timestamp?: string;
}

interface StartupMigrationResult {
  fixed_count: number;
  fixed_dirs: string[];
}

const CHAT_VIEWPORT_WINDOW = 28;
const markdownRemarkPlugins = [remarkGfm];

function MarkdownCodeBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <div className="mb-3 rounded-2xl border border-slate-700 bg-slate-950/95 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-2">
        <span className="text-[11px] text-slate-400">代码片段</span>
        <button
          onClick={() => void handleCopy()}
          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500 hover:bg-slate-700"
        >
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-6 text-slate-100">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function ChatMarkdownContent({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-slate-100 break-words">
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        components={{
          h1: ({ children }) => <h1 className="text-lg font-semibold text-white mb-3">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mb-3">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-100 mb-2">{children}</h3>,
          p: ({ children }) => <p className="mb-3 last:mb-0 text-slate-100/95">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 ml-5 list-disc space-y-1.5 text-slate-100/95">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-slate-100/95">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="mb-3 rounded-2xl border-l-4 border-sky-400 border border-sky-800/50 bg-sky-950/25 px-4 py-3 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-slate-700/80" />,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2 hover:text-sky-200">
              {children}
            </a>
          ),
          code: ({ children }) => {
            const codeText = String(children).replace(/\n$/, "");
            const isBlock = codeText.includes("\n");
            return isBlock ? (
              <MarkdownCodeBlock text={codeText} />
            ) : (
              <code className="rounded bg-slate-950/90 px-1.5 py-0.5 text-[13px] text-emerald-200">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const ChatMessageBubble = memo(
  function ChatMessageBubble({
    message,
    onRetry,
    assistantTitle,
    assistantSubtitle,
  }: {
    message: ChatUiMessage;
    onRetry: (text: string) => void;
    assistantTitle?: string;
    assistantSubtitle?: string;
  }) {
    const isUser = message.role === "user";
    const metaText =
      message.status === "sending"
        ? "发送中..."
        : message.status === "failed"
          ? "发送失败，可重试"
          : (message.timestamp || (isUser ? "你" : "助手"));
    return (
      <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-1`}>
        <div
          className={`max-w-[82%] rounded-[22px] border px-4 py-3 shadow-[0_10px_28px_rgba(2,6,23,0.18)] ${
            isUser
              ? "border-sky-500/20 bg-gradient-to-br from-sky-700 via-sky-700 to-sky-800 text-white"
              : "border-slate-700/80 bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 text-slate-100"
          }`}
        >
          <div className={`mb-2 ${isUser ? "text-sky-100/80" : "text-slate-400"}`}>
            {isUser ? (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-sky-50">你</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-sm font-semibold text-sky-200">
                  {(assistantTitle || "助").slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{assistantTitle || "助手"}</div>
                  <div className="text-[10px] text-slate-500 truncate">{assistantSubtitle || "智能机器人"}</div>
                </div>
              </div>
            )}
          </div>
          <div className={isUser ? "text-[15px] leading-7 whitespace-pre-wrap break-words" : ""}>
            {isUser ? <div>{message.text}</div> : <ChatMarkdownContent text={message.text} />}
          </div>
          <div className={`text-[10px] mt-3 ${isUser ? "text-sky-100/70" : "text-slate-400"}`}>{metaText}</div>
          {message.status === "failed" && (
            <button
              onClick={() => onRetry(message.text)}
              className="mt-1 text-[10px] text-amber-300 hover:text-amber-200 underline"
            >
              回填重试
            </button>
          )}
        </div>
      </div>
    );
  },
  (prev, next) => prev.onRetry === next.onRetry && isSameChatMessage(prev.message, next.message)
);

const ChatAgentSidebar = memo(function ChatAgentSidebar({
  agents,
  selectedAgentId,
  unreadByAgent,
  previewByAgent,
  onSelectAgent,
  getAgentSpecialty,
}: {
  agents: AgentListItem[];
  selectedAgentId: string;
  unreadByAgent: Record<string, number>;
  previewByAgent: Record<string, ChatPreviewMeta>;
  onSelectAgent: (agentId: string) => void;
  getAgentSpecialty: (agentId: string) => "代码" | "表格" | "通用";
}) {
  return (
    <div
      className="w-52 shrink-0 flex flex-col gap-1 bg-slate-800/40 rounded-xl border border-slate-700/60 p-2 overflow-y-auto"
      style={{ contentVisibility: "auto", containIntrinsicSize: "480px" }}
    >
      {agents.length > 0 ? (
        agents.map((a) => {
          const selected = selectedAgentId === a.id;
          const specialty = getAgentSpecialty(a.id);
          const unread = unreadByAgent[a.id] || 0;
          const preview = previewByAgent[a.id];
          return (
            <button
              key={a.id}
              onClick={() => onSelectAgent(a.id)}
              className={`text-left px-2.5 py-2.5 rounded-lg text-xs ${
                selected
                  ? "bg-sky-700/90 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.25)]"
                  : "bg-slate-700/50 hover:bg-slate-600 text-slate-200"
              }`}
              title={a.workspace || a.id}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{a.name || a.id}</span>
                {unread > 0 && <span className="bg-rose-600 text-white rounded-full px-1.5 text-[10px]">{unread}</span>}
              </div>
              <div className="text-[10px] text-slate-300/80 mt-0.5">
                {a.id} · {specialty}
              </div>
              {preview?.text ? (
                <div className="mt-1 space-y-0.5">
                  <div className="text-[11px] text-slate-300/85 truncate">{preview.text}</div>
                  {preview.time ? <div className="text-[10px] text-slate-500">{preview.time}</div> : null}
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-slate-500 truncate">暂无聊天记录</div>
              )}
            </button>
          );
        })
      ) : (
        <p className="text-xs text-slate-500 px-2">暂无 Agent</p>
      )}
    </div>
  );
});

const ChatMessagesViewport = memo(function ChatMessagesViewport({
  chatViewportRef,
  onViewportScroll,
  chatLoading,
  messages,
  totalMessages,
  renderLimit,
  historyLoaded,
  cacheHydrating,
  chatStickBottom,
  pendingReply,
  onLoadHistory,
  onRetry,
  assistantTitle,
  assistantSubtitle,
}: {
  chatViewportRef: RefObject<HTMLDivElement | null>;
  onViewportScroll: (evt: UIEvent<HTMLDivElement>) => void;
  chatLoading: boolean;
  messages: ChatUiMessage[];
  totalMessages: number;
  renderLimit: number;
  historyLoaded: boolean;
  cacheHydrating: boolean;
  chatStickBottom: boolean;
  pendingReply: boolean;
  onLoadHistory: () => void;
  onRetry: (text: string) => void;
  assistantTitle?: string;
  assistantSubtitle?: string;
}) {
  const collapsedByLimit = Math.max(0, totalMessages - renderLimit);
  const cachedCount = Math.min(renderLimit, totalMessages);
  const collapsedByViewport = Math.max(0, cachedCount - messages.length);

  return (
    <div
      ref={chatViewportRef}
      onScroll={onViewportScroll}
      className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[320px]"
      style={{ contentVisibility: "auto", containIntrinsicSize: "720px", overscrollBehavior: "contain" }}
    >
      {cacheHydrating && totalMessages === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">正在恢复本地聊天...</div>
      )}
      {!cacheHydrating && !historyLoaded && !chatLoading && totalMessages === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-300 space-y-2">
          <p>已暂停进入页面自动拉历史，避免一进聊天页就卡顿。</p>
          <button onClick={onLoadHistory} className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 rounded text-xs">
            加载最近消息
          </button>
        </div>
      )}
      {chatLoading && <p className="text-xs text-slate-500">正在加载历史...</p>}
      {!chatLoading && historyLoaded && totalMessages === 0 && <p className="text-xs text-slate-500">暂无消息，开始对话吧。</p>}
      {collapsedByLimit > 0 && (
        <p className="text-[11px] text-slate-500">为提升流畅度当前缓存最近 {cachedCount}/{totalMessages} 条，向上滚动可继续加载更早消息。</p>
      )}
      {collapsedByViewport > 0 && chatStickBottom && (
        <p className="text-[11px] text-slate-500">
          底部模式已临时折叠更早的 {collapsedByViewport} 条消息，向上查看历史时会自动展开，减少等待回复时的滚动卡顿。
        </p>
      )}
      {messages.map((m) => (
        <ChatMessageBubble
          key={m.id}
          message={m}
          onRetry={onRetry}
          assistantTitle={assistantTitle}
          assistantSubtitle={assistantSubtitle}
        />
      ))}
      {pendingReply && (
        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-[22px] border border-slate-700/80 bg-gradient-to-br from-slate-800 via-slate-850 to-slate-900 px-4 py-3 shadow-[0_10px_28px_rgba(2,6,23,0.18)]">
            <div className="mb-2 flex items-center gap-3 text-slate-400">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-sm font-semibold text-sky-200">
                {(assistantTitle || "助").slice(0, 1)}
              </div>
              <div>
                <div className="text-sm font-medium text-slate-100">{assistantTitle || "助手"}</div>
                <div className="text-[10px] text-slate-500">{assistantSubtitle || "智能机器人"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[15px] leading-7 text-slate-100">
              <span>正在整理回复</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-300/80 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-sky-300/70 animate-pulse [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-sky-300/60 animate-pulse [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

interface ChatWorkbenchProps {
  agents: AgentListItem[];
  selectedAgentId: string;
  unreadByAgent: Record<string, number>;
  previewByAgent: Record<string, ChatPreviewMeta>;
  chatLoading: boolean;
  chatSending: boolean;
  chatError: string | null;
  routeHint: string | null;
  messages: ChatUiMessage[];
  renderLimit: number;
  historyLoaded: boolean;
  cacheHydrating: boolean;
  chatStickBottom: boolean;
  pendingReply: boolean;
  chatViewportRef: RefObject<HTMLDivElement | null>;
  onSelectAgent: (agentId: string) => void;
  onNewSession: () => void;
  onClearSession: () => void;
  onAbort: () => void;
  onLoadHistory: () => void;
  onSend: (text: string) => Promise<boolean>;
  onTypingActivity: () => void;
  onViewportScroll: (evt: UIEvent<HTMLDivElement>) => void;
  getAgentSpecialty: (agentId: string) => "代码" | "表格" | "通用";
  getChannelDisplayName: (channel: string) => string;
  gatewayOptionsByAgent: Record<string, GatewayBinding[]>;
  preferredGatewayByAgent: Record<string, string>;
  onPreferredGatewayChange: (agentId: string, gatewayId: string) => void;
}

const ChatWorkbench = memo(function ChatWorkbench({
  agents,
  selectedAgentId,
  unreadByAgent,
  previewByAgent,
  chatLoading,
  chatSending,
  chatError,
  routeHint,
  messages,
  renderLimit,
  historyLoaded,
  cacheHydrating,
  chatStickBottom,
  pendingReply,
  chatViewportRef,
  onSelectAgent,
  onNewSession,
  onClearSession,
  onAbort,
  onLoadHistory,
  onSend,
  onTypingActivity,
  onViewportScroll,
  getAgentSpecialty,
  getChannelDisplayName,
  gatewayOptionsByAgent,
  preferredGatewayByAgent,
  onPreferredGatewayChange,
}: ChatWorkbenchProps) {
  const [draftByAgent, setDraftByAgent] = useState<Record<string, string>>({});
  const draft = selectedAgentId ? draftByAgent[selectedAgentId] || "" : "";
  const deferredMessages = useDeferredValue(messages);
  const visibleMessages = useMemo(
    () => (deferredMessages.length > renderLimit ? deferredMessages.slice(-renderLimit) : deferredMessages),
    [deferredMessages, renderLimit]
  );
  const windowedMessages = useMemo(
    () => (chatStickBottom && visibleMessages.length > CHAT_VIEWPORT_WINDOW ? visibleMessages.slice(-CHAT_VIEWPORT_WINDOW) : visibleMessages),
    [chatStickBottom, visibleMessages]
  );
  const selectedGatewayOptions = selectedAgentId ? (gatewayOptionsByAgent[selectedAgentId] || []) : [];
  const selectedGatewayValue = selectedAgentId ? (preferredGatewayByAgent[selectedAgentId] || selectedGatewayOptions[0]?.gateway_id || "") : "";
  const selectedAssistantTitle = selectedAgentId ? agents.find((a) => a.id === selectedAgentId)?.name || selectedAgentId : "助手";
  const selectedAssistantSubtitle = selectedAgentId ? `${selectedAgentId} · ${getAgentSpecialty(selectedAgentId)}机器人` : undefined;

  const setDraftForSelected = useCallback(
    (text: string) => {
      if (!selectedAgentId) return;
      setDraftByAgent((prev) => {
        if ((prev[selectedAgentId] || "") === text) return prev;
        return { ...prev, [selectedAgentId]: text };
      });
    },
    [selectedAgentId]
  );

  const handleSend = useCallback(async () => {
    const ok = await onSend(draft);
    if (ok) setDraftForSelected("");
  }, [onSend, draft, setDraftForSelected]);

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 560, height: "min(72vh, 760px)" }}>
      <div className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/40 px-3 py-2">
        <div>
          <p className="text-xs text-slate-300">对话页已切成纯聊天模式</p>
          <p className="text-[11px] text-slate-500">路由和执行策略已收进调教中心的高级设置。</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedAgentId && selectedGatewayOptions.length > 0 && (
            <>
              <label className="text-xs text-slate-400">网关</label>
              <select
                value={selectedGatewayValue}
                onChange={(e) => onPreferredGatewayChange(selectedAgentId, e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs max-w-[240px]"
              >
                {selectedGatewayOptions.map((g) => (
                  <option key={g.gateway_id} value={g.gateway_id}>
                    {g.gateway_id} · {getChannelDisplayName(g.channel)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        <ChatAgentSidebar
          agents={agents}
          selectedAgentId={selectedAgentId}
          unreadByAgent={unreadByAgent}
          previewByAgent={previewByAgent}
          onSelectAgent={onSelectAgent}
          getAgentSpecialty={getAgentSpecialty}
        />

        <div className="flex-1 min-w-0 h-full bg-slate-900/50 rounded-xl overflow-hidden border border-slate-700/60 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-slate-700/60 flex items-center justify-between bg-slate-900/70">
            <div className="text-sm text-slate-200">
              当前会话：<span className="font-medium">{selectedAgentId || "(未选择)"}</span>
              {selectedAgentId && <span className="text-xs text-slate-400 ml-2">专长：{getAgentSpecialty(selectedAgentId)}</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={onNewSession} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs">
                新会话
              </button>
              <button onClick={onClearSession} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs">
                清空
              </button>
              <button onClick={onAbort} className="px-2 py-1 bg-rose-700 hover:bg-rose-600 rounded text-xs">
                停止
              </button>
            </div>
          </div>
          <ChatMessagesViewport
            chatViewportRef={chatViewportRef}
            onViewportScroll={onViewportScroll}
            chatLoading={chatLoading}
            messages={windowedMessages}
            totalMessages={messages.length}
            renderLimit={renderLimit}
            historyLoaded={historyLoaded}
            cacheHydrating={cacheHydrating}
            chatStickBottom={chatStickBottom}
            pendingReply={pendingReply}
            onLoadHistory={onLoadHistory}
            onRetry={setDraftForSelected}
            assistantTitle={selectedAssistantTitle}
            assistantSubtitle={selectedAssistantSubtitle}
          />

          <div className="border-t border-slate-700/60 p-3 space-y-2">
            {routeHint && <p className="text-xs text-emerald-300">{routeHint}</p>}
            {chatError && <p className="text-xs text-rose-400">{chatError}</p>}
            <div className="flex gap-2">
              <textarea
                value={draft}
                onChange={(e) => {
                  onTypingActivity();
                  setDraftForSelected(e.target.value);
                }}
                placeholder="输入消息，支持 Markdown 与 @agent 指定"
                rows={2}
                className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={chatSending || !selectedAgentId}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-sm"
              >
                {chatSending ? "发送中..." : "发送"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export interface ChatPageProps {
  starting: boolean;
  startupMigrationResult: StartupMigrationResult | null;
  deploySuccessDialog: string;
  agents: AgentListItem[];
  selectedAgentId: string;
  unreadByAgent: Record<string, number>;
  previewByAgent: Record<string, ChatPreviewMeta>;
  chatLoading: boolean;
  chatSending: boolean;
  chatError: string | null;
  routeHint: string | null;
  messages: ChatUiMessage[];
  renderLimit: number;
  historyLoaded: boolean;
  cacheHydrating: boolean;
  chatStickBottom: boolean;
  pendingReply: boolean;
  chatViewportRef: RefObject<HTMLDivElement | null>;
  gatewayOptionsByAgent: Record<string, GatewayBinding[]>;
  preferredGatewayByAgent: Record<string, string>;
  onStart: () => void;
  onOpenBrowserChat: () => void;
  onSelectAgent: (agentId: string) => void;
  onNewSession: () => void;
  onClearSession: () => void;
  onAbort: () => void;
  onLoadHistory: () => void;
  onSend: (text: string) => Promise<boolean>;
  onTypingActivity: () => void;
  onViewportScroll: (evt: UIEvent<HTMLDivElement>) => void;
  getAgentSpecialty: (agentId: string) => "代码" | "表格" | "通用";
  getChannelDisplayName: (channel: string) => string;
  onPreferredGatewayChange: (agentId: string, gatewayId: string) => void;
}

const ChatPage = memo(function ChatPage({
  starting,
  startupMigrationResult,
  deploySuccessDialog,
  agents,
  selectedAgentId,
  unreadByAgent,
  previewByAgent,
  chatLoading,
  chatSending,
  chatError,
  routeHint,
  messages,
  renderLimit,
  historyLoaded,
  cacheHydrating,
  chatStickBottom,
  pendingReply,
  chatViewportRef,
  gatewayOptionsByAgent,
  preferredGatewayByAgent,
  onStart,
  onOpenBrowserChat,
  onSelectAgent,
  onNewSession,
  onClearSession,
  onAbort,
  onLoadHistory,
  onSend,
  onTypingActivity,
  onViewportScroll,
  getAgentSpecialty,
  getChannelDisplayName,
  onPreferredGatewayChange,
}: ChatPageProps) {
  const selectedGatewayOptions = selectedAgentId ? (gatewayOptionsByAgent[selectedAgentId] || []) : [];
  const selectedGatewayId = selectedAgentId
    ? preferredGatewayByAgent[selectedAgentId] || selectedGatewayOptions[0]?.gateway_id || ""
    : "";
  const selectedGateway =
    selectedGatewayOptions.find((gateway) => gateway.gateway_id === selectedGatewayId) || selectedGatewayOptions[0] || null;
  const startButtonBusy = starting && selectedGateway?.health?.status !== "ok";
  return (
    <div className="w-full max-w-[1200px] mx-auto space-y-4 order-1">
      {startupMigrationResult && startupMigrationResult.fixed_count > 0 && (
        <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-3 text-xs text-emerald-300 space-y-1">
          <p>已自动修复插件兼容清单：{startupMigrationResult.fixed_count} 项</p>
          <p className="text-emerald-200">修复目录：{startupMigrationResult.fixed_dirs.join(", ")}</p>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <button
          onClick={onStart}
          disabled={startButtonBusy}
          className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-xs font-medium"
          title="如果当前 Agent 还没有网关，先去调教中心点一次“保存配置”生成网关"
        >
          {startButtonBusy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              启动中...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              启动当前 Agent 网关
            </>
          )}
        </button>
        <button
          onClick={onOpenBrowserChat}
          className="flex items-center gap-2 px-3 py-1.5 bg-sky-700 hover:bg-sky-600 rounded text-xs font-medium"
        >
          <ExternalLink className="w-4 h-4" />
          打开浏览器对话框
        </button>
      </div>
      <ChatWorkbench
        agents={agents}
        selectedAgentId={selectedAgentId}
        unreadByAgent={unreadByAgent}
        previewByAgent={previewByAgent}
        chatLoading={chatLoading}
        chatSending={chatSending}
        chatError={chatError}
        routeHint={routeHint}
        messages={messages}
        renderLimit={renderLimit}
        historyLoaded={historyLoaded}
        cacheHydrating={cacheHydrating}
        chatStickBottom={chatStickBottom}
        pendingReply={pendingReply}
        chatViewportRef={chatViewportRef}
        onSelectAgent={onSelectAgent}
        onNewSession={onNewSession}
        onClearSession={onClearSession}
        onAbort={onAbort}
        onLoadHistory={onLoadHistory}
        onSend={onSend}
        onTypingActivity={onTypingActivity}
        onViewportScroll={onViewportScroll}
        getAgentSpecialty={getAgentSpecialty}
        getChannelDisplayName={getChannelDisplayName}
        gatewayOptionsByAgent={gatewayOptionsByAgent}
        preferredGatewayByAgent={preferredGatewayByAgent}
        onPreferredGatewayChange={onPreferredGatewayChange}
      />
      <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-4 text-sm text-emerald-100 space-y-2">
        <p className="font-medium text-emerald-200">帮助与 QQ 群交流</p>
        <p>{deploySuccessDialog}</p>
        <p className="text-emerald-200/90">欢迎进群交流使用体验、部署问题和功能建议。</p>
      </div>
    </div>
  );
});

export default ChatPage;
