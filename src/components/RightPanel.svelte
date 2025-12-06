<script>
    import { gridState } from "$lib/stores/gridState";

    // ボタンがクリックされたときのハンドラー関数
    function handleClick(index) {
        // ストアの値を更新
        gridState.update((states) => {
            // 現在の状態を取得
            const currentState = states[index];

            // 次の状態を計算（0→1→2→...→12→0...）
            const nextState = currentState < 12 ? currentState + 1 : 0;

            // 新しい配列を作成して該当のインデックスの値を更新
            const newStates = [...states];
            newStates[index] = nextState;

            console.log(
                `ボタン ${index + 1} がクリックされました。状態: ${nextState}`,
            );

            return newStates;
        });
    }

    // 状態に応じたスタイルクラスを取得する関数
    function getStateClass(state) {
        if (state === 0) return "state-none";
        if (state >= 1 && state <= 4) return "state-chair";
        if (state >= 5 && state <= 8) return "state-desk";
        if (state >= 9 && state <= 12) return "state-wardrobe";
        return "";
    }

    // 状態に応じたテキストを取得する関数
    function getStateText(state) {
        if (state === 0) return "-";

        // 家具の種類を決定
        let furnitureType = "";
        if (state >= 1 && state <= 4) furnitureType = "チェア";
        else if (state >= 5 && state <= 8) furnitureType = "デスク";
        else if (state >= 9 && state <= 12) furnitureType = "クローゼット";

        // 回転角度を矢印で表現
        let arrow = "";
        const rotationState = (state - 1) % 4;
        if (rotationState === 0)
            arrow = "↑"; // 0°
        else if (rotationState === 1)
            arrow = "→"; // 90°
        else if (rotationState === 2)
            arrow = "↓"; // 180°
        else if (rotationState === 3) arrow = "←"; // 270°

        return `${furnitureType}<br>${arrow}`;
    }
</script>

<div class="right-content">
    <table width="100%" height="80%" cellspacing="2" cellpadding="0">
        <tbody>
            {#each Array(8) as _, row}
                <tr height="12.5%">
                    {#each Array(8) as _, col}
                        {@const index = row * 8 + col}
                        {@const state = $gridState[index]}
                        <td width="12.5%">
                            <button
                                class="cell {getStateClass(state)}"
                                on:click={() => handleClick(index)}
                                width="100%"
                                height="100%"
                            >
                                {@html getStateText(state)}
                            </button>
                        </td>
                    {/each}
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    .right-content {
        padding: 20px;
        height: 100%;
        display: flex;
        flex-direction: column;
    }

    .cell {
        width: 100%;
        height: 100%;
        border: 1px solid #ccc;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: none;
        cursor: pointer;
        font-size: 0.7em;
        line-height: 1.1;
        padding: 1px;
        box-sizing: border-box;
    }

    /* 状態に応じたスタイリング */
    .state-none {
        background-color: white;
    }
    .state-chair {
        background-color: #ccddff;
    }
    .state-desk {
        background-color: #ffcccc;
    }
    .state-wardrobe {
        background-color: #ccffcc;
    }
</style>