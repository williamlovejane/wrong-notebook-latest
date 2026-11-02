"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { SetupWizard } from "@/components/setup/setup-wizard";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { usePageTitle } from "@/lib/page-title";

interface SetupStatus {
    setupCompleted: boolean;
}

export default function SetupPage() {
    const { t } = useLanguage();
    usePageTitle(t.setup.pageTitle);
    const router = useRouter();
    const { data: session, status } = useSession();
    const isAdmin = session?.user?.role === "admin";
    const mustChangePassword = session?.user?.mustChangePassword === true;
    // 向导只在首次拿到会话时初始化，改完密码后会话刷新不影响已确定的步骤
    const [initial, setInitial] = useState<{ mustChangePassword: boolean; setupCompleted: boolean } | null>(null);

    useEffect(() => {
        if (status !== "authenticated" || initial) return;
        if (!isAdmin) {
            router.replace("/");
            return;
        }
        apiClient.get<SetupStatus>("/api/setup")
            .then((data) => setInitial({ mustChangePassword, setupCompleted: data.setupCompleted }))
            .catch((error) => {
                frontendLogger.error('[Setup]', 'Failed to fetch setup status', { error });
                setInitial({ mustChangePassword, setupCompleted: false });
            });
    }, [status, isAdmin, mustChangePassword, initial, router]);

    return (
        <AuthShell wide>
            <Card>
                <CardContent className="space-y-4">
                    {initial ? (
                        <SetupWizard mustChangePassword={initial.mustChangePassword} setupCompleted={initial.setupCompleted} />
                    ) : (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                    >
                        {t.setup.logout}
                    </button>
                </CardContent>
            </Card>
        </AuthShell>
    );
}
