import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/src/lib/utils";

interface AlertProps {
    type?: "success" | "error" | "warning" | "info";
    title?: string;
    message: string;
    className?: string;
}

export function Alert({ type = "info", title, message, className }: AlertProps) {
    const styles = {
        success: "bg-success/15 text-success border-success/40 dark:bg-success/20 dark:text-success dark:border-success/50",
        error: "bg-destructive/15 text-destructive border-destructive/40 dark:bg-destructive/20 dark:text-destructive/90 dark:border-destructive/50",
        warning: "bg-warning/20 text-warning border-warning/40 dark:bg-warning/25 dark:text-warning dark:border-warning/50",
        info: "bg-info/15 text-info border-info/40 dark:bg-info/20 dark:text-info dark:border-info/50",
    };

    const icons = {
        success: CheckCircle2,
        error: XCircle,
        warning: AlertCircle,
        info: AlertCircle, // Or Info icon if imported
    };

    const Icon = icons[type];
    const colorClass = styles[type];

    return (
        <div className={cn("flex gap-3 p-4 rounded-lg border", colorClass, className)}>
            <div className="shrink-0">
                <Icon className="w-5 h-5 mt-0.5" />
            </div>
            <div className="flex-1">
                {title && <h4 className="font-semibold mb-1 text-sm">{title}</h4>}
                <p className="text-sm opacity-90">{message}</p>
            </div>
        </div>
    );
}
