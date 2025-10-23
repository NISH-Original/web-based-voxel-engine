import * as THREE from 'three';
import { Noise } from 'noisejs';
import { VoxelWorld } from './VoxelWorld.js';
import { Renderer } from './Renderer.js';
import { InputHandler } from './InputHandler.js';
import { PlayerController } from './PlayerController.js';

export class App {
	constructor() {
		this.canvas = document.querySelector('#c');
		this.renderer = new Renderer(this.canvas);
		this.world = null;
		this.inputHandler = null;
		this.playerController = null;
		this.material = null;
		this.lastTime = 0;
		
		this.init();
	}

	init() {
		// World configuration
		const cellSizeX = 32;
		const cellSizeY = 64;
		const cellSizeZ = 32;
		const tileSize = 16;
		const tileTextureWidth = 256;
		const tileTextureHeight = 64;

		// Create camera
		this.renderer.createCamera(cellSizeX, cellSizeY, cellSizeZ);

		// Load texture and create material
		this.material = this.renderer.loadTexture(() => {
			this.material = this.renderer.createMaterial(this.renderer.texture);
			this.setupWorld(cellSizeX, cellSizeY, cellSizeZ, tileSize, tileTextureWidth, tileTextureHeight);
			this.setupInputHandler();
			this.setupPlayerController();
			this.startRenderLoop();
		});
	}

	setupWorld(cellSizeX, cellSizeY, cellSizeZ, tileSize, tileTextureWidth, tileTextureHeight) {
		const noiseGenerator = new Noise(Math.random());

		this.world = new VoxelWorld({
			cellSizeX,
			cellSizeY,
			cellSizeZ,
			tileSize,
			tileTextureWidth,
			tileTextureHeight,
			material: this.material,
			noise: (x, z) => noiseGenerator.perlin2(x, z)
		});

		// Initialize with some voxels
		this.renderer.updateVoxelGeometry(this.world, 1, 1, 1, this.material);
	}

	setupInputHandler() {
		this.inputHandler = new InputHandler(
			this.canvas, 
			this.renderer.camera, 
			this.world, 
			this.renderer
		);
	}

	setupPlayerController() {
		this.playerController = new PlayerController(
			this.renderer.camera,
			this.world,
			this.renderer
		);
	}

	startRenderLoop() {
		// Setup event listeners
		this.renderer.setupEventListeners();
		
		// Start the render loop
		this.render();
	}

	render() {
		// Calculate delta time
		const currentTime = performance.now();
		const deltaTime = this.lastTime ? (currentTime - this.lastTime) / 1000 : 0;
		this.lastTime = currentTime;
		
		// Update player controller
		if (this.playerController) {
			this.playerController.update(deltaTime);
		}
		
		this.renderer.render(this.world);
		requestAnimationFrame(() => this.render());
	}
}
