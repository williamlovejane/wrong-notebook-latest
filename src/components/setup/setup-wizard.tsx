"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import { AiStep } from "./ai-step";
import { NotebookStep } from "./notebook-step";
import { PasswordStep } from "./password-step";

type SetupStep = "password" | "ai" | "notebook";

interface SetupWizardProps {
    /** 进入向导时是否仍在使用默认密码 */
    mustChangePassword: boolean;
    /** 安装向导此前已完成：只因默认密码进来时，改完密码即结束 */
    setupCompleted: boolean;
}

/** 安装向导：修改默认密码 → 配置 AI 渠道 → 创建第一个错题本 */
export function SetupWizard({ mustChangePassword, setupCompleted }: SetupWizardProps) {
    const { t } = useLanguage();
    const router = useRouter();
    // 步骤在进入时确定，改完密码后会话变化也不再增减
    const [steps] = useState<SetupStep[]>(() => {
        if (mustChangePassword && setupCompleted) return ["password"];
        return mustChangePassword ? ["password", "ai", "notebook"] : ["ai", "notebook"];
    });
    const [index, setIndex] = useState(0);
    const [finishing, setFinishing] = useState(false);
    const step = steps[index];
    const isLast = index === steps.length - 1;

    const finish = async () => {
        setFinishing(true);
        try {
            await apiClient.post("/api/setup", {});
            toast.success(t.setup.finished);
            router.replace("/");
        } catch (error) {
            frontendLogger.error('[Setup]', 'Failed to complete setup', { error });
            toast.error(t.setup.completeFailed);
            setFinishing(false);
        }
    };

    const next = () => {
        if (isLast) {
            void finish();
        } else {
            setIndex((i) => i + 1);
        }
    };

    return (
        <div className="space-y-5">
            {steps.length > 1 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                        {t.setup.step.replace("{current}", String(index + 1)).replace("{total}", String(steps.length))}
                    </p>
                    <div className="flex gap-1.5">
                        {steps.map((s, i) => (
                            <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-muted"}`} />
                        ))}
                    </div>
                </div>
            )}

            {step === "password" && <PasswordStep onDone={next} />}
            {step === "ai" && <AiStep onSaved={next} />}
            {step === "notebook" && <NotebookStep />}

            {/* 改密码不能跳过；中间步骤可以跳过或直接结束向导，最后一步只保留「完成」 */}
            {step !== "password" && (
                isLast ? (
                    <Button type="button" className="w-full" onClick={finish} disabled={finishing}>
                        {finishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t.setup.finish}
                    </Button>
                ) : (
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <Button type="button" variant="ghost" onClick={finish} disabled={finishing}>
                            {t.setup.skipAll}
                        </Button>
                        <Button type="button" variant="outline" onClick={next} disabled={finishing}>
                            {t.setup.skip}
                        </Button>
                    </div>
                )
            )}
        </div>
    );
}
