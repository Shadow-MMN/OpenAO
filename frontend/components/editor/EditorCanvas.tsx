"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type {
    BodiesDB,
    GraphicsDB,
    MapData,
    ObjectsDB,
} from "../../types/game";
import {
    getMapDimensions,
    getTileAt,
    loadBodiesDB,
    loadGraphicsDB,
    loadMapData,
    loadObjectsDB,
} from "../../utils/gameLoader";
import {
    loadGraphicTexture,
    resolveGraphicFrame,
} from "../../lib/graphicTextures";
import { getBottomAnchoredGraphicPosition } from "../game/rendering/characterLayout";
import type { TilePaint } from "../../lib/editor/editorApi";
import {
    clearTileOverride,
    paintTiles,
    placeTileEntity,
} from "../../lib/editor/editorApi";
import { useEditorStore } from "../../lib/editor/editorStore";

const TILE_SIZE = 32;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const Z_LAYER_FLOOR = 0;
const Z_LAYER_BELOW = 2;
const Z_LAYER_OBJECT = 3;
const Z_LAYER_ENTITY = 4;

const LAYER_ORDER = ["1", "2", "3", "4"] as const;

function tileKey(x: number, y: number): string {
    return `${x},${y}`;
}

async function resolveTexture(
    graphicsDB: GraphicsDB,
    grhIndex: number,
): Promise<Texture | null> {
    const graphic = resolveGraphicFrame(graphicsDB, grhIndex, "2");

    if (!graphic) {
        return null;
    }

    try {
        return await loadGraphicTexture(graphic);
    } catch {
        return null;
    }
}

type EditorCanvasProps = {
    width?: number;
    height?: number;
};

/**
 * Lienzo del editor visual: mapa base, tiles editados y objetos/NPCs
 * colocados, con camara (zoom + paneo), grilla, overlay de bloqueo y
 * resaltado del tile bajo el cursor. El click pinta o coloca; arrastrando
 * se pinta de a varios tiles en un solo lote.
 */
export default function EditorCanvas({
    width = 960,
    height = 640,
}: EditorCanvasProps) {
    const { mapNum, tool, overrides, entities, npcs, refreshMapData, refreshStatus } =
        useEditorStore();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const appRef = useRef<Application | null>(null);
    const worldRef = useRef<Container | null>(null);
    const tileContainersRef = useRef<Map<string, Container>>(new Map());
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);
    const [bodiesDB, setBodiesDB] = useState<BodiesDB | null>(null);
    const [objectsDB, setObjectsDB] = useState<ObjectsDB | null>(null);
    const [mapData, setMapData] = useState<MapData | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [cursorTile, setCursorTile] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [showGrid, setShowGrid] = useState(true);
    const [showBlocked, setShowBlocked] = useState(true);
    const [isPanning, setIsPanning] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const hoverHighlightRef = useRef<Graphics | null>(null);
    const gridLayerRef = useRef<Graphics | null>(null);
    const blockedLayerRef = useRef<Graphics | null>(null);
    const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
    const pointerTileRef = useRef<{ x: number; y: number } | null>(null);
    const panStartRef = useRef<{ x: number; y: number } | null>(null);
    const isDrawingRef = useRef(false);
    const pendingPaintRef = useRef<{
        timer: number | null;
        tiles: Map<string, TilePaint>;
    }>({ timer: null, tiles: new Map() });
    const applyingRef = useRef(false);

    const overridesKey = overrides
        .map(
            (entry) =>
                `${entry.x},${entry.y},${entry.layer},${entry.grhIndex ?? ""},${entry.blocked ?? ""}`,
        )
        .join(";");
    const entitiesKey = entities
        .map((entry) => `${entry.x},${entry.y},${entry.kind},${entry.entityId}`)
        .join(";");

    // Carga de recursos base.
    useEffect(() => {
        let cancelled = false;

        Promise.all([loadGraphicsDB(), loadObjectsDB(), loadBodiesDB()])
            .then(([graphics, objects, bodies]) => {
                if (!cancelled) {
                    setGraphicsDB(graphics);
                    setObjectsDB(objects);
                    setBodiesDB(bodies);
                }
            })
            .catch((error) => {
                console.error("Error cargando recursos del editor:", error);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // Carga del mapa base.
    useEffect(() => {
        let cancelled = false;

        setMapData(null);
        setDimensions({ width: 0, height: 0 });

        loadMapData(mapNum)
            .then((data) => {
                if (cancelled) {
                    return;
                }

                setMapData(data);
                setDimensions(getMapDimensions(data, mapNum));
            })
            .catch((error) => {
                console.error(`Error cargando mapa ${mapNum}:`, error);
            });

        return () => {
            cancelled = true;
        };
    }, [mapNum]);

    // Inicializacion de PixiJS.
    useEffect(() => {
        let disposed = false;
        const host = hostRef.current;
        const tileContainers = tileContainersRef.current;

        if (!host) {
            return;
        }

        void (async () => {
            const app = new Application();
            await app.init({
                width,
                height,
                antialias: false,
                backgroundColor: 0x0c0a09,
                resolution: Math.min(window.devicePixelRatio || 1, 2),
                autoDensity: true,
            });

            if (disposed) {
                app.destroy(undefined, { children: true });
                return;
            }

            host.innerHTML = "";
            host.appendChild(app.canvas);
            app.canvas.style.width = `${width}px`;
            app.canvas.style.height = `${height}px`;

            const world = new Container();
            app.stage.addChild(world);

            const gridLayer = new Graphics();
            const blockedLayer = new Graphics();
            const hoverHighlight = new Graphics();
            hoverHighlight.visible = false;
            world.addChild(gridLayer);
            world.addChild(blockedLayer);
            world.addChild(hoverHighlight);

            appRef.current = app;
            worldRef.current = world;
            gridLayerRef.current = gridLayer;
            blockedLayerRef.current = blockedLayer;
            hoverHighlightRef.current = hoverHighlight;
            cameraRef.current = { x: 0, y: 0, zoom: 1 };
        })();

        return () => {
            disposed = true;

            if (appRef.current) {
                appRef.current.destroy(undefined, { children: true });
                appRef.current = null;
            }

            if (host) {
                host.innerHTML = "";
            }

            worldRef.current = null;
            tileContainers.clear();
        };
    }, [width, height]);

    const applyCamera = useCallback(() => {
        const world = worldRef.current;

        if (!world) {
            return;
        }

        const { x, y, zoom: nextZoom } = cameraRef.current;
        world.position.set(x, y);
        world.scale.set(nextZoom);
    }, []);

    // Camara inicial: centra el mapa.
    useEffect(() => {
        if (!dimensions.width || !dimensions.height) {
            return;
        }

        const mapPixels = {
            width: dimensions.width * TILE_SIZE,
            height: dimensions.height * TILE_SIZE,
        };
        const initialZoom = Math.min(
            1,
            Math.max(
                MIN_ZOOM,
                Math.min(width / mapPixels.width, height / mapPixels.height),
            ),
        );
        cameraRef.current = {
            x: (width - mapPixels.width * initialZoom) / 2,
            y: (height - mapPixels.height * initialZoom) / 2,
            zoom: initialZoom,
        };
        setZoom(initialZoom);
        applyCamera();
    }, [dimensions, width, height, applyCamera]);

    const clearTileContainers = useCallback(() => {
        const world = worldRef.current;

        if (!world) {
            return;
        }

        for (const container of tileContainersRef.current.values()) {
            container.destroy({ children: true });
        }

        tileContainersRef.current.clear();
    }, []);

    const drawGrid = useCallback(() => {
        const gridLayer = gridLayerRef.current;

        if (!gridLayer || !dimensions.width) {
            return;
        }

        gridLayer.clear();

        if (!showGrid) {
            return;
        }

        gridLayer
            .rect(0, 0, dimensions.width * TILE_SIZE, dimensions.height * TILE_SIZE)
            .stroke({ color: 0x57534e, alpha: 0.35, width: 1 });

        for (let x = 1; x < dimensions.width; x += 1) {
            gridLayer.moveTo(x * TILE_SIZE, 0);
            gridLayer.lineTo(x * TILE_SIZE, dimensions.height * TILE_SIZE);
        }

        for (let y = 1; y < dimensions.height; y += 1) {
            gridLayer.moveTo(0, y * TILE_SIZE);
            gridLayer.lineTo(dimensions.width * TILE_SIZE, y * TILE_SIZE);
        }

        gridLayer.stroke({ color: 0x57534e, alpha: 0.35, width: 1 });
    }, [dimensions, showGrid]);

    const drawBlocked = useCallback(() => {
        const blockedLayer = blockedLayerRef.current;

        if (!blockedLayer || !mapData || !dimensions.width) {
            return;
        }

        blockedLayer.clear();

        if (!showBlocked) {
            return;
        }

        const overrideByTile = new Map<string, boolean | null>();

        for (const entry of overrides) {
            if (entry.blocked !== null) {
                overrideByTile.set(tileKey(entry.x, entry.y), entry.blocked);
            }
        }

        for (let y = 1; y <= dimensions.height; y += 1) {
            for (let x = 1; x <= dimensions.width; x += 1) {
                const baseTile = getTileAt(mapData, mapNum, x, y);
                const overridden = overrideByTile.has(tileKey(x, y));
                const blocked =
                    (overridden
                        ? overrideByTile.get(tileKey(x, y))
                        : Boolean(baseTile?.blocked)) ?? false;

                if (!blocked) {
                    continue;
                }

                blockedLayer
                    .rect((x - 1) * TILE_SIZE, (y - 1) * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill({ color: 0xef4444, alpha: overridden ? 0.28 : 0.14 });
            }
        }
    }, [dimensions, mapData, mapNum, overrides, showBlocked]);

    // Render del mapa base + overrides + entidades.
    useEffect(() => {
        if (
            !appRef.current ||
            !mapData ||
            !graphicsDB ||
            !objectsDB ||
            !bodiesDB ||
            !dimensions.width
        ) {
            return;
        }

        let cancelled = false;

        void (async () => {
            clearTileContainers();
            const world = worldRef.current;

            if (!world) {
                return;
            }

            const overrideByKey = new Map(
                overrides.map((entry) => [
                    `${entry.x},${entry.y},${entry.layer}`,
                    entry,
                ]),
            );
            const entityByKey = new Map(
                entities.map((entry) => [
                    `${entry.x},${entry.y},${entry.kind}`,
                    entry,
                ]),
            );
            const npcById = new Map(npcs.map((entry) => [entry.id, entry]));

            for (let y = 1; y <= dimensions.height; y += 1) {
                for (let x = 1; x <= dimensions.width; x += 1) {
                    const baseTile = getTileAt(mapData, mapNum, x, y);
                    const graphics = { ...(baseTile?.graphics ?? {}) };

                    for (const layer of LAYER_ORDER) {
                        const override = overrideByKey.get(`${x},${y},${layer}`);

                        if (override?.grhIndex != null) {
                            graphics[layer] = override.grhIndex;
                        } else if (override?.grhIndex === null) {
                            delete graphics[layer];
                        }
                    }

                    const tileContainer = new Container();
                    tileContainer.sortableChildren = true;

                    for (const layer of LAYER_ORDER) {
                        const grhIndex = graphics[layer];

                        if (!grhIndex) {
                            continue;
                        }

                        const texture = await resolveTexture(graphicsDB, grhIndex);

                        if (!texture || cancelled) {
                            continue;
                        }

                        const sprite = new Sprite(texture);
                        sprite.x = (x - 1) * TILE_SIZE;
                        sprite.y = (y - 1) * TILE_SIZE;

                        if (layer === "3" || layer === "4") {
                            const position = getBottomAnchoredGraphicPosition(
                                texture.width,
                                texture.height,
                            );
                            sprite.x += position.x;
                            sprite.y += position.y;
                        }

                        sprite.zIndex =
                            layer === "1"
                                ? Z_LAYER_FLOOR
                                : layer === "2"
                                  ? Z_LAYER_BELOW
                                  : Z_LAYER_OBJECT;
                        tileContainer.addChild(sprite);
                    }

                    // Objetos del mapa base (objInfo).
                    if (
                        baseTile?.objInfo?.objIndex &&
                        baseTile.objInfo.objIndex > 0
                    ) {
                        const objectData =
                            objectsDB[baseTile.objInfo.objIndex.toString()];

                        if (objectData?.grhIndex) {
                            const grhIndex = Number(objectData.grhIndex);
                            const texture = await resolveTexture(
                                graphicsDB,
                                grhIndex,
                            );

                            if (texture && !cancelled) {
                                const sprite = new Sprite(texture);
                                const position = getBottomAnchoredGraphicPosition(
                                    texture.width,
                                    texture.height,
                                );
                                sprite.x = (x - 1) * TILE_SIZE + position.x;
                                sprite.y = (y - 1) * TILE_SIZE + position.y;
                                sprite.zIndex = Z_LAYER_OBJECT;
                                tileContainer.addChild(sprite);
                            }
                        }
                    }

                    // Entidades colocadas desde el editor.
                    for (const kind of ["obj", "npc"] as const) {
                        const entity = entityByKey.get(`${x},${y},${kind}`);

                        if (!entity) {
                            continue;
                        }

                        let grhIndex = 0;

                        if (kind === "obj") {
                            grhIndex = Number(
                                objectsDB[entity.entityId.toString()]?.grhIndex ??
                                    0,
                            );
                        } else {
                            const npcEntry = npcById.get(entity.entityId);
                            const bodyData = npcEntry
                                ? bodiesDB[npcEntry.idBody.toString()]
                                : undefined;
                            grhIndex = Number(bodyData?.["2"] ?? 0);
                        }

                        if (!grhIndex) {
                            continue;
                        }

                        const texture = await resolveTexture(graphicsDB, grhIndex);

                        if (!texture || cancelled) {
                            continue;
                        }

                        const sprite = new Sprite(texture);
                        const position = getBottomAnchoredGraphicPosition(
                            texture.width,
                            texture.height,
                        );
                        sprite.x = (x - 1) * TILE_SIZE + position.x;
                        sprite.y = (y - 1) * TILE_SIZE + position.y;
                        sprite.zIndex = Z_LAYER_ENTITY;
                        sprite.tint = kind === "obj" ? 0xffffff : 0xd8b4fe;
                        tileContainer.addChild(sprite);
                    }

                    tileContainer.zIndex = y * 10;
                    world.addChild(tileContainer);
                    tileContainersRef.current.set(tileKey(x, y), tileContainer);
                }
            }

            if (!cancelled) {
                drawGrid();
                drawBlocked();
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mapData,
        graphicsDB,
        objectsDB,
        bodiesDB,
        dimensions,
        npcs,
        overridesKey,
        entitiesKey,
        clearTileContainers,
        drawGrid,
        drawBlocked,
    ]);

    const flushPendingPaint = useCallback(async () => {
        const pending = pendingPaintRef.current;

        if (pending.timer !== null) {
            window.clearTimeout(pending.timer);
            pending.timer = null;
        }

        const tiles = Array.from(pending.tiles.values());

        if (tiles.length === 0) {
            return;
        }

        // Si hay un apply en curso, reprogramar en vez de descartar los tiles.
        if (applyingRef.current) {
            pending.timer = window.setTimeout(() => {
                pending.timer = null;
                void flushPendingPaint();
            }, 200);
            return;
        }

        pending.tiles.clear();
        applyingRef.current = true;
        setIsApplying(true);

        try {
            // El server acepta como maximo 500 tiles por lote.
            const BATCH_SIZE = 500;

            for (let i = 0; i < tiles.length; i += BATCH_SIZE) {
                await paintTiles(mapNum, tiles.slice(i, i + BATCH_SIZE));
            }

            await refreshMapData();
            await refreshStatus();
        } catch (error) {
            console.error("Error pintando tiles:", error);
        } finally {
            applyingRef.current = false;
            setIsApplying(false);
        }
    }, [mapNum, refreshMapData, refreshStatus]);

    const applyToolToTile = useCallback(
        async (x: number, y: number) => {
            if (!tool) {
                return;
            }

            try {
                if (tool.kind === "erase") {
                    for (const layer of LAYER_ORDER) {
                        await clearTileOverride(mapNum, x, y, Number(layer));
                    }

                    await refreshMapData();
                    return;
                }

                if (tool.kind === "object" || tool.kind === "npc") {
                    await placeTileEntity(mapNum, {
                        x,
                        y,
                        kind: tool.kind === "object" ? "obj" : "npc",
                        entityId:
                            tool.kind === "object"
                                ? tool.object.id
                                : tool.npc.id,
                    });
                    await refreshMapData();
                    return;
                }

                // Herramienta de terreno: se acumula y se envia en lote.
                const pending = pendingPaintRef.current;
                pending.tiles.set(tileKey(x, y), {
                    x,
                    y,
                    layer: 1,
                    grhIndex: tool.grhIndex,
                });

                if (pending.timer !== null) {
                    window.clearTimeout(pending.timer);
                }

                pending.timer = window.setTimeout(() => {
                    pending.timer = null;
                    void flushPendingPaint();
                }, 400);
            } catch (error) {
                console.error("Error aplicando herramienta:", error);
            }
        },
        [flushPendingPaint, mapNum, refreshMapData, tool],
    );

    // Interacciones de camara y pintado.
    useEffect(() => {
        const host = hostRef.current;

        if (!host) {
            return;
        }

        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();

            const camera = cameraRef.current;
            const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
            const nextZoom = Math.min(
                MAX_ZOOM,
                Math.max(MIN_ZOOM, camera.zoom * factor),
            );
            const rect = host.getBoundingClientRect();
            const pointerX = event.clientX - rect.left;
            const pointerY = event.clientY - rect.top;
            const worldX = (pointerX - camera.x) / camera.zoom;
            const worldY = (pointerY - camera.y) / camera.zoom;

            camera.x = pointerX - worldX * nextZoom;
            camera.y = pointerY - worldY * nextZoom;
            camera.zoom = nextZoom;
            setZoom(nextZoom);
            applyCamera();
        };

        const handlePointerDown = (event: PointerEvent) => {
            const isMiddle = event.button === 1;
            const isSpacePan = event.button === 0 && event.shiftKey;

            if (isMiddle || isSpacePan) {
                event.preventDefault();
                panStartRef.current = { x: event.clientX, y: event.clientY };
                setIsPanning(true);
                return;
            }

            if (event.button === 0 && pointerTileRef.current && tool) {
                isDrawingRef.current = true;
                void applyToolToTile(
                    pointerTileRef.current.x,
                    pointerTileRef.current.y,
                );
            }
        };

        const handlePointerMove = (event: PointerEvent) => {
            const rect = host.getBoundingClientRect();
            const camera = cameraRef.current;
            const worldX = (event.clientX - rect.left - camera.x) / camera.zoom;
            const worldY = (event.clientY - rect.top - camera.y) / camera.zoom;
            const tileX = Math.floor(worldX / TILE_SIZE) + 1;
            const tileY = Math.floor(worldY / TILE_SIZE) + 1;
            const inBounds =
                tileX >= 1 &&
                tileX <= dimensions.width &&
                tileY >= 1 &&
                tileY <= dimensions.height;

            pointerTileRef.current = inBounds ? { x: tileX, y: tileY } : null;
            setCursorTile(pointerTileRef.current);

            const hover = hoverHighlightRef.current;

            if (hover) {
                if (pointerTileRef.current) {
                    hover.visible = true;
                    hover.clear();
                    hover
                        .rect(
                            (tileX - 1) * TILE_SIZE,
                            (tileY - 1) * TILE_SIZE,
                            TILE_SIZE,
                            TILE_SIZE,
                        )
                        .fill({ color: 0xfbbf24, alpha: 0.25 })
                        .stroke({ color: 0xfbbf24, alpha: 0.8, width: 1 });
                } else {
                    hover.visible = false;
                }
            }

            if (panStartRef.current) {
                const camera = cameraRef.current;
                camera.x += event.clientX - panStartRef.current.x;
                camera.y += event.clientY - panStartRef.current.y;
                panStartRef.current = { x: event.clientX, y: event.clientY };
                applyCamera();
                return;
            }

            if (isDrawingRef.current && pointerTileRef.current) {
                void applyToolToTile(
                    pointerTileRef.current.x,
                    pointerTileRef.current.y,
                );
            }
        };

        const handlePointerUp = () => {
            panStartRef.current = null;
            setIsPanning(false);

            if (isDrawingRef.current) {
                isDrawingRef.current = false;
                void flushPendingPaint();
            }
        };

        const handlePointerLeave = () => {
            pointerTileRef.current = null;
            setCursorTile(null);

            const hover = hoverHighlightRef.current;

            if (hover) {
                hover.visible = false;
            }

            panStartRef.current = null;
            setIsPanning(false);

            if (isDrawingRef.current) {
                isDrawingRef.current = false;
                void flushPendingPaint();
            }
        };

        host.addEventListener("wheel", handleWheel, { passive: false });
        host.addEventListener("pointerdown", handlePointerDown);
        host.addEventListener("pointermove", handlePointerMove);
        host.addEventListener("pointerup", handlePointerUp);
        host.addEventListener("pointerleave", handlePointerLeave);

        return () => {
            host.removeEventListener("wheel", handleWheel);
            host.removeEventListener("pointerdown", handlePointerDown);
            host.removeEventListener("pointermove", handlePointerMove);
            host.removeEventListener("pointerup", handlePointerUp);
            host.removeEventListener("pointerleave", handlePointerLeave);
        };
    }, [applyCamera, applyToolToTile, dimensions, flushPendingPaint, tool]);

    // Limpieza del timer de pintado al desmontar.
    useEffect(() => {
        const pendingPaint = pendingPaintRef.current;

        return () => {
            if (pendingPaint.timer !== null) {
                window.clearTimeout(pendingPaint.timer);
            }
        };
    }, []);

    useEffect(() => {
        drawGrid();
    }, [drawGrid]);

    useEffect(() => {
        drawBlocked();
    }, [drawBlocked]);

    return (
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-stone-950 shadow-2xl">
            <div
                ref={hostRef}
                className="cursor-crosshair touch-none select-none"
                style={{ width, height }}
            />

            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/10 bg-stone-950/80 px-3 py-1 text-[11px] text-stone-300 backdrop-blur-md">
                Mapa {mapNum}
                {cursorTile ? ` - Tile ${cursorTile.x}, ${cursorTile.y}` : ""}
                <span className="text-stone-500">
                    Zoom {Math.round(zoom * 100)}%
                </span>
            </div>

            <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-stone-950/80 px-2.5 py-1 text-[10px] text-stone-300 backdrop-blur-md">
                    <input
                        type="checkbox"
                        checked={showGrid}
                        onChange={(event) => setShowGrid(event.target.checked)}
                        className="accent-amber-400"
                    />
                    Grilla
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-stone-950/80 px-2.5 py-1 text-[10px] text-stone-300 backdrop-blur-md">
                    <input
                        type="checkbox"
                        checked={showBlocked}
                        onChange={(event) => setShowBlocked(event.target.checked)}
                        className="accent-red-400"
                    />
                    Bloqueo
                </label>
            </div>

            {isApplying ? (
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-amber-400/30 bg-stone-950/80 px-3 py-1 text-[11px] text-amber-200 backdrop-blur-md">
                    Aplicando cambios...
                </div>
            ) : null}

            {isPanning ? (
                <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/10 bg-stone-950/80 px-3 py-1 text-[11px] text-stone-400 backdrop-blur-md">
                    Arrastrando mapa (Shift+click o boton central)
                </div>
            ) : null}
        </div>
    );
}