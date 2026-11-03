import { describe, it, expect } from "vitest";
import { parseDebugNow, resolveDebugNow } from "@/lib/dictation/debug-time";

describe("parseDebugNow", () => {
    it("解析 YYYY-MM-DD 为当天 09:00", () => {
        const d = parseDebugNow("2026-11-10");
        expect(d).not.toBeNull();
        expect(d!.getFullYear()).toBe(2026);
        expect(d!.getMonth()).toBe(10);
        expect(d!.getDate()).toBe(10);
        expect(d!.getHours()).toBe(9);
    });

    it("解析完整 ISO 时间", () => {
        const d = parseDebugNow("2026-11-10T15:30:00");
        expect(d!.getHours()).toBe(15);
        expect(d!.getMinutes()).toBe(30);
    });

    it("拒绝非法输入", () => {
        expect(parseDebugNow(null)).toBeNull();
        expect(parseDebugNow("")).toBeNull();
        expect(parseDebugNow("not-a-date")).toBeNull();
        expect(parseDebugNow("2026-13-99")).toBeNull();
    });
});

describe("resolveDebugNow", () => {
    const makeReq = (qs: string) => new Request(`http://localhost/api/dictation/today${qs}`);

    it("admin 且参数合法时返回模拟时间", () => {
        expect(resolveDebugNow(makeReq("?debugNow=2026-11-10"), "admin")!.getDate()).toBe(10);
    });

    it("非 admin 一律返回 null（参数被透明忽略）", () => {
        expect(resolveDebugNow(makeReq("?debugNow=2026-11-10"), "user")).toBeNull();
        expect(resolveDebugNow(makeReq("?debugNow=2026-11-10"), undefined)).toBeNull();
    });

    it("admin 但参数非法时返回 null", () => {
        expect(resolveDebugNow(makeReq("?debugNow=garbage"), "admin")).toBeNull();
        expect(resolveDebugNow(makeReq(""), "admin")).toBeNull();
    });

    it("支持 x-debug-now 请求头", () => {
        const req = new Request("http://localhost/api/dictation/today", {
            headers: { "x-debug-now": "2026-12-01" },
        });
        expect(resolveDebugNow(req, "admin")!.getDate()).toBe(1);
    });
});
