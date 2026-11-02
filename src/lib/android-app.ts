/**
 * 安卓 App（packaging/android）向网页注入的接口 window.WrongNotebookAndroid。
 * 在普通浏览器中不存在，调用前用 getAndroidAppBridge() 判断。
 */
export interface AndroidAppBridge {
    /** 打开原生页面更换服务器地址 */
    changeServer(): void;
    /** 当前连接的服务器地址 */
    getServerUrl(): string;
    /** 安装包类型：phone 或 tablet */
    getDeviceType(): string;
    /** 是否为内置服务端的单机版；早期客户端版没有此方法 */
    isStandalone?(): boolean;
}

type WindowWithAndroidBridge = Window & { WrongNotebookAndroid?: AndroidAppBridge };

export function getAndroidAppBridge(): AndroidAppBridge | null {
    if (typeof window === 'undefined') return null;
    return (window as WindowWithAndroidBridge).WrongNotebookAndroid ?? null;
}
