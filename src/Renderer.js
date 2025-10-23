import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/src/Stats.js';

export class Renderer {
	constructor(canvas) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({antialias: true, canvas});
		this.scene = new THREE.Scene();
		this.camera = null;
		this.controls = null;
		this.stats = null;
		this.cellIDToMesh = {};
		this.renderRequested = false;
		
		this.setupRenderer();
		this.setupScene();
		this.setupStats();
	}

	setupRenderer() {
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.BasicShadowMap;
		this.renderer.shadowMap.autoUpdate = false;
	}

	setupScene() {
		this.scene.background = new THREE.Color('lightblue');
		
		const sun = new THREE.DirectionalLight(0xffffff, 1.5);
		sun.position.set(100, 200, 100); 
		sun.castShadow = true;
		
		sun.shadow.mapSize.width = 256;
		sun.shadow.mapSize.height = 256;
		sun.shadow.camera.near = 0.5;
		sun.shadow.camera.far = 1000;
		sun.shadow.camera.left = -100;
		sun.shadow.camera.right = 100;
		sun.shadow.camera.top = 100;
		sun.shadow.camera.bottom = -100;
		
		sun.shadow.bias = -0.0001;
		sun.shadow.normalBias = 0.1;
		sun.shadow.radius = 8;
		
		this.scene.add(sun);

		const ambientLight = new THREE.AmbientLight(0x6e6e6e, 0.9);
		this.scene.add(ambientLight);
	}

	setupStats() {
		this.stats = new Stats();
		this.stats.showPanel(0);
		document.body.appendChild(this.stats.dom);
	}

	createCamera(cellSizeX, cellSizeY, cellSizeZ) {
		const fov = 75;
		const aspect = 2;
		const near = 0.1;
		const far = 1000;
		this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
		this.camera.position.set(32, 128, 32);
	}

	createMaterial(texture) {
		this.material = new THREE.MeshLambertMaterial({
			map: texture,
			side: THREE.DoubleSide,
			alphaTest: 0.1,
			transparent: true
		});
		return this.material;
	}

	loadTexture(callback) {
		const loader = new THREE.TextureLoader();
		this.texture = loader.load('pictures/pixil-frame-0.png', callback);
		this.texture.magFilter = THREE.NearestFilter;
		this.texture.minFilter = THREE.NearestFilter;
		this.texture.colorSpace = THREE.SRGBColorSpace;
		return this.texture;
	}

	updateCellGeometry(world, x, y, z, material) {
		const cellX = Math.floor(x / world.cellSizeX);
		const cellY = Math.floor(y / world.cellSizeY);
		const cellZ = Math.floor(z / world.cellSizeZ);
		const cellID = world.computeCellID(x, y, z);
		let mesh = this.cellIDToMesh[cellID];
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
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.cellIDToMesh[cellID] = mesh;
			this.scene.add(mesh);
			mesh.position.set(cellX * world.cellSizeX, cellY * world.cellSizeY, cellZ * world.cellSizeZ);
		}
	}

	updateVoxelGeometry(world, x, y, z, material) {
		const neighborOffsets = [
			[ 0,  0,  0], // self
			[-1,  0,  0], // left
			[ 1,  0,  0], // right
			[ 0, -1,  0], // down
			[ 0,  1,  0], // up
			[ 0,  0, -1], // back
			[ 0,  0,  1], // front
		];

		const updatedCellIDs = {};

		for (const offset of neighborOffsets) {
			const ox = x + offset[0];
			const oy = y + offset[1];
			const oz = z + offset[2];
			const cellID = world.computeCellID(ox, oy, oz);

			if (!updatedCellIDs[cellID]) {
				updatedCellIDs[cellID] = true;
				
				const cellX = Math.floor(ox / world.cellSizeX);
				const cellY = Math.floor(oy / world.cellSizeY);
				const cellZ = Math.floor(oz / world.cellSizeZ);
				const chunkID = `${cellX},${cellY},${cellZ}`;
				
				if (world.chunks[chunkID]) {
					world.chunks[chunkID].updateGeometry(this.scene);
				} else {
					this.updateCellGeometry(world, ox, oy, oz, material);
				}
			}
		}
	}

	resizeRendererToDisplaySize() {
		const canvas = this.renderer.domElement;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const needResize = canvas.width !== width || canvas.height !== height;
		if (needResize) {
			this.renderer.setSize(width, height, false);
		}
		return needResize;
	}

	render(world) {
		this.stats.begin();

		this.renderRequested = undefined;
		if (this.resizeRendererToDisplaySize()) {
			const canvas = this.renderer.domElement;
			this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
			this.camera.updateProjectionMatrix();
		}
		
		// Only update chunks if world is provided
		if (world) {
			world.updateVisibleChunks(this.camera, 3, this.scene, this.cellIDToMesh);
			world.processChunkQueue();
		} 
		// this.controls.update(); // Disabled for first-person movement
		this.renderer.render(this.scene, this.camera);

		this.stats.end();
	}

	requestRenderIfNotRequested() {
		if (!this.renderRequested) {
			this.renderRequested = true;
			requestAnimationFrame(() => this.render());
		}
	}

	// Event listeners
	setupEventListeners() {
		// this.controls.addEventListener('change', () => this.requestRenderIfNotRequested()); // Disabled for first-person movement
		window.addEventListener('resize', () => this.requestRenderIfNotRequested());
	}
}
