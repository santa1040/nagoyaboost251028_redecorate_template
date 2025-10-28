<script>
    import { onMount } from 'svelte';
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
    import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
    import { gridState } from '$lib/stores/gridState';

    let container;
    let scene, camera, renderer, controls;
    let gridObjects = []; // グリッド上のオブジェクトを格納する配列
    let isInitialized = false; // 初期化フラグ

    // モデルのURLリスト
    const placementModelUrls = {
        model1:
            'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo1.glb',
        model2:
            'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo2.glb',
        model3:
            'https://qsbkq9revdprke1d.public.blob.vercel-storage.com/redecorate/robo3.glb'
    };

    // GLBモデルをロードして返すPromiseを作成する関数
    function loadModel(url) {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            loader.load(
                url,
                (gltf) => {
                    // ロードに成功したらモデルを返す
                    resolve(gltf.scene);
                },
                undefined,
                (error) => {
                    console.error('モデルロード中にエラーが発生しました:', error);
                    reject(error);
                }
            );
        });
    }

    // モデルをキャッシュするオブジェクト
    const modelCache = {
        model1: null,
        model2: null,
        model3: null
    };

    // モデルをプリロードする関数
    async function preloadModels() {
        try {
            // 並列でモデルをロード
            const [model1, model2, model3] = await Promise.all([
                loadModel(placementModelUrls.model1),
                loadModel(placementModelUrls.model2),
                loadModel(placementModelUrls.model3)
            ]);

            // キャッシュに保存
            modelCache.model1 = model1;
            modelCache.model2 = model2;
            modelCache.model3 = model3;

            console.log('すべてのモデルをプリロードしました');
        } catch (error) {
            console.error('モデルのプリロード中にエラーが発生しました:', error);
        }
    }

    // 各状態に対応するオブジェクトを作成する関数
    async function createStateObject(state) {
        if (state === 0) {
            // 状態0: なし
            return null;
        }

        // モデルタイプとY軸の回転角度を決定
        let modelType;
        let rotationDegrees;

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

        // キャッシュにモデルがある場合はクローンして使用
        if (modelCache[modelType]) {
            const model = modelCache[modelType].clone();

            // Y軸の回転角度を設定（ラジアンに変換）
            const rotationRadians = THREE.MathUtils.degToRad(rotationDegrees);
            model.rotation.y = rotationRadians;

            return model;
        } else {
            // キャッシュにない場合はロード
            try {
                const model = await loadModel(placementModelUrls[modelType]);
                modelCache[modelType] = model;

                const clonedModel = model.clone();

                // Y軸の回転角度を設定（ラジアンに変換）
                const rotationRadians = THREE.MathUtils.degToRad(rotationDegrees);
                clonedModel.rotation.y = rotationRadians;

                return clonedModel;
            } catch (error) {
                console.error(`${modelType}のロード中にエラーが発生しました:`, error);
                return null;
            }
        }
    }

    // グリッド状態を更新する関数
    async function updateGridObjects(states) {
        if (!isInitialized || !scene) return;

        const gridSize = 8;

        // グリッド上の各セルを処理
        for (let i = 0; i < states.length; i++) {
            const state = states[i];

            // グリッド座標を計算
            const x = i % gridSize;
            const z = Math.floor(i / gridSize);

            // 既存のオブジェクトがあれば削除
            if (gridObjects[i]) {
                scene.remove(gridObjects[i]);
                gridObjects[i] = null;
            }

            // 状態に応じた新しいオブジェクトを作成
            const newObject = await createStateObject(state);
            if (newObject) {
                // モデルのスケールを設定
                newObject.scale.set(0.5, 0.5, 0.5);

                // モデルのサイズを計算するためのバウンディングボックスを作成
                const bbox = new THREE.Box3().setFromObject(newObject);
                const modelHeight = bbox.max.y - bbox.min.y;

                // オブジェクトの位置を設定
                newObject.position.x = x - gridSize / 2 + 0.5;
                // Y軸方向の位置をモデルの高さの半分に設定
                newObject.position.y = modelHeight * 0.5;
                newObject.position.z = z - gridSize / 2 + 0.5;

                // シーンに追加
                scene.add(newObject);

                // 配列に保存
                gridObjects[i] = newObject;
            }
        }
    }

    // リアクティブな状態監視
    $: if (isInitialized) {
        updateGridObjects($gridState);
    }

    onMount(() => {
        // シーン、カメラ、レンダラーの作成
        scene = new THREE.Scene();
        // 背景色を濃いめのクリーム色に設定
        scene.background = new THREE.Color(0xf5f2e8);

        camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true });

        // レンダラーのサイズ設定
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);

        // カメラの位置を設定
        camera.position.set(0, 10, 10);
        camera.lookAt(0, 0, 0);

        // OrbitControlsを追加
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // 基本的な光源の追加
        const light = new THREE.DirectionalLight(0xffffff, 1);
        light.position.set(5, 10, 5);
        scene.add(light);

        // 環境光を追加 - 白色光に変更
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        // 8x8のグリッド床を作成
        const gridSize = 8;
        const gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x999999, 0x999999); // グレーのグリッド線
        scene.add(gridHelper);

        // 床を作成（白色ベース）
        const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
        const planeMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff, // 白色
            side: THREE.DoubleSide,
            roughness: 0.8,
            metalness: 0.1
        });
        const plane = new THREE.Mesh(planeGeometry, planeMaterial);
        plane.rotation.x = Math.PI / 2;
        plane.position.y = -0.01; // グリッドの少し下に配置
        scene.add(plane);

        // 8x8のセルを作成 - グレーのチェック模様
        const cellSize = 1;
        const cellGeometry = new THREE.PlaneGeometry(cellSize * 0.95, cellSize * 0.95);

        // チェック模様用のグレー色
        const colors = [0xf0f0f0, 0xe0e0e0]; // 明るいグレーと少し暗いグレー

        // 8x8のセルを生成
        for (let x = 0; x < gridSize; x++) {
            for (let z = 0; z < gridSize; z++) {
                const index = z * gridSize + x;
                const colorIndex = (x + z) % 2;
                const cellMaterial = new THREE.MeshStandardMaterial({
                    color: colors[colorIndex],
                    side: THREE.DoubleSide,
                    roughness: 0.7,
                    metalness: 0.1
                });

                const cell = new THREE.Mesh(cellGeometry, cellMaterial);
                cell.rotation.x = Math.PI / 2;

                // セルの位置を調整（グリッドの中央を原点に）
                cell.position.x = x - gridSize / 2 + 0.5;
                cell.position.y = 0; // 床の上に配置
                cell.position.z = z - gridSize / 2 + 0.5;

                scene.add(cell);

                // オブジェクト用の位置を初期化
                gridObjects[index] = null;
            }
        }

        // モデルをプリロード
        preloadModels();

        // 初期化完了フラグを設定
        isInitialized = true;

        // 初期状態でグリッドオブジェクトを更新
        updateGridObjects($gridState);

        // アニメーションループ
        function animate() {
            requestAnimationFrame(animate);

            controls.update(); // OrbitControlsの更新

            // 回転処理はなし（静止状態）

            renderer.render(scene, camera);
        }

        // リサイズハンドラ
        function handleResize() {
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
        }

        // リサイズイベントリスナーを追加
        window.addEventListener('resize', handleResize);

        // アニメーション開始
        animate();

        // コンポーネントがアンマウントされたときのクリーンアップ
        return () => {
            window.removeEventListener('resize', handleResize);
            if (container && container.contains(renderer.domElement)) {
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
    }

    .canvas-container {
        flex-grow: 1;
        min-height: 300px;
        width: 100%;
    }
</style>