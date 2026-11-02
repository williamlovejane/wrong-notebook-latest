"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTagStats } from "@/lib/use-tag-stats";
import { StandardTags } from "./standard-tags";
import { CustomTags } from "./custom-tags";

/** 知识点管理：标准标签库与自定义标签 */
export function TagManagement() {
    const { t } = useLanguage();
    const { stats } = useTagStats();

    return (
        <Tabs defaultValue="standard" className="w-full">
            <TabsList className="mb-4">
                <TabsTrigger value="standard">{t.tags?.tabs?.standard || "Standard Tags"}</TabsTrigger>
                <TabsTrigger value="custom">{t.tags?.tabs?.custom || "Custom Tags"}</TabsTrigger>
            </TabsList>
            <TabsContent value="standard" className="space-y-4"><StandardTags stats={stats} /></TabsContent>
            <TabsContent value="custom"><CustomTags /></TabsContent>
        </Tabs>
    );
}
