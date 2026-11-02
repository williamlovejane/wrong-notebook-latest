import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/lib/feedback";
import { frontendLogger } from "@/lib/frontend-logger";

interface EditableFieldOptions<T> {
    /** 开始编辑时的初始值 */
    read: () => T;
    /** 保存，失败时抛出 */
    save: (value: T) => Promise<void>;
    /** 日志中的字段名，如 question */
    logLabel: string;
    successMessage?: string;
    failureMessage?: string;
}

/** 详情页可编辑区块的状态：开始编辑、修改、保存（含成功和失败提示）、取消 */
export function useEditableField<T>({ read, save, logLabel, successMessage, failureMessage }: EditableFieldOptions<T>) {
    const { t } = useLanguage();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState<T>(read);

    const start = () => {
        setValue(read());
        setEditing(true);
    };

    const submit = async () => {
        try {
            await save(value);
            setEditing(false);
            toast.success(successMessage || t.common?.messages?.saveSuccess || 'Saved successfully');
        } catch (error) {
            frontendLogger.error('[ErrorDetail]', `Failed to save ${logLabel}`, { error });
            toast.error(failureMessage || t.common?.messages?.saveFailed || 'Save failed');
        }
    };

    return { editing, value, setValue, start, cancel: () => setEditing(false), submit };
}
