"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StandardStroke } from "./standard-stroke";

interface StrokePracticeDialogProps {
    char: string | null;
    onClose: () => void;
}

/** 判卷页共用一个临摹弹层：放大田字格，交给 hanzi-writer 的 quiz 判定笔顺 */
export function StrokePracticeDialog({ char, onClose }: StrokePracticeDialogProps) {
    return (
        <Dialog
            open={char !== null}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>临摹「{char ?? ""}」</DialogTitle>
                    <DialogDescription>
                        按标准笔顺在田字格里书写，笔顺或方向写错会给出提示。
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center">
                    {char && <StandardStroke key={char} char={char} size={260} practice controls={false} />}
                </div>
            </DialogContent>
        </Dialog>
    );
}
