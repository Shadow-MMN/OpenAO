"use client";

import { useEditorStore } from "../../lib/editor/editorStore";
import GraphicPreview from "./GraphicPreview";

const KIND_LABELS: Record<string, string> = {
    terrain: "Terreno",
    object: "Objeto",
    npc: "NPC",
};

/**
 * Tira de elementos recientes del editor. Un clic vuelve a seleccionar la
 * herramienta correspondiente.
 */
export default function RecentsStrip() {
    const { recents, objects, npcs, setTool } = useEditorStore();

    if (recents.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-2.5 text-[11px] text-stone-500">
                Los elementos que uses apareceran aca para acceso rapido.
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-stone-950/70 px-3 py-2 backdrop-blur-md">
            <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                Recientes
            </span>
            {recents.map((entry) => {
                const matchedObject =
                    entry.kind === "object"
                        ? objects.find((object) => object.id === entry.id)
                        : undefined;
                const matchedNpc =
                    entry.kind === "npc"
                        ? npcs.find((npc) => npc.id === entry.id)
                        : undefined;

                return (
                    <button
                        key={`${entry.kind}:${entry.id}`}
                        type="button"
                        onClick={() => {
                            if (entry.kind === "terrain") {
                                setTool({
                                    kind: "terrain",
                                    paletteId: entry.id,
                                    grhIndex: entry.grhIndex,
                                });
                            } else if (entry.kind === "object") {
                                if (matchedObject) {
                                    setTool({
                                        kind: "object",
                                        object: matchedObject,
                                    });
                                }
                            } else if (matchedNpc) {
                                setTool({ kind: "npc", npc: matchedNpc });
                            }
                        }}
                        title={`${KIND_LABELS[entry.kind] ?? entry.kind} ${entry.name} (#${entry.id})`}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-stone-950/60 px-2 py-1 text-[10px] text-stone-300 transition hover:border-amber-400/50 hover:text-amber-200"
                    >
                        <GraphicPreview
                            grhIndex={entry.grhIndex}
                            size={28}
                            scale={1}
                        />
                        <span className="max-w-24 truncate">{entry.name}</span>
                    </button>
                );
            })}
        </div>
    );
}