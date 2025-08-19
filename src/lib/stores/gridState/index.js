import { writable } from 'svelte/store';

// 8x8のグリッド状態を初期化（すべて0）
export const gridState = writable(Array(64).fill(0));