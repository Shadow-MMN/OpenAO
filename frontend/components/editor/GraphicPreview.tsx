"use client";

import { useEffect, useRef, useState } from "react";
import { Application, Sprite, Texture } from "pixi.js";
import type { GraphicsDB } from "../../types/game";
import { loadGraphicsDB } from "../../utils/gameLoader";
import { loadGraphicTexture, resolveGraphicFrame } from "../../lib/graphicTextures";

type GraphicPreviewProps = {
    grhIndex: number;
    size?: number;
    scale?: number;
    className?: string;
};

/**
 * Miniatura de un grafico del motor. Resuelve el frame desde el catalogo de
 * graficos y lo pinta centrado en un lienzo pequeno.
 */
export default function GraphicPreview({
    grhIndex,
    size = 48,
    scale = 2,
    className = "",
}: GraphicPreviewProps) {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const [graphicsDB, setGraphicsDB] = useState<GraphicsDB | null>(null);

    useEffect(() => {
        let cancelled = false;

        loadGraphicsDB()
            .then((db) => {
                if (!cancelled) {
                    setGraphicsDB(db);
                }
            })
            .catch(() => {
                // Sin catalogo de graficos la miniatura queda vacia.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let disposed = false;
        let app: Application | null = null;
        let texture: Texture | null = null;
        const host = hostRef.current;

        if (!host || !graphicsDB || grhIndex <= 0) {
            return;
        }

        void (async () => {
            const graphic = resolveGraphicFrame(graphicsDB, grhIndex, "2");

            if (!graphic) {
                return;
            }

            try {
                texture = await loadGraphicTexture(graphic);
            } catch {
                return;
            }

            if (disposed) {
                texture.destroy();
                return;
            }

            app = new Application();
            await app.init({
                width: size,
                height: size,
                antialias: false,
                backgroundAlpha: 0,
                autoStart: false,
            });

            if (disposed) {
                app.destroy(undefined, { children: true });
                return;
            }

            host.innerHTML = "";
            host.appendChild(app.canvas);
            app.canvas.style.width = `${size}px`;
            app.canvas.style.height = `${size}px`;

            const sprite = new Sprite(texture);
            const fitScale = Math.min(
                size / Math.max(1, texture.width),
                size / Math.max(1, texture.height),
            );
            sprite.scale.set(Math.min(scale, fitScale));
            sprite.anchor.set(0.5, 0.5);
            sprite.position.set(size / 2, size / 2);
            app.stage.addChild(sprite);
            app.renderer.render(app.stage);
        })();

        return () => {
            disposed = true;

            if (texture) {
                texture.destroy();
            }

            if (app) {
                app.destroy(undefined, { children: true });
            }

            if (host) {
                host.innerHTML = "";
            }
        };
    }, [graphicsDB, grhIndex, scale, size]);

    return (
        <div
            ref={hostRef}
            className={`flex shrink-0 items-center justify-center ${className}`}
            style={{ width: size, height: size }}
        />
    );
}