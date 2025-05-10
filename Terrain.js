const terrainBoundaries = {
    lowerX: 0,
    upperX: 32,
    lowerY: 0,
    upperY: 32,
    lowerZ: 0,
    upperZ: 32
};

export default class Terrain {
    constructor(renderDistanceChunks) { 
        this.horizontalRenderDistance = renderDistanceChunks * 32; // TODO: Change 32 to a constant variable
    }

    init(centerPosition) {
        const terrainBoundaries = this.getTerrainBoundaries(centerPosition);
        this.loadTerrain(terrainBoundaries);
        this.prevCenterChunk = 0; // TODO: call getChunkID() from chunk class
    }

    update(centerPosition) {
        const currentChunk = 0; // TODO: getChunkID()
        
        if (this.prevCenterChunk !== currentChunk) {
            const terrainBoundaries = this.getTerrainBoundaries(centerPosition);
            this.unloadTerrain(terrainBoundaries);
            this.loadTerrain(terrainBoundaries);
            this.prevCenterChunk = currentChunk;
        }
    }

    loadTerrain(terrainBoundaries) {
        const { lowerX, upperX, lowerY, upperY, lowerZ, upperZ } = boundaries;

        for (let x = lowerX; x < upperX; x += 32) {
            for (let y = lowerY; y < upperY; y += 32) {
                for (let z = lowerZ; z < upperZ; z += 32) {
                    // TODO: generate chunk at (x, y, z)
                }
            }
        }
    }

    unloadTerrain(terrainBoundaries) {
        const { lowerX, upperX, lowerY, upperY, lowerZ, upperZ } = boundaries;

        /*
        for (const chunk of loadedChunks) {
            const chunkWorldOriginPosition = chunk.getWorldOriginPosition();

            if (
                chunkWorldOriginPosition.x < lowerX ||
                chunkWorldOriginPosition.x > upperX ||
                chunkWorldOriginPosition.y < lowerY ||
                chunkWorldOriginPosition.y > upperY ||
                chunkWorldOriginPosition.z < lowerZ ||
                chunkWorldOriginPosition.z > upperZ
            ) {
                const removedMeshes = this.chunksManager.removeChunk(chunk.getId());

                // remove the chunk meshes from the scene
                for (const mesh of removedMeshes) {
                if (mesh) {
                    this.scene.remove(mesh);
                }
            }
        }
        */
    }

    getTerrainBoundaries(position) {
        const centerChunkX = this.roundToNearestHorizontalChunk(position.x);
        const centerChunkZ = this.roundToNearestHorizontalChunk(position.z);

        const lowerX = centerChunkX - this.horizontalRenderDistance;
        const upperX = centerChunkX + this.horizontalRenderDistance;
        const lowerZ = centerChunkZ - this.horizontalRenderDistance;
        const upperZ = centerChunkZ + this.horizontalRenderDistance;

        const upperY = 256; // change value for max world height
        const lowerY = 0; // change value for min world height

        return { lowerX, upperX, lowerY, upperY, lowerZ, upperZ };
    }

    roundToNearestHorizontalChunk(num) {
        return Math.round(num / 32) * 32;
    }
}