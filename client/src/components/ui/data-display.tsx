import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TrendIndicatorProps {
  value: number;
  invert?: boolean;
  showIcon?: boolean;
  className?: string;
}

export const TrendIndicator = ({ value, invert = false, showIcon = true, className }: TrendIndicatorProps) => {
    if (value === 0) return <span className={cn("text-muted-foreground text-xs font-medium", className)}>0%</span>;
    
    // Standard: Up is Good (Green), Down is Bad (Red)
    // Invert: Up is Bad (Red), Down is Good (Green) - e.g. for Rank (lower is better)
    
    const isPositive = value > 0;
    const isGood = invert ? !isPositive : isPositive;
    
    return (
        <span className={cn(
            "flex items-center text-xs font-medium",
            isGood ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500",
            className
        )}>
            {showIcon && (
                <span className="mr-0.5 text-[10px] leading-none">
                    {isPositive ? "▲" : "▼"}
                </span>
            )}
            {Math.abs(value)}%
        </span>
    );
};

export const ConfidenceBadge = ({ level }: { level: "High" | "Medium" | "Low" }) => {
    return (
        <Badge variant="outline" className={cn(
            "text-[10px] px-1.5 py-0 h-5 font-normal border",
            level === "High" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800" :
            level === "Medium" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800" :
            "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
        )}>
            {level}
        </Badge>
    );
};
