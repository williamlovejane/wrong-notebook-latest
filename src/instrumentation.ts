
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { setupGlobalProxy } = await import('./lib/global-proxy');
        setupGlobalProxy();

        // 记录每次大模型调用的用量（token/缓存/耗时/原因）
        const { installAiFetchRecorder } = await import('./lib/ai/fetch-recorder');
        installAiFetchRecorder();

        // 构建阶段不启动定时任务
        if (process.env.NEXT_PHASE !== 'phase-production-build') {
            const { startCheckinScheduler } = await import('./lib/minimax-code/checkin');
            startCheckinScheduler();

            // 匿名遥测：过期记录清理（与开关状态无关）
            const { startTelemetryScheduler } = await import('./lib/telemetry/scheduler');
            startTelemetryScheduler();

            // 全新安装还没有管理员时，在启动日志中打印一次性初始化链接
            const { announceSetupLink } = await import('./lib/initialization');
            await announceSetupLink();
        }
    }
}
