import * as THREE from 'three';

export class PlayerController {
	constructor(camera, world, renderer) {
		this.camera = camera;
		this.world = world;
		this.renderer = renderer;
		
		this.isFlying = false;
		this.isGrounded = false;
		this.velocity = new THREE.Vector3(0, 0, 0);
		this.moveSpeed = 8.0;
		this.flySpeed = 12.0;
		this.jumpSpeed = 10.0;
		this.gravity = -30.0;
		this.terminalVelocity = -50.0;
		
		this.keys = {
			forward: false,
			backward: false,
			left: false,
			right: false,
			jump: false,
			flyUp: false,
			flyDown: false
		};
		
		this.flying = false;
		this.lastSpacePress = 0;
		this.spaceDoubleClickTime = 300;
		
		this.playerHeight = 2.0
		this.playerWidth = 0.6;
		this.eyeHeight = 1.8;
		
		this.groundCheckDistance = 0.3;
		
		this.collisionRadius = 0.3;
		this.collisionHeight = 2.0;
		this.autoLandDistance = 2.0;
		
		this.mouseSensitivity = 0.002;
		this.pitch = 0;
		this.yaw = 0;
		this.isPointerLocked = false;
		
		this.setupEventListeners();
	}

	setupEventListeners() {
		document.addEventListener('keydown', (event) => this.onKeyDown(event));
		document.addEventListener('keyup', (event) => this.onKeyUp(event));
		
		document.addEventListener('click', () => this.requestPointerLock());
		document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
		document.addEventListener('mousemove', (event) => this.onMouseMove(event));
	}

	requestPointerLock() {
		if (!this.isPointerLocked) {
			document.body.requestPointerLock();
		}
	}

	onPointerLockChange() {
		this.isPointerLocked = document.pointerLockElement === document.body;
	}

	onMouseMove(event) {
		if (!this.isPointerLocked) return;
		
		this.yaw -= event.movementX * this.mouseSensitivity;
		this.pitch -= event.movementY * this.mouseSensitivity;
		
		this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
		
		this.camera.rotation.order = 'YXZ';
		this.camera.rotation.y = this.yaw;
		this.camera.rotation.x = this.pitch;
	}

	onKeyDown(event) {
		switch(event.code) {
			case 'KeyW':
				this.keys.forward = true;
				break;
			case 'KeyS':
				this.keys.backward = true;
				break;
			case 'KeyA':
				this.keys.left = true;
				break;
			case 'KeyD':
				this.keys.right = true;
				break;
			case 'Space':
				event.preventDefault();
				if (this.flying) {
					this.handleSpacePress();
				} else {
					this.handleSpacePress();
				}
				break;
			case 'ControlLeft':
			case 'ControlRight':
				event.preventDefault();
				this.keys.flyDown = true;
				break;
		}
	}

	onKeyUp(event) {
		switch(event.code) {
			case 'KeyW':
				this.keys.forward = false;
				break;
			case 'KeyS':
				this.keys.backward = false;
				break;
			case 'KeyA':
				this.keys.left = false;
				break;
			case 'KeyD':
				this.keys.right = false;
				break;
			case 'Space':
				if (this.flying) {
					this.keys.flyUp = false;
				}
				break;
			case 'ControlLeft':
			case 'ControlRight':
				this.keys.flyDown = false;
				break;
		}
	}

	handleSpacePress() {
		const currentTime = Date.now();
		
		if (this.flying) {
			if (currentTime - this.lastSpacePress < this.spaceDoubleClickTime) {
				this.land();
			} else {
				this.keys.flyUp = true;
			}
		} else {
			if (currentTime - this.lastSpacePress < this.spaceDoubleClickTime) {
				this.startFlying();
			} else {
				this.keys.jump = true;
			}
		}
		
		this.lastSpacePress = currentTime;
	}

	startFlying() {
		this.flying = true;
		this.velocity.y = 0; 
		console.log('Started flying');
	}

	land() {
		this.flying = false;
		this.velocity.y = 0; 
		console.log('Landed');
	}

	update(deltaTime) {
		if (this.flying) {
			this.updateFlyingMovement(deltaTime);
		} else {
			this.updateWalkingMovement(deltaTime);
		}
		
		this.updatePosition(deltaTime);
		this.checkGroundCollision();
		this.updateUI();
	}

	updateWalkingMovement(deltaTime) {
		const direction = new THREE.Vector3();
		this.camera.getWorldDirection(direction);
		direction.y = 0;
		direction.normalize();
		
		const moveVector = new THREE.Vector3();
		
		if (this.keys.forward) {
			moveVector.add(direction);
		}
		if (this.keys.backward) {
			moveVector.sub(direction);
		}
		if (this.keys.left) {
			moveVector.add(new THREE.Vector3(direction.z, 0, -direction.x));
		}
		if (this.keys.right) {
			moveVector.add(new THREE.Vector3(-direction.z, 0, direction.x));
		}
		
		if (moveVector.length() > 0) {
			moveVector.normalize();
			moveVector.multiplyScalar(this.moveSpeed);
			this.velocity.x = moveVector.x;
			this.velocity.z = moveVector.z;
		} else {
			this.velocity.x *= 0.8;
			this.velocity.z *= 0.8;
		}
		
		if (this.keys.jump && this.isGrounded) {
			this.velocity.y = this.jumpSpeed;
			this.isGrounded = false;
		}
		this.keys.jump = false;
		
		if (!this.isGrounded) {
			this.velocity.y += this.gravity * deltaTime;
			this.velocity.y = Math.max(this.velocity.y, this.terminalVelocity);
		}
	}

	updateFlyingMovement(deltaTime) {
		const direction = new THREE.Vector3();
		this.camera.getWorldDirection(direction);
		direction.normalize();
		
		const moveVector = new THREE.Vector3();
		
		if (this.keys.forward) {
			moveVector.add(direction);
		}
		if (this.keys.backward) {
			moveVector.sub(direction);
		}
		if (this.keys.left) {
			moveVector.add(new THREE.Vector3(direction.z, 0, -direction.x));
		}
		if (this.keys.right) {
			moveVector.add(new THREE.Vector3(-direction.z, 0, direction.x));
		}
		
		if (moveVector.length() > 0) {
			moveVector.normalize();
			moveVector.multiplyScalar(this.flySpeed);
			this.velocity.x = moveVector.x;
			this.velocity.z = moveVector.z;
		} else {
			this.velocity.x *= 0.8;
			this.velocity.z *= 0.8;
		}
		
		if (this.keys.flyUp) {
			this.velocity.y = this.flySpeed;
		} else if (this.keys.flyDown) {
			this.velocity.y = -this.flySpeed;
		} else {
			this.velocity.y = 0;
		}
	}

	updatePosition(deltaTime) {
		const movement = this.velocity.clone().multiplyScalar(deltaTime);
		
		const newPosition = this.camera.position.clone().add(movement);
		
		const horizontalMovement = new THREE.Vector3(movement.x, 0, movement.z);
		if (horizontalMovement.length() > 0) {
			const horizontalPosition = new THREE.Vector3(
				this.camera.position.x + movement.x,
				this.camera.position.y,
				this.camera.position.z
			);
			if (!this.checkCollision(horizontalPosition)) {
				this.camera.position.x = horizontalPosition.x;
			}
			
			const horizontalPositionZ = new THREE.Vector3(
				this.camera.position.x,
				this.camera.position.y,
				this.camera.position.z + movement.z
			);
			if (!this.checkCollision(horizontalPositionZ)) {
				this.camera.position.z = horizontalPositionZ.z;
			}
		}
		
		// Check vertical collision
		if (movement.y !== 0) {
			const verticalPosition = new THREE.Vector3(
				this.camera.position.x,
				this.camera.position.y + movement.y,
				this.camera.position.z
			);
			if (!this.checkCollision(verticalPosition)) {
				this.camera.position.y = verticalPosition.y;
			} else if (movement.y < 0) {
				// Hit ceiling, stop upward movement
				this.velocity.y = 0;
			}
		}
	}

	checkGroundCollision() {
		if (this.flying) {
			if (this.keys.flyDown && this.velocity.y < 0) {
				const groundY = this.getGroundHeight();
				const playerBottom = this.camera.position.y - this.eyeHeight;
				const distanceToGround = playerBottom - groundY;
				
				if (distanceToGround <= this.autoLandDistance) {
					this.land();
					this.camera.position.y = groundY + this.eyeHeight;
					this.velocity.y = 0;
					this.isGrounded = true;
					return;
				}
			}
			this.isGrounded = false;
			return;
		}
		
		const groundY = this.getGroundHeight();
		const playerBottom = this.camera.position.y - this.eyeHeight;
		const distanceToGround = playerBottom - groundY;
		
		if (distanceToGround <= this.groundCheckDistance && this.velocity.y <= 0) {
			if (!this.isGrounded) {
				this.camera.position.y = groundY + this.eyeHeight;
				this.velocity.y = 0;
			}
			this.isGrounded = true;
		} else {
			this.isGrounded = false;
		}
	}

	getGroundHeight() {
		const start = new THREE.Vector3(
			this.camera.position.x,
			this.camera.position.y,
			this.camera.position.z
		);
		const end = new THREE.Vector3(
			this.camera.position.x,
			this.camera.position.y - 100,
			this.camera.position.z
		);
		
		const intersection = this.world.intersectRay(start, end);
		if (intersection) {
			return intersection.position[1];
		}
		
        const checkPoints = [
			[0, 0],                                            // center
			[0.5, 0], [0, 0.5], [-0.5, 0], [0, -0.5],          // cardinal directions
			[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5] // diagonals
		];
		
		let maxGroundY = -Infinity;
		for (const [dx, dz] of checkPoints) {
			const checkStart = new THREE.Vector3(
				this.camera.position.x + dx,
				this.camera.position.y,
				this.camera.position.z + dz
			);
			const checkEnd = new THREE.Vector3(
				this.camera.position.x + dx,
				this.camera.position.y - 100,
				this.camera.position.z + dz
			);
			
			const checkIntersection = this.world.intersectRay(checkStart, checkEnd);
			if (checkIntersection) {
				maxGroundY = Math.max(maxGroundY, checkIntersection.position[1]);
			}
		}
		
		return maxGroundY !== -Infinity ? maxGroundY : 0;
	}

	checkCollision(position) {
		const checkPoints = [
			// Bottom corners
			new THREE.Vector3(position.x - this.collisionRadius, position.y - this.eyeHeight, position.z - this.collisionRadius),
			new THREE.Vector3(position.x + this.collisionRadius, position.y - this.eyeHeight, position.z - this.collisionRadius),
			new THREE.Vector3(position.x - this.collisionRadius, position.y - this.eyeHeight, position.z + this.collisionRadius),
			new THREE.Vector3(position.x + this.collisionRadius, position.y - this.eyeHeight, position.z + this.collisionRadius),
			// Top corners
			new THREE.Vector3(position.x - this.collisionRadius, position.y - this.eyeHeight + this.collisionHeight, position.z - this.collisionRadius),
			new THREE.Vector3(position.x + this.collisionRadius, position.y - this.eyeHeight + this.collisionHeight, position.z - this.collisionRadius),
			new THREE.Vector3(position.x - this.collisionRadius, position.y - this.eyeHeight + this.collisionHeight, position.z + this.collisionRadius),
			new THREE.Vector3(position.x + this.collisionRadius, position.y - this.eyeHeight + this.collisionHeight, position.z + this.collisionRadius),
			// Center points
			new THREE.Vector3(position.x, position.y - this.eyeHeight, position.z),
			new THREE.Vector3(position.x, position.y - this.eyeHeight + this.collisionHeight, position.z)
		];

		for (const point of checkPoints) {
			const voxel = this.world.getVoxel(
				Math.floor(point.x),
				Math.floor(point.y),
				Math.floor(point.z)
			);
			if (voxel) {
				return true;
			}
		}
		
		return false;
	}

	// Method to get current movement state for debugging
	getMovementState() {
		return {
			flying: this.flying,
			grounded: this.isGrounded,
			velocity: this.velocity.clone(),
			position: this.camera.position.clone()
		};
	}

	updateUI() {
		let statusDiv = document.getElementById('player-status');
		if (!statusDiv) {
			statusDiv = document.createElement('div');
			statusDiv.id = 'player-status';
			statusDiv.style.cssText = `
				position: fixed;
				top: 10px;
				left: 10px;
				background: rgba(0, 0, 0, 0.7);
				color: white;
				padding: 10px;
				border-radius: 5px;
				font-family: monospace;
				z-index: 1000;
			`;
			document.body.appendChild(statusDiv);
		}
		
		const state = this.getMovementState();
		const groundY = this.getGroundHeight();
		const distanceToGround = (this.camera.position.y - this.eyeHeight) - groundY;
		
		statusDiv.innerHTML = `
			<div>Mode: ${this.flying ? 'FLYING' : 'WALKING'}</div>
			<div>Grounded: ${this.isGrounded ? 'YES' : 'NO'}</div>
			<div>Position: ${state.position.x.toFixed(1)}, ${state.position.y.toFixed(1)}, ${state.position.z.toFixed(1)}</div>
			<div>Velocity: ${state.velocity.x.toFixed(1)}, ${state.velocity.y.toFixed(1)}, ${state.velocity.z.toFixed(1)}</div>
			<div>Distance to Ground: ${distanceToGround.toFixed(1)}</div>
			<div>Ground Y: ${groundY.toFixed(1)}</div>
			<div>Player Bottom: ${(this.camera.position.y - this.eyeHeight).toFixed(1)}</div>
			<div>Fly Up: ${this.keys.flyUp ? 'YES' : 'NO'}</div>
			<div>Fly Down: ${this.keys.flyDown ? 'YES' : 'NO'}</div>
			<div>Controls: WASD=Move, Space=Jump/Up, Ctrl=Down, Double-Space=Toggle Fly, Scroll Wheel=Cycle Blocks</div>
			<div>Auto-land: ${this.flying && this.keys.flyDown ? 'ACTIVE' : 'INACTIVE'}</div>
		`;
	}
}
