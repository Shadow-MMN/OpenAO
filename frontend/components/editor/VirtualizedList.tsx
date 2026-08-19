"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type VirtualizedListProps<T> = {
    items: T[];
    getItemKey: (item: T, index: number) => string | number;
    renderItem: (item: T, index: number) => ReactNode;
    itemHeight?: number;
    overscan?: number;
    className?: string;
};

/**
 * Lista virtualizada generica sin dependencias: solo renderiza los items
 * visibles. Los catalogos del editor superan los mil elementos, y el navegador
 * no debe crear un nodo DOM por cada uno.
 */
export default function VirtualizedList<T>({
    items,
    getItemKey,
    renderItem,
    itemHeight = 72,
    overscan = 6,
    className = "",
}: VirtualizedListProps<T>) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);

    useEffect(() => {
        const viewport = viewportRef.current;

        if (!viewport) {
            return;
        }

        const updateHeight = () => {
            setViewportHeight(viewport.clientHeight);
        };

        updateHeight();
        window.addEventListener("resize", updateHeight);

        return () => {
            window.removeEventListener("resize", updateHeight);
        };
    }, []);

    const totalHeight = items.length * itemHeight;
    const startIndex = Math.max(
        0,
        Math.floor(scrollTop / itemHeight) - overscan,
    );
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2;
    const endIndex = Math.min(items.length, startIndex + visibleCount);
    const visibleItems: Array<{ item: T; index: number }> = [];

    for (let index = startIndex; index < endIndex; index += 1) {
        visibleItems.push({ item: items[index], index });
    }

    return (
        <div
            ref={viewportRef}
            className={`overflow-y-auto ${className}`}
            onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
            <div style={{ height: totalHeight, position: "relative" }}>
                {visibleItems.map(({ item, index }) => (
                    <div
                        key={getItemKey(item, index)}
                        style={{
                            position: "absolute",
                            top: index * itemHeight,
                            left: 0,
                            right: 0,
                            height: itemHeight,
                        }}
                    >
                        {renderItem(item, index)}
                    </div>
                ))}
            </div>
        </div>
    );
}