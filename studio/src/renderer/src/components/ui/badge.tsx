import React from "react"

const badgeVariants = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  outline: "text-foreground border border-input",
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants
}

function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantClass = badgeVariants[variant] || badgeVariants.default

  return (
    <div
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variantClass}`}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
