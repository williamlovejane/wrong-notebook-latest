import { CheckCircle, Clock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MasteryStatus } from "@/lib/mastery-status";

interface MasteryStatusBadgeProps {
    status: MasteryStatus;
    className?: string;
}

const STATUS_STYLE: Record<MasteryStatus, { className: string; icon: typeof Clock }> = {
    new: { className: "bg-warning/15 text-amber-700 dark:text-warning", icon: Clock },
    reviewing: { className: "bg-primary/10 text-primary", icon: RefreshCw },
    mastered: { className: "bg-success/15 text-success", icon: CheckCircle },
};

/** 卡片左边框颜色，与徽标颜色对应 */
export const MASTERY_STATUS_BORDER: Record<MasteryStatus, string> = {
    new: "border-l-warning/70",
    reviewing: "border-l-primary/60",
    mastered: "border-l-success/70",
};

export function MasteryStatusBadge({ status, className = "" }: MasteryStatusBadgeProps) {
    const { t } = useLanguage();
    const { className: statusClassName, icon: Icon } = STATUS_STYLE[status];
    const label = status === "mastered" ? t.notebook.mastered : status === "reviewing" ? t.notebook.reviewing : t.notebook.review;

    return (
        <Badge variant="secondary" className={`${statusClassName} ${className}`}>
            <span className="flex items-center gap-1">
                <Icon className="h-3 w-3" /> {label}
            </span>
        </Badge>
    );
}
