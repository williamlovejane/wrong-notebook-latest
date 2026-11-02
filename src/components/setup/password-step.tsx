"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { DEFAULT_ADMIN_PASSWORD } from "@/lib/default-admin";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import { getApiErrorMessage } from "@/lib/error-message";

interface PasswordStepProps {
    onDone: () => void;
}

/** 向导第 1 步：管理员必须把默认密码改掉 */
export function PasswordStep({ onDone }: PasswordStepProps) {
    const { t } = useLanguage();
    const { update } = useSession();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (password.length < 6) {
            toast.error(t.setup.password.tooShort);
            return;
        }
        if (password === DEFAULT_ADMIN_PASSWORD) {
            toast.error(t.setup.password.sameAsDefault);
            return;
        }
        if (password !== confirm) {
            toast.error(t.setup.password.mismatch);
            return;
        }

        setSaving(true);
        try {
            await apiClient.patch("/api/user", { password });
            // 刷新会话：服务端按新密码重新判断，解除强制改密
            await update();
            toast.success(t.setup.password.success);
            onDone();
        } catch (error) {
            frontendLogger.error('[Setup]', 'Failed to change default password', { error });
            toast.error(getApiErrorMessage(error) || t.setup.password.failed);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
                <h2 className="text-lg font-semibold">{t.setup.password.title}</h2>
                <p className="text-sm text-muted-foreground">{t.setup.password.desc}</p>
            </div>
            <div className="space-y-2">
                <Label htmlFor="setup-new-password">{t.setup.password.newPassword}</Label>
                <PasswordInput id="setup-new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="setup-confirm-password">{t.setup.password.confirmPassword}</Label>
                <PasswordInput id="setup-confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.setup.password.submit}
            </Button>
        </form>
    );
}
