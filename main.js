import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class VoxelWorld {
	// a cell is a chunk of voxels and a grid of such cells will form
	// a map. our cell will be 32x32x32.
	constructor(options) {
		this.cellSize = options.cellSize;
		this.tileSize = options.tileSize;
		this.tileTextureWidth = options.tileTextureWidth;
		this.tileTextureHeight = options.tileTextureHeight;
		const {cellSize} = this;
		this.cellSliceSize = cellSize * cellSize;
		this.cells = {};
	}

	// helper function to compute the offset of given voxel in the cell
	computeVoxelOffset(x, y, z) {
		const {cellSize, cellSliceSize} = this;

		const voxelX = THREE.MathUtils.euclideanModulo(x, cellSize) | 0;
		const voxelY = THREE.MathUtils.euclideanModulo(y, cellSize) | 0;
		const voxelZ = THREE.MathUtils.euclideanModulo(z, cellSize) | 0;

		return voxelY * cellSliceSize + voxelZ * cellSize + voxelX;
	}

	// return string for cellID from voxel coords
	// so if voxel is (33, 0, 0), it will return '(1,0,0)'
	computeCellID(x, y, z) {
		const {cellSize} = this;
		const cellX = Math.floor(x / cellSize);
		const cellY = Math.floor(y / cellSize);
		const cellZ = Math.floor(z / cellSize);
		return `${cellX},${cellY},${cellZ}`;
	}

	// add a new cell if it does not exist
	addCellForVoxel(x, y, z) {
		const cellID = this.computeCellID(x, y, z);
		let cell = this.cells[cellID];

		if (!cell) {
			const {cellSize} = this;
			cell = new Uint8Array(cellSize * cellSize * cellSize);
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

	// for (0, 0, 0), we consider voxels (0-31x, 0-31y, 0-31z)
	// for (1, 0, 0), we consider voxels (32-63x, 0-31y, 0-31z)
	generateGeometryDataForCell(cellX, cellY, cellZ) {
		const {cellSize, tileSize, tileTextureWidth, tileTextureHeight} = this;
		const positions = [];
		const normals = [];
		const indices = [];
		const uvs = [];
		const startX = cellX * cellSize;
		const startY = cellY * cellSize;
		const startZ = cellZ * cellSize;

		for (let y = 0; y < cellSize; ++y) {
			const voxelY = startY + y;
			for (let z = 0; z < cellSize; ++z) {
				const voxelZ = startZ + z;
				for (let x = 0; x < cellSize; ++x) {
					const voxelX = startX + x;

					const voxel = this.getVoxel(voxelX, voxelY, voxelZ);

					if (voxel) {
						const uvVoxel = voxel - 1;
						for (const {dir, corners, uvRow} of VoxelWorld.faces) {
							// try getting the neighbor of the voxel
							const neighbor = this.getVoxel(
								voxelX + dir[0], // neighbor along x-axis
								voxelY + dir[1], // neighbor along y-axis
								voxelZ + dir[2]  // neighbor along z-axis
							)

							// if there is no neighbor, then render a face
							if (!neighbor) {
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


function main() {
	const canvas = document.querySelector( '#c' );
	const renderer = new THREE.WebGLRenderer({antialias: true, canvas});

	const cellSize = 32;

	const tileSize = 16;
	const tileTextureWidth = 256;
	const tileTextureHeight = 64;

	const fov = 75;
	const aspect = 2; // the canvas default
	const near = 0.1;
	const far = 1000;
	const camera = new THREE.PerspectiveCamera( fov, aspect, near, far );
	camera.position.set( - cellSize * .3, cellSize * .8, - cellSize * .3 );

	const controls = new OrbitControls( camera, canvas );
	controls.target.set( cellSize / 2, cellSize / 3, cellSize / 2 );
	controls.update();

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 'lightblue' );

	const loader = new THREE.TextureLoader();
	const texture = loader.load('pictures/texture_atlas.png', render);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.colorSpace = THREE.SRGBColorSpace;

	// add directional light to scene
	function addLight( x, y, z ) {

		const color = 0xFFFFFF;
		const intensity = 3;
		const light = new THREE.DirectionalLight( color, intensity );
		light.position.set( x, y, z );
		scene.add( light );

	}

	addLight( - 1, 2, 4 );
	addLight( 1, - 1, - 2 );

	const world = new VoxelWorld({
		cellSize,
		tileSize,
		tileTextureWidth,
		tileTextureHeight
	});

	const material = new THREE.MeshLambertMaterial({
		map: texture,
		side: THREE.DoubleSide,
		alphaTest: 0.1,
		transparent: true
	});

	const cellIDToMesh = {};
	function updateCellGeometry(x, y, z) {
		const cellX = Math.floor(x / cellSize);
		const cellY = Math.floor(y / cellSize);
		const cellZ = Math.floor(z / cellSize);
		const cellID = world.computeCellID(x, y, z);
		let mesh = cellIDToMesh[cellID];
		const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry();

		const {positions, normals, uvs, indices} = world.generateGeometryDataForCell(cellX, cellY, cellZ);
		const positionNumComponents = 3;
		const normalNumComponents = 3;
		const uvNumComponents = 2;
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
		geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
		geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), uvNumComponents));
		geometry.setIndex(indices);
		
		try {
			geometry.computeBoundingSphere();
		} catch (err) {
			console.log(err);
		}

		if (!mesh) {
			mesh = new THREE.Mesh(geometry, material);
			mesh.name = cellID;
			cellIDToMesh[cellID] = mesh;
			scene.add(mesh);
			mesh.position.set(cellX * cellSize, cellY * cellSize, cellZ * cellSize);
		}
	}

	const neighborOffsets = [
		[ 0,  0,  0], // self
		[-1,  0,  0], // left
		[ 1,  0,  0], // right
		[ 0, -1,  0], // down
		[ 0,  1,  0], // up
		[ 0,  0, -1], // back
		[ 0,  0,  1], // front
	];

	// update geometry of voxel when a new voxel is added outside the cell
	function updateVoxelGeometry(x, y, z) {
		const updatedCellIDs = {};

		for (const offset of neighborOffsets) {
			const ox = x + offset[0];
			const oy = y + offset[1];
			const oz = z + offset[2];
			const cellID = world.computeCellID(ox, oy, oz);

			if (!updatedCellIDs[cellID]) {
				updatedCellIDs[cellID] = true;
				updateCellGeometry(ox, oy, oz);
			}
		}
	}

	// generate heightmap data and store which voxels should exist in cell array. 
	for (let y = 0; y < cellSize; ++y) {
		for (let z = 0; z < cellSize; ++z) {
			for (let x = 0; x < cellSize; ++x) {
				const height = (Math.sin(x / cellSize * Math.PI * 2) + Math.sin(z / cellSize * Math.PI * 3)) * (cellSize / 6) + (cellSize / 2);
				if (y < height) {
					world.setVoxel(x, y, z, randInt(1, 17));
				}
			}
		}
	}

	// return a random integer between max and min
	function randInt(min, max) {
		return Math.floor(Math.random() * (max - min) + min);
	}

	updateVoxelGeometry(1, 1, 1);

	function resizeRendererToDisplaySize(renderer) {
		const canvas = renderer.domElement;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const needResize = canvas.width !== width || canvas.height !== height;
		if ( needResize ) {
			renderer.setSize( width, height, false );
		}
		return needResize;
	}

	let renderRequested = false;

	function render() {
		renderRequested = undefined;
		if ( resizeRendererToDisplaySize( renderer ) ) {
			const canvas = renderer.domElement;
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
		}
		controls.update();
		renderer.render(scene, camera);
	}

	render();


	function requestRenderIfNotRequested() {
		if (!renderRequested) {
			renderRequested = true;
			requestAnimationFrame(render);
		}
	}

	let currentVoxel = 0;
	let currentID;

	document.querySelectorAll('#ui .tiles input[type=radio][name=voxel]').forEach((elem) => {
		elem.addEventListener('click', allowUncheck);
	});

	function allowUncheck() {
		if (this.id === currentID) {
			this.checked = false;
			currentID = undefined;
			currentVoxel = 0;
		} else {
			currentID = this.id;
			currentVoxel = parseInt(this.value);
		}
	}

	function getCanvasRelativePosition( event ) {

		const rect = canvas.getBoundingClientRect();
		return {
			x: (event.clientX - rect.left) * canvas.width / rect.width,
			y: (event.clientY - rect.top) * canvas.height / rect.height,
		};
	}

	function placeVoxel(event) {
		const pos = getCanvasRelativePosition(event);
		const x = (pos.x / canvas.width) * 2 - 1;
		const y = (pos.y / canvas.height) * -2 + 1;

		const start = new THREE.Vector3();
		const end = new THREE.Vector3();
		start.setFromMatrixPosition(camera.matrixWorld);
		end.set(x, y, 1).unproject(camera);

		const intersection = world.intersectRay(start, end);
		if (intersection) {
			const voxelID = event.shiftKey ? 0 : currentVoxel;
			const pos = intersection.position.map((v, ndx) => {
				return v + intersection.normal[ndx] * (voxelID > 0 ? 0.5 : -0.5);
			});
			world.setVoxel(...pos, voxelID);
			updateVoxelGeometry(...pos);
			requestRenderIfNotRequested();
		}
	}

	const mouse = {x:0, y:0};

	function recordStartPosition(event) {
		mouse.x = event.clientX;
		mouse.y = event.clientY;
		mouse.moveX = 0;
		mouse.moveY = 0;
	}

	function recordMovement(event) {
		mouse.moveX += Math.abs(mouse.x - event.clientX);
		mouse.moveY += Math.abs(mouse.y - event.clientY);
	} 

	function placeVoxelIfNoMovement(event) {
		if (mouse.moveX < 5 && mouse.moveY < 5) {
			placeVoxel(event);
		}

		window.removeEventListener('pointermove', recordMovement);
		window.removeEventListener('pointerup', placeVoxelIfNoMovement);
	}

	canvas.addEventListener('pointerdown', (event) => {
		event.preventDefault();
		recordStartPosition(event);
		window.addEventListener('pointermove', recordMovement);
		window.addEventListener('pointerup', placeVoxelIfNoMovement);
	}, {passive: false});

	canvas.addEventListener('touchstart', (event) => {
		event.preventDefault();
	}, {passive: false});

	controls.addEventListener('change', requestRenderIfNotRequested);
	window.addEventListener('resize', requestRenderIfNotRequested);
}

main();