import { BackButton } from "@/components/ui/back-button";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** 子页面的逻辑父页面；顶级页面由全局导航负责跳转，不传 */
    backHref?: string;
    /** 标题右侧的操作按钮 */
    actions?: React.ReactNode;
    /** 紧跟标题的附加元素，如重命名按钮 */
    titleAddon?: React.ReactNode;
    className?: string;
}

/** 统一的页面标题区：返回按钮 + 标题/副标题 + 右侧操作 */
export function PageHeader({ title, description, backHref, actions, titleAddon, className }: PageHeaderProps) {
    return (
        <div className={cn("flex items-start gap-3", className)}>
            {backHref && <BackButton fallbackUrl={backHref} className="-ml-2 shrink-0" />}
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1">
                    <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
                    {titleAddon}
                </div>
                {description && (
                    <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
                )}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
