import { describe, expect, it } from 'vitest';
import { answeredDateToISOString, dateInputToISOString, DEFAULT_TIME_ZONE, formatDateTime, getDayRange, getMonthStart, isValidTimeZone, shiftCalendarDate } from '@/lib/date-time';
import { calculateGrade } from '@/lib/grade-calculator';

describe('应用时区', () => {
    it('默认北京时间，显式时区可覆盖且不依赖执行环境', () => {
        const date = '2026-10-19T03:27:00Z';
        expect(DEFAULT_TIME_ZONE).toBe('Asia/Shanghai');
        expect(formatDateTime(date)).toBe('2026-10-19 11:27');
        expect(formatDateTime(date, 'yyyy-MM-dd HH:mm', 'America/Los_Angeles')).toBe('2026-10-18 20:27');
    });

    it.each(['Asia/Shanghai', 'America/New_York', 'UTC'])('接受有效时区 %s', (zone) => {
        expect(isValidTimeZone(zone)).toBe(true);
    });
    it.each(['', 'invalid/zone', null, 8])('拒绝无效时区 %s', (zone) => {
        expect(isValidTimeZone(zone)).toBe(false);
    });

    it('北京时间跨日后的统计边界使用次日零点', () => {
        const range = getDayRange(new Date('2026-10-18T16:01:00Z'));
        expect(range.start.toISOString()).toBe('2026-10-18T16:00:00.000Z');
        expect(range.end.toISOString()).toBe('2026-10-19T16:00:00.000Z');
    });

    it.each([
        ['2026-03-08T12:00:00Z', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
        ['2026-11-01T12:00:00Z', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
    ] as const)('夏令时切换日 %s 保留正确的日历边界', (date, start, end, hours) => {
        const range = getDayRange(new Date(date), 'America/New_York');
        expect(range.start.toISOString()).toBe(start);
        expect(range.end.toISOString()).toBe(end);
        expect((range.end.getTime() - range.start.getTime()) / 3600000).toBe(hours);
    });

    it('月初边界、考试日期和日历偏移均按指定时区计算', () => {
        expect(getMonthStart(new Date('2026-09-30T16:01:00Z')).toISOString()).toBe('2026-09-30T16:00:00.000Z');
        expect(dateInputToISOString('2026-10-19')).toBe('2026-10-19T04:00:00.000Z');
        expect(dateInputToISOString('2026-10-19', 'America/New_York')).toBe('2026-10-19T16:00:00.000Z');
        expect(formatDateTime(shiftCalendarDate(new Date('2026-03-07T17:00:00Z'), 'America/New_York', 1), 'HH:mm', 'America/New_York')).toBe('12:00');
    });

    it('作答日期为今天时记录当前时间，补录以前的日期按中午保存', () => {
        const now = new Date('2026-10-19T03:27:00Z');
        expect(answeredDateToISOString('2026-10-19', 'Asia/Shanghai', now)).toBe('2026-10-19T03:27:00.000Z');
        expect(answeredDateToISOString('2026-10-18', 'Asia/Shanghai', now)).toBe('2026-10-18T04:00:00.000Z');
        // 纽约此时仍是 10 月 18 日
        expect(answeredDateToISOString('2026-10-18', 'America/New_York', now)).toBe('2026-10-19T03:27:00.000Z');
        expect(answeredDateToISOString('2026-10-19', 'America/New_York', now)).toBe('2026-10-19T16:00:00.000Z');
    });

    it('九月开学边界按应用时区计算年级', () => {
        const date = new Date('2026-08-31T16:01:00Z');
        expect(calculateGrade('primary', 2025, date, 'zh', 'Asia/Shanghai')).toBe('二年级上');
        expect(calculateGrade('primary', 2025, date, 'zh', 'UTC')).toBe('一年级下');
    });
});
