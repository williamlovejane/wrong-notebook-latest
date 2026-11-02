"use client";

import { CalendarCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { formatDateTime } from "@/lib/date-time";
import type { MiniMaxCodeStatus } from "@/lib/minimax-code/status";

interface MiniMaxCodeCheckinProps {
    checkin: MiniMaxCodeStatus['checkin'];
    /** 表单中的自动签到开关（保存设置后生效） */
    autoCheckin: boolean;
    onAutoCheckinChange: (value: boolean) => void;
    busy: boolean;
    onCheckin: () => void;
}

/** 今天的签到情况（是否已自动签到、积分、连签天数）、立即签到与自动签到开关 */
export function MiniMaxCodeCheckin({ checkin, autoCheckin, onAutoCheckinChange, busy, onCheckin }: MiniMaxCodeCheckinProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const texts = t.settings?.ai?.minimaxCode;
    const { today, last } = checkin;
    const succeeded = last && last.status !== 'failed' ? last : null;
    const checkedToday = Boolean(today?.checkedToday || succeeded);
    const points = String(succeeded?.points ?? (today ? today.points + today.bonusPoints : 0));
    const days = String(succeeded?.streakDays ?? today?.streakDays ?? 0);

    let detail: string;
    if (succeeded?.trigger === 'auto' && succeeded.status === 'checked-in') {
        detail = (texts?.checkinAuto || "Checked in automatically today at {time} (+{points} credits, day {days} in a row)")
            .replace('{time}', formatDateTime(succeeded.at, 'HH:mm', timeZone))
            .replace('{points}', points)
            .replace('{days}', days);
    } else if (checkedToday) {
        detail = (texts?.checkinDone || "Checked in today (+{points} credits, day {days} in a row)")
            .replace('{points}', points)
            .replace('{days}', days);
    } else if (last?.status === 'failed') {
        detail = (texts?.checkinFailed || "Check-in failed: {error}").replace('{error}', last.error || '');
    } else {
        detail = checkin.autoCheckin
            ? (texts?.checkinWillAuto || "Not checked in yet today. The app will check in automatically within the hour.")
            : (texts?.checkinNotYet || "Not checked in yet today");
    }

    return (
        <div className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="text-muted-foreground">{texts?.checkinToday || "Today's check-in"}</span>
                    <Badge variant={checkedToday ? 'default' : last?.status === 'failed' ? 'destructive' : 'secondary'}>
                        <CalendarCheck className="mr-1 h-3 w-3" />
                        {checkedToday ? (texts?.checkinSuccess || "Checked in") : (texts?.checkinNotYet || "Not yet")}
                    </Badge>
                </div>
                {!checkedToday && (
                    <Button size="sm" variant="outline" onClick={onCheckin} disabled={busy}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {texts?.checkinNow || "Check in now"}
                    </Button>
                )}
            </div>
            <p className="text-xs text-muted-foreground break-words">{detail}</p>

            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <Label htmlFor="minimax-code-auto-checkin">{texts?.autoCheckin || "Daily auto check-in"}</Label>
                    <p className="text-xs text-muted-foreground">{texts?.autoCheckinHint}</p>
                </div>
                <Switch id="minimax-code-auto-checkin" checked={autoCheckin} onCheckedChange={onAutoCheckinChange} />
            </div>
        </div>
    );
}
