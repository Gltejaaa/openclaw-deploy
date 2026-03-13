// @ts-nocheck
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Users, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { cancelIdleTask, scheduleIdleTask } from "../perf";

const RECOMMENDED_MODEL_FALLBACK = "deepseek-ai/DeepSeek-V3";
const AGENT_PROVIDER_OPTIONS = ["openai", "deepseek", "kimi", "qwen", "bailian", "anthropic"] as const;
const MODEL_STRATEGY_INITIAL_RENDER_LIMIT = 8;
const MODEL_STRATEGY_RENDER_STEP = 8;
const ROUTE_RULE_INITIAL_RENDER_LIMIT = 12;
const ROUTE_RULE_RENDER_STEP = 12;
const HEAVY_CARD_VISIBILITY_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "220px",
};
const ROUTE_ROW_VISIBILITY_STYLE = {
  contentVisibility: "auto",
  containIntrinsicSize: "160px",
};
const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  telegram: "Telegram",
  feishu: "飞书",
  dingtalk: "钉钉",
  discord: "Discord",
  qq: "QQ",
};

function getChannelDisplayName(channel: string): string {
  if ((channel || "").trim().toLowerCase() === "local") return "本地对话";
  return CHANNEL_DISPLAY_NAMES[channel] || channel;
}

function getChannelStatusTagClass(channel: string): string {
  const normalized = (channel || "").trim().toLowerCase();
  if (normalized === "telegram") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (normalized === "qq") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (normalized === "feishu") return "border-violet-500/40 bg-violet-500/10 text-violet-200";
  if (normalized === "discord") return "border-indigo-500/40 bg-indigo-500/10 text-indigo-200";
  if (normalized === "dingtalk") return "border-cyan-500/40 bg-cyan-500/10 text-cyan-200";
  if (normalized === "local") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  return "border-slate-600/60 bg-slate-800/70 text-slate-200";
}

function hasConfiguredTelegramDraftInstance(row?: { bot_token?: string } | null): boolean {
  return !!(row?.bot_token || "").trim();
}

function hasConfiguredChannelDraftInstance(channel: string, row?: { credential1?: string; credential2?: string } | null): boolean {
  const c1 = (row?.credential1 || "").trim();
  const c2 = (row?.credential2 || "").trim();
  if (channel === "discord") return !!c1;
  return !!c1 && !!c2;
}

function FeedbackCard({
  toneClassName,
  title,
  headline,
  detail,
  className = "",
  detailAsPre = false,
  badge,
  detailClassName = "",
}: {
  toneClassName: string;
  title: string;
  headline?: string;
  detail?: string;
  className?: string;
  detailAsPre?: boolean;
  badge?: string;
  detailClassName?: string;
}) {
  if (!headline && !detail) return null;
  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClassName} ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{title}</p>
        {badge ? <span className="text-[11px] opacity-70">{badge}</span> : null}
      </div>
      {headline ? <p className="mt-2 whitespace-pre-wrap">{headline}</p> : null}
      {detail
        ? detailAsPre
          ? (
            <pre className={`mt-2 overflow-auto whitespace-pre-wrap text-[11px] opacity-90 ${detailClassName}`.trim()}>{detail}</pre>
          )
          : (
            <p className={`mt-1 whitespace-pre-wrap text-[11px] opacity-90 ${detailClassName}`.trim()}>{detail}</p>
          )
        : null}
    </div>
  );
}

function buildGatewayStatusMeta({
  agentHasGateway,
  agentHasExternalChannels,
  agentExternalChannels,
  agentRunningCount,
  agentPortOnlyCount,
  agentRuntimeLoading,
}: {
  agentHasGateway: boolean;
  agentHasExternalChannels: boolean;
  agentExternalChannels: string[];
  agentRunningCount: number;
  agentPortOnlyCount: number;
  agentRuntimeLoading: boolean;
}) {
  if (!agentHasGateway) {
    return agentRuntimeLoading
      ? {
          label: "读取中",
          detail: "正在恢复已保存网关状态",
          className: "text-slate-300",
          badgeClassName: "border-slate-500/40 bg-slate-500/10 text-slate-200",
          title: "正在读取当前 Agent 的网关配置与运行状态。",
        }
      : {
          label: "未保存",
          detail: "先点“保存配置”生成网关",
          className: "text-amber-200",
          badgeClassName: "border-amber-500/40 bg-amber-500/10 text-amber-200",
          title: "当前 Agent 还没有生成网关。先点保存配置，再去启动。",
        };
  }

  if (agentHasExternalChannels) {
    const channelNames = agentExternalChannels.map((ch) => getChannelDisplayName(ch)).join(" / ");
    if (agentRunningCount > 0 && agentPortOnlyCount >= agentRunningCount) {
      return {
        label: "端口已监听",
        detail: `${channelNames} 网关已拉起，渠道未验证`,
        className: "text-amber-200",
        title: "当前只确认网关端口已监听，渠道机器人是否真正可用仍未验证。可继续点“探活”或“日志”确认。",
        badgeClassName: "border-amber-500/40 bg-amber-500/10 text-amber-200",
      };
    }
    return {
      label: "已接入外部渠道",
      detail: agentRunningCount > 0 ? `${channelNames} 已生效` : `${channelNames} 已配置，去启动`,
      className: "text-fuchsia-300",
      title: agentRunningCount > 0 ? "当前 Agent 已接入外部渠道。" : "当前 Agent 已配置外部渠道，但还没启动网关。",
      badgeClassName: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200",
    };
  }

  return agentRunningCount > 0
    ? {
        label: "运行中",
        detail: "本地/网页对话已生效",
        className: "text-emerald-300",
        badgeClassName: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        title: "当前 Agent 网关已在运行，可直接用于网页对话或客户端对话。",
      }
    : {
        label: "已保存待启动",
        detail: "本地对话已就绪，去启动",
        className: "text-sky-300",
        badgeClassName: "border-sky-500/40 bg-sky-500/10 text-sky-200",
        title: "当前 Agent 网关已经生成，下一步去启动即可。",
      };
}

function DeferredPanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-[11px] text-slate-400 mt-1">优先显示页面框架，重表格与状态分析会在空闲时补齐。</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-[10px] text-slate-300">
          载入中
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="h-16 rounded-lg border border-slate-800 bg-slate-800/70" />
        <div className="h-16 rounded-lg border border-slate-800 bg-slate-800/70" />
        <div className="h-16 rounded-lg border border-slate-800 bg-slate-800/70" />
      </div>
    </div>
  );
}

function DeferredSectionPlaceholder({
  title,
  detail,
  blocks = 2,
}: {
  title: string;
  detail: string;
  blocks?: number;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-200">{title}</p>
          <p className="text-[11px] text-slate-400 mt-1">{detail}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800/80 px-2 py-1 text-[10px] text-slate-300">
          准备中
        </span>
      </div>
      <div className="space-y-2">
        {Array.from({ length: blocks }).map((_, index) => (
          <div key={`${title}-${index}`} className="h-16 rounded-lg border border-slate-800 bg-slate-800/70" />
        ))}
      </div>
    </div>
  );
}

function formatRelativeAgeLabel(timestamp?: number | null): string {
  if (!timestamp) return "未刷新";
  const diffMs = Math.max(0, Date.now() - timestamp);
  if (diffMs < 5000) return "刚刚";
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.round(diffMin / 60);
  return `${diffHour} 小时前`;
}

const ModelStrategyAgentCard = memo(function ModelStrategyAgentCard({
  agent,
  draft,
  models,
  providerLoading,
  setAgentProfileDrafts,
  refreshModelsForProvider,
  saveAgentProfile,
  agentRuntimeSaving,
}: Record<string, any>) {
  return (
    <div className="border border-slate-700 rounded p-2 space-y-2" style={HEAVY_CARD_VISIBILITY_STYLE}>
      <div className="text-xs text-slate-300">
        <span className="font-mono">{agent.id}</span>
        <span className="text-slate-500 ml-2">{agent.name || "-"}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <select
          value={draft.provider}
          onChange={(e) => {
            const nextProvider = e.target.value;
            setAgentProfileDrafts((prev: Record<string, any>) => ({
              ...prev,
              [agent.id]: {
                provider: nextProvider,
                model: prev[agent.id]?.model || RECOMMENDED_MODEL_FALLBACK,
              },
            }));
          }}
          className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs"
        >
          {AGENT_PROVIDER_OPTIONS.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
        <select
          value={draft.model}
          onChange={(e) =>
            setAgentProfileDrafts((prev: Record<string, any>) => ({
              ...prev,
              [agent.id]: { ...(prev[agent.id] || { provider: draft.provider, model: "" }), model: e.target.value },
            }))
          }
          className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs md:col-span-2"
        >
          {models.length === 0 ? (
            <option value={draft.model}>{draft.model || "请先刷新模型列表"}</option>
          ) : (
            <>
              {!models.includes(draft.model) && <option value={draft.model}>{draft.model}</option>}
              {models.map((modelId: string) => (
                <option key={modelId} value={modelId}>
                  {modelId}
                </option>
              ))}
            </>
          )}
        </select>
        <div className="flex gap-2">
          <button
            onClick={() => void refreshModelsForProvider(draft.provider)}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
            disabled={providerLoading}
          >
            {providerLoading ? "刷新中..." : "刷新模型"}
          </button>
          <button
            onClick={() => void saveAgentProfile(agent.id)}
            className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[11px]"
            disabled={agentRuntimeSaving}
          >
            保存
          </button>
        </div>
      </div>
      <input
        value={draft.model}
        onChange={(e) =>
          setAgentProfileDrafts((prev: Record<string, any>) => ({
            ...prev,
            [agent.id]: { ...(prev[agent.id] || { provider: draft.provider, model: "" }), model: e.target.value },
          }))
        }
        placeholder="也可手动输入模型ID"
        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
      />
    </div>
  );
});

const RouteRuleRow = memo(function RouteRuleRow({
  route,
  index,
  agents,
  gatewayBindingsDraft,
  getChannelInstanceIdsByChannel,
  setChannelRoutesDraft,
}: Record<string, any>) {
  const updateRoute = (patch: Record<string, any>) => {
    setChannelRoutesDraft((prev: Record<string, any>[]) =>
      prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  };

  return (
    <div
      className="border border-slate-700 rounded p-2 grid grid-cols-1 md:grid-cols-9 gap-2"
      style={ROUTE_ROW_VISIBILITY_STYLE}
    >
      <label className="flex items-center gap-1 text-xs text-slate-300">
        <input type="checkbox" checked={route.enabled} onChange={(e) => updateRoute({ enabled: e.target.checked })} />
        启用
      </label>
      <select
        value={route.channel}
        onChange={(e) => updateRoute({ channel: e.target.value })}
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
      >
        {["telegram", "feishu", "dingtalk", "discord", "qq"].map((channel) => (
          <option key={channel} value={channel}>
            {channel}
          </option>
        ))}
      </select>
      <select
        value={route.agent_id}
        onChange={(e) => updateRoute({ agent_id: e.target.value })}
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
      >
        {agents.map((agent: Record<string, any>) => (
          <option key={agent.id} value={agent.id}>
            {agent.id}
          </option>
        ))}
      </select>
      <select
        value={route.gateway_id || ""}
        onChange={(e) => updateRoute({ gateway_id: e.target.value || undefined })}
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
        title="可指定网关实例（优先于bot_instance）"
      >
        <option value="">网关(任意)</option>
        {gatewayBindingsDraft.map((gateway: Record<string, any>) => (
          <option key={`gw-opt-${gateway.gateway_id}`} value={gateway.gateway_id}>
            {gateway.gateway_id}
          </option>
        ))}
      </select>
      <select
        value={route.bot_instance || ""}
        onChange={(e) => updateRoute({ bot_instance: e.target.value || undefined })}
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
        title="可指定渠道实例"
      >
        <option value="">实例(任意)</option>
        {getChannelInstanceIdsByChannel(route.channel).map((instanceId: string) => (
          <option key={instanceId} value={instanceId}>
            {instanceId}
          </option>
        ))}
      </select>
      <input
        value={route.account || ""}
        onChange={(e) => updateRoute({ account: e.target.value })}
        placeholder="account(可选)"
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
      />
      <input
        value={route.peer || ""}
        onChange={(e) => updateRoute({ peer: e.target.value })}
        placeholder="peer/chatId(可选)"
        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
      />
      <button
        onClick={() => setChannelRoutesDraft((prev: Record<string, any>[]) => prev.filter((_, itemIndex) => itemIndex !== index))}
        className="px-2 py-1 bg-rose-700 hover:bg-rose-600 rounded text-[11px]"
      >
        删除
      </button>
    </div>
  );
});

function TuningAgentsSection(props: { ctx: Record<string, any> }) {
  const ctx = props.ctx as Record<string, any>;
  const deferredPanelKey = `${ctx.agentCenterTab}`;
  const selectedChannelStageKey = `${ctx.agentCenterTab}:${ctx.channelInstancesEditorChannel || ""}`;
  const warmedPanelKeysRef = useRef<Set<string>>(new Set());
  const warmedEditorKeysRef = useRef<Set<string>>(new Set());
  const warmedGatewayKeysRef = useRef<Set<string>>(new Set());
  const warmedPairingKeysRef = useRef<Set<string>>(new Set());
  const warmedPluginKeysRef = useRef<Set<string>>(new Set());
  const warmedGuideKeysRef = useRef<Set<string>>(new Set());
  const [deferredPanelReady, setDeferredPanelReady] = useState(false);
  const [channelsEditorReady, setChannelsEditorReady] = useState(false);
  const [channelsGatewayReady, setChannelsGatewayReady] = useState(false);
  const [channelsPairingReady, setChannelsPairingReady] = useState(false);
  const [channelsPluginReady, setChannelsPluginReady] = useState(false);
  const [channelsGuideReady, setChannelsGuideReady] = useState(false);
  const [channelCredentialRenderLimit, setChannelCredentialRenderLimit] = useState(0);
  const [gatewayListRenderLimit, setGatewayListRenderLimit] = useState(0);
  const [overviewRenderLimit, setOverviewRenderLimit] = useState(0);
  const [modelStrategyRenderLimit, setModelStrategyRenderLimit] = useState(MODEL_STRATEGY_INITIAL_RENDER_LIMIT);
  const [routeRuleRenderLimit, setRouteRuleRenderLimit] = useState(ROUTE_RULE_INITIAL_RENDER_LIMIT);

  useEffect(() => {
    if (warmedPanelKeysRef.current.has(deferredPanelKey)) {
      setDeferredPanelReady(true);
      return;
    }
    setDeferredPanelReady(false);
    const handle = scheduleIdleTask(() => {
      warmedPanelKeysRef.current.add(deferredPanelKey);
      setDeferredPanelReady(true);
    }, 120);
    return () => cancelIdleTask(handle);
  }, [deferredPanelKey]);

  useEffect(() => {
    if (ctx.agentCenterTab !== "channels" || !deferredPanelReady) {
      setChannelsEditorReady(false);
      setChannelsGatewayReady(false);
      return;
    }

    const editorStageKey = `editor:${deferredPanelKey}`;
    const gatewayStageKey = `gateway:${deferredPanelKey}`;
    const editorReady = warmedEditorKeysRef.current.has(editorStageKey);
    const gatewayReady = warmedGatewayKeysRef.current.has(gatewayStageKey);
    setChannelsEditorReady(editorReady);
    setChannelsGatewayReady(gatewayReady);
    if (editorReady && gatewayReady) return;

    const handle = scheduleIdleTask(() => {
      warmedEditorKeysRef.current.add(editorStageKey);
      warmedGatewayKeysRef.current.add(gatewayStageKey);
      setChannelsEditorReady(true);
      setChannelsGatewayReady(true);
    }, 160);

    return () => {
      cancelIdleTask(handle);
    };
  }, [ctx.agentCenterTab, deferredPanelKey, deferredPanelReady]);

  const configuredTelegramIds = useMemo(() => {
    return new Set(
      (ctx.telegramInstancesDraft || [])
        .filter((item) => item?.enabled !== false && hasConfiguredTelegramDraftInstance(item))
        .map((item) => (item.id || "").trim())
        .filter(Boolean)
    );
  }, [ctx.telegramInstancesDraft]);

  const configuredChannelIdsByChannel = useMemo(() => {
    const next: Record<string, Set<string>> = {};
    for (const item of ctx.channelInstancesDraft || []) {
      const channel = (item?.channel || "").trim().toLowerCase();
      const id = (item?.id || "").trim();
      if (!channel || !id || item?.enabled === false || !hasConfiguredChannelDraftInstance(channel, item)) continue;
      if (!next[channel]) next[channel] = new Set<string>();
      next[channel].add(id);
    }
    return next;
  }, [ctx.channelInstancesDraft]);

  const gatewayStatusByAgent = useMemo(() => {
    const next: Record<string, any> = {};
    for (const agent of ctx.agentsList?.agents || []) {
      const agentGateways = ctx.enabledGatewaysByAgent?.[agent.id] || [];
      const agentHasGateway = agentGateways.length > 0;
      let agentRunningCount = 0;
      let agentPortOnlyCount = 0;
      const externalChannels = new Set<string>();
      for (const gateway of agentGateways) {
        if ((gateway?.health?.status || "") === "ok") {
          agentRunningCount += 1;
          if (ctx.isGatewayPortOnlyHealth?.(gateway?.health)) {
            agentPortOnlyCount += 1;
          }
        }
        const channelInstances = ctx.parseGatewayChannelInstances(gateway.channel_instances, gateway.channel, gateway.instance_id);
        for (const [channelName, instanceValue] of Object.entries(channelInstances || {})) {
          const channel = (channelName || "").trim().toLowerCase();
          const instanceId = String(instanceValue || "").trim();
          if (!channel || channel === "local" || !instanceId) continue;
          const configured =
            channel === "telegram"
              ? configuredTelegramIds.has(instanceId)
              : configuredChannelIdsByChannel[channel]?.has(instanceId);
          if (configured) externalChannels.add(channel);
        }
      }
      const agentExternalChannels = Array.from(externalChannels);
      next[agent.id] = {
        hasGateway: agentHasGateway,
        hasExternalChannels: agentExternalChannels.length > 0,
        externalChannels: agentExternalChannels,
        gatewayStatusMeta: buildGatewayStatusMeta({
          agentHasGateway,
          agentHasExternalChannels: agentExternalChannels.length > 0,
          agentExternalChannels,
          agentRunningCount,
          agentPortOnlyCount,
          agentRuntimeLoading: !!ctx.agentRuntimeLoading,
        }),
      };
    }
    return next;
  }, [
    ctx.agentRuntimeLoading,
    ctx.agentsList?.agents,
    ctx.enabledGatewaysByAgent,
    ctx.isGatewayPortOnlyHealth,
    ctx.parseGatewayChannelInstances,
    configuredChannelIdsByChannel,
    configuredTelegramIds,
  ]);

  const selectedChannel = ctx.channelInstancesEditorChannel;
  const selectedChannelIsTelegram = selectedChannel === "telegram";
  const selectedChannelDraftRows = useMemo(() => {
    if (selectedChannelIsTelegram) return [];
    return (ctx.channelInstancesDraft || []).filter(
      (item) => (item?.channel || "").trim().toLowerCase() === selectedChannel
    );
  }, [ctx.channelInstancesDraft, selectedChannel, selectedChannelIsTelegram]);
  const selectedChannelDraftById = useMemo(() => {
    const next: Record<string, any> = {};
    for (const item of selectedChannelDraftRows) {
      const id = (item?.id || "").trim();
      if (id) next[id] = item;
    }
    return next;
  }, [selectedChannelDraftRows]);
  const telegramDraftById = useMemo(() => {
    const next: Record<string, any> = {};
    for (const item of ctx.telegramInstancesDraft || []) {
      const id = (item?.id || "").trim();
      if (id) next[id] = item;
    }
    return next;
  }, [ctx.telegramInstancesDraft]);
  const selectedChannelReadyCount = useMemo(() => {
    if (selectedChannelIsTelegram) {
      return (ctx.telegramInstancesDraft || []).filter((item) => !!item.bot_token?.trim()).length;
    }
    return selectedChannelDraftRows.filter((item) => ctx.hasRequiredChannelCredentials(selectedChannel, item)).length;
  }, [ctx.hasRequiredChannelCredentials, ctx.telegramInstancesDraft, selectedChannel, selectedChannelDraftRows, selectedChannelIsTelegram]);
  const selectedChannelHasGenerated = useMemo(() => {
    if (selectedChannelIsTelegram) {
      return (ctx.telegramInstancesDraft || []).some((item) => !!item.id?.trim());
    }
    return selectedChannelDraftRows.some((item) => !!item.id?.trim());
  }, [ctx.telegramInstancesDraft, selectedChannelDraftRows, selectedChannelIsTelegram]);
  const selectedChannelHasPrimaryCredential = useMemo(() => {
    if (selectedChannelIsTelegram) {
      return (ctx.telegramInstancesDraft || []).some((item) => !!item.bot_token?.trim());
    }
    return selectedChannelDraftRows.some((item) => !!item.credential1?.trim());
  }, [ctx.telegramInstancesDraft, selectedChannelDraftRows, selectedChannelIsTelegram]);
  const selectedChannelInstanceOptions = selectedChannelIsTelegram ? ctx.telegramInstancesDraft || [] : selectedChannelDraftRows;
  const selectedPairingRequests = useMemo(
    () => ctx.pairingRequestsByChannel?.[selectedChannel] || [],
    [ctx.pairingRequestsByChannel, selectedChannel]
  );
  const selectedChannelSupportsPairing = ["telegram", "feishu", "qq"].includes(selectedChannel);
  const selectedChannelSupportsPlugin = ["qq", "feishu", "discord", "dingtalk", "telegram"].includes(selectedChannel);
  const totalAgentsCount = ctx.agentsList?.agents?.length || 0;
  const refreshStatusMeta = useMemo(() => {
    const dirty = ctx.runtimeDirtyFlags || {};
    const freshness = ctx.runtimeFreshness || {};
    const staticAge = formatRelativeAgeLabel(freshness.staticSnapshotAt);
    const gatewayAge = formatRelativeAgeLabel(freshness.gatewaySnapshotAt);
    if (ctx.agentRuntimeLoading || ctx.gatewayRuntimeLoading) {
      return {
        toneClassName: "border-sky-700/50 bg-sky-950/20 text-sky-100",
        title: "正在刷新当前页缓存",
        detail:
          ctx.agentCenterTab === "channels"
            ? "正在同步配置快照和网关状态，请稍等片刻。"
            : "正在同步 Agent 配置快照，请稍等片刻。",
      };
    }
    if (dirty.agentsDirty || dirty.runtimeConfigDirty || dirty.gatewayHealthDirty || dirty.channelLinkDirty) {
      const reasons: string[] = [];
      if (dirty.agentsDirty) reasons.push("Agent 列表刚发生变更");
      if (dirty.runtimeConfigDirty) reasons.push("配置快照可能还没和磁盘最新状态对齐");
      if (dirty.channelLinkDirty) reasons.push("渠道绑定可能已更新");
      if (dirty.gatewayHealthDirty) reasons.push("网关运行状态可能已变化");
      return {
        toneClassName: "border-amber-700/50 bg-amber-950/20 text-amber-100",
        title: "当前展示的是缓存快照",
        detail: `${reasons.join("；")}。配置快照：${staticAge}；网关状态：${gatewayAge}。如需立即同步，请点右侧刷新。`,
      };
    }
    if (freshness.staticSnapshotAt || freshness.gatewaySnapshotAt) {
      return {
        toneClassName: "border-emerald-700/40 bg-emerald-950/20 text-emerald-100",
        title: "已按需加载缓存",
        detail:
          ctx.agentCenterTab === "channels"
            ? `配置快照：${staticAge}；网关状态：${gatewayAge}。切换 Agent 管理 / 渠道配置 不会再自动刷新。`
            : `配置快照：${staticAge}。切换 Agent 管理 / 渠道配置 不会再自动刷新。`,
      };
    }
    return {
      toneClassName: "border-slate-700 bg-slate-900/30 text-slate-200",
      title: "当前还没有缓存快照",
      detail: "首次需要时会加载一次，之后改为按动作失效或手动刷新，不再随着切页自动拉取网关状态。",
    };
  }, [
    ctx.agentCenterTab,
    ctx.agentRuntimeLoading,
    ctx.gatewayRuntimeLoading,
    ctx.runtimeDirtyFlags,
    ctx.runtimeFreshness,
  ]);

  useEffect(() => {
    if (ctx.agentCenterTab !== "channels" || !channelsEditorReady) {
      setChannelsPairingReady(false);
      setChannelsPluginReady(false);
      setChannelsGuideReady(false);
      return;
    }

    const pairingStageKey = `pairing:${selectedChannelStageKey}`;
    const pluginStageKey = `plugin:${selectedChannelStageKey}`;
    const guideStageKey = `guide:${selectedChannelStageKey}`;
    const pairingReady = selectedChannelSupportsPairing && warmedPairingKeysRef.current.has(pairingStageKey);
    const pluginReady = selectedChannelSupportsPlugin && warmedPluginKeysRef.current.has(pluginStageKey);
    const guideReady = warmedGuideKeysRef.current.has(guideStageKey);
    setChannelsPairingReady(pairingReady);
    setChannelsPluginReady(pluginReady);
    setChannelsGuideReady(guideReady);

    if (
      (!selectedChannelSupportsPairing || pairingReady) &&
      (!selectedChannelSupportsPlugin || pluginReady) &&
      guideReady
    ) {
      return;
    }

    const handle = scheduleIdleTask(() => {
      warmedGuideKeysRef.current.add(guideStageKey);
      setChannelsGuideReady(true);
      if (selectedChannelSupportsPairing) {
        warmedPairingKeysRef.current.add(pairingStageKey);
        setChannelsPairingReady(true);
      }
      if (selectedChannelSupportsPlugin) {
        warmedPluginKeysRef.current.add(pluginStageKey);
        setChannelsPluginReady(true);
      }
    }, 180);

    return () => {
      cancelIdleTask(handle);
    };
  }, [channelsEditorReady, ctx.agentCenterTab, selectedChannelStageKey, selectedChannelSupportsPairing, selectedChannelSupportsPlugin]);

  useEffect(() => {

    if (ctx.agentCenterTab !== "channels" || !channelsEditorReady) {
      setChannelCredentialRenderLimit(0);
      return;
    }

    const total = ctx.agentsList?.agents?.length || 0;
    const initial = Math.min(total, 6);
    setChannelCredentialRenderLimit(initial);
  }, [channelsEditorReady, ctx.agentCenterTab, ctx.agentsList?.agents?.length, selectedChannel]);

  useEffect(() => {
    if (ctx.agentCenterTab !== "channels" || !channelsGatewayReady) {
      setGatewayListRenderLimit(0);
      return;
    }

    const total = ctx.gatewayBindingsDraft?.length || 0;
    const initial = Math.min(total, 4);
    setGatewayListRenderLimit(initial);
  }, [channelsGatewayReady, ctx.agentCenterTab, ctx.gatewayBindingsDraft, selectedChannel]);

  useEffect(() => {
    if (ctx.agentCenterTab !== "overview" || !deferredPanelReady) {
      setOverviewRenderLimit(0);
      return;
    }

    const total = ctx.agentsList?.agents?.length || 0;
    const initial = Math.min(total, 8);
    setOverviewRenderLimit(initial);
  }, [ctx.agentCenterTab, ctx.agentsList?.agents?.length, deferredPanelReady]);

  const visibleCredentialAgents = useMemo(() => {
    const agents = ctx.agentsList?.agents || [];
    if (channelCredentialRenderLimit <= 0) return [];
    return agents.slice(0, channelCredentialRenderLimit);
  }, [channelCredentialRenderLimit, ctx.agentsList?.agents]);
  const remainingCredentialAgents = Math.max(0, totalAgentsCount - visibleCredentialAgents.length);
  const visibleGatewayBindings = useMemo(() => {
    const bindings = ctx.gatewayBindingsDraft || [];
    if (gatewayListRenderLimit <= 0) return [];
    return bindings.slice(0, gatewayListRenderLimit);
  }, [ctx.gatewayBindingsDraft, gatewayListRenderLimit]);
  const remainingGatewayBindings = Math.max(0, (ctx.gatewayBindingsDraft?.length || 0) - visibleGatewayBindings.length);
  const visibleOverviewAgents = useMemo(() => {
    const agents = ctx.agentsList?.agents || [];
    if (overviewRenderLimit <= 0) return [];
    return agents.slice(0, overviewRenderLimit);
  }, [ctx.agentsList?.agents, overviewRenderLimit]);
  const remainingOverviewAgents = Math.max(0, totalAgentsCount - visibleOverviewAgents.length);
  const visibleModelStrategyAgents = useMemo(() => {
    const agents = ctx.agentsList?.agents || [];
    return agents.slice(0, modelStrategyRenderLimit);
  }, [ctx.agentsList?.agents, modelStrategyRenderLimit]);
  const remainingModelStrategyAgents = Math.max(0, totalAgentsCount - visibleModelStrategyAgents.length);
  const visibleRouteRules = useMemo(() => {
    const routes = ctx.channelRoutesDraft || [];
    return routes.slice(0, routeRuleRenderLimit);
  }, [ctx.channelRoutesDraft, routeRuleRenderLimit]);
  const remainingRouteRules = Math.max(0, (ctx.channelRoutesDraft?.length || 0) - visibleRouteRules.length);

  return (
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-3" style={ctx.heavyPanelStyle}>
              <p className="font-medium text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                {ctx.agentCenterTab === "channels" ? "渠道配置" : "Agent 管理"}
              </p>
              {ctx.agentsLoading ? (
                <p className="text-xs text-slate-400">加载中...</p>
              ) : ctx.agentsError ? (
                <p className="text-xs text-rose-400">{ctx.agentsError}</p>
              ) : ctx.agentsList ? (
                <div className="space-y-3">
                  <div className={`grid grid-cols-1 gap-3 ${ctx.agentCenterTab === "channels" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                      <p className="text-[11px] text-slate-400">当前 Agent 数量</p>
                      <p className="text-lg font-semibold text-slate-100 mt-1">{ctx.agentsList.agents.length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                      <p className="text-[11px] text-slate-400">默认 Agent</p>
                      <p className="text-lg font-semibold text-slate-100 mt-1">
                        {ctx.agentsList.agents.find((a) => a.default)?.name || ctx.agentsList.agents.find((a) => a.default)?.id || "未设置"}
                      </p>
                    </div>
                    {ctx.agentCenterTab === "channels" && (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                        <p className="text-[11px] text-slate-400">已绑定渠道</p>
                        <p className="text-lg font-semibold text-slate-100 mt-1">{ctx.agentsList.bindings?.length || 0}</p>
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-2 flex gap-2 flex-wrap">
                    <button
                      onClick={() => ctx.setAgentCenterTab("overview")}
                      className={`px-3 py-1.5 rounded text-xs ${
                        ctx.agentCenterTab === "overview" ? "bg-sky-700 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                      }`}
                    >
                      Agent 管理
                    </button>
                    <button
                      onClick={() => ctx.setAgentCenterTab("channels")}
                      className={`px-3 py-1.5 rounded text-xs ${
                        ctx.agentCenterTab === "channels" ? "bg-sky-700 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-200"
                      }`}
                    >
                      渠道配置
                    </button>
                  </div>
                  <div className={`rounded-lg border px-3 py-3 ${refreshStatusMeta.toneClassName}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-xs font-medium">{refreshStatusMeta.title}</p>
                        <p className="mt-1 text-[11px] opacity-90">{refreshStatusMeta.detail}</p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => void ctx.refreshAgentRuntimeSettings(undefined, { probeLive: false })}
                          disabled={ctx.agentRuntimeLoading}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-[11px]"
                        >
                          {ctx.agentRuntimeLoading ? "刷新配置中..." : "刷新配置快照"}
                        </button>
                        {ctx.agentCenterTab === "channels" && (
                          <button
                            onClick={() => void ctx.refreshGatewayInstances()}
                            disabled={ctx.gatewayRuntimeLoading}
                            className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-[11px]"
                          >
                            {ctx.gatewayRuntimeLoading ? "刷新网关中..." : "刷新网关状态"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {ctx.agentCenterTab === "overview" && (
                  deferredPanelReady ? (
                  <div className="space-y-3" style={ctx.heavyPanelStyle}>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm text-slate-200 font-medium">极简模式</p>
                        <p className="text-[11px] text-slate-400">
                          默认只保留 Agent 列表、改名、设默认、新建、删除。模型策略和维护项都收进高级设置。
                        </p>
                      </div>
                      <button
                        onClick={() => ctx.setShowAgentAdvancedSettings((prev) => !prev)}
                        className="px-3 py-1.5 rounded border border-slate-600 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-800/70"
                      >
                        {ctx.showAgentAdvancedSettings ? "收起高级设置" : "展开高级设置"}
                      </button>
                    </div>
                  </div>
                  {ctx.agentsActionFeedbackCard ? <FeedbackCard {...ctx.agentsActionFeedbackCard} className="text-xs" /> : null}
                  <div className="overflow-x-auto" style={ctx.heavyPanelStyle}>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-600">
                          <th className="text-left py-1.5 px-2">ID</th>
                          <th className="text-left py-1.5 px-2">名称</th>
                          <th className="text-left py-1.5 px-2">默认</th>
                          <th className="text-left py-1.5 px-2">网关状态</th>
                          <th className="text-left py-1.5 px-2">Workspace</th>
                          <th className="text-left py-1.5 px-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleOverviewAgents.map((a) => {
                          const gatewayMeta = gatewayStatusByAgent[a.id] || {
                            hasGateway: false,
                            hasExternalChannels: false,
                            externalChannels: [],
                            gatewayStatusMeta: buildGatewayStatusMeta({
                              agentHasGateway: false,
                              agentHasExternalChannels: false,
                              agentExternalChannels: [],
                              agentRunningCount: 0,
                              agentRuntimeLoading: !!ctx.agentRuntimeLoading,
                            }),
                          };
                          const agentHasGateway = gatewayMeta.hasGateway;
                          const agentHasExternalChannels = gatewayMeta.hasExternalChannels;
                          const agentExternalChannels = gatewayMeta.externalChannels;
                          const gatewayStatusMeta = gatewayMeta.gatewayStatusMeta;
                          return (
                            <tr key={a.id} className="border-b border-slate-700/50">
                              <td className="py-1.5 px-2 font-mono">{a.id}</td>
                              <td className="py-1.5 px-2">
                                <input
                                  value={ctx.agentNameDrafts[a.id] ?? a.name ?? ""}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    ctx.setAgentNameDrafts((prev) => ({ ...prev, [a.id]: next }));
                                    if (ctx.agentsActionResult) ctx.setAgentsActionResult(null);
                                  }}
                                  placeholder="输入 Agent 名称"
                                  className="w-full min-w-[140px] bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                                />
                              </td>
                              <td className="py-1.5 px-2">{a.default ? "✓" : ""}</td>
                              <td className="py-1.5 px-2">
                                <div className={`text-[11px] ${gatewayStatusMeta.className}`} title={gatewayStatusMeta.title}>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${gatewayStatusMeta.badgeClassName}`}
                                    >
                                      {gatewayStatusMeta.label}
                                    </span>
                                    {agentHasExternalChannels
                                      ? agentExternalChannels.map((ch) => (
                                          <span
                                            key={`${a.id}-status-ch-${ch}`}
                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${getChannelStatusTagClass(ch)}`}
                                          >
                                            {getChannelDisplayName(ch)}
                                          </span>
                                        ))
                                      : agentHasGateway
                                        ? (
                                          <span
                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${getChannelStatusTagClass("local")}`}
                                          >
                                            本地对话
                                          </span>
                                        )
                                        : null}
                                  </div>
                                  <p className="mt-0.5 opacity-90">{gatewayStatusMeta.detail}</p>
                                </div>
                              </td>
                              <td className="py-1.5 px-2 font-mono text-slate-400 truncate max-w-[120px]">{a.workspace || "-"}</td>
                              <td className="py-1.5 px-2 flex gap-1 flex-wrap">
                                <button
                                  onClick={() => void ctx.handleRenameAgent(a.id)}
                                  disabled={
                                    ctx.renamingAgentId === a.id ||
                                    !(ctx.agentNameDrafts[a.id] || "").trim() ||
                                    (ctx.agentNameDrafts[a.id] || "").trim() === (a.name || "").trim()
                                  }
                                  className="text-sky-400 hover:text-sky-300 disabled:text-slate-500 text-xs"
                                >
                                  {ctx.renamingAgentId === a.id ? "保存中..." : "保存名称"}
                                </button>
                                {!a.default && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        ctx.setAgentsActionResult(null);
                                        await invoke("set_default_agent", {
                                          id: a.id,
                                          customPath: ctx.normalizeConfigPath(ctx.customConfigPath) || undefined,
                                        });
                                        ctx.updateRuntimeDirtyFlags({ agentsDirty: true });
                                        await ctx.refreshAgentsList();
                                        await ctx.refreshAgentRuntimeSettings(undefined, { probeLive: false, silent: true });
                                      } catch (e) {
                                        alert(String(e));
                                      }
                                    }}
                                    className="text-emerald-400 hover:text-emerald-300 text-xs"
                                  >
                                    设为默认
                                  </button>
                                )}
                                {a.id !== "main" && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`确定删除 Agent "${a.id}"？`)) return;
                                      try {
                                        ctx.setAgentsActionResult(null);
                                        await invoke("delete_agent", {
                                          id: a.id,
                                          force: true,
                                          customPath: ctx.normalizeConfigPath(ctx.customConfigPath) || undefined,
                                        });
                                        ctx.updateRuntimeDirtyFlags({ agentsDirty: true, runtimeConfigDirty: true, channelLinkDirty: true });
                                        await ctx.refreshAgentsList();
                                        await ctx.refreshAgentRuntimeSettings(undefined, { probeLive: false, silent: true });
                                      } catch (e) {
                                        alert(String(e));
                                      }
                                    }}
                                    className="text-rose-400 hover:text-rose-300 text-xs"
                                  >
                                    删除
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {remainingOverviewAgents > 0 && (
                          <tr className="border-b border-slate-700/50">
                            <td className="py-2 px-2 text-[11px] text-slate-500" colSpan={6}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span>其余 {remainingOverviewAgents} 个 Agent 暂未展开，避免首屏一次性渲染整表。</span>
                                <span className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => setOverviewRenderLimit((prev) => Math.min(totalAgentsCount, prev + 8))}
                                    className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100"
                                  >
                                    再加载 8 个
                                  </button>
                                  <button
                                    onClick={() => setOverviewRenderLimit(totalAgentsCount)}
                                    className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 text-[11px] text-slate-200"
                                  >
                                    展开全部
                                  </button>
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => ctx.setShowCreateAgent(true)}
                      className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 rounded text-xs"
                    >
                      新建 Agent
                    </button>
                  </div>
                  {ctx.showAgentAdvancedSettings && (
                    <div className="space-y-3">
                      <details className="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-200">维护工具</summary>
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] text-slate-400">这里放维护型操作，不打扰默认使用流程。</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void ctx.refreshAgentsList()}
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                            >
                              刷新 Agent 列表
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-500">配置: {ctx.agentsList.config_path}</p>
                          <p className="text-[11px] text-slate-500">点击「设为默认」切换用于对话的 Agent，新对话将使用默认 Agent。</p>
                        </div>
                      </details>

                      <details className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-200">模型策略</summary>
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm text-slate-200 font-medium">Agent 模型分配（按 Agent 独立）</p>
                            <button
                              onClick={() => {
                                const providers = new Set<string>();
                                for (const a of ctx.agentsList.agents) {
                                  const p = ctx.agentProfileDrafts[a.id]?.provider;
                                  if (p) providers.add(p);
                                }
                                providers.forEach((p) => {
                                  void ctx.refreshModelsForProvider(p);
                                });
                              }}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
                            >
                              刷新已选 Provider 模型列表
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            模型来源于你当前 Provider 的“刷新模型”结果；保存后将同步写入对应 Agent 的主模型。
                          </p>
                          {ctx.agentRuntimeSettings && (
                            <p className="text-[11px] text-slate-500">运行时配置文件：{ctx.agentRuntimeSettings.settings_path}</p>
                          )}
                          <div className="space-y-2">
                            {visibleModelStrategyAgents.map((agent) => {
                              const draft = ctx.agentProfileDrafts[agent.id] || { provider: "openai", model: RECOMMENDED_MODEL_FALLBACK };
                              return (
                                <ModelStrategyAgentCard
                                  key={`runtime-${agent.id}`}
                                  agent={agent}
                                  draft={draft}
                                  models={ctx.agentModelsByProvider[draft.provider] || []}
                                  providerLoading={!!ctx.agentModelsLoadingByProvider[draft.provider]}
                                  setAgentProfileDrafts={ctx.setAgentProfileDrafts}
                                  refreshModelsForProvider={ctx.refreshModelsForProvider}
                                  saveAgentProfile={ctx.saveAgentProfile}
                                  agentRuntimeSaving={ctx.agentRuntimeSaving}
                                />
                              );
                            })}
                          </div>
                          {remainingModelStrategyAgents > 0 && (
                            <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3 text-xs text-slate-400">
                              <p>
                                为了避免一次挂载全部模型表单，这里先渲染前 {visibleModelStrategyAgents.length} 个 Agent，剩余 {remainingModelStrategyAgents} 个按需展开。
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  onClick={() =>
                                    setModelStrategyRenderLimit((prev) =>
                                      Math.min(totalAgentsCount, prev + MODEL_STRATEGY_RENDER_STEP)
                                    )
                                  }
                                  className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100"
                                >
                                  再加载 {Math.min(remainingModelStrategyAgents, MODEL_STRATEGY_RENDER_STEP)} 个
                                </button>
                                <button
                                  onClick={() => setModelStrategyRenderLimit(totalAgentsCount)}
                                  className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 text-[11px] text-slate-200"
                                >
                                  展开全部
                                </button>
                              </div>
                            </div>
                          )}
                          {ctx.agentRuntimeFeedbackCard ? <FeedbackCard {...ctx.agentRuntimeFeedbackCard} className="text-xs" /> : null}
                          {ctx.telegramSelfHealFeedbackCard ? <FeedbackCard {...ctx.telegramSelfHealFeedbackCard} className="text-xs" /> : null}
                        </div>
                      </details>
                    </div>
                  )}
                  </div>
                  ) : (
                  <DeferredPanelPlaceholder label="Agent 管理面板正在准备" />
                  )
                  )}

                  {ctx.agentCenterTab === "channels" && (
                  deferredPanelReady ? (
                  <div className="space-y-3" style={ctx.heavyPanelStyle}>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm text-slate-200 font-medium">渠道绑定摘要</p>
                        <p className="text-[11px] text-slate-400 mt-1">这里的统计严格跟随下方 Agent 网关控制台，不再和 Agent 管理混放。</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-right">
                        <p className="text-[11px] text-slate-400">已绑定渠道</p>
                        <p className="text-lg font-semibold text-slate-100 mt-1">{ctx.agentsList.bindings?.length || 0}</p>
                      </div>
                    </div>
                  </div>
                  {channelsGuideReady ? (
                  <div className="bg-indigo-950/30 border border-indigo-700/50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm text-indigo-200 font-medium flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                          新手引导：先填凭据，再接到当前 Agent 网关
                        </p>
                        <p className="text-[11px] text-indigo-100/75 mt-1">
                          这一版不再讲一大串概念，直接按“生成配置项 → 填机器人凭据 → 保存配置”走即可。
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-300">
                        <input
                          type="checkbox"
                          checked={!ctx.simpleModeForAgent}
                          onChange={(e) => ctx.setSimpleModeForAgent(!e.target.checked)}
                        />
                        显示高级选项
                      </label>
                    </div>
                    {(() => {
                      const totalAgents = totalAgentsCount;
                      const channelLabelMap: Record<ChannelEditorChannel, string> = {
                        telegram: "Telegram",
                        feishu: "飞书",
                        dingtalk: "钉钉",
                        discord: "Discord",
                        qq: "QQ",
                      };
                      const hasApplied = selectedChannelIsTelegram
                        ? !!ctx.activeTelegramInstanceId
                        : !!ctx.activeChannelInstanceByChannel[selectedChannel];
                      const isTestDone = !!(ctx.routeTestResult && ctx.routeTestResult.includes("命中 Agent"));
                      const autoState = ctx.channelInstanceAutosaveStateByChannel[selectedChannel] || "idle";
                      const autoStateText =
                        autoState === "saving"
                          ? "正在写入本地配置..."
                          : autoState === "saved"
                            ? "已写入本地配置"
                            : autoState === "error"
                              ? "写入失败，请看上方结果提示"
                              : "当前仅在页面暂存，点“保存配置”后统一写入";
                      const steps = [
                        {
                          title: "1. 生成配置项",
                          desc: "先点“按 Agent 自动生成”，每个 Agent 会生成一行渠道配置。",
                          done: selectedChannelHasGenerated,
                        },
                        {
                          title: "2. 填机器人凭据",
                          desc: selectedChannelIsTelegram
                            ? "为每个 Agent 填 Bot Token，先在当前页面暂存。"
                            : `直接填写 ${channelLabelMap[selectedChannel]} 机器人凭据，先在当前页面暂存。`,
                          done: totalAgents > 0 && selectedChannelReadyCount >= totalAgents,
                        },
                        {
                          title: "3. 保存配置",
                          desc: "点底部主按钮，系统会自动接到当前 Agent 网关。",
                          done: hasApplied,
                        },
                        {
                            title: "4. 重启或测试",
                            desc: "保存后按提示重启网关，或再点检查机器人确认可用。",
                          done: isTestDone,
                        },
                      ];
                      return (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                            {steps.map((step) => (
                              <div
                                key={step.title}
                                className={`rounded-xl border px-3 py-3 ${
                                  step.done
                                    ? "border-emerald-600/50 bg-emerald-900/20"
                                    : "border-indigo-600/40 bg-slate-950/35"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className={`text-xs font-medium ${step.done ? "text-emerald-200" : "text-indigo-100"}`}>{step.title}</p>
                                  <span className={`text-[10px] ${step.done ? "text-emerald-300" : "text-slate-500"}`}>{step.done ? "已完成" : "待操作"}</span>
                                </div>
                                <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{step.desc}</p>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-xl border border-indigo-600/40 bg-slate-950/40 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-medium text-indigo-100">当前渠道：{channelLabelMap[selectedChannel]}</p>
                                <p className="text-[11px] text-slate-300 mt-1">
                                  已填凭据 {selectedChannelReadyCount}/{totalAgents || 0} 个 Agent
                                  {` · ${autoStateText}`}
                                </p>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() =>
                                    void (
                                      selectedChannel === "telegram"
                                        ? ctx.runTelegramFirstSetupWizard()
                                        : ctx.runChannelFirstSetupWizard(selectedChannel as string)
                                    )
                                  }
                                  disabled={
                                    (selectedChannel === "telegram"
                                      ? ctx.telegramWizardRunning
                                      : !!ctx.channelWizardRunningByChannel[selectedChannel]) || !ctx.agentsList?.agents?.length
                                  }
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-[11px] font-medium"
                                >
                                  一键跑通当前渠道
                                </button>
                              </div>
                            </div>
                            <p className="mt-3 text-[10px] text-indigo-100/70">
                              概念精简版：输入框只在当前页面暂存；底部“保存配置”才会统一写入并发布到当前 Agent。
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  ) : (
                  <DeferredSectionPlaceholder
                    title="渠道引导卡片正在准备"
                    detail="新手引导和步骤卡会在首屏稳定后补上，避免第一次进入时顶部整块一起渲染。"
                    blocks={2}
                  />
                  )}

                  {channelsEditorReady ? (
                  <div className="bg-slate-900/40 border border-slate-700 rounded-lg overflow-hidden flex flex-col md:flex-row min-h-[320px]">
                    <div className="w-full md:w-36 shrink-0 flex md:flex-col gap-1 p-2 border-b md:border-b-0 md:border-r border-slate-700 bg-slate-800/50">
                      <p className="text-xs text-slate-400 px-2 py-1 md:mb-1 hidden md:block">渠道</p>
                      {(["telegram", "feishu", "dingtalk", "discord", "qq"] as string[]).map((ch) => {
                        const label = { telegram: "Telegram", feishu: "飞书", dingtalk: "钉钉", discord: "Discord", qq: "QQ" }[ch];
                        const statusMeta = ctx.channelTabStatusMap[ch];
                        return (
                          <button
                            key={ch}
                            onClick={() => ctx.setChannelInstancesEditorChannel(ch)}
                            title={statusMeta.title}
                            className={`text-left px-2 py-2 rounded text-xs font-medium transition-colors ${
                              ctx.channelInstancesEditorChannel === ch
                                ? "bg-indigo-700 text-indigo-100"
                                : "bg-slate-700/60 hover:bg-slate-600 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{label}</span>
                              <span className={`inline-flex h-2 w-2 rounded-full ${statusMeta.dotClass}`} aria-hidden />
                            </div>
                            <div className={`mt-1 text-[10px] ${ctx.channelInstancesEditorChannel === ch ? "text-indigo-100/80" : statusMeta.textClass}`}>
                              {statusMeta.label}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex-1 min-w-0 p-3 space-y-3 overflow-auto" style={ctx.heavyPanelStyle}>
                    {ctx.agentsList?.agents?.length &&
                      !selectedChannelHasPrimaryCredential && (
                      <div className="rounded border border-amber-600/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                        <span className="font-medium">首次使用？</span> 先点「按 Agent 自动生成」生成配置项，填写 Token 后点「首次配置向导」一键完成。
                      </div>
                    )}
                    {selectedChannelSupportsPairing && (channelsPairingReady ? (() => {
                      const pairingChannel = selectedChannel as string;
                      const pairingLabelMap: Record<PairingChannel, string> = {
                        telegram: "Telegram",
                        feishu: "飞书",
                        qq: "QQ",
                      };
                      const pairingPlaceholderMap: Record<PairingChannel, string> = {
                        telegram: "粘贴 Telegram 返回的配对码",
                        feishu: "粘贴飞书返回的配对码",
                        qq: "粘贴 QQ 返回的配对码",
                      };
                      return (
                        <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3 space-y-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <p className="text-sm text-slate-200 font-medium">首次配对审批</p>
                              <p className="text-[11px] text-amber-200/90">
                                {pairingLabelMap[pairingChannel]} 首次私聊时如果返回配对码，直接在这里审批，后面就能正常对话。
                              </p>
                            </div>
                            <button
                              onClick={() => void ctx.handleListPairings(pairingChannel)}
                              disabled={ctx.pairingLoading === pairingChannel}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-[11px]"
                            >
                              {ctx.pairingLoading === pairingChannel ? "查询中..." : "查询待审批"}
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              placeholder={pairingPlaceholderMap[pairingChannel]}
                              value={ctx.pairingCodeByChannel[pairingChannel]}
                              onChange={(e) =>
                                ctx.setPairingCodeByChannel((prev) => ({
                                  ...prev,
                                  [pairingChannel]: e.target.value,
                                }))
                              }
                              className="flex-1 min-w-[220px] bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm"
                            />
                            <button
                              onClick={() => ctx.handleApprovePairing(pairingChannel)}
                              disabled={ctx.pairingLoading === pairingChannel || !ctx.pairingCodeByChannel[pairingChannel].trim()}
                              className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-xs"
                            >
                              批准配对码
                            </button>
                          </div>
                          {selectedPairingRequests.length > 0 && (
                            <div className="space-y-2">
                              {selectedPairingRequests.map((req, index) => {
                                const code = typeof req.code === "string" ? req.code : "";
                                const title =
                                  (typeof req.displayName === "string" && req.displayName) ||
                                  (typeof req.senderLabel === "string" && req.senderLabel) ||
                                  (typeof req.senderId === "string" && req.senderId) ||
                                  (typeof req.from === "string" && req.from) ||
                                  `请求 ${index + 1}`;
                                const metaText = Object.entries(req)
                                  .filter(([key, value]) => key !== "code" && typeof value === "string" && value)
                                  .slice(0, 3)
                                  .map(([key, value]) => `${key}: ${value}`)
                                  .join(" · ");
                                return (
                                  <div key={`${pairingChannel}-${code || index}`} className="flex flex-wrap items-center gap-2 rounded border border-slate-700 bg-slate-900/60 px-3 py-2">
                                    <div className="min-w-[160px] flex-1">
                                      <div className="text-xs text-slate-200">{title}</div>
                                      <div className="text-[11px] text-slate-500">{metaText || "等待批准首次访问"}</div>
                                    </div>
                                    <code className="rounded bg-slate-950 px-2 py-1 text-xs text-emerald-300">{code || "无 code"}</code>
                                    {code && (
                                      <button
                                        onClick={() => ctx.handleApprovePairing(pairingChannel, code)}
                                        disabled={ctx.pairingLoading === pairingChannel}
                                        className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-xs"
                                      >
                                        直接批准
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {ctx.channelFeedbackCard ? <FeedbackCard {...ctx.channelFeedbackCard} className="text-xs" /> : null}
                        </div>
                      );
                    })() : (
                      <DeferredSectionPlaceholder
                        title="首次配对审批区正在准备"
                        detail="配对查询和审批按钮会在首屏稳定后补上，避免第一次进入时和主表单一起抢渲染。"
                        blocks={1}
                      />
                    ))}
                    {selectedChannelSupportsPlugin && (channelsPluginReady ? (
                      <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <p className="text-sm text-slate-200 font-medium">安装渠道对话插件</p>
                            <p className="text-[11px] text-slate-400">
                              建议在填写当前渠道凭据前后顺手检查这里。`Telegram` 属于 OpenClaw 内置渠道；`QQ / 飞书 / Discord / 钉钉` 可能走联网插件，也可能直接同步桌面端内置扩展。
                            </p>
                            <p className="text-[11px] text-amber-200/90 mt-1">
                              如果桌面端已经内置了对应渠道，再点这里会把新版扩展同步到 `OpenClaw/extensions`；只有本地没有内置扩展时，才会走 OpenClaw / npm 联网安装。
                            </p>
                          </div>
                          <button
                            onClick={ctx.handleAutoInstallPlugins}
                            disabled={ctx.pluginInstallLoading}
                            className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.pluginInstallLoading ? "安装中..." : "按勾选渠道自动安装/校验插件"}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {["telegram", "qq", "feishu", "discord", "dingtalk"].map((id) => (
                            <label key={`channel-plugin-${id}`} className="flex items-center gap-1 text-xs text-slate-300">
                              <input
                                type="checkbox"
                                checked={!!ctx.pluginSelection[id]}
                                onChange={(e) => {
                                  ctx.setPluginSelectionTouched(true);
                                  ctx.setPluginSelection((prev) => ({ ...prev, [id]: e.target.checked }));
                                }}
                              />
                              {id}
                            </label>
                          ))}
                        </div>
                        {ctx.pluginInstallLoading && ctx.pluginInstallProgress && (
                          <div className="space-y-2">
                            <p className="text-xs text-sky-300">
                              当前进度：{ctx.pluginInstallProgress?.current ?? 0}/{ctx.pluginInstallProgress?.total ?? 0}，
                              正在处理 `{ctx.pluginInstallProgress?.channel ?? "-"}`（{ctx.pluginInstallProgress?.status ?? "-"}）
                            </p>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-500 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.max(
                                    5,
                                    Math.min(
                                      100,
                                      Math.round(
                                        ((ctx.pluginInstallProgress?.current ?? 0) / Math.max(ctx.pluginInstallProgress?.total ?? 0, 1)) * 100
                                      )
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                            <pre className="bg-slate-900/40 rounded p-3 text-xs whitespace-pre-wrap max-h-28 overflow-auto">
                              {ctx.pluginInstallProgressLog.join("\n")}
                            </pre>
                          </div>
                        )}
                        {ctx.pluginInstallFeedbackCard ? (
                          <FeedbackCard {...ctx.pluginInstallFeedbackCard} className="text-xs" detailAsPre detailClassName="max-h-40" />
                        ) : null}
                      </div>
                    ) : (
                      <DeferredSectionPlaceholder
                        title="渠道插件区正在准备"
                        detail="插件勾选和安装进度面板会在首屏稳定后挂载，避免第一次进入时出现额外布局压力。"
                        blocks={1}
                      />
                    ))}
                    {selectedChannel !== "telegram" && (
                    <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-slate-200 font-medium">{selectedChannel} 实例池</p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <button
                          onClick={() => ctx.buildChannelPerAgentDraft(selectedChannel)}
                          className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[11px]"
                          title="① 先点这里：生成每个 Agent 的配置项"
                        >
                          按 Agent 自动生成 <span className="text-emerald-200/80 text-[10px]">① 先点</span>
                        </button>
                        {ctx.showAgentAdvancedSettings && (
                          <>
                            <button
                              onClick={() => void ctx.runChannelFirstSetupWizard(selectedChannel)}
                              disabled={!!ctx.channelWizardRunningByChannel[selectedChannel]}
                              className="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-[11px]"
                              title="③ 填完 Token 后点这里：一键完成保存、应用、路由与测试"
                            >
                              {ctx.channelWizardRunningByChannel[ctx.channelInstancesEditorChannel] ? "向导执行中..." : "首次配置向导"}
                              <span className="text-indigo-200/80 text-[10px] ml-0.5">③ 填完点</span>
                            </button>
                            <button
                              onClick={() => void ctx.testChannelInstancesBatch(selectedChannel)}
                              disabled={!!ctx.channelBatchTestingByChannel[selectedChannel]}
                              className="px-2 py-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded text-[11px]"
                            >
                              {ctx.channelBatchTestingByChannel[ctx.channelInstancesEditorChannel] ? "检测中..." : "批量检测"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      当前渠道：{selectedChannel}。可点“首次配置向导”一键跑完：实例池到应用网关，再到路由与命中测试。
                    </p>
                    {selectedChannel === "qq" && (
                      <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/20 p-3 space-y-2">
                        <p className="text-sm text-cyan-200 font-medium">QQ 新接入方式</p>
                        <p className="text-[11px] text-cyan-100/90 leading-relaxed">
                          这里直接填写 <strong>AppID</strong> 和 <strong>AppSecret</strong>。
                          后台会自动拼成 OpenClaw 需要的 <code>AppID:AppSecret</code> token，并写入当前 Agent 的 QQ 渠道配置。
                        </p>
                        <p className="text-[10px] text-cyan-200/75">
                          不需要你自己手动拼命令，也不需要手动执行 `channels add`。
                        </p>
                      </div>
                    )}
                    {!!ctx.agentsList.agents.length && (
                      <div className="border border-slate-700 rounded p-2 space-y-2">
                        <p className="text-xs text-slate-300">按 Agent 配置 {selectedChannel} 凭据（简化）</p>
                        {visibleCredentialAgents.map((a) => {
                          const ch = selectedChannel;
                          const iid = `${ch}-${a.id}`;
                          const item =
                            selectedChannelDraftById[iid] ||
                            ({
                              id: iid,
                              name: a.name || a.id,
                              channel: ch,
                              credential1: "",
                              credential2: "",
                              chat_id: "",
                              enabled: true,
                            } as ChannelBotInstance);
                          const singleKey = `${ch}:${iid}`;
                          const singleTesting = !!ctx.channelSingleTestingByInstanceId[singleKey];
                          return (
                            <div key={`agent-${ch}-${a.id}`} className="space-y-1">
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                                <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300">
                                  {a.id}
                                </div>
                                <input
                                  type="password"
                                  value={item.credential1}
                                  onChange={(e) =>
                                    ctx.updateAgentScopedChannelDraft(ch, iid, a.name || a.id, (current) => ({
                                      ...current,
                                      id: iid,
                                      name: a.name || a.id,
                                      channel: ch,
                                      credential1: e.target.value,
                                      credential2: current.credential2 || "",
                                      chat_id: current.chat_id || "",
                                      enabled: current.enabled,
                                    }))
                                  }
                                  placeholder={
                                    ch === "qq"
                                      ? `${a.id} 的 AppID`
                                      : `${a.id} 的 ${ctx.channelEditorCredential1Label}`
                                  }
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                />
                                {ctx.channelEditorCredential2Label ? (
                                  <input
                                    type="password"
                                    value={item.credential2 || ""}
                                    onChange={(e) =>
                                      ctx.updateAgentScopedChannelDraft(ch, iid, a.name || a.id, (current) => ({
                                        ...current,
                                        id: iid,
                                        name: a.name || a.id,
                                        channel: ch,
                                        credential1: current.credential1 || "",
                                        credential2: e.target.value,
                                        chat_id: current.chat_id || "",
                                        enabled: current.enabled,
                                      }))
                                    }
                                    placeholder={
                                      ch === "qq"
                                        ? "AppSecret（后台会自动拼成 AppID:AppSecret）"
                                        : `${ctx.channelEditorCredential2Label}(可选)`
                                    }
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                  />
                                ) : (
                                  <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-500 flex items-center">
                                    无第二凭据
                                  </div>
                                )}
                                <input
                                  value={item.chat_id || ""}
                                  onChange={(e) =>
                                    ctx.updateAgentScopedChannelDraft(ch, iid, a.name || a.id, (current) => ({
                                      ...current,
                                      id: iid,
                                      name: a.name || a.id,
                                      channel: ch,
                                      credential1: current.credential1 || "",
                                      credential2: current.credential2 || "",
                                      chat_id: e.target.value,
                                      enabled: current.enabled,
                                    }))
                                  }
                                  placeholder="chatId(可选)"
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                />
                                <label className="flex items-center gap-1 text-xs text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={item.enabled}
                                    onChange={(e) =>
                                      ctx.updateAgentScopedChannelDraft(ch, iid, a.name || a.id, (current) => ({
                                        ...current,
                                        id: iid,
                                        name: a.name || a.id,
                                        channel: ch,
                                        credential1: current.credential1 || "",
                                        credential2: current.credential2 || "",
                                        chat_id: current.chat_id || "",
                                        enabled: e.target.checked,
                                      }))
                                    }
                                  />
                                  启用
                                </label>
                                <button
                                  onClick={() => void ctx.testSingleChannelInstance(ch, iid)}
                                  disabled={singleTesting || !ctx.hasRequiredChannelCredentials(ch, item)}
                                  className="px-2 py-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded text-[11px]"
                                  title={ch === "qq" ? "检测 AppID / AppSecret 配置是否完整，失败时会给出修复建议" : "检测凭据连通性，失败时会给出修复建议"}
                                >
                                  {singleTesting ? "检测中..." : "检测本行"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {remainingCredentialAgents > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>其余 {remainingCredentialAgents} 个 Agent 配置项暂未展开，避免输入区一次挂满。</span>
                            <span className="flex flex-wrap gap-2">
                              <button
                                onClick={() => setChannelCredentialRenderLimit((prev) => Math.min(totalAgentsCount, prev + 6))}
                                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100"
                              >
                                再加载 6 个
                              </button>
                              <button
                                onClick={() => setChannelCredentialRenderLimit(totalAgentsCount)}
                                className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 text-[11px] text-slate-200"
                              >
                                展开全部
                              </button>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                      <label className="text-xs text-slate-300">激活实例（可选）</label>
                      <select
                        value={ctx.activeChannelInstanceByChannel[selectedChannel] || ""}
                        onChange={(e) => {
                          const channel = selectedChannel as string;
                          const nextActive = {
                            ...ctx.activeChannelInstanceByChannel,
                            [selectedChannel]: e.target.value,
                          };
                          ctx.setActiveChannelInstanceByChannel(nextActive);
                          ctx.setChannelInstanceAutosaveStateByChannel((prev) => ({ ...prev, [channel]: "idle" }));
                        }}
                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                      >
                        <option value="">(未选择)</option>
                        {selectedChannelInstanceOptions.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.id} {it.name ? `· ${it.name}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">填写凭据只会先留在当前页面；不选激活实例也能先点“保存配置”生成本地对话网关。要接入外部渠道时，再回来选择激活实例并重新保存。</p>
                    </div>
                    </>
                  )}

                  {selectedChannel === "telegram" && (
                    <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm text-slate-200 font-medium">telegram 实例池</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={ctx.buildTelegramPerAgentDraft}
                          className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-[11px]"
                          title="① 先点这里：生成每个 Agent 的配置项"
                        >
                          按 Agent 自动生成 <span className="text-emerald-200/80 text-[10px]">① 先点</span>
                        </button>
                        {ctx.showAgentAdvancedSettings && (
                          <>
                            <button
                              onClick={() => void ctx.runTelegramFirstSetupWizard()}
                              disabled={ctx.telegramWizardRunning}
                              className="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-[11px]"
                              title="③ 填完 Token 后点这里：一键完成保存、应用、路由与测试"
                            >
                              {ctx.telegramWizardRunning ? "向导执行中..." : "首次配置向导"}
                              <span className="text-indigo-200/80 text-[10px] ml-0.5">③ 填完点</span>
                            </button>
                            <button
                              onClick={() => void ctx.testTelegramInstancesBatch()}
                              disabled={ctx.telegramBatchTesting}
                              className="px-2 py-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded text-[11px]"
                            >
                              {ctx.telegramBatchTesting ? "批量检测中..." : "批量 getMe 检查"}
                            </button>
                            <button
                              onClick={() => void ctx.cleanupBrowserSessionsForTelegramBindings()}
                              disabled={ctx.telegramSessionCleanupRunning}
                              className="px-2 py-1 bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-50 rounded text-[11px]"
                              title="仅保留当前 Telegram 路由绑定到 Agent 的会话（会重写 sessions.json）"
                            >
                              {ctx.telegramSessionCleanupRunning ? "清理中..." : "清理浏览器会话"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      可先点“按 Agent 自动生成”，界面会出现所有 Agent；你只需为每个 Agent 填 Token，确认无误后点底部“保存配置”即可统一写入。
                    </p>
                    {!!ctx.agentsList.agents.length && (
                      <div className="border border-slate-700 rounded p-2 space-y-2">
                        <p className="text-xs text-slate-300">按 Agent 配置 Token（简化）</p>
                        {visibleCredentialAgents.map((a) => {
                          const iid = `tg-${a.id}`;
                          const item =
                            telegramDraftById[iid] ||
                            ({ id: iid, name: a.name || a.id, bot_token: "", chat_id: "", enabled: true } as TelegramBotInstance);
                          const actualUsername = ctx.telegramUsernameByInstanceId[iid];
                          const singleTesting = !!ctx.telegramSingleTestingByInstanceId[iid];
                          return (
                            <div key={`agent-tg-${a.id}`} className="space-y-1">
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                                <div className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300">
                                  {a.id}
                                </div>
                                <input
                                  type="password"
                                  value={item.bot_token}
                                  onChange={(e) =>
                                    ctx.updateAgentScopedTelegramDraft(iid, a.name || a.id, (current) => ({
                                      ...current,
                                      id: iid,
                                      name: a.name || a.id,
                                      bot_token: e.target.value,
                                      chat_id: current.chat_id || "",
                                      enabled: current.enabled,
                                    }))
                                  }
                                  placeholder={`${a.id} 的 Bot Token`}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs md:col-span-3"
                                />
                                <input
                                  value={item.chat_id || ""}
                                  onChange={(e) =>
                                    ctx.updateAgentScopedTelegramDraft(iid, a.name || a.id, (current) => ({
                                      ...current,
                                      id: iid,
                                      name: a.name || a.id,
                                      bot_token: current.bot_token,
                                      chat_id: e.target.value,
                                      enabled: current.enabled,
                                    }))
                                  }
                                  placeholder="chatId(可选)"
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                />
                                <label className="flex items-center gap-1 text-xs text-slate-300">
                                  <input
                                    type="checkbox"
                                    checked={item.enabled}
                                    onChange={(e) =>
                                      ctx.updateAgentScopedTelegramDraft(iid, a.name || a.id, (current) => ({
                                        ...current,
                                        id: iid,
                                        name: a.name || a.id,
                                        bot_token: current.bot_token,
                                        chat_id: current.chat_id || "",
                                        enabled: e.target.checked,
                                      }))
                                    }
                                  />
                                  启用
                                </label>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] text-slate-400">
                                  token 实际对应的 bot username：{actualUsername ? `@${actualUsername}` : "未识别（可点本行检测）"}
                                </p>
                                <button
                                  onClick={() => void ctx.testSingleTelegramInstance(iid)}
                                  disabled={singleTesting || !item.bot_token?.trim()}
                                  className="px-2 py-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded text-[11px]"
                                  title="检测 Token 连通性，失败时会给出修复建议"
                                >
                                  {singleTesting ? "检测中..." : "检测用户名"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {remainingCredentialAgents > 0 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span>其余 {remainingCredentialAgents} 个 Agent Token 行暂未展开，避免首屏输入控件过多。</span>
                            <span className="flex flex-wrap gap-2">
                              <button
                                onClick={() => setChannelCredentialRenderLimit((prev) => Math.min(totalAgentsCount, prev + 6))}
                                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100"
                              >
                                再加载 6 个
                              </button>
                              <button
                                onClick={() => setChannelCredentialRenderLimit(totalAgentsCount)}
                                className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 text-[11px] text-slate-200"
                              >
                                展开全部
                              </button>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                      <label className="text-xs text-slate-300">激活实例（可选）</label>
                      <select
                        value={ctx.activeTelegramInstanceId}
                        onChange={(e) => {
                          const nextActive = e.target.value;
                          ctx.setActiveTelegramInstanceId(nextActive);
                          ctx.setChannelInstanceAutosaveStateByChannel((prev) => ({ ...prev, telegram: "idle" }));
                        }}
                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                      >
                        <option value="">(未选择)</option>
                        {selectedChannelInstanceOptions.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.id} {it.name ? `· ${it.name}` : ""}
                            {ctx.telegramUsernameByInstanceId[it.id] ? ` · @${ctx.telegramUsernameByInstanceId[it.id]}` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500">填写凭据只会先留在当前页面；不选激活实例也能先点“保存配置”生成本地对话网关。要接入 Telegram 时，再选择激活实例并重新保存。</p>
                    </div>
                    </>
                  )}
                    </div>
                  </div>
                  ) : (
                  <DeferredSectionPlaceholder
                    title="渠道实例编辑区正在准备"
                    detail="先显示摘要和渠道切换，凭据表单、插件区和配对审批会在空闲时补上。"
                    blocks={3}
                  />
                  )}

                  {channelsGatewayReady ? (
                  <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm text-slate-200 font-medium">Agent 网关控制台（每个 Agent 一个）</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {ctx.simpleModeForAgent
                            ? "系统会自动把同一 Agent 的 Telegram / QQ / 飞书等渠道合并到同一个网关里。默认静默后台启动；如需看输出，请点“前台查看”。"
                            : "高级模式下仍可检查网关字段，但运行时会自动收敛为每个 Agent 一个网关。默认静默后台启动；如需看输出，请点“前台查看”。"}
                        </p>
                      </div>
                      {(ctx.gatewayBindingsDraft?.length ?? 0) === 0 && (
                        <div className="rounded border border-amber-600/60 bg-amber-900/20 px-2 py-1.5 text-[11px] text-amber-200">
                          提示：先点底部“保存配置”生成当前 Agent 网关；高级模式下也可手动点“按 Agent 自动生成网关”
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => void ctx.refreshGatewayInstances()}
                        disabled={ctx.gatewayRuntimeLoading}
                        className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded text-xs"
                      >
                        {ctx.gatewayRuntimeLoading ? "刷新网关中..." : "刷新网关状态"}
                      </button>
                      <button
                        onClick={() => ctx.setShowGatewayAdvancedActions((prev) => !prev)}
                        className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                      >
                        {ctx.showGatewayAdvancedActions ? "收起网关高级操作" : "展开网关高级操作"}
                      </button>
                      {ctx.showGatewayAdvancedActions && (
                        <>
                          {!ctx.simpleModeForAgent && (
                            <button
                              onClick={() =>
                                ctx.setGatewayBindingsDraft((prev) => [
                                  ...prev,
                                  (() => {
                                    const aid = ctx.agentsList.agents[0]?.id || "main";
                                    const channelMap = ctx.buildChannelInstanceMapForAgent(aid);
                                    const fallbackChannel = ctx.channelInstancesEditorChannel;
                                    const fallbackInstance =
                                      channelMap[fallbackChannel] ||
                                      channelMap.telegram ||
                                      Object.values(channelMap)[0] ||
                                      "";
                                    return {
                                      gateway_id: `gw-${fallbackChannel}-${Date.now().toString(36)}`,
                                      agent_id: aid,
                                      channel: fallbackChannel,
                                      instance_id: fallbackInstance,
                                      channel_instances: channelMap,
                                      enabled: true,
                                      auto_restart: true,
                                    } as GatewayBinding;
                                  })(),
                                ])
                              }
                              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                            >
                              新增网关绑定
                            </button>
                          )}
                          <button
                            onClick={() => void ctx.saveGatewayBindings()}
                            disabled={ctx.agentRuntimeSaving}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-xs"
                          >
                            保存 Agent 网关
                          </button>
                          <button
                            onClick={ctx.generateGatewayBindingsByAgent}
                            className="px-3 py-1.5 bg-violet-700 hover:bg-violet-600 rounded text-xs"
                            title="为每个 Agent 自动生成一个网关，并绑定当前激活的多渠道实例"
                          >
                            按 Agent 自动生成网关
                          </button>
                          <button
                            onClick={() => void ctx.runStartAllEnabledGateways()}
                            disabled={ctx.gatewayBatchLoading === "start"}
                            className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.gatewayBatchLoading === "start" ? "批量启动中..." : "批量启动全部启用网关"}
                          </button>
                          <button
                            onClick={() => void ctx.runRestartAllEnabledGateways()}
                            disabled={ctx.gatewayBatchLoading === "restart"}
                            className="px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.gatewayBatchLoading === "restart" ? "批量重启中..." : "批量重启全部启用网关"}
                          </button>
                          <button
                            onClick={() => void ctx.runHealthAllEnabledGateways()}
                            disabled={ctx.gatewayBatchLoading === "health"}
                            className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.gatewayBatchLoading === "health" ? "批量检查中..." : "批量健康检查"}
                          </button>
                          <button
                            onClick={() => void ctx.exportGatewayDiagnosticReport()}
                            disabled={ctx.gatewayBatchLoading === "report"}
                            className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.gatewayBatchLoading === "report" ? "导出中..." : "导出多网关诊断报告"}
                          </button>
                        </>
                      )}
                    </div>
                    {ctx.gatewayBatchProgress && (
                      <div className="rounded border border-sky-700/60 bg-sky-950/30 px-3 py-2 text-xs text-sky-100">
                        {ctx.gatewayBatchProgress.active
                          ? `批量${ctx.gatewayBatchProgress.action === "restart" ? "重启" : "启动"}进行中：${ctx.gatewayBatchProgress.done}/${ctx.gatewayBatchProgress.total}，成功 ${ctx.gatewayBatchProgress.succeeded}，失败 ${ctx.gatewayBatchProgress.failed}`
                          : `批量${ctx.gatewayBatchProgress.action === "restart" ? "重启" : "启动"}已结束：${ctx.gatewayBatchProgress.done}/${ctx.gatewayBatchProgress.total}，成功 ${ctx.gatewayBatchProgress.succeeded}，失败 ${ctx.gatewayBatchProgress.failed}`}
                      </div>
                    )}
                    <div className="space-y-2" style={ctx.heavyPanelStyle}>
                      {(ctx.gatewayBindingsDraft || []).length === 0 ? (
                        <p className="text-xs text-slate-500">暂无网关绑定。点一次“保存配置”后系统会自动生成。</p>
                      ) : (
                        visibleGatewayBindings.map((g, idx) => {
                          const rowIndex = idx;
                          const loading = !!ctx.gatewayActionLoadingById[g.gateway_id];
                          return (
                            <div
                              key={`gw-row-${g.gateway_id}-${idx}`}
                              className="border border-slate-700 rounded p-2 grid grid-cols-1 md:grid-cols-12 gap-2"
                              style={ctx.heavyPanelStyle}
                            >
                              {ctx.simpleModeForAgent ? (
                                <>
                                  <div className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs md:col-span-4">
                                    <p className="text-slate-200 font-medium">{g.agent_id}</p>
                                    <p className="text-slate-400 mt-1">
                                      网关 ID：{g.gateway_id}
                                      {g.listen_port ? ` · 端口 ${g.listen_port}` : ""}
                                    </p>
                                  </div>
                                  <div className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs md:col-span-5">
                                    <p className="text-slate-300">已接入渠道</p>
                                    <p className="text-slate-400 mt-1 break-all">
                                      {ctx.formatOrderedChannelBindings(g.channel_instances, { channel: g.channel, instance_id: g.instance_id })}
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <input
                                    value={g.gateway_id}
                                    onChange={(e) =>
                                      ctx.setGatewayBindingsDraft((prev) =>
                                        prev.map((x, i) => (i === rowIndex ? { ...x, gateway_id: e.target.value } : x))
                                      )
                                    }
                                    placeholder="gateway_id"
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs md:col-span-2"
                                  />
                                  <select
                                    value={g.agent_id}
                                    onChange={(e) =>
                                      ctx.setGatewayBindingsDraft((prev) =>
                                        prev.map((x, i) => (i === rowIndex ? { ...x, agent_id: e.target.value } : x))
                                      )
                                    }
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs md:col-span-2"
                                  >
                                    {ctx.agentsList.agents.map((a) => (
                                      <option key={`gw-a-${g.gateway_id}-${a.id}`} value={a.id}>
                                        {a.id}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={g.channel}
                                    onChange={(e) =>
                                      ctx.setGatewayBindingsDraft((prev) =>
                                        prev.map((x, i) => (i === rowIndex ? { ...x, channel: e.target.value } : x))
                                      )
                                    }
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                  >
                                    {["telegram", "feishu", "dingtalk", "discord", "qq"].map((ch) => (
                                      <option key={`gw-ch-${g.gateway_id}-${ch}`} value={ch}>
                                        {ch}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    value={g.instance_id}
                                    onChange={(e) =>
                                      ctx.setGatewayBindingsDraft((prev) =>
                                        prev.map((x, i) => (i === rowIndex ? { ...x, instance_id: e.target.value } : x))
                                      )
                                    }
                                    placeholder="instance_id"
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                  />
                                </>
                              )}
                              {!ctx.simpleModeForAgent && (
                                <>
                                  <input
                                    value={ctx.stringifyGatewayChannelInstances(g.channel_instances, g.channel, g.instance_id)}
                                    onChange={(e) =>
                                      ctx.setGatewayBindingsDraft((prev) =>
                                        prev.map((x, i) =>
                                          i === rowIndex
                                            ? {
                                                ...x,
                                                channel_instances: ctx.parseGatewayChannelInstancesText(
                                                  e.target.value,
                                                  x.channel,
                                                  x.instance_id
                                                ),
                                              }
                                            : x
                                        )
                                      )
                                    }
                                    placeholder="多渠道映射: telegram:tg-main,feishu:feishu-main"
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs md:col-span-3"
                                  />
                                  <button
                                    onClick={() =>
                                      ctx.setGatewayBindingsDraft((prev) =>
                                        prev.map((x, i) =>
                                          i === rowIndex ? { ...x, channel_instances: ctx.buildChannelInstanceMapForAgent(x.agent_id) } : x
                                        )
                                      )
                                    }
                                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
                                    title="优先按该 Agent 的路由实例填充映射，其次回退到当前激活实例"
                                  >
                                    按 Agent 路由填充
                                  </button>
                                </>
                              )}
                              {!ctx.simpleModeForAgent && (
                                <input
                                  value={g.listen_port ?? ""}
                                  onChange={(e) =>
                                    ctx.setGatewayBindingsDraft((prev) =>
                                      prev.map((x, i) => ({
                                        ...x,
                                        listen_port: i === rowIndex ? (e.target.value ? Number(e.target.value) : undefined) : x.listen_port,
                                      }))
                                    )
                                  }
                                  placeholder="port"
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                />
                              )}
                              <label className="flex items-center gap-1 text-xs text-slate-300">
                                <input
                                  type="checkbox"
                                  checked={!!g.enabled}
                                  onChange={(e) =>
                                    ctx.setGatewayBindingsDraft((prev) =>
                                      prev.map((x, i) => (i === rowIndex ? { ...x, enabled: e.target.checked } : x))
                                    )
                                  }
                                />
                                启用
                              </label>
                              {ctx.showGatewayAdvancedActions && (
                                <div className="flex flex-wrap gap-1 md:col-span-3">
                                  <button
                                    onClick={() => void ctx.runGatewayAction("start", g.gateway_id)}
                                    disabled={loading}
                                    className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-[11px]"
                                  >
                                    启动
                                  </button>
                                  <button
                                    onClick={() => void ctx.runGatewayAction("stop", g.gateway_id)}
                                    disabled={loading}
                                    className="px-2 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-[11px]"
                                  >
                                    停止
                                  </button>
                                  <button
                                    onClick={() => void ctx.runGatewayAction("restart", g.gateway_id)}
                                    disabled={loading}
                                    className="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-[11px]"
                                  >
                                    重启
                                  </button>
                                  <button
                                    onClick={() => void ctx.runGatewayAction("health", g.gateway_id)}
                                    disabled={loading}
                                    className="px-2 py-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 rounded text-[11px]"
                                  >
                                    探活
                                  </button>
                                  <button
                                    onClick={() => void ctx.runGatewayAction("logs", g.gateway_id)}
                                    disabled={loading}
                                    className="px-2 py-1 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded text-[11px]"
                                  >
                                    日志
                                  </button>
                                  <button
                                    onClick={() => void ctx.openGatewayLogWindow(g.gateway_id)}
                                    disabled={!g.gateway_id}
                                    className="px-2 py-1 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded text-[11px]"
                                  >
                                    前台查看
                                  </button>
                                </div>
                              )}
                              <div
                                className="text-[11px] text-slate-400 md:col-span-12"
                                title={g.health?.detail || ""}
                              >
                                状态: {g.health?.status || "unknown"} · {ctx.summarizeGatewayHealthDetail(g.health?.detail)}
                              </div>
                              {!!ctx.gatewayActionHintById[g.gateway_id] && (
                                <div
                                  className={`text-[11px] md:col-span-12 ${
                                    loading
                                      ? "text-sky-300"
                                      : ctx.gatewayActionHintById[g.gateway_id].includes("失败")
                                        ? "text-rose-300"
                                        : "text-emerald-300"
                                  }`}
                                  title={ctx.gatewayActionHintById[g.gateway_id]}
                                >
                                  最近操作: {ctx.gatewayActionHintById[g.gateway_id]}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {remainingGatewayBindings > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span>其余 {remainingGatewayBindings} 条网关记录暂未展开，避免控制台首屏一次性挂满。</span>
                          <span className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                setGatewayListRenderLimit((prev) => Math.min(ctx.gatewayBindingsDraft.length, prev + 4))
                              }
                              className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100"
                            >
                              再加载 4 条
                            </button>
                            <button
                              onClick={() => setGatewayListRenderLimit(ctx.gatewayBindingsDraft.length)}
                              className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 text-[11px] text-slate-200"
                            >
                              展开全部
                            </button>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  ) : (
                  <DeferredSectionPlaceholder
                    title="Agent 网关控制台正在准备"
                    detail="网关列表、批量操作和状态明细会延后一拍挂载，避免第一次进入时整块压住主线程。"
                    blocks={2}
                  />
                  )}

                  <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 space-y-3" style={ctx.heavyPanelStyle}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm text-slate-200 font-medium">手动路由覆盖</p>
                        <p className="text-xs text-slate-400 mt-1">
                          默认不用改。只有需要强制指定网关、实例，或按 account / peer / chatId 做特殊分流时，才需要改这里。
                        </p>
                      </div>
                      {ctx.showAgentAdvancedSettings && (
                        <button
                          onClick={() => ctx.setShowAdvancedRouteRules((prev) => !prev)}
                          className="px-3 py-1.5 rounded border border-slate-600 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-800/70"
                        >
                          {ctx.showAdvancedRouteRules ? "收起手动路由覆盖" : "展开手动路由覆盖"}
                        </button>
                      )}
                    </div>
                    {!ctx.showAgentAdvancedSettings && (
                      <p className="text-[11px] text-slate-500">
                        如需做特殊分流，请先展开高级设置，再打开这里。
                      </p>
                    )}
                    {ctx.showAgentAdvancedSettings && ctx.showAdvancedRouteRules && (
                      <div className="space-y-3 rounded border border-slate-700 bg-slate-950/30 p-3">
                        {ctx.telegramInstancesDraft.length === 0 && (
                          <div className="rounded border border-amber-700 bg-amber-900/20 p-2 text-xs text-amber-200">
                            你还没有配置 Telegram 实例。请先在上方点“按 Agent 自动生成”，填写 Token，再点底部“保存配置”即可。
                          </div>
                        )}
                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                          {visibleRouteRules.map((route, idx) => (
                            <RouteRuleRow
                              key={route.id || `route-${idx}`}
                              route={route}
                              index={idx}
                              agents={ctx.agentsList.agents}
                              gatewayBindingsDraft={ctx.gatewayBindingsDraft}
                              getChannelInstanceIdsByChannel={ctx.getChannelInstanceIdsByChannel}
                              setChannelRoutesDraft={ctx.setChannelRoutesDraft}
                            />
                          ))}
                        </div>
                        {remainingRouteRules > 0 && (
                          <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3 text-xs text-slate-400">
                            <p>
                              手动路由规则较多时会明显拖慢滚动，这里先渲染前 {visibleRouteRules.length} 条，剩余 {remainingRouteRules} 条按需继续展开。
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  setRouteRuleRenderLimit((prev) =>
                                    Math.min(ctx.channelRoutesDraft.length, prev + ROUTE_RULE_RENDER_STEP)
                                  )
                                }
                                className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-[11px] text-slate-100"
                              >
                                再加载 {Math.min(remainingRouteRules, ROUTE_RULE_RENDER_STEP)} 条
                              </button>
                              <button
                                onClick={() => setRouteRuleRenderLimit(ctx.channelRoutesDraft.length)}
                                className="px-2 py-1 rounded border border-slate-600 hover:border-slate-500 text-[11px] text-slate-200"
                              >
                                展开全部规则
                              </button>
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              ctx.setChannelRoutesDraft((prev) => [
                                ...prev,
                                {
                                  id: "",
                                  channel: "telegram",
                                  agent_id: ctx.agentsList.agents[0]?.id || "main",
                                  bot_instance: "",
                                  account: "",
                                  peer: "",
                                  enabled: true,
                                },
                              ])
                            }
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                          >
                            新增覆盖规则
                          </button>
                          <button
                            onClick={() => void ctx.saveChannelRoutes()}
                            disabled={ctx.agentRuntimeSaving}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.agentRuntimeSaving ? "保存中..." : "保存手动覆盖"}
                          </button>
                        </div>
                        <div className="border border-slate-700 rounded p-2 space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-xs text-slate-300">路由命中测试</p>
                            <button
                              onClick={() => ctx.setShowRouteTestPanel((prev) => !prev)}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
                            >
                              {ctx.showRouteTestPanel ? "收起测试面板" : "展开测试面板"}
                            </button>
                          </div>
                          {ctx.showRouteTestPanel && (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                                <select
                                  value={ctx.gatewaySelectedIdForRouteTest}
                                  onChange={(e) => ctx.setGatewaySelectedIdForRouteTest(e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                >
                                  <option value="">网关(任意)</option>
                                  {ctx.gatewayBindingsDraft.map((g) => (
                                    <option key={`route-gw-${g.gateway_id}`} value={g.gateway_id}>
                                      {g.gateway_id}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={ctx.routeTestChannel}
                                  onChange={(e) => ctx.setRouteTestChannel(e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                >
                                  {["telegram", "feishu", "dingtalk", "discord", "qq"].map((ch) => (
                                    <option key={ch} value={ch}>
                                      {ch}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={ctx.routeTestBotInstance}
                                  onChange={(e) => ctx.setRouteTestBotInstance(e.target.value)}
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                >
                                  <option value="">实例(任意)</option>
                                  {ctx.getChannelInstanceIdsByChannel(ctx.routeTestChannel).map((iid) => (
                                    <option key={iid} value={iid}>
                                      {iid}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={ctx.routeTestAccount}
                                  onChange={(e) => ctx.setRouteTestAccount(e.target.value)}
                                  placeholder="account(可选)"
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                />
                                <input
                                  value={ctx.routeTestPeer}
                                  onChange={(e) => ctx.setRouteTestPeer(e.target.value)}
                                  placeholder="peer/chatId(可选)"
                                  className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-xs"
                                />
                                <button
                                  onClick={() => void ctx.testChannelRoute()}
                                  disabled={ctx.routeTesting}
                                  className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 rounded text-xs"
                                >
                                  {ctx.routeTesting ? "测试中..." : "测试命中"}
                                </button>
                              </div>
                              {ctx.routeTestResult && <p className="text-xs text-sky-300 whitespace-pre-wrap">{ctx.routeTestResult}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {ctx.gatewayLogViewerId && (
                    <div
                      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
                      onClick={() => ctx.setGatewayLogViewerId(null)}
                    >
                      <div
                        className="w-[92vw] max-w-4xl bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-slate-200">网关日志：{ctx.gatewayLogViewerId}</p>
                          <button
                            onClick={() => ctx.setGatewayLogViewerId(null)}
                            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                          >
                            关闭
                          </button>
                        </div>
                        <pre className="max-h-[60vh] overflow-auto bg-slate-950/70 border border-slate-800 rounded p-2 text-[11px] text-slate-300 whitespace-pre-wrap">
                          {ctx.gatewayLogsById[ctx.gatewayLogViewerId] || "(暂无日志)"}
                        </pre>
                      </div>
                    </div>
                  )}
                  {(() => {
                    const focusedAgentId =
                      ctx.selectedAgentId ||
                      ctx.agentsList.agents.find((a) => a.default)?.id ||
                      ctx.agentsList.agents[0]?.id ||
                      "";
                    const currentGatewayBinding =
                      ctx.gatewayBindingsDraft.find((g) => (g.agent_id || "").trim() === focusedAgentId && g.enabled !== false) ||
                      ctx.gatewayBindingsDraft.find((g) => (g.agent_id || "").trim() === focusedAgentId) ||
                      null;
                    const currentGatewayId = currentGatewayBinding?.gateway_id || "";
                    const gatewayLoading = currentGatewayId ? !!ctx.gatewayActionLoadingById[currentGatewayId] : false;
                    const currentGatewayHint = currentGatewayId ? ctx.gatewayActionHintById[currentGatewayId] || "" : "";
                    const gatewayLooksRunning = currentGatewayBinding?.health?.status === "ok";
                    const gatewayPortOnlyHealth = currentGatewayBinding ? !!ctx.isGatewayPortOnlyHealth?.(currentGatewayBinding.health) : false;
                    const testingCurrentChannel =
                      ctx.channelInstancesEditorChannel === "telegram"
                        ? ctx.telegramBatchTesting
                        : !!ctx.channelBatchTestingByChannel[ctx.channelInstancesEditorChannel];
                    return (
                      <div className="sticky bottom-0 z-20 rounded-lg border border-slate-700 bg-slate-950/90 backdrop-blur px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.28)]">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="text-xs text-slate-300">
                            <p>
                              当前 Agent：<span className="text-slate-100 font-medium">{focusedAgentId || "未选择"}</span>
                              {" · "}
                              当前渠道：<span className="text-slate-100 font-medium">{getChannelDisplayName(ctx.channelInstancesEditorChannel)}</span>
                            </p>
                            <p className="text-slate-500 mt-1">
                              当前网关：{currentGatewayId || "未生成，先点保存配置"}{currentGatewayBinding?.listen_port ? ` · 端口 ${currentGatewayBinding.listen_port}` : ""}
                            </p>
                            {currentGatewayHint && <p className="text-slate-400 mt-1">网关反馈：{currentGatewayHint}</p>}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() =>
                                void (ctx.channelInstancesEditorChannel === "telegram"
                                  ? ctx.saveAndApplyTelegramSetup()
                                  : ctx.saveAndApplyChannelSetup(ctx.channelInstancesEditorChannel as string))
                              }
                              disabled={ctx.agentRuntimeSaving}
                              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-xs font-medium"
                            >
                              {ctx.agentRuntimeSaving ? "保存中..." : "保存配置"}
                            </button>
                            <button
                              onClick={() =>
                                void (ctx.channelInstancesEditorChannel === "telegram"
                                  ? ctx.testTelegramInstancesBatch()
                                  : ctx.testChannelInstancesBatch(ctx.channelInstancesEditorChannel as string))
                              }
                              disabled={testingCurrentChannel}
                              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-xs font-medium"
                            >
                              {testingCurrentChannel ? "检查中..." : "检查机器人"}
                            </button>
                            <button
                              onClick={() => void ctx.runGatewayAction(gatewayLooksRunning ? "restart" : "start", currentGatewayId)}
                              disabled={!currentGatewayId || gatewayLoading}
                              className="px-3 py-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded-lg text-xs font-medium"
                              title={
                                !currentGatewayId
                                  ? "先点“保存配置”生成当前 Agent 网关，再来启动"
                                  : gatewayLooksRunning
                                    ? gatewayPortOnlyHealth
                                      ? "当前只确认网关端口已监听；如果渠道没回复，建议先重启当前 Agent 网关或点“日志”继续检查。"
                                      : "当前配置改动后，可在这里重启当前 Agent 网关使其生效"
                                    : "在这里启动当前 Agent 网关，启动后即可网页对话和客户端对话"
                              }
                            >
                              {gatewayLoading ? (gatewayLooksRunning ? "重启中..." : "启动中...") : gatewayLooksRunning ? "重启当前 Agent 网关" : "启动当前 Agent 网关"}
                            </button>
                            <button
                              onClick={() => void ctx.openGatewayLogWindow(currentGatewayId)}
                              disabled={!currentGatewayId}
                              className="px-3 py-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 rounded-lg text-xs font-medium"
                              title="打开实时日志窗口，不会重启当前网关"
                            >
                              前台查看网关
                            </button>
                          </div>
                        </div>
                        {ctx.stickyChannelActionFeedbackCard ? (
                          <FeedbackCard {...ctx.stickyChannelActionFeedbackCard} className="mt-3 text-xs" />
                        ) : null}
                        {ctx.telegramSelfHealFeedbackCard ? (
                          <FeedbackCard {...ctx.telegramSelfHealFeedbackCard} className="mt-3 text-xs" />
                        ) : null}
                      </div>
                    );
                  })()}
                  </div>
                  ) : (
                  <DeferredPanelPlaceholder label="渠道配置面板正在准备" />
                  )
                  )}
                  {ctx.showCreateAgent && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => ctx.setShowCreateAgent(false)}>
                      <div className="bg-slate-800 rounded-lg p-4 max-w-md w-full mx-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-medium text-slate-200">新建 Agent</h3>
                        <label className="block text-xs text-slate-400">ID (必填)</label>
                        <input
                          value={ctx.createAgentId}
                          onChange={(e) => ctx.setCreateAgentId(e.target.value)}
                          placeholder="work-agent"
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                        />
                        <label className="block text-xs text-slate-400">名称 (选填)</label>
                        <input
                          value={ctx.createAgentName}
                          onChange={(e) => ctx.setCreateAgentName(e.target.value)}
                          placeholder="显示名称"
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                        />
                        <label className="block text-xs text-slate-400">Workspace (选填)</label>
                        <input
                          value={ctx.createAgentWorkspace}
                          onChange={(e) => ctx.setCreateAgentWorkspace(e.target.value)}
                          placeholder="留空使用默认"
                          className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-sm"
                        />
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => ctx.setShowCreateAgent(false)}
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs"
                          >
                            取消
                          </button>
                          <button
                            onClick={async () => {
                              if (!ctx.createAgentId.trim()) {
                                alert("请输入 Agent ID");
                                return;
                              }
                              const newAgentId = ctx.createAgentId.trim();
                              ctx.setCreatingAgent(true);
                              try {
                                ctx.updateRuntimeDirtyFlags({ agentsDirty: true, runtimeConfigDirty: true });
                                await invoke("create_agent", {
                                  id: newAgentId,
                                  name: ctx.createAgentName.trim() || undefined,
                                  workspace: ctx.createAgentWorkspace.trim() || undefined,
                                  customPath: ctx.normalizeConfigPath(ctx.customConfigPath) || undefined,
                                });
                                ctx.setShowCreateAgent(false);
                                ctx.setCreateAgentId("");
                                ctx.setCreateAgentName("");
                                ctx.setCreateAgentWorkspace("");
                                ctx.setSelectedAgentId(newAgentId);
                                ctx.setAgentCenterTab("channels");
                                await ctx.refreshAgentsList();
                                await ctx.refreshAgentRuntimeSettings(undefined, { probeLive: false });
                                await ctx.ensureAgentSpecialtyIdentity(newAgentId);
                                const nextStepMessage =
                                  `已创建 Agent「${newAgentId}」。\n下一步：先到下方渠道配置点一次“保存配置”。\n保存完成后，再去聊天页或当前 Agent 配置页启动当前 Agent 网关，就可以直接网页对话和客户端对话。\n后续如果再新增 Telegram / QQ / 飞书等渠道，也同样是保存后再启动/重启当前 Agent 网关。`;
                                ctx.setAgentsActionResult(nextStepMessage);
                                ctx.setAgentRuntimeResult(null);
                              } catch (e) {
                                alert(String(e));
                              } finally {
                                ctx.setCreatingAgent(false);
                              }
                            }}
                            disabled={ctx.creatingAgent}
                            className="px-3 py-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 rounded text-xs"
                          >
                            {ctx.creatingAgent ? "创建中..." : "创建"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">暂无 Agent 数据</p>
              )}
            </div>
  );
}

export default memo(TuningAgentsSection);
