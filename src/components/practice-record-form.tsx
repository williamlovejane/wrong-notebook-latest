"use client";

import { useState } from "react";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PracticeResultPicker } from "@/components/practice-result-picker";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { answeredDateToISOString, formatDateTime } from "@/lib/date-time";
import type { PracticeResult } from "@/types/api";

interface PracticeRecordFormProps {
    errorItemId: string;
    onSaved: () => void;
    onCancel: () => void;
}

/** 在错题详情中直接录入一次做对 / 做错 / 不会做的结果 */
export function PracticeRecordForm({ errorItemId, onSaved, onCancel }: PracticeRecordFormProps) {
    const { t } = useLanguage();
    const { timeZone } = useTimeZone();
    const today = formatDateTime(new Date(), "yyyy-MM-dd", timeZone);
    const [result, setResult] = useState<PracticeResult | null>(null);
    const [date, setDate] = useState(today);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (!result || !date) return;
        setSaving(true);
        setError(null);
        try {
            await apiClient.post("/api/practice/record", {
                errorItemId,
                result,
                source: "manual",
                takenAt: answeredDateToISOString(date, timeZone),
            });
            onSaved();
        } catch {
            setError(t.mastery.resultSaveFailed);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <PracticeResultPicker value={result} onChange={setResult} disabled={saving} />
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label htmlFor={`practice-date-${errorItemId}`} className="text-sm font-medium">{t.mastery.recordDate}</label>
                <Input
                    id={`practice-date-${errorItemId}`}
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => setDate(e.target.value)}
                    className="sm:w-48"
                />
                <div className="flex gap-2 sm:ml-auto">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="flex-1 sm:flex-none">{t.exam.cancel}</Button>
                    <Button size="sm" onClick={save} disabled={saving || !result || !date} className="flex-1 sm:flex-none">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {t.mastery.saveResult}
                    </Button>
                </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
