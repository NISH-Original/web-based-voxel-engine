import * as THREE from 'three';

export class Chunk {
	constructor(world, cellX, cellY, cellZ) {
		this.world = world;
		this.cellX = cellX;
		this.cellY = cellY;
		this.cellZ = cellZ;
		this.mesh = null;
		this.generate();
	}

	generate() {
		const {cellSizeX, cellSizeZ} = this.world;
		const startX = this.cellX * cellSizeX;
		const startZ = this.cellZ * cellSizeZ;

		for (let x = 0; x < cellSizeX; x++) {
			for (let z = 0; z < cellSizeZ; z++) {
				const worldX = startX + x;
				const worldZ = startZ + z;
				const height = Math.max(1, Math.floor(this.fractalNoise(worldX, worldZ, this.world.noise) * 50 + 10));
				
				// Ensure minimum height to prevent holes
				const minHeight = Math.max(height, 5);
				
				// Generate solid terrain from bottom to surface
				for (let y = 0; y < height; y++) {
					// Only set voxel if it doesn't already exist AND hasn't been manually edited
					const existingVoxel = this.world.getVoxel(worldX, y, worldZ);
					const isManuallyEdited = this.world.isVoxelManuallyEdited(worldX, y, worldZ);
					if (!existingVoxel && !isManuallyEdited) {
						this.world.setVoxel(worldX, y, worldZ, 14);
					}
				}
			}
		}
	}

	fractalNoise(x, z, noiseGen, octaves = 4, persistence = 0.5, scale = 0.02) {
		// Check cache first
		const cacheKey = `${x},${z},${octaves},${persistence},${scale}`;
		if (this.world.noiseCache.has(cacheKey)) {
			return this.world.noiseCache.get(cacheKey);
		}
		
		let total = 0;
		let frequency = scale;
		let amplitude = 1;
		let maxValue = 0;
	
		for (let i = 0; i < octaves; i++) {
			total += noiseGen(x * frequency, z * frequency) * amplitude;
			maxValue += amplitude;
			amplitude *= persistence;
			frequency *= 2;
		}
	
		const result = total / maxValue; // Normalize
		this.world.noiseCache.set(cacheKey, result);
		return result;
	}

	updateGeometry(scene) {
		const { cellX, cellY, cellZ, world } = this;
		const { positions, normals, uvs, indices } = world.generateGeometryDataForCell(cellX, cellY, cellZ);
		
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
		geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
		geometry.setIndex(indices);

		if (this.mesh) {
			scene.remove(this.mesh);
			this.mesh.geometry.dispose();
		}

		this.mesh = new THREE.Mesh(geometry, world.material);
		this.mesh.position.set(cellX * world.cellSizeX, cellY * world.cellSizeY, cellZ * world.cellSizeZ);
		// Disable shadows during generation for performance
		this.mesh.castShadow = false;
		this.mesh.receiveShadow = false;
		scene.add(this.mesh);
		
		// Enable shadows after a short delay to avoid frame drops
		setTimeout(() => {
			if (this.mesh) {
				this.mesh.castShadow = true;
				this.mesh.receiveShadow = true;
			}
		}, 100);
	}

	dispose(scene) {
		if (this.mesh) {
			scene.remove(this.mesh);
			this.mesh.geometry.dispose();
			this.mesh = null;
		}
	}
}
