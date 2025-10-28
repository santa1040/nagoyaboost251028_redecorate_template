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

    // ========== 宇宙テーマ用ユーティリティ ==========
    // 決定的な2Dノイズ（シードはx,zに依存）
    function hash2d(x, z) {
        // 0..1 の値に正規化された疑似乱数
        const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return s - Math.floor(s);
    }
    function smoothstep(t) {
        return t * t * (3.0 - 2.0 * t);
    }
    // 連続性のある簡易バリューノイズ
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
    // タイル高さ（振幅は控えめに）
    function getTileHeight(x, z) {
        // グリッド中央を原点にスケールを少し縮めて滑らかさUP
        const sx = (x - gridSize / 2 + 0.5) * 0.7;
        const sz = (z - gridSize / 2 + 0.5) * 0.7;

        // 2オクターブほど重ねてコントラストを出す
        const n1 = valueNoise2D(sx * 0.6, sz * 0.6);
        const n2 = valueNoise2D(sx * 1.2, sz * 1.2);
        const n = (n1 * 0.7 + n2 * 0.3); // 0..1

        const amplitude = 0.18; // 高低差の最大量（お好みで 0.1〜0.3）
        const centerBias = -0.06; // 全体をやや沈めてSF感
        return (n - 0.5) * 2 * amplitude + centerBias; // -amp..+amp付近
    }

    // 星パーティクル生成
    function createStars(count = 2000, radius = 80) {
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            // 球殻上にランダム配置
            const phi = Math.acos(2 * Math.random() - 1);
            const theta = 2 * Math.PI * Math.random();
            const r = radius * (0.6 + Math.random() * 0.4); // ばらけさせる

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

    // ========== モデルURL & ローダ ==========
    const placementModelUrls = {
        model1:
            'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo1.glb',
        model2:
            'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo2.glb',
        model3:
            'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo3.glb'
    };

    function loadModel(url) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(
                url,
                (gltf) => resolve(gltf.scene),
                undefined,
                (error) => {
                    console.error('モデルロード中にエラーが発生しました:', error);
                    reject(error);
                }
            );
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
        } catch (e) {
            console.error('モデルのプリロード中にエラー:', e);
        }
    }

    async function createStateObject(state) {
        if (state === 0) return null;

        let modelType, rotationDegrees;
        if (state >= 1 && state <= 4) {
            modelType = 'model1';
            rotationDegrees = (state - 1) * 90;
        } else if (state >= 5 && state <= 8) {
            modelType = 'model2';
            rotationDegrees = (state - 5) * 90;
        } else if (state >= 9 && state <= 12) {
            modelType = 'model3';
            rotationDegrees = (state - 9) * 90;
        } else {
            return null;
        }

        const fromCache = modelCache[modelType];
        let baseModel = fromCache ? fromCache : await loadModel(placementModelUrls[modelType]).then(m => (modelCache[modelType] = m));
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

            // 既存モデル削除
            if (gridObjects[idx]) {
                scene.remove(gridObjects[idx]);
                gridObjects[idx] = null;
            }

            const newObject = await createStateObject(state);
            if (newObject) {
                // モデルのスケール
                newObject.scale.set(0.5, 0.5, 0.5);

                // 高さを計算
                const bbox = new THREE.Box3().setFromObject(newObject);
                const modelH = bbox.max.y - bbox.min.y;

                const tileY = cellHeights[idx] ?? 0;

                // 位置（セルの高さに追従）
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

    // リアクティブ反映
    $: if (isInitialized) {
        updateGridObjects($gridState);
    }

    onMount(() => {
        // シーン
        scene = new THREE.Scene();
        // 宇宙色（とても暗い青）
        scene.background = new THREE.Color(0x030611);
        scene.fog = new THREE.FogExp2(0x030611, 0.035);

        // カメラ
        camera = new THREE.PerspectiveCamera(
            60,
            1, // 初期値。あとでリサイズで更新
            0.1,
            1000
        );

        // レンダラー
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        container.appendChild(renderer.domElement);

        // カメラ位置
        camera.position.set(0, 9.5, 10.5);
        camera.lookAt(0, 0, 0);

        // 操作
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.target.set(0, 0, 0);

        // ライト（クール寄り）
        const dirLight = new THREE.DirectionalLight(0xbfdcff, 1.1);
        dirLight.position.set(6, 10, 4);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const ambientLight = new THREE.AmbientLight(0x4e5a6a, 0.55);
        scene.add(ambientLight);

        // 床（暗色で微反射）
        const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0x0b0f16,
            metalness: 0.6,
            roughness: 0.4,
            side: THREE.DoubleSide
        });
        const basePlane = new THREE.Mesh(planeGeometry, planeMaterial);
        basePlane.rotation.x = Math.PI / 2;
        basePlane.receiveShadow = true;
        basePlane.position.y = -0.15; // タイルの最低より少し下に
        scene.add(basePlane);

        // プレート（セル）を作成：色はSFっぽいダークグレー＋弱発光
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
                    emissiveIntensity: 0.25,
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
                gridObjects[idx] = null; // モデル領域初期化
            }
        }

        // 星空を追加
        stars = createStars(2200, 90);
        scene.add(stars);

        // モデルをプリロード
        preloadModels();

        // 初期化完了
        isInitialized = true;

        // 初期反映
        updateGridObjects($gridState);

        // アニメーション
        function animate() {
            requestAnimationFrame(animate);

            // 星をゆっくり回転させて宇宙感を出す
            if (stars) {
                stars.rotation.y += 0.0006;
            }

            controls.update();
            renderer.render(scene, camera);
        }

        // リサイズ
        function handleResize() {
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
        window.addEventListener('resize', handleResize);

        // 初回に正しいアスペクトへ
        handleResize();
        animate();

        // クリーンアップ
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
