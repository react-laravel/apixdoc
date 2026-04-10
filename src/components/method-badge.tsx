import { Badge } from "@/components/ui/badge";
import { cn, METHOD_COLORS } from "@/lib/utils";

interface MethodBadgeProps {
  method: string;
  className?: string;
}

export function MethodBadge({ method, className }: MethodBadgeProps) {
  const upper = method.toUpperCase();
  const colorClass = METHOD_COLORS[upper] ?? "bg-zinc-100 text-zinc-700";

  return (
    <Badge
      variant="secondary"
      className={cn("font-mono text-[10px] px-1.5 py-0", colorClass, className)}
    >
      {upper}
    </Badge>
  );
}
