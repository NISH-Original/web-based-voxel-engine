import * as THREE from 'three';

export class InputHandler {
	constructor(canvas, camera, world, renderer) {
		this.canvas = canvas;
		this.camera = camera;
		this.world = world;
		this.renderer = renderer;
		this.currentVoxel = 1; // Start with first block selected
		this.currentID = 'voxel1';
		this.mouse = {x: 0, y: 0};
		
		this.setupUI();
		this.setupEventListeners();
	}

	setupUI() {
		// Setup voxel selection UI
		document.querySelectorAll('#ui input[type=radio][name=voxel]').forEach((elem) => {
			elem.addEventListener('click', () => this.allowUncheck(elem));
		});
		
		// Set initial selection
		document.getElementById('voxel1').checked = true;
		this.currentID = 'voxel1';
		this.currentVoxel = 1;
	}

	allowUncheck(elem) {
		if (elem.id === this.currentID) {
			elem.checked = false;
			this.currentID = undefined;
			this.currentVoxel = 0;
		} else {
			this.currentID = elem.id;
			this.currentVoxel = parseInt(elem.value);
		}
	}

	getCanvasRelativePosition(event) {
		const rect = this.canvas.getBoundingClientRect();
		return {
			x: (event.clientX - rect.left) * this.canvas.width / rect.width,
			y: (event.clientY - rect.top) * this.canvas.height / rect.height,
		};
	}

	placeVoxel(event) {
		const start = new THREE.Vector3();
		const end = new THREE.Vector3();
		start.setFromMatrixPosition(this.camera.matrixWorld);
		
		end.set(0, 0, 1).unproject(this.camera);

		const intersection = this.world.intersectRay(start, end);
		if (intersection) {
			// Left click (button 0) = destroy, Right click (button 2) = place
			const isLeftClick = event.button === 0;
			const isRightClick = event.button === 2;
			
			let voxelID;
			if (isLeftClick) {
				voxelID = 0; // Destroy block
			} else if (isRightClick) {
				voxelID = this.currentVoxel; // Place selected block
			} else {
				return; // Ignore other mouse buttons
			}
			
			// Calculate position for block placement
			const pos = intersection.position.map((v, ndx) => {
				return v + intersection.normal[ndx] * (voxelID > 0 ? 0.5 : -0.5);
			});
			
			const x = Math.floor(pos[0]);
			const y = Math.floor(pos[1]);
			const z = Math.floor(pos[2]);
			
			const cellX = Math.floor(x / this.world.cellSizeX);
			const cellY = Math.floor(y / this.world.cellSizeY);
			const cellZ = Math.floor(z / this.world.cellSizeZ);
			const chunk = this.world.ensureChunkForEditing(cellX, cellY, cellZ, this.renderer.scene);
			
			this.world.markVoxelAsEdited(x, y, z);
			
			this.world.setVoxel(x, y, z, voxelID);
			
			this.renderer.updateVoxelGeometry(this.world, x, y, z, this.world.material);
			
			this.renderer.requestRenderIfNotRequested();
		}
	}

	recordStartPosition(event) {
		this.mouse.x = event.clientX;
		this.mouse.y = event.clientY;
		this.mouse.moveX = 0;
		this.mouse.moveY = 0;
	}

	recordMovement(event) {
		this.mouse.moveX = Math.abs(this.mouse.x - event.clientX);
		this.mouse.moveY = Math.abs(this.mouse.y - event.clientY);
	}

	placeVoxelIfNoMovement(event) {
		if (this.mouse.moveX < 5 && this.mouse.moveY < 5) {
			this.placeVoxel(event);
		}

		window.removeEventListener('pointermove', this.recordMovement.bind(this));
		window.removeEventListener('pointerup', this.placeVoxelIfNoMovement.bind(this));
	}

	cycleVoxel(direction) {
		const maxVoxel = 16;
		const oldVoxel = this.currentVoxel;
		this.currentVoxel += direction;
		
		// Wrap around
		if (this.currentVoxel > maxVoxel) {
			this.currentVoxel = 1;
		} else if (this.currentVoxel < 1) {
			this.currentVoxel = maxVoxel;
		}
		
		// Uncheck current selection
		if (this.currentID) {
			const currentElement = document.getElementById(this.currentID);
			if (currentElement) {
				currentElement.checked = false;
			}
		}
		
		// Update UI with new selection
		const voxelId = `voxel${this.currentVoxel}`;
		const voxelElement = document.getElementById(voxelId);
		if (voxelElement) {
			voxelElement.checked = true;
			this.currentID = voxelId;
		}
	}

	setupEventListeners() {
		this.canvas.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			this.recordStartPosition(event);
			window.addEventListener('pointermove', this.recordMovement.bind(this));
			window.addEventListener('pointerup', this.placeVoxelIfNoMovement.bind(this));
		}, {passive: false});

		this.canvas.addEventListener('touchstart', (event) => {
			event.preventDefault();
		}, {passive: false});
		
		// Prevent context menu on right click
		this.canvas.addEventListener('contextmenu', (event) => {
			event.preventDefault();
		});
		
		// Add scroll wheel cycling - listen on window to catch all scroll events
		window.addEventListener('wheel', (event) => {
			event.preventDefault();
			this.cycleVoxel(event.deltaY > 0 ? 1 : -1);
		}, {passive: false});
		
		this.updateCrosshairTargeting();
	}

	updateCrosshairTargeting() {
		// Check if crosshair is pointing at a block
		const start = new THREE.Vector3();
		const end = new THREE.Vector3();
		start.setFromMatrixPosition(this.camera.matrixWorld);
		
		end.set(0, 0, 1).unproject(this.camera);

		const intersection = this.world.intersectRay(start, end);
		const crosshair = document.getElementById('crosshair');
		
		if (intersection && crosshair) {
			crosshair.classList.add('targeting');
		} else if (crosshair) {
			crosshair.classList.remove('targeting');
		}
		
		requestAnimationFrame(() => this.updateCrosshairTargeting());
	}
}
