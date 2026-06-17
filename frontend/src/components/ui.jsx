import { clsx } from "../lib/utils";

export function Card({ className, children, ...rest }) {
  return (
    <div
      className={clsx(
        "bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-xl",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={clsx("px-5 py-4 border-b border-slate-800 flex items-start justify-between", className)}>
      <div>
        <h3 className="font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Button({ variant = "primary", size = "md", className, children, ...rest }) {
  const variants = {
    primary: "bg-sky-600 hover:bg-sky-500 text-white",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100",
    ghost: "hover:bg-slate-800 text-slate-300",
    danger: "bg-red-600 hover:bg-red-500 text-white",
    outline: "border border-slate-700 hover:border-slate-600 text-slate-200",
  };
  const sizes = {
    sm: "text-xs px-2.5 py-1.5 gap-1",
    md: "text-sm px-4 py-2 gap-2",
    lg: "text-base px-5 py-2.5 gap-2",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ className, ...rest }) {
  return (
    <input
      className={clsx(
        "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm",
        "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent",
        "placeholder:text-slate-600",
        className
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }) {
  return (
    <textarea
      className={clsx(
        "w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm",
        "focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent",
        "placeholder:text-slate-600 resize-y",
        className
      )}
      {...rest}
    />
  );
}

export function Badge({ className, children, color = "slate" }) {
  const colors = {
    slate: "text-slate-300 bg-slate-800 border-slate-700",
    sky: "text-sky-300 bg-sky-950/40 border-sky-900",
    emerald: "text-emerald-300 bg-emerald-950/40 border-emerald-900",
    amber: "text-amber-300 bg-amber-950/40 border-amber-900",
    red: "text-red-300 bg-red-950/40 border-red-900",
    violet: "text-violet-300 bg-violet-950/40 border-violet-900",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
        colors[color],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return (
    <svg
      className={clsx("animate-spin w-4 h-4", className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-12">
      {Icon && (
        <div className="inline-flex p-3 rounded-full bg-slate-800 mb-4">
          <Icon className="w-6 h-6 text-slate-500" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {description && <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
