import { describe, expect, it } from 'vitest';
import { isMasteryStatus, masteryLevelOf, masteryStatusOf, masteryStatusWhere } from '@/lib/mastery-status';

describe('masteryStatusOf', () => {
    it('没有举一反三记录时为待复习', () => {
        expect(masteryStatusOf(0, null)).toBe('new');
        expect(masteryStatusOf(0, 0.9)).toBe('new');
    });

    it('有记录且掌握概率低于 50% 时为复习中', () => {
        expect(masteryStatusOf(1, 0.49)).toBe('reviewing');
        // 新记录尚未评估完成时按复习中处理
        expect(masteryStatusOf(2, null)).toBe('reviewing');
    });

    it('有记录且掌握概率达到 50% 时为已掌握', () => {
        expect(masteryStatusOf(1, 0.5)).toBe('mastered');
        expect(masteryStatusOf(3, 0.9)).toBe('mastered');
    });

    it('按用户设置的阈值判断', () => {
        expect(masteryStatusOf(1, 0.79, 80)).toBe('reviewing');
        expect(masteryStatusOf(1, 0.8, 80)).toBe('mastered');
        expect(masteryStatusOf(1, 0.3, 30)).toBe('mastered');
        expect(masteryStatusOf(1, 0.57, 57)).toBe('mastered');
        expect(masteryStatusOf(1, 1, 100)).toBe('mastered');
    });
});

describe('masteryStatusWhere', () => {
    it('默认以 50% 为界，传入阈值时换算为 0~1 的概率', () => {
        expect(masteryStatusWhere('mastered')).toMatchObject({ masteryProbability: { gte: 0.5 } });
        expect(masteryStatusWhere('mastered', 80)).toMatchObject({ masteryProbability: { gte: 0.8 } });
        expect(masteryStatusWhere('reviewing', 80)).toMatchObject({
            OR: [{ masteryProbability: null }, { masteryProbability: { lt: 0.8 } }],
        });
    });
});

describe('辅助函数', () => {
    it('masteryLevelOf 与 schema 约定一致', () => {
        expect(masteryLevelOf('new')).toBe(0);
        expect(masteryLevelOf('reviewing')).toBe(1);
        expect(masteryLevelOf('mastered')).toBe(2);
    });

    it('isMasteryStatus 只接受三种状态', () => {
        expect(isMasteryStatus('reviewing')).toBe(true);
        expect(isMasteryStatus('1')).toBe(false);
        expect(isMasteryStatus(null)).toBe(false);
    });
});
