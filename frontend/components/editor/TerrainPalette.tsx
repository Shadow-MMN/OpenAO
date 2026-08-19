"use client";

import { useRef, useState } from "react";
import { useEditorStore } from "../../lib/editor/editorStore";
import { uploadGraphicPng } from "../../lib/editor/editorApi";
import GraphicPreview from "./GraphicPreview";

/**
 * Paleta de terreno del mapa: entradas de terrain.json mas los graficos
 * subidos por administradores. Permite subir PNGs nuevos al modo construccion.
 */
export default function TerrainPalette() {
    const { terrain, tool, setTool, refreshMapData } = useEditorStore();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const selectedPaletteId =
        tool?.kind === "terrain" ? tool.paletteId : null;

    const handleSelect = (paletteId: number, grhIndex: number) => {
        setTool({ kind: "terrain", paletteId, grhIndex });
    };

    const handleFile = async (file: File) => {
        setIsUploading(true);
        setUploadError(null);

        try {
            const bytes = await file.arrayBuffer();
            await uploadGraphicPng(bytes);
            await refreshMapData();
        } catch (error) {
            setUploadError(
                error instanceof Error
                    ? error.message
                    : "No se pudo subir el grafico.",
            );
        } finally {
            setIsUploading(false);

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    if (!terrain) {
        return (
            <div className="flex h-full items-center justify-center text-xs text-stone-500">
                Sin paleta de terreno para este mapa.
            </div>
        );
    }

    const uploadedEntries = (terrain.uploadedGraphics ?? []).map(
        (graphic) => ({
            id: graphic.grhIndex,
            grhIndex: graphic.grhIndex,
            blocked: false,
        }),
    );

    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];

                        if (file) {
                            void handleFile(file);
                        }
                    }}
                />
                <button
                    type="button"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 rounded-lg border border-white/10 bg-stone-950/60 px-3 py-2 text-xs text-stone-300 transition hover:border-amber-400/50 hover:text-amber-200 disabled:opacity-50"
                >
                    {isUploading ? "Subiendo..." : "Subir PNG nuevo"}
                </button>
            </div>

            {uploadError ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
                    {uploadError}
                </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg pr-1">
                <p className="sticky top-0 z-10 bg-stone-950/95 px-1 py-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                    Terreno ({terrain.palette.length})
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                    {terrain.palette.map((entry) => {
                        const grhIndex = entry.graphics.find(
                            (graphic): graphic is number =>
                                typeof graphic === "number" && graphic > 0,
                        );
                        const isSelected =
                            selectedPaletteId === entry.id;

                        return (
                            <button
                                key={entry.id}
                                type="button"
                                disabled={grhIndex === undefined}
                                onClick={() => {
                                    if (grhIndex !== undefined) {
                                        handleSelect(entry.id, grhIndex);
                                    }
                                }}
                                title={`${entry.id}${entry.blocked ? " (bloqueado)" : ""}`}
                                className={`flex flex-col items-center gap-1 rounded-lg border p-1 transition ${
                                    isSelected
                                        ? "border-amber-400/70 bg-amber-400/15"
                                        : "border-white/10 bg-stone-950/50 hover:border-white/25"
                                } ${entry.blocked ? "ring-1 ring-red-500/40" : ""}`}
                            >
                                <GraphicPreview
                                    grhIndex={grhIndex ?? 0}
                                    size={56}
                                    scale={1.4}
                                />
                                <span className="w-full truncate text-center text-[9px] text-stone-500">
                                    #{entry.id}
                                    {entry.blocked ? " ●" : ""}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {uploadedEntries.length > 0 ? (
                    <>
                        <p className="sticky top-0 z-10 mt-3 bg-stone-950/95 px-1 py-1 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                            Subidos ({uploadedEntries.length})
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                            {uploadedEntries.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    onClick={() =>
                                        handleSelect(entry.id, entry.grhIndex)
                                    }
                                    title={`Grafico subido ${entry.id}`}
                                    className={`flex flex-col items-center gap-1 rounded-lg border p-1 transition ${
                                        selectedPaletteId === entry.id
                                            ? "border-cyan-400/70 bg-cyan-400/15"
                                            : "border-white/10 bg-stone-950/50 hover:border-white/25"
                                    }`}
                                >
                                    <GraphicPreview
                                        grhIndex={entry.grhIndex}
                                        size={56}
                                        scale={1.4}
                                    />
                                    <span className="w-full truncate text-center text-[9px] text-cyan-300/70">
                                        #{entry.id}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}