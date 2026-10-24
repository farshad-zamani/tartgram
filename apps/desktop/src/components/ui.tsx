import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-cream-50">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-sand">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
  index = 0,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  hint?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="panel p-5"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-sand">{label}</span>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink-850 text-coral-400 ring-1 ring-ink-700">
          {icon}
        </span>
      </div>
      <div className="mt-3 text-2xl font-extrabold text-cream-50">{value}</div>
      {hint && <div className="mt-1 text-xs text-sand">{hint}</div>}
    </motion.div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "coral" | "moss" | "amber";
}) {
  const tones: Record<string, string> = {
    neutral: "border-ink-700 bg-ink-850 text-cream-300",
    coral: "border-coral-500/30 bg-coral-500/10 text-coral-400",
    moss: "border-moss/30 bg-moss/10 text-moss",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-coral-500" : "bg-ink-700"}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream-50 shadow transition-all ${
          checked ? "start-0.5" : "start-[22px]"
        }`}
      />
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-850 text-coral-400 ring-1 ring-ink-700">
        {icon}
      </span>
      <h3 className="text-lg font-bold text-cream-50">{title}</h3>
      <p className="max-w-sm text-sm leading-7 text-sand">{body}</p>
      {action}
    </div>
  );
}
