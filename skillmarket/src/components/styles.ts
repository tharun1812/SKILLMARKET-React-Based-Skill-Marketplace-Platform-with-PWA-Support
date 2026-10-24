export const inputClass = (invalid = false) =>
  `mt-1 w-full rounded-lg border bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    invalid ? 'border-red-500 focus:ring-red-200' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-200'}`;

export const buttonClass = (variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'primary') =>
  `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${{
    primary: 'bg-brand-700 text-white hover:bg-brand-800',
    secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-brand-700 hover:bg-brand-50',
  }[variant]}`;
