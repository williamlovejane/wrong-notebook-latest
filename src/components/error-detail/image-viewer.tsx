"use client";

import { useLanguage } from "@/contexts/LanguageContext";

interface ImageViewerProps {
    src: string | null;
    onClose: () => void;
}

/** 全屏查看图片，点击图片以外的区域关闭 */
export function ImageViewer({ src, onClose }: ImageViewerProps) {
    const { t } = useLanguage();
    if (!src) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
            <div className="relative max-w-7xl max-h-full">
                <button
                    className="absolute -top-12 right-0 text-white hover:text-gray-300 text-lg font-semibold bg-black/50 px-4 py-2 rounded"
                    onClick={onClose}
                >
                    {t.detail?.close || '✕ Close'}
                </button>
                <img
                    src={src}
                    alt="Full size"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                />
                <p className="text-center text-white/70 text-sm mt-4">
                    {t.detail?.clickOutside || 'Click outside to close'}
                </p>
            </div>
        </div>
    );
}
