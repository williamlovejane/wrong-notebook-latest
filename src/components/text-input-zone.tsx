"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, PenLine, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface TextInputZoneProps {
    onSubmit: (questionText: string) => Promise<void>;
    isAnalyzing: boolean;
    defaultNotebookName?: string;
}

export function TextInputZone({ onSubmit, isAnalyzing, defaultNotebookName }: TextInputZoneProps) {
    const { t } = useLanguage();
    const [questionText, setQuestionText] = useState("");

    const handleSubmit = async () => {
        if (!questionText.trim()) return;
        await onSubmit(questionText.trim());
    };

    // Support Ctrl+Enter to submit
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (questionText.trim() && !isAnalyzing) {
                handleSubmit();
            }
        }
    };

    return (
        <Card className="rounded-2xl">
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <PenLine className="h-5 w-5" />
                    <span className="text-sm font-medium">
                        {t.app?.textInputHint || "Enter question text"}
                    </span>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="question-text">
                        {t.editor?.question || "Question Text"}
                    </Label>
                    <Textarea
                        id="question-text"
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            t.app?.textInputPlaceholder ||
                            "Paste or type question text here...\nSupports Markdown and LaTeX formulas (e.g. $x^2 + y^2 = 1$)\n\nCtrl+Enter to submit"
                        }
                        className="min-h-[200px] font-mono text-sm resize-y"
                        disabled={isAnalyzing}
                    />
                </div>

                {defaultNotebookName && (
                    <p className="text-xs text-muted-foreground">
                        {t.notebooks?.title || "My Notebooks"}: {defaultNotebookName}
                    </p>
                )}

                <Button
                    onClick={handleSubmit}
                    disabled={!questionText.trim() || isAnalyzing}
                    className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 font-medium text-white hover:from-indigo-700 hover:to-violet-600"
                    size="lg"
                >
                    {isAnalyzing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t.editor?.reanswering || "AI solving..."}
                        </>
                    ) : (
                        <>
                            <Sparkles className="mr-2 h-4 w-4" />
                            {t.app?.aiSolve || "AI Solve"}
                        </>
                    )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                    {t.app?.textInputTip || "After entering the question, AI will automatically solve and generate analysis"}
                </p>
            </CardContent>
        </Card>
    );
}
