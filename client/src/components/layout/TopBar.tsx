import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, Calendar, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { PLAN_LIMITS, TimeWindow } from "@/lib/data-model";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCurrentBrand } from "@/hooks/use-brand";

interface TopBarProps {
    title?: string;
    showTimeSelector?: boolean;
    showExport?: boolean;
    showBaselineToggle?: boolean;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    onTimeWindowChange?: (tw: TimeWindow) => void;
    timeWindowValue?: TimeWindow;
}

export function TopBar({ title, showTimeSelector = true, showExport = true, showBaselineToggle = true, onRefresh, isRefreshing, onTimeWindowChange, timeWindowValue }: TopBarProps) {
    const [timeWindow, setTimeWindow] = useState<TimeWindow>(timeWindowValue || "7d");
    const [compareBaseline, setCompareBaseline] = useState(true);

    useEffect(() => {
      if (timeWindowValue && timeWindowValue !== timeWindow) {
        setTimeWindow(timeWindowValue);
      }
    }, [timeWindowValue]);
    const { brand } = useCurrentBrand();
    const planCaps = brand ? PLAN_LIMITS[brand.tier as keyof typeof PLAN_LIMITS] : PLAN_LIMITS.free;

    return (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
            <div>
                {title && <h1 className="text-2xl font-display font-bold tracking-tight">{title}</h1>}
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1.5">
                         <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Last updated: Just now
                    </span>
                    {compareBaseline && (
                         <span className="ml-2 pl-2 border-l">
                            Vs prev {timeWindow}
                         </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                 {showBaselineToggle && (
                    <div className="flex items-center gap-2 mr-2 px-3 py-1.5 bg-muted/30 rounded-full border">
                        <Switch id="baseline-mode" checked={compareBaseline} onCheckedChange={setCompareBaseline} className="scale-75" />
                        <Label htmlFor="baseline-mode" className="text-xs cursor-pointer font-medium">Compare Baseline</Label>
                    </div>
                 )}

                 {showTimeSelector && (
                    <Select value={timeWindow} onValueChange={(v) => { setTimeWindow(v as TimeWindow); onTimeWindowChange?.(v as TimeWindow); }}>
                        <SelectTrigger className="w-[110px] h-8 text-xs bg-background">
                            <Calendar className="mr-2 h-3 w-3" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="28d">Last 28 days</SelectItem>
                            <SelectItem value="90d">Last 90 days</SelectItem>
                            <SelectItem value="custom">Custom...</SelectItem>
                        </SelectContent>
                    </Select>
                 )}

                 <Button variant="outline" size="icon" onClick={onRefresh} disabled={isRefreshing} data-testid="button-refresh">
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="sr-only">Refresh</span>
                 </Button>

                 {showExport && (
                    <Popover>
                        <PopoverTrigger asChild>
                             <Button variant="outline" size="sm" className="h-8 text-xs gap-2">
                                <Download className="h-3.5 w-3.5" />
                                Export
                             </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56" align="end">
                            <div className="space-y-2">
                                <h4 className="font-medium text-sm">Export Data</h4>
                                <p className="text-xs text-muted-foreground mb-2">Download current view data.</p>
                                {planCaps.exportsAllowed ? (
                                    <div className="grid gap-2">
                                        <Button size="sm" variant="outline" className="justify-start h-8">Download CSV</Button>
                                        <Button size="sm" variant="outline" className="justify-start h-8">Download PDF Report</Button>
                                    </div>
                                ) : (
                                    <div className="bg-muted p-3 rounded-md text-xs text-center space-y-2">
                                        <AlertCircle className="h-5 w-5 mx-auto text-muted-foreground" />
                                        <p>Exporting is limited to Growth plans and above.</p>
                                        <Button size="sm" className="w-full h-7 text-xs">Upgrade Plan</Button>
                                    </div>
                                )}
                            </div>
                        </PopoverContent>
                    </Popover>
                 )}
            </div>
        </div>
    );
}
