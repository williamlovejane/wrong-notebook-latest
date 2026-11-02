// global-agent 4 自带类型声明，但 package.json 未声明 types 字段，这里转发到其声明文件
declare module 'global-agent' {
    export * from 'global-agent/dist/index';
}
