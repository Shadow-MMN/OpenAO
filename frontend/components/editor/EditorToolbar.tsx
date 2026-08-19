"use client";

import { useState } from "react";
import { useEditorStore } from "../../lib/editor/editorStore";
import {
    discardMapDrafts,
    publishMapChanges,
    revertMapChanges,
} from "../../lib/editor/editorApi";

/**
 * Barra de herramientas del editor: seleccion de herramienta, accion de
 * borrado y acciones de publicar / descartar / revertir cambios.
 */
export default function EditorToolbar() {
    const {
        mapNum,
        setMapNum,
        tool,
        setTool,
        refreshMapData,
        refreshStatus,
        status,
        terrain,
        objects,
        npcs,
    } = useEditorStore();
    const [isBusy, setIsBusy] = useState<"publish" | "discard" | "revert" | null>(
        null,
    );
    const [error, setError] = useState<string | null>(null);

    const runAction = async (
        action: "publish" | "discard" | "revert",
        callback: () => Promise<unknown>,
    ) => {
        setIsBusy(action);
        setError(null);

        try {
            await callback();
            await refreshMapData();
            await refreshStatus();
        } catch (actionError) {
            setError(
                actionError instanceof Error
                    ? actionError.message
                    : "Ocurrio un error.",
            );
        } finally {
            setIsBusy(null);
        }
    };

    const handlePublish = () =>
        runAction("publish", () => publishMapChanges(mapNum));

    const handleDiscard = () =>
        runAction("discard", () => discardMapDrafts(mapNum));

    const handleRevert = () =>
        runAction("revert", () => revertMapChanges(mapNum));

    const toolButtons: Array<{
        key: string;
        label: string;
        icon: string;
        isActive: boolean;
        onClick: () => void;
    }> = [
        {
            key: "terrain",
            label: "Terreno",
            icon: "◫",
            isActive: tool?.kind === "terrain",
            onClick: () => {
                const firstEntry =
                    terrain?.palette.find((entry) =>
                        entry.graphics.some(
                            (graphic) =>
                                typeof graphic === "number" && graphic > 0,
                        ),
                    ) ?? null;
                const grhIndex =
                    firstEntry?.graphics.find(
                        (graphic): graphic is number =>
                            typeof graphic === "number" && graphic > 0,
                    ) ?? 1;

                setTool({
                    kind: "terrain",
                    paletteId: firstEntry?.id ?? 1,
                    grhIndex,
                });
            },
        },
        {
            key: "object",
            label: "Objeto",
            icon: "▦",
            isActive: tool?.kind === "object",
            onClick: () => {
                const firstObject = objects[0];

                if (firstObject) {
                    setTool({ kind: "object", object: firstObject });
                }
            },
        },
        {
            key: "npc",
            label: "NPC",
            icon: "◉",
            isActive: tool?.kind === "npc",
            onClick: () => {
                const firstNpc = npcs[0];

                if (firstNpc) {
                    setTool({ kind: "npc", npc: firstNpc });
                }
            },
        },
        {
            key: "erase",
            label: "Borrar",
            icon: "⌫",
            isActive: tool?.kind === "erase",
            onClick: () => setTool({ kind: "erase" }),
        },
    ];

    const draftCount = status?.draft ?? 0;

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-stone-950/70 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
                <label
                    htmlFor="editor-map-input"
                    className="text-[11px] text-stone-400"
                >
                    Mapa
                </label>
                <input
                    id="editor-map-input"
                    type="number"
                    min={1}
                    value={mapNum}
                    onChange={(event) => {
                        const nextValue = Number(event.target.value);

                        if (Number.isInteger(nextValue) && nextValue > 0) {
                            setMapNum(nextValue);
                        }
                    }}
                    className="w-20 rounded-lg border border-white/10 bg-stone-950/60 px-2 py-1 text-xs text-stone-200 focus:border-amber-400/50 focus:outline-none"
                />
            </div>

            <div className="mx-2 h-6 w-px bg-white/10" />

            <div className="flex items-center gap-1">
                {toolButtons.map((button) => (
                    <button
                        key={button.key}
                        type="button"
                        onClick={button.onClick}
                        title={button.label}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition ${
                            button.isActive
                                ? "border-amber-400/70 bg-amber-400/20 text-amber-200"
                                : "border-white/10 bg-stone-950/60 text-stone-400 hover:border-white/25 hover:text-stone-200"
                        }`}
                    >
                        {button.icon}
                    </button>
                ))}
            </div>

            <div className="mx-2 h-6 w-px bg-white/10" />

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => void handlePublish()}
                    disabled={isBusy !== null}
                    className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                >
                    {isBusy === "publish" ? "Publicando..." : "Publicar"}
                </button>
                <button
                    type="button"
                    onClick={() => void handleDiscard()}
                    disabled={isBusy !== null || draftCount === 0}
                    className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-400/20 disabled:opacity-40"
                >
                    {isBusy === "discard" ? "Descartando..." : "Descartar borradores"}
                </button>
                <button
                    type="button"
                    onClick={() => void handleRevert()}
                    disabled={isBusy !== null}
                    className="rounded-lg border border-white/10 bg-stone-950/60 px-3 py-1.5 text-xs font-medium text-stone-300 transition hover:border-white/25 hover:text-stone-100 disabled:opacity-50"
                >
                    {isBusy === "revert" ? "Revirtiendo..." : "Revertir"}
                </button>
            </div>

            <div className="ml-auto flex items-center gap-3 text-[11px] text-stone-400">
                <span>
                    Publicados:{" "}
                    <span className="font-medium text-emerald-300">
                        {status?.published ?? 0}
                    </span>
                </span>
                <span>
                    Borradores:{" "}
                    <span className="font-medium text-amber-300">
                        {status?.draft ?? 0}
                    </span>
                </span>
                <span>
                    Entidades:{" "}
                    <span className="font-medium text-stone-200">
                        {status?.publishedEntities ?? 0}
                    </span>
                </span>
            </div>

            {error ? (
                <p className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">
                    {error}
                </p>
            ) : null}
        </div>
    );
}