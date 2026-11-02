/**
 * MiniMax Code 渠道的常量与配置类型。本文件不依赖 Node 模块，前端设置界面也会引用。
 */

/** 默认模型 */
export const DEFAULT_MINIMAX_CODE_MODEL = 'MiniMax-M3.1-Flash';
/** 设置页可选的模型（MiniMax Code 客户端提供的模型），也可手动填写 */
export const MINIMAX_CODE_MODELS = ['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.7'] as const;

/** app-config.json 中 minimaxCode 的配置；登录凭据另存于 minimax-code.json，不在这里 */
export interface MiniMaxCodeConfig {
    model?: string;
    /** 每日自动签到，默认开启 */
    autoCheckin?: boolean;
}
