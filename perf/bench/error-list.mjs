// 两个版本使用相同数据、认证和网络，按 A/B 顺序交替读取完整列表。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';

const [baselineUrl, candidateUrl] = process.argv.slice(2);
if (!baselineUrl || !candidateUrl) {
    throw new Error('用法：node perf/bench/error-list.mjs <基线接口地址> <优化后接口地址>');
}
const runs = Number(process.env.PERF_RUNS || 10);
assert(Number.isInteger(runs) && runs >= 10, '每个版本至少测量 10 次');
const cookie = process.env.PERF_COOKIE_FILE ? readFileSync(process.env.PERF_COOKIE_FILE, 'utf8').trim() : '';
const rate = process.env.PERF_DOWNLOAD_BYTES_PER_SECOND;

function measure(url) {
    const args = ['--silent', '--show-error', '--max-time', '60', '--write-out', '\n%{json}'];
    if (cookie) args.push('--header', '@-');
    if (rate) args.push('--limit-rate', rate);
    args.push(url);
    const start = performance.now();
    const result = spawnSync('curl', args, {
        input: cookie ? `Cookie: ${cookie}\n` : undefined,
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(result.status, 0, 'curl 请求失败');
    const split = result.stdout.lastIndexOf('\n');
    const body = result.stdout.slice(0, split);
    const timing = JSON.parse(result.stdout.slice(split + 1));
    assert.equal(timing.http_code, 200, '接口必须返回已认证的成功响应');
    const data = JSON.parse(body);
    assert(Array.isArray(data.items), '响应必须包含题目列表');
    return {
        data,
        sample: {
            elapsedMs: +(performance.now() - start).toFixed(2),
            httpMs: +(timing.time_total * 1000).toFixed(2),
            firstByteMs: +(timing.time_starttransfer * 1000).toFixed(2),
            bytes: Buffer.byteLength(body),
        },
    };
}

const cardFields = ['id', 'shortId', 'questionText', 'mistakeStatus', 'knowledgePoints', 'difficultyStars', 'masteryStatus', 'masteryProbability', 'createdAt'];
function cards(data) {
    return {
        ...Object.fromEntries(['total', 'page', 'pageSize', 'totalPages'].map(key => [key, data[key]])),
        items: data.items.map(item => ({
            ...Object.fromEntries(cardFields.map(key => [key, item[key]])),
            tags: item.tags.map(tag => tag.name),
        })),
    };
}

// 预热不计入结果，避免把开发环境的首次编译误算成优化收益。
assert.deepEqual(cards(measure(baselineUrl).data), cards(measure(candidateUrl).data));
const samples = { baseline: [], candidate: [] };
for (let index = 0; index < runs; index++) {
    const baseline = measure(baselineUrl);
    const candidate = measure(candidateUrl);
    assert.deepEqual(cards(candidate.data), cards(baseline.data), '卡片内容或分页发生变化');
    samples.baseline.push(baseline.sample);
    samples.candidate.push(candidate.sample);
}
function summarize(values) {
    const sorted = values.map(value => value.elapsedMs).sort((a, b) => a - b);
    return Object.fromEntries([50, 75, 95].map(percentile => [`p${percentile}Ms`, sorted[Math.ceil(percentile / 100 * sorted.length) - 1]]));
}
console.log(JSON.stringify({
    runs, downloadBytesPerSecond: rate ? Number(rate) : null,
    baseline: { ...summarize(samples.baseline), bytes: samples.baseline[0].bytes },
    candidate: { ...summarize(samples.candidate), bytes: samples.candidate[0].bytes },
    samples,
}, null, 2));
