// @ts-nocheck
import { ShieldCheck } from "lucide-react";

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
          ? <pre className={`mt-2 overflow-auto whitespace-pre-wrap text-[11px] opacity-90 ${detailClassName}`.trim()}>{detail}</pre>
          : <p className={`mt-1 whitespace-pre-wrap text-[11px] opacity-90 ${detailClassName}`.trim()}>{detail}</p>
        : null}
    </div>
  );
}

function HealthLamp({ label, state }: { label: string; state: string }) {
  const color =
    state === "ok"
      ? "bg-emerald-500"
      : state === "warn"
        ? "bg-amber-500"
        : state === "error"
          ? "bg-red-500"
          : "bg-slate-500";
  const text =
    state === "ok" ? "正常" : state === "warn" ? "关注" : state === "error" ? "异常" : "未知";
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-xs text-slate-300">{label}</span>
      <span className="ml-auto text-xs text-slate-500">{text}</span>
    </div>
  );
}

export default function TuningHealthSection(props: { ctx: Record<string, any> }) {
  const ctx = props.ctx as Record<string, any>;

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
      <p className="font-medium text-slate-200 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        健康检查与自愈
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
        <HealthLamp label="模型探活" state={ctx.runtimeProbeResult?.includes("失败") ? "error" : ctx.runtimeProbeResult ? "ok" : "unknown"} />
        <HealthLamp label="Skills可用率" state={ctx.skillsCatalog.length ? (ctx.skillsCatalog.some((s) => s.eligible) ? "ok" : "warn") : "unknown"} />
        <HealthLamp
          label="自检状态"
          state={ctx.selfCheckItems.some((x) => x.status === "error") ? "error" : ctx.selfCheckItems.some((x) => x.status === "warn") ? "warn" : ctx.selfCheckItems.length ? "ok" : "unknown"}
        />
        <HealthLamp label="记忆状态" state={ctx.memoryStatus?.enabled ? "ok" : "warn"} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={ctx.handleTuningHealthCheck}
          disabled={ctx.tuningActionLoading !== null}
          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded text-xs"
        >
          {ctx.tuningActionLoading === "check" ? "体检中..." : "一键体检"}
        </button>
        <button
          onClick={ctx.handleTuningSelfHeal}
          disabled={ctx.tuningActionLoading !== null}
          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-xs"
        >
          {ctx.tuningActionLoading === "heal" ? "修复中..." : "一键修复"}
        </button>
      </div>
      <div className="bg-slate-900/40 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 space-y-3" style={ctx.heavyPanelStyle}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="font-medium text-slate-200">运行状态与任务队列</p>
            <p className="text-xs text-slate-500 mt-1">这部分已从聊天页迁入这里，减少聊天滚动时的布局和重绘压力。</p>
          </div>
          <button
            onClick={() => {
              ctx.setStep(3);
            }}
            className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
          >
            返回聊天页
          </button>
        </div>
        {ctx.startFeedbackCard ? (
          <FeedbackCard {...ctx.startFeedbackCard} className="text-sm" detailAsPre detailClassName="max-h-28" />
        ) : (
          <p className="text-xs text-slate-500">最近没有新的网关反馈。</p>
        )}
        <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-300 space-y-3" style={ctx.heavyPanelStyle}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="font-medium text-slate-200">任务队列中心</p>
              <p className="text-xs text-slate-500 mt-1">
                共 {ctx.serviceQueueSummary.total} 个任务
                {ctx.serviceQueueSummary.running ? ` · 运行中 ${ctx.serviceQueueSummary.running}` : ""}
                {ctx.serviceQueueSummary.queued ? ` · 排队 ${ctx.serviceQueueSummary.queued}` : ""}
                {ctx.serviceQueueSummary.failed ? ` · 失败 ${ctx.serviceQueueSummary.failed}` : ""}
                {ctx.serviceQueueSummary.cancelled ? ` · 已取消 ${ctx.serviceQueueSummary.cancelled}` : ""}
              </p>
            </div>
            {ctx.queueTasks.length > 0 && (
              <button
                onClick={() => ctx.setShowServiceQueueDetails((prev) => !prev)}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
              >
                {ctx.showServiceQueueDetails ? "收起任务详情" : "展开任务详情"}
              </button>
            )}
          </div>
          {ctx.queueTasks.length === 0 ? (
            <p className="text-xs text-slate-500">暂无任务。重操作会进入队列并串行执行。</p>
          ) : ctx.showServiceQueueDetails ? (
            <div className="space-y-2 max-h-44 overflow-auto">
              {ctx.serviceRecentQueueTasks.map((t) => (
                <div key={t.id} className="bg-slate-900/40 border border-slate-700 rounded p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-200">
                      {t.name}
                      <span className="ml-2 text-slate-400">[{t.status}]</span>
                    </p>
                    <div className="flex gap-1">
                      {(t.status === "queued" || t.status === "running") && (
                        <button
                          onClick={() => ctx.cancelTask(t.id)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px]"
                        >
                          取消
                        </button>
                      )}
                      {(t.status === "error" || t.status === "cancelled") && t.retryCount < t.maxRetries && (
                        <button
                          onClick={() => ctx.retryTask(t.id)}
                          className="px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-[11px]"
                        >
                          重试
                        </button>
                      )}
                    </div>
                  </div>
                  {t.error && <p className="text-[11px] text-rose-300 mt-1">{t.error}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">默认仅显示摘要，点击“展开任务详情”查看最近 5 条任务。</p>
          )}
        </div>
      </div>
    </div>
  );
}
