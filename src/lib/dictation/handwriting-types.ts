/**
 * 在线手写整轮交卷的共享类型：前端采集、提交接口与人工判卷共用。
 * 坐标沿用 handwriting-pad 的 0~1 归一化画布坐标（y 向下），t 为相对该字开始书写的毫秒数。
 */

/** 交卷后的批次状态：已收卷，等待人工逐字判定（自动判卷已停用） */
export const AWAITING_REVIEW = "awaiting_review";

export interface TimedStrokePoint {
    x: number;
    y: number;
    t: number;
}

/** 一笔的完整轨迹（带时间轴，可回放书写过程） */
export type TimedStroke = TimedStrokePoint[];

/** 一个田字格里的所有笔画 */
export type TimedPad = TimedStroke[];

/** 单个田字格的导出快照 */
export interface PadSnapshot {
    strokes: TimedPad;
    /** 成品静态图：白底黑字、无网格，供人工审核对照 */
    image: string;
    /** 书写过程 GIF 动图，供回看 */
    animation: string;
}

/**
 * 一道题（可能含多个待写字）的作答。
 * 题面刻意不返回答案，所以这里也不带 expected：服务端从 pending 日志反查标准答案。
 */
export interface HandwritingAnswer {
    cardId: string;
    /** 出题时创建的 ReviewLog id */
    quizToken: string;
    /** 已写题为该题全部字格的快照；未写题传空数组 */
    pads: PadSnapshot[];
}

/** 整轮交卷请求。现在只保存笔迹，交给人工判卷，不再生成或上传判分图 */
export interface SubmitHandwritingRequest {
    answers: HandwritingAnswer[];
    /** 本轮未作答的题数（含没翻到的题），仅用于展示，不参与判定与复习计划 */
    skippedCount?: number;
}

/**
 * 「今日提交」扁平列表里的一条待判/已判记录。
 * 一次交卷可能含多个字、一天可能交多次，这里按题目（item）平铺，不再按批次分级。
 */
export interface ReviewListItem {
    id: string;
    submissionId: string;
    position: number;
    expected: string;
    promptWord: string | null;
    pinyin: string | null;
    /** JSON 字符串数组：每个字格的成品图 dataURL */
    images: string;
    /** JSON 字符串数组：每个字格的书写过程 GIF dataURL */
    animations: string | null;
    /** 交卷时间（ISO） */
    createdAt: string;
    correct: boolean | null;
    judgedBy: string | null;
    manualCorrect: boolean | null;
}

/** 当天提交总览：默认只回传待判字的完整笔迹，已判记录按需展开 */
export interface ReviewListResponse {
    date: string;
    /** 交卷批次数量，仅用于顶部说明「今天交了几次」 */
    batchCount: number;
    pending: ReviewListItem[];
    reviewedCount: number;
    /** includeReviewed=1 时才返回，避免每次轮询都下载已判记录的动图 */
    reviewed?: ReviewListItem[];
}

/**
 * 单字标准笔顺数据，结构与 hanzi-writer 的 CharacterJson 一致。
 * strokes 是每笔的 SVG 路径，medians 是笔画中轴线（动画与临摹判定用）。
 */
export interface HanziCharacterData {
    strokes: string[];
    medians: number[][][];
    radStrokes?: number[];
}

/** 只有单个汉字才有标准笔顺；词语、标点、英文字母直接跳过，也防止拼出越界文件路径 */
export function isStandardStrokeChar(char: string): boolean {
    return /^[\u3400-\u4dbf\u4e00-\u9fff]$/.test(char);
}

