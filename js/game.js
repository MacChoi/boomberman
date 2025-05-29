import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Post-processing
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.composer.addPass(bloomPass);

        // Enhanced Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Point lights for atmosphere
        const pointLight1 = new THREE.PointLight(0xff0000, 1, 10);
        pointLight1.position.set(5, 2, 5);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x0000ff, 1, 10);
        pointLight2.position.set(-5, 2, -5);
        this.scene.add(pointLight2);

        // Camera setup
        this.camera.position.set(10, 15, 10);
        this.camera.lookAt(0, 0, 0);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Game state
        this.score = 0;
        this.gameOver = false;
        this.isRestarting = false;
        this.map = [];
        this.player = null;
        this.enemies = [];
        this.bombs = [];
        this.explosionParticles = [];
        this.mapSize = 21;
        this.enemyCount = 5;
        this.collisionRadius = 0.4; // 충돌 반경 설정
        this.playerBounceHeight = 0;
        this.playerBounceSpeed = 0.1;
        this.playerRotationSpeed = 0.1;
        this.enemyBounceHeight = 0;
        this.enemyBounceSpeed = 0.08;
        this.playerSpeed = 0.22; // 플레이어 이동 속도 약간 더 빠르게 (0.2 -> 0.22)
        this.enemySpeed = 0.04; // 적군 이동 속도 감소 (0.07 -> 0.04)

        // Store breakable blocks for easy access
        this.breakableBlocks = {};

        // Player invincibility state
        this.playerInvincible = false;
        this.invincibilityEndTime = 0;

        // Initialize game
        this.initMap();
        this.initPlayer();
        this.initEnemies();
        this.setupEventListeners();
        this.setupGameOverUI();
        this.animate();
    }

    initMap() {
        const textureLoader = new THREE.TextureLoader();
        
        // Load textures
        const wallTexture = textureLoader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
        const floorTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
        const blockTexture = textureLoader.load('https://threejs.org/examples/textures/crate.gif');
        const pathTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');

        // Create floor with texture
        const floorGeometry = new THREE.PlaneGeometry(this.mapSize, this.mapSize);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            map: floorTexture,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.5;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Create walls and blocks with improved visibility
        for (let x = 0; x < this.mapSize; x++) {
            this.map[x] = [];
            for (let z = 0; z < this.mapSize; z++) {
                // Modified logic for wider passages (3 tiles wide)
                // Place walls on borders and at coordinates divisible by 4
                if (x === 0 || x === this.mapSize - 1 || z === 0 || z === this.mapSize - 1 || 
                    (x % 4 === 0 && z % 4 === 0)) {
                    // Wall with glowing effect
                    const geometry = new THREE.BoxGeometry(1, 1, 1);
                    const material = new THREE.MeshStandardMaterial({ 
                        map: wallTexture,
                        roughness: 0.7,
                        metalness: 0.3,
                        emissive: 0x8B4513,
                        emissiveIntensity: 0.2
                    });
                    const wall = new THREE.Mesh(geometry, material);
                    wall.position.set(x - this.mapSize/2, 0, z - this.mapSize/2);
                    wall.castShadow = true;
                    wall.receiveShadow = true;
                    this.scene.add(wall);
                    this.map[x][z] = 1; // Wall
                }
                // Place breakable blocks with reduced frequency
                else if (this.map[x][z] !== 1 && Math.random() < 0.3) { // 30% chance to place a block
                    // Breakable block with pulsing effect
                    const geometry = new THREE.BoxGeometry(1, 1, 1);
                    const material = new THREE.MeshStandardMaterial({ 
                        map: blockTexture,
                        roughness: 0.6,
                        metalness: 0.4,
                        emissive: 0xCD853F,
                        emissiveIntensity: 0.1
                    });
                    const block = new THREE.Mesh(geometry, material);
                    block.position.set(x - this.mapSize/2, 0, z - this.mapSize/2);
                    block.castShadow = true;
                    block.receiveShadow = true;
                    this.scene.add(block);
                    this.map[x][z] = 2; // Breakable block
                    // Store reference to the block
                    this.breakableBlocks[`${x},${z}`] = block;
                }
                else {
                    // Path with subtle texture
                    const geometry = new THREE.PlaneGeometry(1, 1);
                    const material = new THREE.MeshStandardMaterial({
                        map: pathTexture,
                        roughness: 0.9,
                        metalness: 0.1
                    });
                    const path = new THREE.Mesh(geometry, material);
                    path.rotation.x = -Math.PI / 2;
                    path.position.set(x - this.mapSize/2, 0.01, z - this.mapSize/2);
                    this.scene.add(path);
                    this.map[x][z] = 0; // Path
                }
            }
        }
    }

    initPlayer() {
        // 플레이어 본체
        const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 32);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            roughness: 0.5,
            metalness: 0.5,
            emissive: 0x00ff00,
            emissiveIntensity: 0.2
        });
        this.player = new THREE.Mesh(bodyGeometry, bodyMaterial);
        // 플레이어 시작 위치를 랜덤한 빈 타일로 설정
        let startX, startZ;
        let foundValidSpawn = false;
        const maxAttempts = 100; // 유효한 스폰 위치를 찾기 위한 최대 시도 횟수
        let attempts = 0;

        do {
            startX = Math.floor(Math.random() * this.mapSize);
            startZ = Math.floor(Math.random() * this.mapSize);
            attempts++;

            // 맵 경계 내부인지 확인
            if (startX > 0 && startX < this.mapSize - 1 && startZ > 0 && startZ < this.mapSize - 1) {
                 // 해당 타일이 빈 타일(0)인지 확인
                 if (this.map[startX][startZ] === 0) {
                     // 주변 3x3 구역이 모두 빈 타일인지 추가 확인
                     let 주변_공간_충분 = true;
                     for (let dx = -1; dx <= 1; dx++) {
                         for (let dz = -1; dz <= 1; dz++) {
                             const checkX = startX + dx;
                             const checkZ = startZ + dz;
                             // 맵 경계 내부이고 빈 타일(0)인지 확인
                             if (checkX < 0 || checkX >= this.mapSize || checkZ < 0 || checkZ >= this.mapSize || this.map[checkX][checkZ] !== 0) {
                                 주변_공간_충분 = false;
                                 break;
                             }
                         }
                         if (!주변_공간_충분) break;
                     }

                     if (주변_공간_충분) {
                         // 해당 타일에 폭탄이 설치될 수 있는 위치인지도 고려 (폭탄 위치에는 플레이어 생성 안함)
                         let isBombSpawnLocation = false; // initPlayer 시점에는 폭탄이 없으므로 항상 false 이지만 로직 일관성을 위해 남겨둠
                          for (const bomb of this.bombs) {
                              const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                              const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                              if (startX === bombMapX && startZ === bombMapZ) {
                                  isBombSpawnLocation = true;
                                  break;
                              }
                          }
                          // 주변 공간이 충분하고 폭탄 위치가 아니면 유효한 스폰 위치
                         if (!isBombSpawnLocation) {
                              foundValidSpawn = true;
                         }
                     }
                 }
            }

        } while (!foundValidSpawn && attempts < maxAttempts);

        // 최대 시도 횟수를 넘으면 경고 메시지 출력 (맵 생성에 문제가 있을 수 있음)
        if (!foundValidSpawn) {
            console.warn("Failed to find a valid player spawn location after multiple attempts.");
            // 기본값으로 맵 중앙 근처의 빈 타일 사용 시도 (폴백)
            for(let x = Math.floor(this.mapSize/4); x < Math.ceil(this.mapSize*3/4); x++){
                 for(let z = Math.floor(this.mapSize/4); z < Math.ceil(this.mapSize*3/4); z++){
                      if(this.map[x][z] === 0) {
                           startX = x;
                           startZ = z;
                           foundValidSpawn = true;
                           break;
                      }
                 }
                 if(foundValidSpawn) break;
            }
             if (!foundValidSpawn) { // 최종 폴백: 맵 중앙 타일 (충돌 가능성 있음)
                  startX = Math.floor(this.mapSize / 2);
                  startZ = Math.floor(this.mapSize / 2);
                  console.warn("Using default map center spawn, potential collision.");
             }
        }

        this.player.position.set(
            startX - this.mapSize / 2 + 0.5, // 타일 중앙으로 위치 조정 (+0.5)
            0.4,
            startZ - this.mapSize / 2 + 0.5  // 타일 중앙으로 위치 조정 (+0.5)
        );
        this.player.castShadow = true;
        this.player.receiveShadow = true;

        // 플레이어 머리
        const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            roughness: 0.5,
            metalness: 0.5,
            emissive: 0x00ff00,
            emissiveIntensity: 0.2
        });
        const head = new THREE.Mesh(headGeometry, headMaterial);
        head.position.y = 0.6;
        this.player.add(head);

        // 플레이어 눈
        const eyeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const eyeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(0.15, 0.1, 0.2);
        head.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(-0.15, 0.1, 0.2);
        head.add(rightEye);

        // 플레이어 테두리 (구분용)
        const borderGeometry = new THREE.TorusGeometry(0.45, 0.05, 16, 32);
        const borderMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.5
        });
        const border = new THREE.Mesh(borderGeometry, borderMaterial);
        border.rotation.x = Math.PI / 2;
        this.player.add(border);

        // 플레이어 본체에 바운스 애니메이션을 위한 속성 추가
        this.player.userData = {
            bounceHeight: 0,
            bounceSpeed: 0.1,
            rotationSpeed: 0.1,
            isMoving: false
        };

        this.scene.add(this.player);

        // Apply invincibility after spawning
        this.applyInvincibility(3000); // 3초 무적
    }

    initEnemies() {
        // 적들이 생성될 수 있는 빈 타일 목록 생성
        const availableTiles = [];
        for (let x = 0; x < this.mapSize; x++) {
            for (let z = 0; z < this.mapSize; z++) {
                // 맵 값이 0 (경로)이고 플레이어 시작 위치와 너무 가깝지 않은 타일만 선택
                // 플레이어 시작 위치 (1, 1)과 거리가 3타일 이상 떨어진 곳에 적 생성 (플레이어 시작 위치가 (0,0) 타일이 아니므로 조정)
                const playerStartMapX = Math.floor(this.player.position.x + this.mapSize / 2);
                const playerStartMapZ = Math.floor(this.player.position.z + this.mapSize / 2);
                const distanceToPlayerStart = Math.abs(x - playerStartMapX) + Math.abs(z - playerStartMapZ);

                // 해당 타일에 폭탄이 설치될 수 있는 위치인지도 고려 (폭탄 위치에는 적 생성 안함)
                let isBombSpawnLocation = false;
                for (const bomb of this.bombs) {
                     const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                     const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                     if (x === bombMapX && z === bombMapZ) {
                         isBombSpawnLocation = true;
                         break;
                     }
                }

                // 맵이 0이고, 플레이어 시작 위치에서 멀고, 폭탄 생성 위치가 아닌 곳만 추가
                if (this.map[x][z] === 0 && distanceToPlayerStart >= 3 && !isBombSpawnLocation) {
                    availableTiles.push({ x, z });
                }
            }
        }

        // 생성할 적의 수와 사용 가능한 타일 수를 비교하여 적절한 수의 적 생성
        const numberOfEnemiesToCreate = Math.min(this.enemyCount, availableTiles.length);

        // 사용 가능한 타일 목록을 섞어서 랜덤하게 적 위치 선택 (셔플)
         for (let i = availableTiles.length - 1; i > 0; i--) {
             const j = Math.floor(Math.random() * (i + 1));
             [availableTiles[i], availableTiles[j]] = [availableTiles[j], availableTiles[i]];
         }

        // 선택된 타일을 추적하여 적들이 겹치지 않게 배치
        const usedTiles = new Set();
        const enemiesToPlace = [];

        for (let i = 0; i < availableTiles.length && enemiesToPlace.length < numberOfEnemiesToCreate; i++) {
            const tile = availableTiles[i];
            const tileKey = `${tile.x},${tile.z}`;

            // 이미 사용된 타일이 아니면 적 배치 목록에 추가하고 사용 처리
            if (!usedTiles.has(tileKey)) {
                enemiesToPlace.push(tile);
                usedTiles.add(tileKey);
            }
        }

        // 실제 적 객체 생성 및 배치
        enemiesToPlace.forEach(selectedTile => {
            const enemyGroup = new THREE.Group();
            
            // 적 본체
            const bodyGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.8, 32);
            const bodyMaterial = new THREE.MeshStandardMaterial({
                color: 0xff0000,
                roughness: 0.5,
                metalness: 0.5,
                emissive: 0xff0000,
                emissiveIntensity: 0.2
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.position.y = 0.4;
            body.castShadow = true;
            body.receiveShadow = true;
            enemyGroup.add(body);

            // 적 머리
            const headGeometry = new THREE.SphereGeometry(0.3, 32, 32);
            const headMaterial = new THREE.MeshStandardMaterial({
                color: 0xff0000,
                roughness: 0.5,
                metalness: 0.5,
                emissive: 0xff0000,
                emissiveIntensity: 0.2
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 0.6;
            enemyGroup.add(head);

            // 적 눈
            const eyeGeometry = new THREE.SphereGeometry(0.1, 16, 16);
            const eyeMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveIntensity: 0.5
            });
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(0.15, 0.1, 0.2);
            head.add(leftEye);
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(-0.15, 0.1, 0.2);
            head.add(rightEye);

            // 적 테두리 (구분용)
            const borderGeometry = new THREE.TorusGeometry(0.45, 0.05, 16, 32);
            const borderMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveIntensity: 0.5
            });
            const border = new THREE.Mesh(borderGeometry, borderMaterial);
            border.rotation.x = Math.PI / 2;
            enemyGroup.add(border);

            // 적에 바운스 애니메이션을 위한 속성 추가
            enemyGroup.userData = {
                bounceHeight: 0,
                bounceSpeed: 0.08,
                rotationSpeed: 0.1,
                isMoving: false
            };

            // 선택된 타일 위치에 적 배치
            enemyGroup.position.set(
                selectedTile.x - this.mapSize / 2 + 0.5, // 타일 중앙으로 위치 조정 (+0.5)
                0,
                selectedTile.z - this.mapSize / 2 + 0.5  // 타일 중앙으로 위치 조정 (+0.5)
            );

            enemyGroup.speed = 0.03;
            enemyGroup.direction = new THREE.Vector3(
                Math.random() - 0.5,
                0,
                Math.random() - 0.5
            ).normalize();

            this.scene.add(enemyGroup);
            this.enemies.push(enemyGroup);
        });
    }

    updateEnemies() {
         // 적과 플레이어의 충돌 체크 (거리 기반 - 게임 오버 조건)
         // 적 이동 로직 수행 전에 체크하여 충돌 시 즉시 게임 오버 처리
         for (let i = this.enemies.length - 1; i >= 0; i--) {
              const enemy = this.enemies[i];
              const distanceToPlayer = enemy.position.distanceTo(this.player.position);

              if (distanceToPlayer < this.collisionRadius * 1.5) { // 충돌 반경을 1.5배로 조정하여 좀 더 여유 있게 충돌 감지
                  if (!this.playerInvincible) {
                     this.handleGameOver(); // This will now only log a message
                  }
                  // Removed return to prevent all enemies from stopping on collision
              }
         }

        // 충돌된 적 없이 게임 오버가 아닌 경우에만 적 이동 로직 수행

        // 적들을 플레이어와의 거리에 따라 정렬
        const enemiesSortedByDistance = this.enemies.map(enemy => {
            const distance = enemy.position.distanceTo(this.player.position);
            return { enemy, distance };
        }).sort((a, b) => a.distance - b.distance);

        const chasingEnemyCount = 1; // 플레이어를 쫓을 적의 최대 수 (변경: 2 -> 1)

        this.enemies.forEach(enemy => {
            const oldPosition = enemy.position.clone();
            const enemyMapX = Math.floor(enemy.position.x + this.mapSize / 2);
            const enemyMapZ = Math.floor(enemy.position.z + this.mapSize / 2);

            // 플레이어 위치
            const playerMapX = Math.floor(this.player.position.x + this.mapSize / 2);
            const playerMapZ = Math.floor(this.player.position.z + this.mapSize / 2);

            // 이 적이 플레이어를 쫓는 상위 n마리 안에 드는지 확인
            // Check if this enemy is among the top `chasingEnemyCount` closest enemies
            const isChasing = enemiesSortedByDistance.slice(0, chasingEnemyCount).some(item => item.enemy === enemy);

            let moveSuccess = false;
            let attemptedPosition = enemy.position.clone();
            let moveDirection = new THREE.Vector3(0, 0, 0); // 기본 이동 방향

            // Determine if enemy should chase or move randomly this frame
            // Introduce a small chance for chasing enemies to do a random move instead (reduced chance)
            const shouldChase = isChasing && Math.random() > 0.05; // 95% chance to chase if in chasing group (was 90%)

            if (shouldChase) { // Play
             // 적의 현재 맵 좌표와 목표 맵 좌표 (플레이어 위치)
            const startNode = { x: enemyMapX, z: enemyMapZ };
            const endNode = { x: playerMapX, z: playerMapZ };

            // 경로 탐색 (BFS)
            // 적의 현재 타일에서 플레이어 타일까지의 경로를 찾되, 벽, 블록, 폭탄은 피함
            const path = this.findPath(startNode, endNode);

            if (path && path.length > 1) {
                 // 경로의 다음 스텝 타일의 3D 좌표 계산 (타일 중앙)
                const nextTile = path[1];
                const targetX = nextTile.x - this.mapSize / 2 + 0.5; // 타일 중앙으로 이동 (+0.5)
                const targetZ = nextTile.z - this.mapSize / 2 + 0.5;

                // 현재 적 위치에서 목표 타일 중앙으로 향하는 방향 벡터
                 moveDirection.set(targetX - enemy.position.x, 0, targetZ - enemy.position.z).normalize();

                // 이동 시도할 위치 계산
                    attemptedPosition.add(moveDirection.clone().multiplyScalar(this.enemySpeed * 0.8)); // 추적 시 속도 감소

                 // 이동하려는 위치에 맵 타일 장애물(벽/블록)이 없는지 체크
                 const attemptedMapX = Math.floor(attemptedPosition.x + this.mapSize / 2);
                 const attemptedMapZ = Math.floor(attemptedPosition.z + this.mapSize / 2);

                 let mapTileCollision = false;
                  if (attemptedMapX < 0 || attemptedMapX >= this.mapSize || attemptedMapZ < 0 || attemptedMapZ >= this.mapSize ||
                      this.map[attemptedMapX][attemptedMapZ] !== 0) {
                      mapTileCollision = true;
                  }

                // 이동하려는 위치에 객체(다른 적, 플레이어, 폭탄 모델) 충돌이 있는지 체크
                     if (!mapTileCollision && !this.checkObjectCollision(attemptedPosition, enemy)) { // 현재 업데이트 중인 적 자신을 인자로 전달
                     // 맵 타일 장애물도 없고 객체 충돌도 없으면 이동
                     enemy.position.copy(attemptedPosition);
                     moveSuccess = true;
                 } else {
                     // 충돌 발생 시 (맵 타일 장애물 또는 객체 충돌)
                         // 무작위 이동 시도 (경로 막혔을 때)
                         const randomAngle = Math.random() * Math.PI * 2;
                          const randomDirection = new THREE.Vector3(
                              Math.cos(randomAngle),
                              0,
                              Math.sin(randomAngle)
                          ).normalize();
                          attemptedPosition.copy(oldPosition).add(randomDirection.clone().multiplyScalar(this.enemySpeed * 0.5));
                           const attemptedMapX_rand = Math.floor(attemptedPosition.x + this.mapSize / 2);
                           const attemptedMapZ_rand = Math.floor(attemptedPosition.z + this.mapSize / 2);
                            let mapTileCollision_rand = false;
                            if (attemptedMapX_rand < 0 || attemptedMapX_rand >= this.mapSize || attemptedMapZ_rand < 0 || attemptedMapZ_rand >= this.mapSize ||
                                this.map[attemptedMapX_rand][attemptedMapZ_rand] !== 0) {
                                mapTileCollision_rand = true;
                            }
                           let isTargetTileBomb_rand = false;
                            for(const bomb of this.bombs) {
                                const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                                const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                                if (attemptedMapX_rand === bombMapX && attemptedMapZ_rand === bombMapZ) {
                                    isTargetTileBomb_rand = true;
                                    break;
                                }
                            }
                           if (!mapTileCollision_rand && !isTargetTileBomb_rand && !this.checkObjectCollision(attemptedPosition, enemy)) {
                                enemy.position.copy(attemptedPosition);
                                moveDirection.copy(randomDirection);
                                moveSuccess = true;
                           } else {
                     enemy.position.copy(oldPosition);
                                moveDirection.set(0, 0, 0);
                           }
                 }

            } else { // 경로를 찾지 못했거나 이미 플레이어 타일 근처인 경우
                     // 무작위 이동 시도 (경로 없을 때)
                     const randomAngle = Math.random() * Math.PI * 2;
                      const randomDirection = new THREE.Vector3(
                          Math.cos(randomAngle),
                          0,
                          Math.sin(randomAngle)
                      ).normalize();
                      attemptedPosition.copy(oldPosition).add(randomDirection.clone().multiplyScalar(this.enemySpeed * 0.5));
                       const attemptedMapX_rand = Math.floor(attemptedPosition.x + this.mapSize / 2);
                       const attemptedMapZ_rand = Math.floor(attemptedPosition.z + this.mapSize / 2);
                        let mapTileCollision_rand = false;
                        if (attemptedMapX_rand < 0 || attemptedMapX_rand >= this.mapSize || attemptedMapZ_rand < 0 || attemptedMapZ_rand >= this.mapSize ||
                            this.map[attemptedMapX_rand][attemptedMapZ_rand] !== 0) {
                            mapTileCollision_rand = true;
                        }
                       let isTargetTileBomb_rand = false;
                        for(const bomb of this.bombs) {
                            const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                            const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                            if (attemptedMapX_rand === bombMapX && attemptedMapZ_rand === bombMapZ) {
                                isTargetTileBomb_rand = true;
                                break;
                            }
                        }
                       if (!mapTileCollision_rand && !isTargetTileBomb_rand && !this.checkObjectCollision(attemptedPosition, enemy)) {
                            enemy.position.copy(attemptedPosition);
                            moveDirection.copy(randomDirection);
                            moveSuccess = true;
                       } else {
                      enemy.position.copy(oldPosition);
                           moveDirection.set(0, 0, 0);
                       }
                }
            } else { // 플레이어를 쫓지 않는 적은 무작위 이동
                 // 무작위 이동 시도 (경로 없을 때와 동일 로직 재사용)
                 const randomAngle = Math.random() * Math.PI * 2;
                  const randomDirection = new THREE.Vector3(
                      Math.cos(randomAngle),
                      0,
                      Math.sin(randomAngle)
                  ).normalize();
                  attemptedPosition.copy(oldPosition).add(randomDirection.clone().multiplyScalar(this.enemySpeed * 0.5));
                   const attemptedMapX_rand = Math.floor(attemptedPosition.x + this.mapSize / 2);
                   const attemptedMapZ_rand = Math.floor(attemptedPosition.z + this.mapSize / 2);
                    let mapTileCollision_rand = false;
                    if (attemptedMapX_rand < 0 || attemptedMapX_rand >= this.mapSize || attemptedMapZ_rand < 0 || attemptedMapZ_rand >= this.mapSize ||
                        this.map[attemptedMapX_rand][attemptedMapZ_rand] !== 0) {
                        mapTileCollision_rand = true;
                    }
                   let isTargetTileBomb_rand = false;
                    for(const bomb of this.bombs) {
                        const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                        const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                        if (attemptedMapX_rand === bombMapX && attemptedMapZ_rand === bombMapZ) {
                            isTargetTileBomb_rand = true;
                            break;
                        }
                    }
                   if (!mapTileCollision_rand && !isTargetTileBomb_rand && !this.checkObjectCollision(attemptedPosition, enemy)) {
                        enemy.position.copy(attemptedPosition);
                        moveDirection.copy(randomDirection);
                        moveSuccess = true;
                   } else {
                       enemy.position.copy(oldPosition);
                       moveDirection.set(0, 0, 0);
                 }
            }

            // 적 회전 (이동 방향에 따라)
            if (moveDirection.lengthSq() > 0.001) { // 이동 벡터가 거의 0이 아니면 회전 적용 (오차 고려)
                 enemy.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
                 enemy.direction.copy(moveDirection); // 실제 이동 방향 업데이트
            } else { // 이동하지 않으면 현재 방향 유지 또는 기본 방향 설정
                 // enemy.direction은 마지막 이동 방향 유지. 회전만 멈춤.
            }

            // 적 바운스 애니메이션 업데이트
            if (enemy.direction.lengthSq() > 0.001) { // 이동 중일 때만 바운스 (오차 고려)
                enemy.userData.isMoving = true;
                enemy.userData.bounceHeight += enemy.userData.bounceSpeed;
                const bounceOffset = Math.sin(enemy.userData.bounceHeight) * 0.1;
                 // Group 내의 body 메시의 material에 접근
                const body = enemy.children[0]; // body는 첫 번째 자식
                if (body && body.material && body.material.emissive) { // emissive 속성 체크 추가
                     body.material.emissiveIntensity = 0.3 + Math.abs(bounceOffset) * 0.2;
                 }
                enemy.position.y = 0.4 + bounceOffset; // 기본 y 위치에 더하기
            } else {
                enemy.userData.isMoving = false;
                 // Group 내의 body 메시의 material에 접근
                const body = enemy.children[0]; // body는 첫 번째 자식
                if (body && body.material && body.material.emissive) { // emissive 속성 체크 추가
                     body.material.emissiveIntensity = 0.2;
                 }
                enemy.position.y = 0.4; // 정지 시 y 위치 초기화
            }

             // 적과 플레이어의 타일 충돌 시 게임 오버 체크 (적 이동 후 위치 기준)
             // 거리 기반 충돌 체크로 대체되었으므로 이 부분은 불필요.
             // const currentEnemyMapX = Math.floor(enemy.position.x + this.mapSize / 2);
             // const currentEnemyMapZ = Math.floor(enemy.position.z + this.mapSize / 2);

             // if (currentEnemyMapX === playerMapX && currentEnemyMapZ === playerMapZ) {
             //     this.handleGameOver(); // 적이 플레이어 타일로 이동 시 게임 오버
             // }
        });
    }

    createExplosionParticles(position) {
        const particleCount = 200; // 파티클 수 증가 (100 -> 200)
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const velocities = [];
        const colors = new Float32Array(particleCount * 3);

        // 폭발 방향 설정 (X축 좌우만 -> 상하좌우 4방향)
        const directions = [
            new THREE.Vector3(1, 0, 0),   // Right (+X)
            new THREE.Vector3(-1, 0, 0),  // Left (-X)
            new THREE.Vector3(0, 0, 1),   // Down (+Z)
            new THREE.Vector3(0, 0, -1)   // Up (-Z)
        ];

        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = position.x;
            positions[i * 3 + 1] = position.y + Math.random() * 0.5; // Y축 위치에 약간의 랜덤성 추가
            positions[i * 3 + 2] = position.z;

            // 랜덤한 방향 선택
            const direction = directions[Math.floor(Math.random() * directions.length)];
            const speed = 0.4 + Math.random() * 0.3; // 속도 범위 증가

            velocities.push(
                direction.x * speed,
                (Math.random() - 0.5) * 0.2, // Y축 속도에 약간의 랜덤성 추가
                direction.z * speed
            );

            // 색상 설정 (빨간색에서 노란색으로 변화)
            colors[i * 3] = 1;
            colors[i * 3 + 1] = Math.random() * 0.5;
            colors[i * 3 + 2] = 0;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.4, // 파티클 크기 증가 (0.3 -> 0.4)
            transparent: true,
            opacity: 1,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });

        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        this.explosionParticles.push({ 
            particles, 
            velocities, 
            life: 1.0,
            rotationSpeed: Math.random() * 0.1
        });
    }

    updateExplosionParticles() {
        for (let i = this.explosionParticles.length - 1; i >= 0; i--) {
            const { particles, velocities, life, rotationSpeed } = this.explosionParticles[i];
            const positions = particles.geometry.attributes.position.array;
            const colors = particles.geometry.attributes.color.array;

            for (let j = 0; j < positions.length; j += 3) {
                positions[j] += velocities[j];
                positions[j + 1] += velocities[j + 1];
                positions[j + 2] += velocities[j + 2];

                // 색상 변화 (빨간색에서 노란색으로)
                colors[j + 1] += 0.02; // 색상 변화 속도 증가
                colors[j] -= 0.02;

                // 중력 효과 추가
                velocities[j + 1] -= 0.01; // Y축 속도 감소 (중력 효과)
            }

            particles.geometry.attributes.position.needsUpdate = true;
            particles.geometry.attributes.color.needsUpdate = true;
            particles.material.opacity = life;

            this.explosionParticles[i].life -= 0.01;

            if (life <= 0) {
                this.scene.remove(particles);
                this.explosionParticles.splice(i, 1);
            }
        }
    }

    explodeBomb(bomb) {
        const bombPos = bomb.position.clone();
        const mapX = Math.round(bombPos.x + this.mapSize / 2); // 폭탄이 설치된 타일의 정수 맵 좌표
        const mapZ = Math.round(bombPos.z + this.mapSize / 2);
        const explosionRange = 3; // 폭발 범위 3칸

        // Remove bomb mesh from scene and array
        this.scene.remove(bomb);
        this.bombs = this.bombs.filter(b => b !== bomb);

        // Create explosion particles at bomb position
        this.createExplosionParticles(bombPos);

        // Create explosion light
        const explosionLight = new THREE.PointLight(0xff0000, 2, 5);
        explosionLight.position.copy(bombPos);
        this.scene.add(explosionLight);

        // Fade out explosion light
        setTimeout(() => {
            this.scene.remove(explosionLight);
        }, 500);

        // --- Create Cross-Shaped Explosion Visual ---
        const crossThickness = 0.8; // Thickness of the cross arms
        // Explosion visual length should match explosion range (e.g., 3 tiles out = 3 + 1 + 3 = 7 tiles total length)
        const explosionVisualLength = explosionRange * 2 + 1;

        const explosionMaterial = new THREE.MeshStandardMaterial({
            color: 0xffa500, // Orange color
            emissive: 0xffa500, // Glowing orange
            emissiveIntensity: 2.0, // Make it brighter
            transparent: true,
            opacity: 1.0
        });

        // X-axis arm
        const explosionXGeometry = new THREE.BoxGeometry(explosionVisualLength, crossThickness, crossThickness);
        const explosionXMesh = new THREE.Mesh(explosionXGeometry, explosionMaterial);
        explosionXMesh.position.copy(bombPos);
        explosionXMesh.position.y = 0.4; // Position slightly above the ground

        // Z-axis arm
        const explosionZGeometry = new THREE.BoxGeometry(crossThickness, crossThickness, explosionVisualLength);
        const explosionZMesh = new THREE.Mesh(explosionZGeometry, explosionMaterial);
        explosionZMesh.position.copy(bombPos);
        explosionZMesh.position.y = 0.4; // Position slightly above the ground

        // Add explosion meshes to the scene
        this.scene.add(explosionXMesh);
        this.scene.add(explosionZMesh);

       // Optional: Add a brief screen flash effect
       const flashDiv = document.createElement('div');
       flashDiv.style.cssText = `
           position: fixed;
           top: 0;
           left: 0;
           width: 100%;
           height: 100%;
           background-color: white;
           opacity: 0.8;
           z-index: 9999;
           pointer-events: none;
       `;
       document.body.appendChild(flashDiv);

       // Animate flash opacity
       setTimeout(() => {
            flashDiv.style.opacity = '0';
       }, 50); // Quick flash

       // Remove flash element after it fades
       setTimeout(() => {
            document.body.removeChild(flashDiv);
       }, 300); // Remove after fade out

        // Remove explosion meshes after a duration (e.g., matching the light fade or slightly longer)
        const explosionDuration = 600; // Duration in milliseconds
        setTimeout(() => {
            this.scene.remove(explosionXMesh);
            this.scene.remove(explosionZMesh);
        }, explosionDuration);

        // ------------------------------------------

       // --- Play Explosion Sound ---
       // You need to have an audio file for the mechanical explosion sound.
       // Replace 'mechanical_explosion.mp3' with the actual path to your sound file.
       const explosionSound = new Audio('audio/mechanical_explosion.mp3');
       explosionSound.play().catch(error => {
           console.error('Error playing explosion sound:', error);
           // Handle cases where autoplay is blocked or file is not found
       });
       // --------------------------

        // Explosion Logic (Spread in 4 directions, checking hits on each tile)
        const directions = [
            { dx: 1, dz: 0 }, // Right (+X)
            { dx: -1, dz: 0 }, // Left (-X)
            { dx: 0, dz: 1 }, // Down (+Z)
            { dx: 0, dz: -1 }  // Up (-Z)
        ];

        // Keep track of meshes to hide and show later for the screen clearing effect
        const meshesToHide = [];

        // Center of explosion (bomb position tile)
        this.checkExplosionHit(mapX, mapZ, meshesToHide); // Pass meshesToHide to potentially include center mesh

        directions.forEach(dir => {
            for (let i = 1; i <= explosionRange; i++) {
                const currentX = mapX + dir.dx * i;
                const currentZ = mapZ + dir.dz * i;

                // Check map boundaries
                if (currentX < 0 || currentX >= this.mapSize || currentZ < 0 || currentZ >= this.mapSize) {
                    break; // Stop if out of bounds
                }

                const mapValue = this.map[currentX][currentZ];

                if (mapValue === 1) {
                    // Solid wall stops explosion in this direction
                    // Walls are not destroyed but can be temporarily hidden by the screen clear effect
                     this.checkExplosionHit(currentX, currentZ, meshesToHide); // Check for hits (like enemies) at wall tile
                    break; // Stop in this direction
                } else if (mapValue === 2) {
                    // Breakable block is destroyed and stops explosion in this direction
                    this.checkExplosionHit(currentX, currentZ, meshesToHide); // Check for hits (like enemies) at block tile *before* destroying
                    this.destroyBlock(currentX, currentZ); // destroyBlock removes the block mesh and updates map
                    break; // Stop in this direction
                } else if (mapValue === 0) {
                    // Path - check for hits and continue explosion in this direction
                    this.checkExplosionHit(currentX, currentZ, meshesToHide); // Check for hits (like enemies or player) at path tile
                }
                // Explosion continues through paths (mapValue === 0)
            }
        });
        // ------------------------------------------------

        // Show hidden meshes after a delay (e.g., slightly longer than light fade)
        setTimeout(() => {
            meshesToHide.forEach(mesh => {
                 if (mesh && mesh.parent) { // Check if mesh still exists in the scene graph
                      mesh.visible = true;
                 }
            });
        }, 700); // 700ms delay
    }

    // Helper function to find a mesh at a given map tile coordinate and handle screen clear effect
    getMeshAtTile(mapX, mapZ, meshesToHide) {
        // Convert map coordinates to world coordinates (center of the tile)
        const worldX = mapX - this.mapSize / 2 + 0.5;
        const worldZ = mapZ - this.mapSize / 2 + 0.5;

        // Iterate through objects in the scene to find a mesh at this position
        const tolerance = 0.2; // Increased tolerance slightly
        for (const obj of this.scene.children) {
            // Check if the object is a Mesh and is at the target tile's position
            if (obj.isMesh &&
                Math.abs(obj.position.x - worldX) < tolerance &&
                Math.abs(obj.position.z - worldZ) < tolerance) {
                // Exclude player, enemies, bombs, and explosion particles themselves
                // Breakable blocks are handled separately via this.breakableBlocks
                if (obj !== this.player &&
                    !this.bombs.includes(obj) &&
                    !this.explosionParticles.some(p => p.particles === obj)) {

                     // Check if it's a wall mesh
                     // This is a bit hacky, assumes wall meshes are distinct from path meshes
                     // A better way is to store references to all map meshes
                     const mapValue = this.map[mapX][mapZ];
                     if (mapValue === 1 || mapValue === 0) { // It's a wall or path tile mesh
                          if (meshesToHide && !meshesToHide.includes(obj)) { // Avoid adding duplicates
                               meshesToHide.push(obj);
                               obj.visible = false; // Temporarily hide for screen clear effect
                          }
                     }
                    return obj; // Return the found mesh regardless of type for checkExplosionHit to process
                }
            }
        }

        // Also check breakable blocks specifically as they are stored separately
        const blockKey = `${mapX},${mapZ}`;
        if (this.breakableBlocks[blockKey]) {
             const blockMesh = this.breakableBlocks[blockKey];
             // Note: Breakable blocks are usually removed by destroyBlock, but if still present,
             // they would be hit. destroyBlock handles their visual removal.
             // Add to meshesToHide if it hasn't been removed yet and is a block tile
             if (this.map[mapX][mapZ] === 2 && meshesToHide && !meshesToHide.includes(blockMesh)){
                  // blockMesh.visible = false; // destroyBlock handles removal
                  // meshesToHide.push(blockMesh); // No need to hide if destroyBlock removes it
             }
            return this.breakableBlocks[blockKey];
        }

        // Also check enemy meshes (within enemy groups)
        for(const enemyGroup of this.enemies) {
             const enemyPos2D = new THREE.Vector2(enemyGroup.position.x, enemyGroup.position.z);
             const tileWorldX = mapX - this.mapSize / 2 + 0.5; // Center of the target tile in world coords
             const tileWorldZ = mapZ - this.mapSize / 2 + 0.5;
             const tilePos2D = new THREE.Vector2(tileWorldX, tileWorldZ);

             // Check if the enemy group's position is close to the center of the target tile
             // Using a slightly larger tolerance here as enemy position might not be exactly at tile center
             if (enemyPos2D.distanceTo(tilePos2D) < 0.7) { // Tolerance based on tile size and enemy size
                  // Found an enemy group at this tile. checkExplosionHit will handle removal.
                  // No need to hide enemy meshes here as checkExplosionHit removes them.
                  return enemyGroup; // Return the group if it's at this tile
             }
        }


        return null; // No relevant mesh or enemy group found at this tile
    }

    destroyBlock(x, z) {
        const blockKey = `${x},${z}`;
        const blockMesh = this.breakableBlocks[blockKey];
        if (blockMesh) {
            // 블록 위치 계산 (파티클 생성을 위해)
            const blockWorldPosition = new THREE.Vector3(
                x - this.mapSize / 2 + 0.5, // 타일 중앙으로 위치 조정 (+0.5)
                0.4, // 블록 높이 고려
                z - this.mapSize / 2 + 0.5  // 타일 중앙으로 위치 조정 (+0.5)
            );

            this.scene.remove(blockMesh);
            delete this.breakableBlocks[blockKey];
            this.map[x][z] = 0; // Update map grid to indicate path

            // 블록 파괴 시 파티클 생성
            this.createExplosionParticles(blockWorldPosition);

            // Add score for destroying block
            this.score += 50;
            document.getElementById('score').textContent = `Score: ${this.score}`;

            // 파괴된 블록 위치에서 플레이어 또는 적 충돌 체크 (폭발 히트와 별개로)
            // checkExplosionHit에서 이미 처리되므로 여기서 중복 처리 안함.
            // this.checkExplosionHit(x, z);
        }
    }

    checkExplosionHit(mapX, mapZ, meshesToHide) { // Added meshesToHide parameter
        // Check player collision at map coordinate
        const playerMapX = Math.floor(this.player.position.x + this.mapSize / 2);
        const playerMapZ = Math.floor(this.player.position.z + this.mapSize / 2);

        // 플레이어가 폭발 타일의 맵 좌표 (X, Z)에 있는지 확인
        // Y축은 고려하지 않음
        if (playerMapX === mapX && playerMapZ === mapZ) {
            // Check if player is invincible before triggering game over
            if (!this.playerInvincible) {
                 this.handleGameOver(); // This will now only log a message
            }
            // return; // Player is hit, but check enemies on the same tile
        }

        // Check enemy collision at map coordinate
        // Iterate through enemies and check if their tile coordinates match the explosion tile
        // Remove hit enemies directly within this loop or collect and remove later
        const enemiesHit = [];
        // Iterate backwards when removing to avoid index issues
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const enemyMapX = Math.floor(enemy.position.x + this.mapSize / 2);
            const enemyMapZ = Math.floor(enemy.position.z + this.mapSize / 2);

             // 적이 폭발 타일의 맵 좌표 (X, Z)에 있는지 확인
             // Using a small tolerance for enemy position to tile center check
             const tileWorldX = mapX - this.mapSize / 2 + 0.5; // Center of the target tile in world coords
             const tileWorldZ = mapZ - this.mapSize / 2 + 0.5;
             const tilePos2D = new THREE.Vector2(tileWorldX, tileWorldZ);
             const enemyPos2D = new THREE.Vector2(enemy.position.x, enemy.position.z);

            if (enemyPos2D.distanceTo(tilePos2D) < 0.7) { // Check if enemy is close to the center of the explosion tile
                 // Found an enemy at this explosion tile
                enemiesHit.push(enemy);
                // Remove immediately to prevent checking the same enemy multiple times in this explosion
            this.scene.remove(enemy);
                 this.enemies.splice(i, 1); // Remove from the game's enemy array
                 
                 // Add score for defeating enemy
                 this.score += 100;
            document.getElementById('score').textContent = `Score: ${this.score}`;
            }
        }

        // enemiesHit.forEach(enemy => { // This loop is no longer needed if removed directly above
        //     this.scene.remove(enemy);
        //     const enemyIndex = this.enemies.findIndex(e => e === enemy);
        //     if (enemyIndex !== -1) {
        //          this.enemies.splice(enemyIndex, 1); // 배열에서 제거
        //     }
        // });

         // No score addition or map update for walls or paths here, destroyBlock handles blocks.

         // Handle temporary hiding of wall/path meshes for screen clear effect
         // getMeshAtTile now handles adding to meshesToHide and hiding
         // const meshToHide = this.getMeshAtTile(mapX, mapZ, meshesToHide); // Now called from explodeBomb
         // if (meshToHide && meshesToHide && !meshesToHide.includes(meshToHide)) {
         //      meshesToHide.push(meshToHide);
         //      meshToHide.visible = false; // Temporarily hide
         // }
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        window.addEventListener('resize', () => this.handleResize());
    }

    handleKeyPress(e) {
        // Removed game over check at the start
        // if (this.gameOver) {
        //     if (e.key === 'r' || e.key === 'R') {
        //         this.restartGame();
        //     }
        //     return;
        // }

        // 게임 일시정지 상태 등 추가적인 이동 불가 조건 체크 가능

        const speed = this.playerSpeed; // 플레이어 이동 속도 변수 사용
        const oldPosition = this.player.position.clone();
        const attemptedPosition = this.player.position.clone();
        let moved = false;

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                attemptedPosition.z -= speed;
                moved = true;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                attemptedPosition.z += speed;
                moved = true;
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                attemptedPosition.x -= speed;
                moved = true;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                attemptedPosition.x += speed;
                moved = true;
                break;
            case ' ':
                this.placeBomb();
                // 폭탄 설치는 이동이 아니므로 moved = false 유지
                moved = false;
                break;
        }

         if (moved) {
            // 이동하려는 목표 위치의 맵 좌표 계산 (플레이어 중심 기준)
             const targetMapX = Math.floor(attemptedPosition.x + this.mapSize / 2);
             const targetMapZ = Math.floor(attemptedPosition.z + this.mapSize / 2);

             // 현재 플레이어 위치의 맵 좌표 계산
             const currentMapX = Math.floor(oldPosition.x + this.mapSize / 2);
             const currentMapZ = Math.floor(oldPosition.z + this.mapSize / 2);

             let canMove = true;

            // 1. 맵 경계 또는 벽/블록 충돌 체크 (타일 기반 - 목표 타일만 확인)
            // 기존 타일 기반 체크 유지
              if (targetMapX < 0 || targetMapX >= this.mapSize || targetMapZ < 0 || targetMapZ >= this.mapSize ||
                 this.map[targetMapX][targetMapZ] !== 0) {
                  canMove = false;
              }

            // 2. 폭탄 타일 이동 로직: 플레이어가 폭탄을 설치한 타일에서 벗어나는 경우는 허용.
            // 새로운 폭탄 타일로 진입하는 경우는 막음.
             let isCurrentlyOnBombTile = false;
            let isTargetTileBomb = false;

              for (const bomb of this.bombs) {
                  const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                  const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                  // 현재 플레이어 위치의 맵 좌표가 폭탄이 설치된 타일의 맵 좌표와 일치하는지 확인
                  if (currentMapX === bombMapX && currentMapZ === bombMapZ) {
                      isCurrentlyOnBombTile = true;
                     //break; // No break here, as there could be multiple bombs (though unlikely on one tile)
                 }
                 // 목표 타일의 맵 좌표가 폭탄이 설치된 타일의 맵 좌표와 일치하는지 확인
                 if (targetMapX === bombMapX && targetMapZ === bombMapZ) {
                     isTargetTileBomb = true;
                     //break; // No break here
                 }
             }

              // 이동하려는 타일에 폭탄이 있고, 현재 플레이어가 그 폭탄 타일에 있지 않다면 이동 불가
             if (canMove && isTargetTileBomb && !isCurrentlyOnBombTile) {
                 canMove = false; // 폭탄 타일로 새로 진입하는 것은 막음
             }

            // 3. 객체 충돌 체크 (물리적 겹침 방지) - 지형 메쉬 충돌 체크 추가
            // 타일 이동이 가능한 경우에만 물리적 겹침 체크
            // Removed physical object collision check for player movement against enemies and bombs.
            // The player can now move through these objects since game over is disabled.
            // A separate check for entering a bomb tile is still in place.

            // --- 새로운 메쉬 기반 지형 충돌 체크 추가 ---
            if (canMove) { // 타일 기반 체크를 통과한 경우에만 메쉬 충돌 체크 수행
                 // 이동하려는 위치에서 벽 또는 블록 메쉬와 충돌하는지 확인
                 // 플레이어의 충돌 반경을 고려한 체크
                 const playerCollisionSphere = new THREE.Sphere(
                     attemptedPosition,
                     this.collisionRadius // 플레이어 충돌 반경 사용
                 );

                 // --- 수정된 메쉬 기반 지형 충돌 체크: 플레이어 주변 타일만 확인 ---
                 const checkRange = 2; // 플레이어 현재 타일 중심에서 체크할 타일 범위 (예: ±2 타일)
                 const playerMapX_current = Math.floor(oldPosition.x + this.mapSize / 2);
                 const playerMapZ_current = Math.floor(oldPosition.z + this.mapSize / 2);

                 // 플레이어 주변 타일 범위 설정
                 const startX = Math.max(0, playerMapX_current - checkRange);
                 const endX = Math.min(this.mapSize - 1, playerMapX_current + checkRange);
                 const startZ = Math.max(0, playerMapZ_current - checkRange);
                 const endZ = Math.min(this.mapSize - 1, playerMapZ_current + checkRange);

                 // 플레이어 주변의 벽(1) 또는 블록(2) 타일 메쉬와 충돌 체크
                 for (let x = startX; x <= endX; x++) {
                     for (let z = startZ; z <= endZ; z++) {
                         if (this.map[x][z] === 1 || this.map[x][z] === 2) { // 벽 또는 블록 타일
                             // 해당 타일의 중심 좌표 계산
                             const tileCenterX = x - this.mapSize / 2 + 0.5;
                             const tileCenterZ = z - this.mapSize / 2 + 0.5;

                             // 타일 메쉬의 근사적인 경계 구체 생성 (타일 크기 1x1x1)
                             // 약간 더 작은 반지름을 사용하여 덜 민감하게 조정할 수 있음 (예: 0.45)
                             const tileBoundingSphere = new THREE.Sphere(
                                 new THREE.Vector3(tileCenterX, 0, tileCenterZ),
                                 0.5 * Math.sqrt(2) // 1x1 박스 대각선 길이의 절반 사용 (정육면체보다 덜 보수적)
                             );

                             // 플레이어 충돌 구와 타일 경계 구가 겹치는지 확인
                             if (playerCollisionSphere.intersectsSphere(tileBoundingSphere)) {
                                 // 충돌 발생! 이동 불가
                                 canMove = false;
                                 break; // Z 루프 중단
                             }
                         }
                     }
                     if (!canMove) break; // X 루프 중단
                 }
            }
            // ------------------------------------------

            // 4. 플레이어와 적의 타일 충돌 시 게임 오버 체크 (이동 후 위치 기준) - Handled in updateEnemies and checkExplosionHit.
            // Keeping this comment for clarity.

            // 최종 이동 처리
             if (canMove) {
                this.player.position.copy(attemptedPosition);
                // 플레이어 회전 (이동 방향에 따라)
                const moveDirection = new THREE.Vector3().subVectors(attemptedPosition, oldPosition).normalize();
                 if (moveDirection.lengthSq() > 0.001) { // 이동 벡터가 거의 0이 아니면 회전 적용 (오차 고려)
                    this.player.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
                 }

             } else {
                 // 충돌 시 원래 위치 유지
                 this.player.position.copy(oldPosition);
             }

            // 플레이어 바운스 애니메이션
            // 위치가 바뀌었으면 이동 성공으로 간주하고 바운스 적용
            if (!this.player.position.equals(oldPosition)) {
                this.player.userData.isMoving = true;
                this.player.userData.bounceHeight += this.player.userData.bounceSpeed;
                this.player.position.y = 0.4 + Math.sin(this.player.userData.bounceHeight) * 0.1; // 기본 y 위치에 더하기
            } else {
                 // 이동하지 않았을 때 바운스 애니메이션 멈추고 y 위치 초기화
                this.player.userData.isMoving = false;
                this.player.position.y = 0.4;
            }

        } else { // 이동 관련 키가 아닐 때 (ex: 스페이스바)
             // 바운스 애니메이션 멈추고 y 위치 초기화
             this.player.userData.isMoving = false;
             this.player.position.y = 0.4;
        }
    }

    placeBomb() {
        const pos = this.player.position.clone();
        // 플레이어가 서 있는 칸의 정중앙 좌표 계산
        const mapX = Math.round(pos.x + this.mapSize / 2);
        const mapZ = Math.round(pos.z + this.mapSize / 2);
        const bombPosition = new THREE.Vector3(
            mapX - this.mapSize / 2,
            0.4, // 폭탄이 바닥에 파묻히지 않도록 y값 조정
            mapZ - this.mapSize / 2
        );

        // 이미 해당 위치에 폭탄이 있는지 확인 (중복 설치 방지)
        for (const bomb of this.bombs) {
            const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
            const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
            if (bombMapX === mapX && bombMapZ === mapZ) {
                console.log('Bomb already exists at this position.');
                return; // 이미 폭탄이 있으면 설치하지 않음
            }
        }

        const bombGeometry = new THREE.SphereGeometry(0.4);
        const bombMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const bomb = new THREE.Mesh(bombGeometry, bombMaterial);
        bomb.position.copy(bombPosition);
        // 폭탄 객체에 설치된 맵 좌표와 폭발 시간 저장
        bomb.userData.mapX = mapX;
        bomb.userData.mapZ = mapZ;
        bomb.userData.explosionTime = Date.now() + 3000; // 현재 시간 + 3초

        this.scene.add(bomb);
        this.bombs.push(bomb);

        // 폭탄 설치 후 플레이어가 해당 타일에서 벗어날 수 있도록,
        // checkCollision(현재 checkObjectCollision)에서는 폭탄 모델과의 물리적 겹침만 확인하고,
        // handleKeyPress에서 타일 기반 이동 가능 여부를 판단하도록 수정.

        // 폭탄 터지는 타이머는 animate 루프에서 관리
        // setTimeout(() => {
        //     this.explodeBomb(bomb);
        // }, 3000);
    }

    handleGameOver() {
        // Removed Game Over logic as requested
        console.log('Game Over condition triggered, but ignored.');
        // if (this.gameOver) return; // 이미 게임오버 상태면 중복 실행 방지

        // this.gameOver = true;

        // // 플레이어 사망 효과
        // if(this.player && this.player.material) {
        //     this.player.material.emissive.setHex(0xff0000);
        //     this.player.material.emissiveIntensity = 0.5;
        // }

        // // 카메라 효과
        // this.camera.position.y = 20;
        // if(this.player) this.camera.lookAt(this.player.position);

        // // 게임오버 UI 표시
        // const gameOverDiv = document.getElementById('gameOver');
        // if(gameOverDiv) {
        //     document.getElementById('finalScore').textContent = this.score;
        //     gameOverDiv.style.display = 'block';
        // }

        // // 게임 컨트롤 비활성화
        // this.controls.enabled = false;

        // // 사운드 효과 (선택사항)
        // // const gameOverSound = new Audio('gameover.mp3');
        // // gameOverSound.play();
    }

    restartGame() {
        if (this.isRestarting) return;
        this.isRestarting = true;

        // 게임 상태 초기화
        this.gameOver = false;
        this.score = 0;
        document.getElementById('score').textContent = 'Score: 0';
        document.getElementById('gameOver').style.display = 'none';

        // 기존 객체 제거
        this.scene.remove(this.player);
        this.enemies.forEach(enemy => this.scene.remove(enemy));
        this.bombs.forEach(bomb => this.scene.remove(bomb));
        this.explosionParticles.forEach(particle => this.scene.remove(particle.particles));

        // 배열 초기화
        this.enemies = [];
        this.bombs = [];
        this.explosionParticles = [];

        // 맵 재생성
        this.initMap();
        this.initPlayer();
        this.initEnemies();

        // 카메라 위치 초기화
        this.camera.position.set(10, 15, 10);
        this.camera.lookAt(0, 0, 0);
        this.controls.enabled = true;

        this.isRestarting = false;
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupGameOverUI() {
        // 게임오버 UI 생성
        const gameOverDiv = document.createElement('div');
        gameOverDiv.id = 'gameOver';
        gameOverDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            display: none;
            z-index: 1000;
        `;
        gameOverDiv.innerHTML = `
            <h2 style="font-size: 48px; margin-bottom: 20px;">GAME OVER</h2>
            <p style="font-size: 24px; margin-bottom: 20px;">Score: <span id="finalScore">0</span></p>
            <button id="restartButton" style="
                padding: 10px 20px;
                font-size: 20px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
            ">Restart Game</button>
        `;
        document.body.appendChild(gameOverDiv);

        // 재시작 버튼 이벤트 리스너
        document.getElementById('restartButton').addEventListener('click', () => this.restartGame());
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Removed game over check
        // if (!this.gameOver) {
            // Calculate deltaTime if needed based on time elapsed since last frame
            const now = Date.now();
            const deltaTime = (now - (this.lastAnimateTime || now)) / 1000; // Delta time in seconds
            this.lastAnimateTime = now;

            this.controls.update();
            this.updateEnemies();
            this.updateExplosionParticles();
            this.updateBombs(); // 폭탄 상태 업데이트 (타이머 및 진행 표시)
            this.updatePlayerInvincibility(); // 무적 상태 업데이트
        // } else {
            // // 게임오버 시 카메라 회전 효과
            // this.camera.position.x = Math.sin(Date.now() * 0.001) * 15;
            // this.camera.position.z = Math.cos(Date.now() * 0.001) * 15;
            // // lookAt 대상은 플레이어 위치 유지 (사망 위치)
            // if (this.player) {
            //      this.camera.lookAt(this.player.position);
            // }
        // }

        this.composer.render();
    }

    // 폭탄 상태 업데이트 및 진행 표시
    updateBombs() {
        const now = Date.now();
        for (let i = this.bombs.length - 1; i >= 0; i--) {
            const bomb = this.bombs[i];
            // 폭발 시간이 설정되지 않은 폭탄은 업데이트하지 않음 (방금 설치된 폭탄 등)
             if (!bomb.userData.explosionTime) continue;

            const timeLeft = bomb.userData.explosionTime - now;

            // 폭발 타이머 완료 체크
            if (timeLeft <= 0) {
                this.explodeBomb(bomb); // 폭발
            } else {
                // 폭발 진행 상황 시각화 (예: 크기 변화)
                const totalDuration = 3000; // 폭발 대기 시간 (3초)
                const progress = 1 - (timeLeft / totalDuration);
                const scale = 1 + Math.sin(progress * Math.PI) * 0.2; // 시간에 따라 커졌다 작아졌다 하는 효과 (0 ~ 1 -> 1 ~ 1.2 ~ 1)
                bomb.scale.set(scale, scale, scale);

                // 추가 시각화: 색상 변화 (선택사항)
                // 시간에 따라 어두운 색 -> 밝은 색으로 변화 등 가능
                 const material = bomb.material;
                 if (material.isMeshStandardMaterial) { // StandardMaterial인 경우 emissive 속성 사용
                      // 간단하게 시간에 따라 빨간색 emissive 강도 증가
                      // Math.sin(progress * Math.PI * 5) * 0.5 + 0.5; // 빠르게 깜빡이는 효과
                      const emissiveIntensity = progress * 0.8; // 0에서 0.8까지 선형 증가 (은은하게 밝아지는 효과)
                     material.emissive.setHex(0xff0000); // 붉은 색
                     material.emissiveIntensity = emissiveIntensity;
                 }
            }
        }
    }

    // 간단한 BFS 기반 경로 탐색 함수 (맵 배열 사용)
    // 벽(1), 블록(2), 폭탄이 설치된 타일을 장애물로 간주하고 피함
    findPath(start, end) {
        // 시작 노드와 끝 노드가 유효한 맵 범위 내에 있는지 체크
         if (start.x < 0 || start.x >= this.mapSize || start.z < 0 || start.z >= this.mapSize ||
             end.x < 0 || end.x >= this.mapSize || end.z < 0 || end.z >= this.mapSize) {
             return null; // 시작 또는 끝이 맵 범위 밖
         }

         // 시작 노드가 장애물(벽, 블록)인 경우 경로 없음 (적이나 플레이어가 갇힌 상황)
         if (this.map[start.x][start.z] !== 0) {
             return null; // 시작 위치가 벽 또는 블록
         }

        const queue = [{ node: start, path: [start] }];
        const visited = new Set();
        visited.add(`${start.x},${start.z}`);

        const directions = [
            { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, // Right, Left
            { dx: 0, dz: 1 }, { dx: 0, dz: -1 }  // Down, Up
        ];

        while (queue.length > 0) {
            const { node, path } = queue.shift();

            // 목표 지점에 도착했으면 경로 반환
            if (node.x === end.x && node.z === end.z) {
                return path; // 목표 타일에 도착
            }

            // 인접 노드 탐색
            for (const dir of directions) {
                const nextX = node.x + dir.dx;
                const nextZ = node.z + dir.dz;

                // 맵 경계 체크
                if (nextX >= 0 && nextX < this.mapSize && nextZ >= 0 && nextZ < this.mapSize) {

                    // 이동 가능한 타일인지 (벽, 블록, 폭탄이 아닌지)
                    // 맵 값이 0인 경로 타일이면서, 해당 타일에 폭탄이 설치되어 있지 않아야 함.
                    if (this.map[nextX][nextZ] === 0) { // 맵 값이 0인 경로 타일만 1차 통과

                         const nextNode = { x: nextX, z: nextZ };
                         const nextNodeKey = `${nextX},${nextZ}`;

                         // 해당 타일에 폭탄이 설치되어 있는지 확인
                        let isBombOnTile = false;
                        for(const bomb of this.bombs) {
                            const bombMapX = Math.round(bomb.position.x + this.mapSize / 2);
                            const bombMapZ = Math.round(bomb.position.z + this.mapSize / 2);
                            // 타일 좌표 일치 여부로 판단
                            if (nextX === bombMapX && nextZ === bombMapZ) {
                                 isBombOnTile = true;
                                 break;
                             }
                        }

                        // 다음 노드가 폭탄이 없는 타일이고 아직 방문하지 않았다면 큐에 추가
                        if (!visited.has(nextNodeKey) && !isBombOnTile) {
                            visited.add(nextNodeKey);
                            queue.push({ node: nextNode, path: [...path, nextNode] });
                        }
                    }
                }
            }
        }

        return null; // 경로를 찾지 못한 경우
    }

    applyInvincibility(duration) {
        this.playerInvincible = true;
        this.invincibilityEndTime = Date.now() + duration;
        console.log(`Player is now invincible for ${duration}ms.`);
        // Optional: Add visual indicator for invincibility (e.g., transparency)
        if (this.player && this.player.material) {
             // Example: Make player slightly transparent and change emissive color
             this.player.material.transparent = true;
             this.player.material.opacity = 0.6;
             this.player.material.emissive.setHex(0x00ffff); // Cyan glow
             this.player.material.emissiveIntensity = 0.5;
        }
    }

    updatePlayerInvincibility() {
        if (this.playerInvincible && Date.now() > this.invincibilityEndTime) {
            this.playerInvincible = false;
            console.log('Player invincibility ended.');
            // Remove visual indicator
             if (this.player && this.player.material) {
                 this.player.material.transparent = false;
                 this.player.material.opacity = 1.0;
                 this.player.material.emissive.setHex(0x00ff00); // Back to original color
                 this.player.material.emissiveIntensity = 0.2;
             }
        }
    }

    checkObjectCollision(position, excludeObject = null) {
         const checkPosition2D = new THREE.Vector2(position.x, position.z);

        // 다른 적과의 충돌 체크 (물리적 겹침 방지 목적)
        for (const enemy of this.enemies) {
            if (enemy !== excludeObject) {
                const enemyPos2D = new THREE.Vector2(enemy.position.x, enemy.position.z);
                if (checkPosition2D.distanceTo(enemyPos2D) < this.collisionRadius * 1.2) { // 적과의 물리적 겹침 방지 반경을 약간 줄여서 부드러운 이동 유도 (2 -> 1.2)
                    // 플레이어-적 충돌 시 게임 오버 처리는 handleKeyPress 또는 updateEnemies에서 수행
                    // checkObjectCollision은 물리적 겹침만 판단하며, 무적 상태는 여기서 고려하지 않음.
                    return true; // 적과 충돌
                }
            }
        }

        // 폭탄 모델과의 충돌 체크 (폭탄 모델 자체와 너무 가깝게 겹치는 것을 방지)
        for (const bomb of this.bombs) {
            if (bomb !== excludeObject) {
                const bombPos2D = new THREE.Vector2(bomb.position.x, bomb.position.z);
                // 캐릭터가 폭탄 모델 자체와 물리적으로 겹치는 것을 방지하기 위한 충돌
                // 이동하려는 위치가 폭탄 모델의 충돌 반경 내에 있는지 체크
                // 폭탄 설치 후 플레이어가 폭탄 타일에서 즉시 벗어나는 것은 허용되어야 하므로,
                // 이 충돌 체크는 물리적 겹침 방지에 초점을 맞춤.
                if (checkPosition2D.distanceTo(bombPos2D) < this.collisionRadius * 0.6) { // 폭탄과의 물리적 겹침 방지 반경을 약간 줄여서 지나가기 쉽게 조정 (0.8 -> 0.6)
                    // 이 충돌 체크는 이동하려는 위치에 폭탄 모델이 이미 있을 때 물리적 겹침을 막는 용도.
                    // 플레이어가 폭탄 타일에서 벗어나는 경우는 이 충돌 체크와 무관하게 허용해야 함.
                    // checkObjectCollision은 단순히 겹침 여부만 반환하고, 실제 이동 가능 여부는 handleKeyPress나 updateEnemies에서 판단.
                    return true; // 폭탄 모델과 충돌
                }
            }
        }

        // 플레이어 모델과의 충돌 체크 (물리적 겹침 방지 목적)
        if (this.player !== excludeObject) {
            const playerPos2D = new THREE.Vector2(this.player.position.x, this.player.position.z);
            if (checkPosition2D.distanceTo(playerPos2D) < this.collisionRadius * 0.6) { // 플레이어와의 물리적 겹침 방지 반경을 약간 줄여서 부드러운 이동 유도 (0.8 -> 0.6)
                return true; // 플레이어와 물리적으로 겹침
            }
        }

        return false; // 객체 충돌 없음
    }
}

// Start the game
new Game(); 