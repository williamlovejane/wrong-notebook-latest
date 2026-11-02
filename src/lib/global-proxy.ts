import { bootstrap } from 'global-agent';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { createLogger } from './logger';

const logger = createLogger('proxy');

export function setupGlobalProxy() {
    const httpProxy = process.env.http_proxy || process.env.HTTP_PROXY;
    const httpsProxy = process.env.https_proxy || process.env.HTTPS_PROXY;
    const allProxy = process.env.all_proxy || process.env.ALL_PROXY;

    // Logic: Specific proxy > All proxy > None
    const targetHttpProxy = httpProxy || allProxy;
    const targetHttpsProxy = httpsProxy || allProxy;

    if (targetHttpProxy || targetHttpsProxy) {
        if (process.env.NODE_ENV === 'development') {
            logger.info({ http: targetHttpProxy, https: targetHttpsProxy }, 'Configuring proxy');
        }

        // 1. Configure Undici (global fetch)
        // Undici accepts a single dispatcher.
        // For general usage (APIs, etc.), we usually care about the HTTPS proxy.
        // If only HTTP is available, fall back to that.
        const undiciProxy = targetHttpsProxy || targetHttpProxy;
        if (undiciProxy) {
            try {
                const proxyAgent = new ProxyAgent(undiciProxy);
                setGlobalDispatcher(proxyAgent);
                if (process.env.NODE_ENV === 'development') {
                    logger.info({ proxy: undiciProxy }, 'Global Undici dispatcher set');
                }
            } catch (error) {
                logger.error({ error }, 'Failed to set global Undici dispatcher');
            }
        }

        // 2. Configure legacy http/https modules using global-agent
        try {
            // global-agent 从 GLOBAL_AGENT_ 前缀的环境变量读取代理；
            // 不要预先设置 global.GLOBAL_AGENT，否则 bootstrap 会认为已初始化而直接跳过
            if (targetHttpProxy) process.env.GLOBAL_AGENT_HTTP_PROXY = targetHttpProxy;
            if (targetHttpsProxy) process.env.GLOBAL_AGENT_HTTPS_PROXY = targetHttpsProxy;

            bootstrap();

            if (process.env.NODE_ENV === 'development') {
                logger.info('global-agent bootstrap initialized');
            }
        } catch (error) {
            logger.error({ error }, 'Failed to initialize global-agent');
        }
    }
}
