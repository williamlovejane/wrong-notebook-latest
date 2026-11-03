"use client";

/**
 * 可打印的听写试卷：题号 + 拼音 + 田字格空位。
 * ○ 表示待填的生字位置，其余字符原样展示。
 */

export interface PaperSheetItem {
    pinyin: string;
    maskedWord: string;
}

interface PaperSheetProps {
    dateLabel: string;
    items: PaperSheetItem[];
}

const MASK = "○";

function BlankBox() {
    return (
        <span className="relative inline-block h-11 w-11 border-2 border-neutral-700 print:h-12 print:w-12">
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 border-l border-dashed border-neutral-300" />
            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 border-t border-dashed border-neutral-300" />
        </span>
    );
}

function ShownBox({ ch }: { ch: string }) {
    return (
        <span className="inline-flex h-11 w-11 items-center justify-center border-2 border-neutral-400 text-2xl text-neutral-800 print:h-12 print:w-12">
            {ch}
        </span>
    );
}

export function PaperSheet({ dateLabel, items }: PaperSheetProps) {
    return (
        <div className="paper-print rounded-lg border bg-white p-6 text-neutral-900 shadow-sm print:border-0 print:p-0 print:shadow-none">
            <div className="mb-1 break-inside-avoid text-center text-xl font-bold">今日生字考察</div>
            <div className="mb-6 flex break-inside-avoid items-center justify-between text-sm text-neutral-600">
                <span>{dateLabel}</span>
                <span>姓名：＿＿＿＿＿＿　得分：＿＿＿＿</span>
            </div>

            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                {items.map((item, i) => (
                    <div key={i} className="flex break-inside-avoid items-end gap-2">
                        <span className="w-7 shrink-0 pb-1 text-sm font-semibold text-neutral-700">
                            {i + 1}.
                        </span>
                        <div className="flex flex-col gap-1">
                            <span className="h-5 text-base tracking-widest text-neutral-700">
                                {item.pinyin}
                            </span>
                            <span className="flex gap-1">
                                {Array.from(item.maskedWord).map((ch, k) =>
                                    ch === MASK ? <BlankBox key={k} /> : <ShownBox key={k} ch={ch} />
                                )}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {items.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-500">今天没有到期的生字。</p>
            )}
        </div>
    );
}
