import assert from "node:assert/strict";
import { beforeAll, test } from "vitest";
import {
    API_AUTH,
    ensureApiReady,
    requestJson,
} from "./helpers/api";

beforeAll(async () => {
    await ensureApiReady();
});

test("world builder admin endpoints are forbidden without the admin proxy token", async () => {
    const [entities, terrain, status] = await Promise.all([
        requestJson<{ error?: string }>(
            "/admin/game-data/maps/1/entities",
            {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${API_AUTH}`,
                },
                body: JSON.stringify({
                    x: 1,
                    y: 1,
                    kind: "obj",
                    entityId: 1,
                }),
            },
        ),
        requestJson<{ error?: string }>(
            "/admin/game-data/maps/1/terrain",
            {
                headers: {
                    Authorization: `Bearer ${API_AUTH}`,
                },
            },
        ),
        requestJson<{ error?: string }>(
            "/admin/game-data/maps/1/status",
            {
                headers: {
                    Authorization: `Bearer ${API_AUTH}`,
                },
            },
        ),
    ]);

    assert.equal(entities.status, 403);
    assert.equal(terrain.status, 403);
    assert.equal(status.status, 403);
});

test("map overrides endpoint returns entities alongside tiles", async () => {
    const response = await requestJson<{
        mapNum?: number;
        overrides?: unknown[];
        entities?: unknown[];
        error?: string;
    }>("/maps/1/overrides");

    assert.equal(response.status, 200);
    assert.equal(response.data.mapNum, 1);
    assert.equal(Array.isArray(response.data.overrides), true);
    assert.equal(Array.isArray(response.data.entities), true);
});

test("admin map overrides endpoint is forbidden without the admin proxy token", async () => {
    const response = await requestJson<{ error?: string }>(
        "/admin/game-data/maps/1/overrides",
        {
            headers: {
                Authorization: `Bearer ${API_AUTH}`,
            },
        },
    );

    assert.equal(response.status, 403);
});

test("objects internal endpoint supports all=true for the editor catalog", async () => {
    const response = await requestJson<{
        objects?: Array<{ id: number; name: string; objType: number }>;
        pagination?: { total?: number; totalPages?: number };
        error?: string;
    }>("/internal/game-data/objects?all=true", {
        headers: {
            Authorization: API_AUTH,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(response.data.objects), true);
    assert.ok((response.data.objects?.length ?? 0) > 900);
    assert.equal(response.data.pagination?.totalPages, 1);
});

test("npcs internal endpoint supports all=true for the editor catalog", async () => {
    const response = await requestJson<{
        npcs?: Array<{ id: number; name: string }>;
        pagination?: { total?: number; totalPages?: number };
        error?: string;
    }>("/internal/game-data/npcs?all=true", {
        headers: {
            Authorization: API_AUTH,
        },
    });

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(response.data.npcs), true);
    assert.ok((response.data.npcs?.length ?? 0) > 300);
    assert.equal(response.data.pagination?.totalPages, 1);
});