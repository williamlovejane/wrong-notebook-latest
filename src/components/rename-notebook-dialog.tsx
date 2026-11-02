"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";

interface RenameNotebookDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentName: string;
    onRename: (name: string) => Promise<void>;
}

export function RenameNotebookDialog({ open, onOpenChange, currentName, onRename }: RenameNotebookDialogProps) {
    const [name, setName] = useState(currentName);
    const [loading, setLoading] = useState(false);
    const { t } = useLanguage();

    // 外部名称变化时（如重命名成功后）同步输入框：在渲染时比较，避免 effect 中多渲染一次
    const [prevCurrentName, setPrevCurrentName] = useState(currentName);
    if (currentName !== prevCurrentName) {
        setPrevCurrentName(currentName);
        setName(currentName);
    }

    const handleRename = async () => {
        if (!name.trim()) {
            toast.warning(t.notebooks?.renameDialog?.enterName || "Please enter notebook name");
            return;
        }

        setLoading(true);
        try {
            await onRename(name.trim());
            onOpenChange(false);
        } catch (error) {
            frontendLogger.error('[RenameNotebook]', 'Failed to rename notebook', { error });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t.notebooks?.renameDialog?.title || "Rename Notebook"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="rename-name">{t.notebooks?.renameDialog?.nameLabel || "New Name"}</Label>
                        <Input
                            id="rename-name"
                            placeholder={t.notebooks?.renameDialog?.placeholder || "Enter new notebook name"}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleRename()}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t.common.cancel}
                    </Button>
                    <Button onClick={handleRename} disabled={loading || !name.trim()}>
                        {loading ? (t.notebooks?.renameDialog?.renaming || "Renaming...") : (t.notebooks?.renameDialog?.rename || "Rename")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
