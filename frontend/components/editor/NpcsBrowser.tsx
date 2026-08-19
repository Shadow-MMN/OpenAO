"use client";

import { useMemo, useState } from "react";
import type { EditorNpc } from "../../lib/editor/editorApi";
import { useEditorStore } from "../../lib/editor/editorStore";
import CharacterSpritePreview from "../CharacterSpritePreview";
import VirtualizedList from "./VirtualizedList";

const ITEM_HEIGHT = 76;

/**
 * Catalogo de NPCs del juego. Los NPCs se previsualizan con el mismo
 * renderizado de personajes del cliente (CharacterSpritePreview).
 */
export default function NpcsBrowser() {
    const { npcs, tool, setTool, addRecent } = useEditorStore();
    const [search, setSearch] = useState("");
    const normalizedSearch = search.trim().toLowerCase();

    const filteredNpcs = useMemo(() => {
        if (!normalizedSearch) {
            return npcs;
        }

        return npcs.filter(
            (entry) =>
                entry.name.toLowerCase().includes(normalizedSearch) ||
                String(entry.id).includes(normalizedSearch),
        );
    }, [normalizedSearch, npcs]);

    const selectedId = tool?.kind === "npc" ? tool.npc.id : null;

    const handleSelect = (entry: EditorNpc) => {
        setTool({ kind: "npc", npc: entry });
        addRecent({
            kind: "npc",
            id: entry.id,
            grhIndex: entry.idHead,
            name: entry.name,
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-2">
            <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar NPC por nombre o id..."
                className="w-full rounded-lg border border-white/10 bg-stone-950/60 px-3 py-2 text-xs text-stone-200 placeholder:text-stone-500 focus:border-amber-400/50 focus:outline-none"
            />

            <VirtualizedList
                items={filteredNpcs}
                getItemKey={(entry) => entry.id}
                renderItem={(entry) => {
                    const isSelected = selectedId === entry.id;

                    return (
                        <button
                            type="button"
                            onClick={() => handleSelect(entry)}
                            className={`flex h-[72px] w-full items-center gap-2 rounded-lg border px-2 text-left transition ${
                                isSelected
                                    ? "border-amber-400/70 bg-amber-400/15"
                                    : "border-transparent bg-stone-950/40 hover:border-white/10 hover:bg-stone-900/70"
                            }`}
                        >
                            <div className="h-[64px] w-[52px] overflow-hidden rounded-md">
                                <CharacterSpritePreview
                                    bodyId={entry.idBody}
                                    headId={entry.idHead}
                                    scale={1.4}
                                    mode="head"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium text-stone-200">
                                    {entry.name}
                                </p>
                                <p className="text-[10px] text-stone-500">
                                    #{entry.id} - Cuerpo {entry.idBody} / Cabeza{" "}
                                    {entry.idHead}
                                </p>
                            </div>
                        </button>
                    );
                }}
                itemHeight={ITEM_HEIGHT}
                className="min-h-0 flex-1 rounded-lg"
            />
        </div>
    );
}