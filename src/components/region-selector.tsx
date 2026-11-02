"use client";

import { forwardRef, useRef, useState } from "react";
import type { CSSProperties, SyntheticEvent } from "react";
import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { regionFromPoints } from "@/lib/image-crop";
import type { ImageRegion } from "@/lib/image-crop";

interface RegionSelectorProps {
    imageSrc?: string;
    regions: ImageRegion[];
    onChange: (regions: ImageRegion[]) => void;
    /** 图片显示样式，缩放时由外部传入 */
    imageStyle?: CSSProperties;
    onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}

const DEFAULT_IMAGE_STYLE: CSSProperties = { maxHeight: "65vh", maxWidth: "100%", objectFit: "contain" };

// 过小的框视为误触
const MIN_REGION_SIZE = 0.02;

/** 在图片上拖动画出多个矩形框，支持鼠标与触摸 */
export const RegionSelector = forwardRef<HTMLImageElement, RegionSelectorProps>(function RegionSelector(
    { imageSrc, regions, onChange, imageStyle = DEFAULT_IMAGE_STYLE, onImageLoad },
    imageRef
) {
    const { t } = useLanguage();
    const overlayRef = useRef<HTMLDivElement>(null);
    const startRef = useRef<{ x: number; y: number } | null>(null);
    const [draft, setDraft] = useState<ImageRegion | null>(null);

    const toRelative = (event: React.PointerEvent) => {
        const rect = overlayRef.current!.getBoundingClientRect();
        return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    };

    const handlePointerDown = (event: React.PointerEvent) => {
        if (event.button !== 0) return;
        overlayRef.current?.setPointerCapture(event.pointerId);
        startRef.current = toRelative(event);
        setDraft(null);
    };

    const handlePointerMove = (event: React.PointerEvent) => {
        if (!startRef.current) return;
        const point = toRelative(event);
        setDraft(regionFromPoints(startRef.current.x, startRef.current.y, point.x, point.y));
    };

    const handlePointerUp = () => {
        if (draft && draft.width >= MIN_REGION_SIZE && draft.height >= MIN_REGION_SIZE) {
            onChange([...regions, draft]);
        }
        startRef.current = null;
        setDraft(null);
    };

    const boxStyle = (region: ImageRegion) => ({
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
    });

    return (
        <div className="relative inline-block select-none">
            <img
                ref={imageRef}
                src={imageSrc}
                alt=""
                draggable={false}
                style={imageStyle}
                onLoad={onImageLoad}
                className="block"
            />
            <div
                ref={overlayRef}
                className="absolute inset-0 cursor-crosshair"
                style={{ touchAction: "none" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                {regions.map((region, index) => (
                    <div key={index} className="absolute border-2 border-sky-400 bg-sky-400/15" style={boxStyle(region)}>
                        <span className="absolute left-0 top-0 bg-sky-500 px-1.5 text-xs font-bold text-white">{index + 1}</span>
                        <button
                            type="button"
                            className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow"
                            aria-label={t.batchImport.removeRegion.replace("{index}", String(index + 1))}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={() => onChange(regions.filter((_, i) => i !== index))}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                ))}
                {draft && <div className="absolute border-2 border-dashed border-yellow-300 bg-yellow-300/10" style={boxStyle(draft)} />}
            </div>
        </div>
    );
});
