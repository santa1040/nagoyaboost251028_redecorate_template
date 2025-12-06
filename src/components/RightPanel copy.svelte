<script>
	import { gridState } from '$lib/stores/gridState';

	// 値 → 表示ラベル
	const labels = [
		'-',
		'チェア↑', 'チェア→', 'チェア↓', 'チェア←',      // 1-4
		'デスク↑', 'デスク→', 'デスク↓', 'デスク←',        // 5-8
		'クローゼット↑', 'クローゼット→', 'クローゼット↓', 'クローゼット←' // 9-12
	];

	const MAX_BUTTON_VALUE = 12;

	// 値→色クラス
	function valueToClass(v) {
		if (v >= 1 && v <= 4) return 'chair';
		if (v >= 5 && v <= 8) return 'desk';
		if (v >= 9 && v <= 12) return 'closet';
		return '';
	}

	// クリックで 0→1→…→12→0
	function handleClick(index) {
		gridState.update(arr => {
			const next = arr[index] >= MAX_BUTTON_VALUE ? 0 : arr[index] + 1;
			const copy = arr.slice();
			copy[index] = next;
			return copy;
		});
	}
</script>

<div>
	<table>
		<tbody>
			{#each Array(8) as _, row}
				<tr>
					{#each Array(8) as _, col}
						<td>
							{#key $gridState[row * 8 + col]}
								<button
									class="cellBtn {valueToClass($gridState[row * 8 + col])}"
									on:click={() => handleClick(row * 8 + col)}
									aria-label={`cell-${row}-${col}`}
								>
									{labels[$gridState[row * 8 + col]]}
								</button>
							{/key}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	table { border-collapse: collapse; }
	td { padding: 0; border: none; }

	/* 固定サイズで文字数に依存しない */
	.cellBtn {
		width: 64px;
		height: 64px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		border: 1px solid #ccc;
		background-color: #f9f9f9; /* 0 のとき */
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: filter 0.1s ease;
	}

	.cellBtn:hover { filter: brightness(0.95); }

	/* 色分け（チェア=青、デスク=赤、クローゼット=緑） */
	.cellBtn.chair  { background-color: #1e88e5; color: #fff; border-color: #1565c0; }
	.cellBtn.desk   { background-color: #e53935; color: #fff; border-color: #b71c1c; }
	.cellBtn.closet { background-color: #43a047; color: #fff; border-color: #2e7d32; }
</style>
