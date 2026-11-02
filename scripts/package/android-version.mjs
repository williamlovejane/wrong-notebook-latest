/**
 * 安卓 versionCode 必须随版本单调递增，由日期版本号换算：
 *   预览版 2026.10.22-3 → 2026102203（当天序号 1–98）
 *   正式版 2026.10.22   → 2026102299（排在当天所有预览版之后）
 * git describe 形式（2026.10.22-3-gabc1234）按其所在的预览版计算。
 */
export function androidVersionCode(version) {
    const match = /^v?(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d+))?/.exec(String(version));
    if (!match) throw new Error(`无法从版本号 ${version} 计算安卓 versionCode，需形如 2026.10.22 或 2026.10.22-1`);
    const [, year, month, day, seq] = match;
    if (seq !== undefined && (Number(seq) < 1 || Number(seq) > 98)) {
        throw new Error(`预览版序号需在 1–98 之间：${version}`);
    }
    const n = seq === undefined ? 99 : Number(seq);
    return Number(year) * 1_000_000 + Number(month) * 10_000 + Number(day) * 100 + n;
}
