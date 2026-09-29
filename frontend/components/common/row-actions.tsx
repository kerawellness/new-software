import { MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowActionItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
};

/** One primary tap + overflow menu for extra actions. */
export function RowActions({
  primary,
  items,
}: {
  primary?: ReactNode;
  items?: Array<RowActionItem | null | undefined | false>;
}) {
  const extras = (items ?? []).filter((item): item is RowActionItem => Boolean(item));
  if (!primary && extras.length === 0) return null;

  return (
    <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
      {primary}
      {extras.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="size-10 shrink-0 rounded-xl border-line p-0 transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5 sm:size-9"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {extras.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.label}
                  className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
                  onClick={item.onSelect}
                >
                  {Icon ? <Icon className="mr-2 size-3.5" aria-hidden /> : null}
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
