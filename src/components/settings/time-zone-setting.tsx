"use client";

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';

interface TimeZoneSettingProps {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
}

export function TimeZoneSetting({ value, onChange, disabled }: TimeZoneSettingProps) {
    const { t } = useLanguage();
    return (
        <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="app-time-zone">{t.settings.general.timeZoneLabel}</Label>
            <Input id="app-time-zone" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} list="app-time-zones" placeholder="Asia/Shanghai" />
            <datalist id="app-time-zones">
                {['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'].map((zone) => <option key={zone} value={zone} />)}
            </datalist>
            <p className="text-xs text-muted-foreground">{t.settings.general.timeZoneDesc}</p>
        </div>
    );
}
