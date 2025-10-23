import * as THREE from 'three';
import { Chunk } from './Chunk.js';

export class VoxelWorld {
	// a cell is a chunk of voxels and a grid of such cells will form
	// a map. our cell will be 32x32x32.
	constructor(options) {
		this.cellSizeX = options.cellSizeX;
		this.cellSizeY = options.cellSizeY;
		this.cellSizeZ = options.cellSizeZ;
		this.tileSize = options.tileSize;
		this.tileTextureWidth = options.tileTextureWidth;
		this.tileTextureHeight = options.tileTextureHeight;
		this.material = options.material;
		this.noise = options.noise;
		this.cellSliceSize = this.cellSizeX * this.cellSizeZ;
		this.cells = {};
		this.chunks = {};
		this.activeChunkIDs = new Set();
		this.lastCamChunkX = null;
		this.lastCamChunkY = null;
		this.chunkGenerationQueue = [];
		this.isGeneratingChunk = false;
		this.noiseCache = new Map();
		this.manuallyEditedVoxels = new Set();
	}

	// helper function to compute the offset of given voxel in the cell
	computeVoxelOffset(x, y, z) {
		const {cellSizeX, cellSizeY, cellSizeZ, cellSliceSize} = this;

		const voxelX = THREE.MathUtils.euclideanModulo(x, cellSizeX) | 0;
		const voxelY = THREE.MathUtils.euclideanModulo(y, cellSizeY) | 0;
		const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSizeZ) | 0;

		return voxelY * cellSliceSize + voxelZ * cellSizeZ + voxelX;
	}

	// return string for cellID from voxel coords
	// so if voxel is (33, 0, 0), it will return '(1,0,0)'
	computeCellID(x, y, z) {
		const {cellSizeX, cellSizeY, cellSizeZ} = this;
		const cellX = Math.floor(x / cellSizeX);
		const cellY = Math.floor(y / cellSizeY);
		const cellZ = Math.floor(z / cellSizeZ);
		return `${cellX},${cellY},${cellZ}`;
	}

	// add a new cell if it does not exist
	addCellForVoxel(x, y, z) {
		const cellID = this.computeCellID(x, y, z);
		let cell = this.cells[cellID];
		const {cellSizeX, cellSizeY, cellSizeZ} = this

		if (!cell) {
			cell = new Uint8Array(cellSizeX * cellSizeY * cellSizeZ);
			this.cells[cellID] = cell;
		}

		return cell;
	}

	// get cell coordinates from voxel coordinates
	getCellForVoxel(x, y, z) {
		return this.cells[this.computeCellID(x, y, z)];
	}

	// set voxel of type v on coords (x, y, z)
	// if does not exist, add a new cell
	setVoxel(x, y, z, v, addCell = true) {
		let cell = this.getCellForVoxel(x, y, z);

		if (!cell) {
			if (!addCell) { return; }
			cell = this.addCellForVoxel(x, y, z);
		}

		const voxelOffset = this.computeVoxelOffset(x, y, z);
		cell[voxelOffset] = v;
	}

	// get voxel from provided coordinates
	getVoxel(x, y, z) {
		const cell = this.getCellForVoxel(x, y, z);
		
		if (!cell) {
			return 0;
		}

		const voxelOffset = this.computeVoxelOffset(x, y, z);
		return cell[voxelOffset];
	}

	// Helper method to create a unique key for a voxel position
	getVoxelKey(x, y, z) {
		return `${x},${y},${z}`;
	}

	// Mark a voxel as manually edited
	markVoxelAsEdited(x, y, z) {
		const key = this.getVoxelKey(x, y, z);
		this.manuallyEditedVoxels.add(key);
	}

	// Check if a voxel has been manually edited
	isVoxelManuallyEdited(x, y, z) {
		const key = this.getVoxelKey(x, y, z);
		return this.manuallyEditedVoxels.has(key);
	}

	// for (0, 0, 0), we consider voxels (0-31x, 0-31y, 0-31z)
	// for (1, 0, 0), we consider voxels (32-63x, 0-31y, 0-31z)
	generateGeometryDataForCell(cellX, cellY, cellZ) {
		const {cellSizeX, cellSizeY, cellSizeZ, tileSize, tileTextureWidth, tileTextureHeight} = this;
		const positions = [];
		const normals = [];
		const indices = [];
		const uvs = [];
		const startX = cellX * cellSizeX;
		const startY = cellY * cellSizeY;
		const startZ = cellZ * cellSizeZ;

		for (let y = 0; y < cellSizeY; ++y) {
			const voxelY = startY + y;
			for (let z = 0; z < cellSizeZ; ++z) {
				const voxelZ = startZ + z;
				for (let x = 0; x < cellSizeX; ++x) {
					const voxelX = startX + x;

					const voxel = this.getVoxel(voxelX, voxelY, voxelZ);

					if (voxel) {
						
						const uvVoxel = voxel - 1;
						for (const {dir, corners, uvRow} of VoxelWorld.faces) {
							const neighbor = this.getVoxel(
								voxelX + dir[0], // neighbor along x-axis
								voxelY + dir[1], // neighbor along y-axis
								voxelZ + dir[2]  // neighbor along z-axis
							)

							let shouldRenderFace = !neighbor;
							
							// If no neighbor found, check if it's in an adjacent chunk
							if (!neighbor) {
								const neighborX = voxelX + dir[0];
								const neighborY = voxelY + dir[1];
								const neighborZ = voxelZ + dir[2];
								
								// Check if neighbor is in a different chunk
								const neighborCellX = Math.floor(neighborX / this.cellSizeX);
								const neighborCellY = Math.floor(neighborY / this.cellSizeY);
								const neighborCellZ = Math.floor(neighborZ / this.cellSizeZ);
								
								const currentCellX = Math.floor(voxelX / this.cellSizeX);
								const currentCellY = Math.floor(voxelY / this.cellSizeY);
								const currentCellZ = Math.floor(voxelZ / this.cellSizeZ);
								
								// If neighbor is in a different chunk, check if that chunk exists
								if (neighborCellX !== currentCellX || neighborCellY !== currentCellY || neighborCellZ !== currentCellZ) {
									const neighborChunk = this.getChunk(neighborCellX, neighborCellY, neighborCellZ);
									if (neighborChunk) {
										// Neighbor chunk exists, check for voxel there
										const neighborVoxel = this.getVoxel(neighborX, neighborY, neighborZ);
										if (neighborVoxel) {
											shouldRenderFace = false;
										}
									}
								}
							}

							// if there is no neighbor, then render a face
							if (shouldRenderFace) {
								const ndx = positions.length / 3;

								for (const {pos, uv} of corners) {
									positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
									normals.push(...dir);
									uvs.push(
										(uvVoxel + uv[0]) * tileSize / tileTextureWidth,
										1 - (uvRow + 1 - uv[1]) * tileSize / tileTextureHeight
									);
								}

								indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
							}
						}
					}
				}
			}
		}

		return { positions, normals, uvs, indices };
	}

	getChunk(cellX, cellY, cellZ) {
		const id = `${cellX},${cellY},${cellZ}`;
		return this.chunks[id];
	}

	ensureChunkExists(cellX, cellY, cellZ, scene) {
		const id = `${cellX},${cellY},${cellZ}`;
		if (!this.chunks[id]) {
			this.chunkGenerationQueue.push({ cellX, cellY, cellZ, scene });
			return null;
		}

		return this.chunks[id];
	}
	
	// Process chunk generation queue (call this in render loop)
	processChunkQueue() {
		if (this.chunkGenerationQueue.length > 0 && !this.isGeneratingChunk) {
			this.isGeneratingChunk = true;
			const chunkData = this.chunkGenerationQueue.shift();
			const { cellX, cellY, cellZ, scene } = chunkData;
			const id = `${cellX},${cellY},${cellZ}`;
			
			// Generate chunk
			this.chunks[id] = new Chunk(this, cellX, cellY, cellZ);
			this.chunks[id].updateGeometry(scene);
			
			this.isGeneratingChunk = false;
		}
	}
	
	// Force chunk generation for voxel editing
	ensureChunkForEditing(cellX, cellY, cellZ, scene) {
		const id = `${cellX},${cellY},${cellZ}`;
		if (!this.chunks[id]) {
			// Generate chunk immediately for editing
			this.chunks[id] = new Chunk(this, cellX, cellY, cellZ);
			this.chunks[id].updateGeometry(scene);
		}
		return this.chunks[id];
	}
	
	regenerateAdjacentChunks(cellX, cellY, cellZ, scene) {
		// Regenerate the 6 adjacent chunks to fix face culling
		const adjacentChunks = [
			[cellX - 1, cellY, cellZ], [cellX + 1, cellY, cellZ],
			[cellX, cellY - 1, cellZ], [cellX, cellY + 1, cellZ],
			[cellX, cellY, cellZ - 1], [cellX, cellY, cellZ + 1]
		];
		
		for (const [adjX, adjY, adjZ] of adjacentChunks) {
			const adjId = `${adjX},${adjY},${adjZ}`;
			if (this.chunks[adjId]) {
				this.chunks[adjId].updateGeometry(scene);
			}
		}
	}

	updateVisibleChunks(camera, distance, scene, cellIDToMesh) {
		const camX = Math.floor(camera.position.x / this.cellSizeX);
		const camZ = Math.floor(camera.position.z / this.cellSizeZ);
		
		if (camX === this.lastCamChunkX && camZ === this.lastCamChunkZ) {
			return;
		}

		this.lastCamChunkX = camX;
		this.lastCamChunkZ = camZ;

		const newActiveChunkIDs = new Set();

		for (let dz = -distance; dz <= distance; dz++) {
			for (let dx = -distance; dx <= distance; dx++) {
				const chunkX = camX + dx;
				const chunkZ = camZ + dz;
				const id = `${chunkX},0,${chunkZ}`;
				newActiveChunkIDs.add(id);
				this.ensureChunkExists(chunkX, 0, chunkZ, scene);
			}
		}

		// unloading chunks outside range
		for (const id of this.activeChunkIDs) {
			if (!newActiveChunkIDs.has(id)) {
				const chunk = this.chunks[id];
				if (chunk) {
					chunk.dispose(scene);
					delete this.chunks[id];
				}
				
				// Also clean up the cellIDToMesh for this chunk
				if (cellIDToMesh) {
					const [chunkX, chunkY, chunkZ] = id.split(',').map(Number);
					const cellSizeX = this.cellSizeX;
					const cellSizeY = this.cellSizeY;
					const cellSizeZ = this.cellSizeZ;
					
					// Clean up all cells in this chunk
					for (let y = 0; y < cellSizeY; y++) {
						for (let z = 0; z < cellSizeZ; z++) {
							for (let x = 0; x < cellSizeX; x++) {
								const worldX = chunkX * cellSizeX + x;
								const worldY = chunkY * cellSizeY + y;
								const worldZ = chunkZ * cellSizeZ + z;
								const cellID = this.computeCellID(worldX, worldY, worldZ);
								
								if (cellIDToMesh[cellID]) {
									scene.remove(cellIDToMesh[cellID]);
									cellIDToMesh[cellID].geometry.dispose();
									delete cellIDToMesh[cellID];
								}
							}
						}
					}
				}
			}
		}
		
		this.activeChunkIDs = newActiveChunkIDs;
	}

	intersectRay(start, end) {
		let dx = end.x - start.x;
		let dy = end.y - start.y;
		let dz = end.z - start.z;
		const lenSq = dx * dx + dy * dy + dz * dz;
		const len = Math.sqrt(lenSq);

		dx /= len;
		dy /= len;
		dz /= len;

		let t = 0.0;
		let ix = Math.floor(start.x);
		let iy = Math.floor(start.y);
		let iz = Math.floor(start.z);

		const stepX = (dx > 0) ? 1 : -1;
		const stepY = (dy > 0) ? 1 : -1;
		const stepZ = (dz > 0) ? 1 : -1;

		const txDelta = Math.abs( 1 / dx );
		const tyDelta = Math.abs( 1 / dy );
		const tzDelta = Math.abs( 1 / dz );

		const xDist = ( stepX > 0 ) ? ( ix + 1 - start.x ) : ( start.x - ix );
		const yDist = ( stepY > 0 ) ? ( iy + 1 - start.y ) : ( start.y - iy );
		const zDist = ( stepZ > 0 ) ? ( iz + 1 - start.z ) : ( start.z - iz );

		// location of nearest voxel boundary, in units of t
		let txMax = ( txDelta < Infinity ) ? txDelta * xDist : Infinity;
		let tyMax = ( tyDelta < Infinity ) ? tyDelta * yDist : Infinity;
		let tzMax = ( tzDelta < Infinity ) ? tzDelta * zDist : Infinity;

		let steppedIndex = - 1;

		// main loop along raycast vector
		while ( t <= len ) {
			const voxel = this.getVoxel( ix, iy, iz );
			if ( voxel ) {
				return {
					position: [
						start.x + t * dx,
						start.y + t * dy,
						start.z + t * dz,
					],
					normal: [
						steppedIndex === 0 ? - stepX : 0,
						steppedIndex === 1 ? - stepY : 0,
						steppedIndex === 2 ? - stepZ : 0,
					],
					voxel,
				};
			}

			// advance t to next nearest voxel boundary
			if ( txMax < tyMax ) {
				if ( txMax < tzMax ) {

					ix += stepX;
					t = txMax;
					txMax += txDelta;
					steppedIndex = 0;
				} else {

					iz += stepZ;
					t = tzMax;
					tzMax += tzDelta;
					steppedIndex = 2;
				}
			} else {
				if ( tyMax < tzMax ) {
					iy += stepY;
					t = tyMax;
					tyMax += tyDelta;
					steppedIndex = 1;
				} else {
					iz += stepZ;
					t = tzMax;
					tzMax += tzDelta;
					steppedIndex = 2;
				}
			}
		}

		return null;
	}
}

// store all faces of a voxel which includes:
// - row of the UVMap
// - direction of the normal
// - coords of the vertices of the face
// - UV coords associated with the vertex
VoxelWorld.faces = [
	{ 	// left
		uvRow: 0,
		dir: [ -1,  0,  0, ],
		corners: [
			{ pos: [ 0, 1, 0 ], uv: [ 0, 1 ], },
			{ pos: [ 0, 0, 0 ], uv: [ 0, 0 ], },
			{ pos: [ 0, 1, 1 ], uv: [ 1, 1 ], },
			{ pos: [ 0, 0, 1 ], uv: [ 1, 0 ], },
		],
	},
	{ 	// right
		uvRow: 0,
		dir: [  1,  0,  0, ],
		corners: [
			{ pos: [ 1, 1, 1 ], uv: [ 0, 1 ], },
			{ pos: [ 1, 0, 1 ], uv: [ 0, 0 ], },
			{ pos: [ 1, 1, 0 ], uv: [ 1, 1 ], },
			{ pos: [ 1, 0, 0 ], uv: [ 1, 0 ], },
		],
	},
	{ 	// bottom
		uvRow: 1,
		dir: [  0, -1,  0, ],
		corners: [
			{ pos: [ 1, 0, 1 ], uv: [ 1, 0 ], },
			{ pos: [ 0, 0, 1 ], uv: [ 0, 0 ], },
			{ pos: [ 1, 0, 0 ], uv: [ 1, 1 ], },
			{ pos: [ 0, 0, 0 ], uv: [ 0, 1 ], },
		],
	},
	{ 	// top
		uvRow: 2,
		dir: [  0,  1,  0, ],
		corners: [
			{ pos: [ 0, 1, 1 ], uv: [ 1, 1 ], },
			{ pos: [ 1, 1, 1 ], uv: [ 0, 1 ], },
			{ pos: [ 0, 1, 0 ], uv: [ 1, 0 ], },
			{ pos: [ 1, 1, 0 ], uv: [ 0, 0 ], },
		],
	},
	{ 	// back
		uvRow: 0,
		dir: [  0,  0, -1, ],
		corners: [
			{ pos: [ 1, 0, 0 ], uv: [ 0, 0 ], },
			{ pos: [ 0, 0, 0 ], uv: [ 1, 0 ], },
			{ pos: [ 1, 1, 0 ], uv: [ 0, 1 ], },
			{ pos: [ 0, 1, 0 ], uv: [ 1, 1 ], },
		],
	},
	{ 	// front
		uvRow: 0,
		dir: [  0,  0,  1, ],
		corners: [
			{ pos: [ 0, 0, 1 ], uv: [ 0, 0 ], },
			{ pos: [ 1, 0, 1 ], uv: [ 1, 0 ], },
			{ pos: [ 0, 1, 1 ], uv: [ 0, 1 ], },
			{ pos: [ 1, 1, 1 ], uv: [ 1, 1 ], },
		],
	},
];
