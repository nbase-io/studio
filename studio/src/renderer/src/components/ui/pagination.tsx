import React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const Pagination = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <nav
    role="navigation"
    aria-label="pagination"
    className="mx-auto flex w-full justify-center"
    {...props}
  />
)

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className="flex flex-row items-center gap-1"
    {...props}
  />
))
PaginationContent.displayName = "PaginationContent"

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.LiHTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className="cursor-pointer" {...props} />
))
PaginationItem.displayName = "PaginationItem"

type PaginationLinkProps = {
  isActive?: boolean
} & React.AnchorHTMLAttributes<HTMLAnchorElement>

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps & {
  size?: "default" | "sm" | "lg" | "icon"
}) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={`flex h-8 w-8 items-center justify-center rounded-md border ${
      isActive ? "border-primary bg-primary" : "border-input bg-transparent"
    } hover:bg-gray-100`}
    {...props}
  />
)
PaginationLink.displayName = "PaginationLink"

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to previous page"
    size="default"
    className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"
    {...props}
  >
    <ChevronLeft className="h-4 w-4" />
  </PaginationLink>
)
PaginationPrevious.displayName = "PaginationPrevious"

const PaginationNext = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to next page"
    size="default"
    className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-gray-100 disabled:opacity-50 disabled:pointer-events-none"
    {...props}
  >
    <ChevronRight className="h-4 w-4" />
  </PaginationLink>
)
PaginationNext.displayName = "PaginationNext"

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
