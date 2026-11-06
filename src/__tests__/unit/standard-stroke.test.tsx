import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    create: vi.fn(),
    animateCharacter: vi.fn(async () => undefined),
    quiz: vi.fn(),
    cancelQuiz: vi.fn(),
    fetch: vi.fn(),
}));

vi.mock("hanzi-writer", () => ({
    default: { create: mocks.create },
}));
vi.mock("@/lib/frontend-logger", () => ({
    frontendLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { StandardStroke } from "@/components/dictation/standard-stroke";

interface WriterOptionsMock {
    charDataLoader?: (char: string) => Promise<unknown>;
    onLoadCharDataSuccess?: (data: { strokes: string[]; medians: number[][][] }) => void;
    onLoadCharDataError?: (error?: unknown) => void;
}

interface QuizOptionsMock {
    onComplete?: (summary: { totalMistakes: number }) => void;
}

const writer = {
    animateCharacter: mocks.animateCharacter,
    quiz: mocks.quiz,
    cancelQuiz: mocks.cancelQuiz,
};

let container: HTMLDivElement;
let root: Root;

const render = async (ui: ReactElement) => {
    await act(async () => {
        root.render(ui);
    });
};

const createOptions = () => mocks.create.mock.calls[0][2] as WriterOptionsMock;

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ strokes: [], medians: [] }) });
    mocks.create.mockImplementation((...args: unknown[]) => {
        const options = args[2] as WriterOptionsMock;
        options.onLoadCharDataSuccess?.({ strokes: [], medians: [] });
        return writer;
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
});

describe("StandardStroke：判卷页标准笔顺动画", () => {
    it("合法汉字创建 Hanzi Writer 并自动播放一次", async () => {
        await render(<StandardStroke char="年" size={100} />);
        expect(mocks.create).toHaveBeenCalledTimes(1);
        expect(mocks.create.mock.calls[0][1]).toBe("年");
        expect(mocks.animateCharacter).toHaveBeenCalledTimes(1);
        expect(container.textContent).toContain("标准笔顺");
    });

    it("字形数据走本地接口，不请求外部 CDN", async () => {
        await render(<StandardStroke char="年" />);
        const loader = createOptions().charDataLoader;
        expect(loader).toBeTypeOf("function");
        await loader?.("年");
        expect(mocks.fetch.mock.calls[0][0]).toBe("/api/dictation/hanzi-data/%E5%B9%B4");
    });

    it("非汉字不创建实例，显示占位", async () => {
        await render(<StandardStroke char="A" />);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(container.textContent).toContain("非汉字");
    });

    it("判卷页重播键变化时，标准笔顺跟着重播", async () => {
        await render(<StandardStroke char="年" replayKey={0} />);
        await render(<StandardStroke char="年" replayKey={1} />);
        expect(mocks.animateCharacter).toHaveBeenCalledTimes(2);
    });

    it("点击重播按钮可再看一遍笔顺", async () => {
        await render(<StandardStroke char="年" />);
        const button = [...container.querySelectorAll("button")].find((b) =>
            b.textContent?.includes("重播")
        );
        expect(button?.disabled).toBe(false);
        await act(async () => button?.click());
        expect(mocks.animateCharacter).toHaveBeenCalledTimes(2);
    });

    it("临摹模式进入 quiz，不播放动画；完成后显示失误次数", async () => {
        await render(<StandardStroke char="年" practice controls={false} />);
        expect(mocks.quiz).toHaveBeenCalledTimes(1);
        expect(mocks.animateCharacter).not.toHaveBeenCalled();
        const quizOptions = mocks.quiz.mock.calls[0][0] as QuizOptionsMock;
        await act(async () => quizOptions.onComplete?.({ totalMistakes: 2 }));
        expect(container.textContent).toContain("失误 2 次");
    });

    it("字形数据加载失败时降级为无标准笔顺", async () => {
        mocks.create.mockImplementation((...args: unknown[]) => {
            const options = args[2] as WriterOptionsMock;
            options.onLoadCharDataError?.(new Error("404"));
            return writer;
        });
        await render(<StandardStroke char="年" />);
        expect(container.textContent).toContain("无标准笔顺");
    });

    it("卸载时取消临摹并清掉渲染节点", async () => {
        await render(<StandardStroke char="年" practice />);
        await act(async () => root.unmount());
        expect(mocks.cancelQuiz).toHaveBeenCalled();
        // 重新挂载，避免 afterEach 二次 unmount 报错
        root = createRoot(container);
        await render(<StandardStroke char="年" />);
    });
});
