<script>
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { gridState } from '$lib/stores/gridState';

    let container;
    let scene, camera, renderer, controls;
    let gridObjects = [];         // 各セル上の配置モデル
    let cellMeshes = [];          // 各セルのプレートMesh
    let cellHeights = [];         // 各セルの高さ（決定的ノイズ）
    let stars;                    // 星パーティクル
    let isInitialized = false;

    const gridSize = 8;
    const cellSize = 1;

    // ===== 宇宙テーマ：高さノイズ =====
    function hash2d(x, z) {
        const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }
    function smoothstep(t) { return t * t * (3.0 - 2.0 * t); }
    function valueNoise2D(x, z) {
        const xi = Math.floor(x), zi = Math.floor(z);
        const xf = x - xi,        zf = z - zi;
        const a = hash2d(xi,     zi);
        const b = hash2d(xi + 1, zi);
        const c = hash2d(xi,     zi + 1);
        const d = hash2d(xi + 1, zi + 1);
        const u = smoothstep(xf);
        const v = smoothstep(zf);
        const ab = a * (1 - u) + b * u;
        const cd = c * (1 - u) + d * u;
        return ab * (1 - v) + cd * v; // 0..1
    }
    function getTileHeight(x, z) {
        const sx = (x - gridSize / 2 + 0.5) * 0.7;
        const sz = (z - gridSize / 2 + 0.5) * 0.7;
        const n1 = valueNoise2D(sx * 0.6, sz * 0.6);
        const n2 = valueNoise2D(sx * 1.2, sz * 1.2);
        const n = (n1 * 0.7 + n2 * 0.3);
        const amplitude = 0.18;
        const centerBias = -0.06;
        return (n - 0.5) * 2 * amplitude + centerBias;
    }

    // ===== 星空 =====
    function createStars(count = 2200, radius = 90) {
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = 2 * Math.PI * Math.random();
            const r = radius * (0.6 + Math.random() * 0.4);
            positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({
            size: 0.6,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        return new THREE.Points(geom, mat);
    }

    // ===== モデル =====
    const placementModelUrls = {
        model1: 'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo1.glb',
        model2: 'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo2.glb',
        model3: 'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/burn.glb'
    };
    function loadModel(url) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(url, (gltf) => resolve(gltf.scene), undefined, (e) => reject(e));
        });
    }
    const modelCache = { model1: null, model2: null, model3: null };
    async function preloadModels() {
        try {
            const [m1, m2, m3] = await Promise.all([
                loadModel(placementModelUrls.model1),
                loadModel(placementModelUrls.model2),
                loadModel(placementModelUrls.model3)
            ]);
            modelCache.model1 = m1;
            modelCache.model2 = m2;
            modelCache.model3 = m3;
            console.log('すべてのモデルをプリロードしました');
        } catch (e) { console.error('モデルのプリロード中にエラー:', e); }
    }
    async function createStateObject(state) {
        if (state === 0) return null;
        let modelType, rotationDegrees;
        if (state >= 1 && state <= 4) { modelType = 'model1'; rotationDegrees = (state - 1) * 90; }
        else if (state >= 5 && state <= 8) { modelType = 'model2'; rotationDegrees = (state - 5) * 90; }
        else if (state >= 9 && state <= 12) { modelType = 'model3'; rotationDegrees = (state - 9) * 90; }
        else return null;

        const baseModel = modelCache[modelType] ?? (modelCache[modelType] = await loadModel(placementModelUrls[modelType]));
        if (!baseModel) return null;
        const model = baseModel.clone();
        model.rotation.y = THREE.MathUtils.degToRad(rotationDegrees);
        return model;
    }
    async function updateGridObjects(states) {
        if (!isInitialized || !scene) return;
        for (let i = 0; i < states.length; i++) {
            const state = states[i];
            const x = i % gridSize;
            const z = Math.floor(i / gridSize);
            const idx = z * gridSize + x;
            if (gridObjects[idx]) {
                scene.remove(gridObjects[idx]);
                gridObjects[idx] = null;
            }
            const newObject = await createStateObject(state);
            if (newObject) {
                newObject.scale.set(0.5, 0.5, 0.5);
                const bbox = new THREE.Box3().setFromObject(newObject);
                const modelH = bbox.max.y - bbox.min.y;
                const tileY = cellHeights[idx] ?? 0;
                newObject.position.set(
                    x - gridSize / 2 + 0.5,
                    tileY + modelH * 0.5,
                    z - gridSize / 2 + 0.5
                );
                scene.add(newObject);
                gridObjects[idx] = newObject;
            }
        }
    }
    $: if (isInitialized) { updateGridObjects($gridState); }

    onMount(() => {
        // === シーン ===
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a1222);         // 少し明るい宇宙色
        scene.fog = new THREE.FogExp2(0x0a1222, 0.02);        // 霧を薄く

        // === カメラ ===
        camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(0, 9.5, 10.5);
        camera.lookAt(0, 0, 0);

        // === レンダラー ===
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.45; // 明るめ
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        // === 操作 ===
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.target.set(0, 0, 0);

        // === ライティング（明るく見やすく） ===
        const hemi = new THREE.HemisphereLight(0xbfdcff, 0x0b0f16, 0.9); // sky, ground
        scene.add(hemi);

        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(6, 12, 6);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0x9fc7ff, 1.1);
        fill.position.set(-8, 6, -2);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0x88aaff, 1.0);
        rim.position.set(-2, 8, 8);
        scene.add(rim);

        const spot = new THREE.SpotLight(0xffffff, 1.2, 0, Math.PI / 5, 0.35, 1.0);
        spot.position.set(0, 12, 0);
        spot.target.position.set(0, 0, 0);
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        scene.add(spot);
        scene.add(spot.target);

        // === ベース面 ===
        const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0x0b0f16,
            metalness: 0.55,   // 少しだけ上げる
            roughness: 0.35,   // 少しだけ下げる
            side: THREE.DoubleSide
        });
        const basePlane = new THREE.Mesh(planeGeometry, planeMaterial);
        basePlane.rotation.x = Math.PI / 2;
        basePlane.receiveShadow = true;
        basePlane.position.y = -0.15; // タイルの最低より下
        scene.add(basePlane);

        // === プレート（セル） ===
        const cellGeom = new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);
        cellMeshes = [];
        cellHeights = [];
        for (let x = 0; x < gridSize; x++) {
            for (let z = 0; z < gridSize; z++) {
                const idx = z * gridSize + x;
                const tileY = getTileHeight(x, z);
                cellHeights[idx] = tileY;

                const colorA = new THREE.Color(0x1c2330);
                const colorB = new THREE.Color(0x111723);
                const mix = ((x + z) % 2 === 0) ? 0.55 : 0.3;
                const tileColor = colorA.clone().lerp(colorB, mix);

                const cellMat = new THREE.MeshStandardMaterial({
                    color: tileColor,
                    emissive: new THREE.Color(0x0a1220),
                    emissiveIntensity: 0.40, // 視認性UP
                    metalness: 0.5,
                    roughness: 0.6,
                    side: THREE.DoubleSide
                });

                const cell = new THREE.Mesh(cellGeom, cellMat);
                cell.rotation.x = Math.PI / 2;
                cell.position.set(
                    x - gridSize / 2 + 0.5,
                    tileY,
                    z - gridSize / 2 + 0.5
                );
                cell.receiveShadow = true;
                scene.add(cell);

                cellMeshes[idx] = cell;
                gridObjects[idx] = null;
            }
        }

        // === 星空 ===
        stars = createStars(2200, 90);
        scene.add(stars);

        // === モデルプリロード & 初期反映 ===
        preloadModels();
        isInitialized = true;
        updateGridObjects($gridState);

        // === ループ ===
        function animate() {
            requestAnimationFrame(animate);
            if (stars) stars.rotation.y += 0.0006; // ゆっくり回転
            controls.update();
            renderer.render(scene, camera);
        }

        // === リサイズ ===
        function handleResize() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
        window.addEventListener('resize', handleResize);
        handleResize();
        animate();

        // === クリーンアップ ===
        return () => {
            window.removeEventListener('resize', handleResize);
            if (container && renderer?.domElement && container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            isInitialized = false;
        };
    });
</script>

<div class="left-content">
    <div class="canvas-container" bind:this={container}></div>
</div>

<style>
    .left-content {
        padding: 20px;
        height: 80%;
        display: flex;
        flex-direction: column;
        background: radial-gradient(1200px 600px at 50% -10%, rgba(35, 54, 92, 0.25), transparent 60%);
    }
    .canvas-container {
        flex-grow: 1;
        min-height: 300px;
        width: 100%;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(0,0,0,0.35);
        backdrop-filter: blur(2px);
    }
</style>
