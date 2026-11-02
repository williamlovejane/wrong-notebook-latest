import { Loader2 } from "lucide-react";

/** 整页加载占位 */
export function PageLoading({ label }: { label?: string }) {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            {label && <p className="text-sm">{label}</p>}
        </div>
    );
}
