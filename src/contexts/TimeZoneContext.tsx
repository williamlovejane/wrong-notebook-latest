"use client";

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_TIME_ZONE } from '@/lib/date-time';

interface TimeZoneContextValue {
    timeZone: string;
    setTimeZone: (timeZone: string) => void;
}

const TimeZoneContext = createContext<TimeZoneContextValue>({ timeZone: DEFAULT_TIME_ZONE, setTimeZone: () => undefined });

export function TimeZoneProvider({ children, initialTimeZone = DEFAULT_TIME_ZONE }: { children: ReactNode; initialTimeZone?: string }) {
    const [timeZone, setTimeZone] = useState(initialTimeZone);
    return <TimeZoneContext.Provider value={{ timeZone, setTimeZone }}>{children}</TimeZoneContext.Provider>;
}

export function useTimeZone(): TimeZoneContextValue {
    return useContext(TimeZoneContext);
}
