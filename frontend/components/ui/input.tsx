import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, inputMode, ...props }, ref) => {
    const resolvedMode =
      inputMode ??
      (type === "number" ? "decimal" : type === "tel" ? "tel" : undefined);
    return (
      <input
        type={type}
        inputMode={resolvedMode}
        className={cn(
          "flex h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base transition-colors file:h-auto file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 md:text-sm",
          type === "number" && "tabular-nums",
          type === "file" && "h-auto min-h-10 py-2 sm:min-h-9",
          (type === "date" || type === "month" || type === "time") &&
            "relative h-11 min-h-11 overflow-visible px-3 pe-11 text-base leading-normal sm:h-9 sm:min-h-9 sm:pe-8 md:text-sm [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-y-0 [&::-webkit-calendar-picker-indicator]:right-2 [&::-webkit-calendar-picker-indicator]:my-auto [&::-webkit-calendar-picker-indicator]:size-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:min-w-0",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
