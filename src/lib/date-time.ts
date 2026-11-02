import { addDays, addMonths, startOfDay, startOfMonth } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TIME_ZONE = 'Asia/Shanghai';

export function isValidTimeZone(value: unknown): value is string {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        new Intl.DateTimeFormat('en', { timeZone: value.trim() }).format();
        return true;
    } catch {
        return false;
    }
}

/** 显示时间时显式指定应用时区，不依赖浏览器或服务器的本地时区。 */
export function formatDateTime(date: Date | string | number, pattern = 'yyyy-MM-dd HH:mm', timeZone = DEFAULT_TIME_ZONE): string {
    return formatInTimeZone(date, timeZone, pattern);
}

/** 取得指定时区中的日历日期，供年级、学期等日历计算使用。 */
export function getCalendarDate(date: Date | string | number, timeZone = DEFAULT_TIME_ZONE): Date {
    return toZonedTime(date, timeZone);
}

/** 返回一天的起点和次日起点；夏令时切换日也按实际日历边界计算。 */
export function getDayRange(date: Date, timeZone = DEFAULT_TIME_ZONE, offsetDays = 0): { start: Date; end: Date } {
    const day = startOfDay(addDays(toZonedTime(date, timeZone), offsetDays));
    return { start: fromZonedTime(day, timeZone), end: fromZonedTime(addDays(day, 1), timeZone) };
}

export function getMonthStart(date: Date, timeZone = DEFAULT_TIME_ZONE, offsetMonths = 0): Date {
    return fromZonedTime(startOfMonth(addMonths(toZonedTime(date, timeZone), offsetMonths)), timeZone);
}

/** 日历加减保留目标时区的钟点，用于复习安排和时间范围筛选。 */
export function shiftCalendarDate(date: Date, timeZone = DEFAULT_TIME_ZONE, days = 0, months = 0): Date {
    return fromZonedTime(addDays(addMonths(toZonedTime(date, timeZone), months), days), timeZone);
}

/** 日期输入没有时区；按应用时区的中午保存，避免客户端时区改变考试日期。 */
export function dateInputToISOString(date: string, timeZone = DEFAULT_TIME_ZONE): string {
    return fromZonedTime(`${date}T12:00:00`, timeZone).toISOString();
}

/** 作答日期：选的是今天时记录当前时间，便于同一天多次作答区分先后；补录以前的日期按中午保存。 */
export function answeredDateToISOString(date: string, timeZone = DEFAULT_TIME_ZONE, now = new Date()): string {
    return date === formatDateTime(now, 'yyyy-MM-dd', timeZone) ? now.toISOString() : dateInputToISOString(date, timeZone);
}
