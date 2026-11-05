import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  htmlFor: string
  children: ReactNode
  hint?: string
  required?: boolean
  className?: string
  labelExtra?: ReactNode
}

export function FormField({
  label,
  htmlFor,
  children,
  hint,
  required = false,
  className,
  labelExtra,
}: FormFieldProps) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-ink">
          {label}
          {required ? <span className="ml-1 text-accent">*</span> : null}
        </label>
        {labelExtra}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-[11px] leading-4 text-muted">{hint}</p> : null}
    </div>
  )
}
