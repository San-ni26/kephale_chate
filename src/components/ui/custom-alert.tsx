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
        success: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-900/10 dark:text-emerald-200 dark:border-emerald-800",
        error: "bg-red-50 text-red-900 border-red-200 dark:bg-red-900/10 dark:text-red-200 dark:border-red-800",
        warning: "bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/10 dark:text-yellow-200 dark:border-yellow-800",
        info: "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-900/10 dark:text-blue-200 dark:border-blue-800",
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
