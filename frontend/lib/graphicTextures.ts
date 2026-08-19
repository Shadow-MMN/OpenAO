import { Assets, Rectangle, Texture } from "pixi.js";
import type {
    DirectionalGraphicData,
    GraphicData,
    GraphicsDB,
} from "../types/game";
import { UPLOADED_GRAPHIC_INDEX_START } from "../utils/gameLoader";
import { getApiBaseUrl } from "./api-base-url";

/**
 * Resolucion de graficos compartida entre el juego y el editor visual.
 *
 * Los graficos subidos desde el modo construccion no estan horneados en
 * public/, se sirven desde la API. Se distinguen por el rango de indice.
 */
export function getGraphicImagePaths(
    imageFile: string | number,
): string[] {
    if (Number(imageFile) >= UPLOADED_GRAPHIC_INDEX_START) {
        return [`${getApiBaseUrl()}/game-data/graphics/${imageFile}.png`];
    }

    return [
        `/graphics/${imageFile}.png`,
        `/static/graphics/${imageFile}.png`,
        `/static/graficosbk/${imageFile}.png`,
    ];
}

const baseTexturePromiseCache = new Map<string, Promise<Texture>>();

export async function loadBaseTexture(
    imageFile: string | number,
): Promise<Texture> {
    const candidatePaths = getGraphicImagePaths(imageFile);
    const cacheKey = candidatePaths.join("|");
    const cachedPromise = baseTexturePromiseCache.get(cacheKey);

    if (cachedPromise) {
        return cachedPromise;
    }

    const loadPromise = (async () => {
        let lastError: unknown;

        for (const candidatePath of candidatePaths) {
            try {
                const texture = await Assets.load(candidatePath);
                texture.source.scaleMode = "nearest";
                return texture;
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError ?? new Error("Failed to load base texture");
    })();

    baseTexturePromiseCache.set(cacheKey, loadPromise);
    return loadPromise;
}

export async function loadGraphicTexture(
    graphicData: GraphicData,
): Promise<Texture> {
    const baseTexture = await loadBaseTexture(graphicData.numFile);

    return new Texture({
        source: baseTexture.source,
        frame: new Rectangle(
            graphicData.sX,
            graphicData.sY,
            graphicData.width,
            graphicData.height,
        ),
    });
}

export function resolveGraphicFrame(
    graphicsDB: GraphicsDB,
    graphicId: number,
    direction: string,
): GraphicData | null {
    const graphic = graphicsDB[graphicId.toString()];

    if (!graphic) {
        return null;
    }

    if (graphic.numFile && graphic.numFrames <= 1) {
        return graphic;
    }

    const frameId =
        (graphic.numFrames > 1 ? graphic.frames?.["1"] : undefined) ??
        graphic.frames?.[direction] ??
        graphic.frames?.["1"] ??
        Object.values(graphic.frames ?? {})[0];

    if (!frameId) {
        return null;
    }

    return graphicsDB[frameId.toString()] ?? null;
}

export function resolveDirectionalGraphicFrame(
    graphicsDB: GraphicsDB,
    directionalData: DirectionalGraphicData | undefined,
    direction: string,
): GraphicData | null {
    if (!directionalData) {
        return null;
    }

    const graphicId = directionalData[direction as keyof DirectionalGraphicData];

    if (!graphicId) {
        return null;
    }

    return resolveGraphicFrame(graphicsDB, graphicId, direction);
}
