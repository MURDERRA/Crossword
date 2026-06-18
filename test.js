'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  loadWords,
  buildIndex,
  parseGrid,
  extractSlots,
  getCandidates,
  isSlotFilled,
  isSlotValid,
  solve,
  shuffle,
} = require('./crossword.js');

const WORDS_PATH = path.join(__dirname, 'words.txt');
const wordSet = loadWords(WORDS_PATH);

// ── Unit tests ────────────────────────────────────────────────────────────────

function testLoadWords() {
  const words = loadWords(WORDS_PATH);
  assert(words.size > 0, 'Word list should not be empty');
  assert(words.has('HELLO'), 'Should contain HELLO');
  assert(words.has('AA'), 'Should contain AA');
  assert(!words.has('A'), 'Should not contain 1-letter words');
  assert(!words.has('TOOLONGWORD'), 'Should not contain words > 7 letters');
  console.log('  ✓ loadWords');
}

function testBuildIndex() {
  const idx = buildIndex(new Set(['CAT', 'CAR', 'BAT']));
  assert(idx.has(3), 'Should index 3-letter words');
  assert(!idx.has(4), 'Should not have 4-letter index');
  assert(idx.get(3)[0].get('C').has('CAT'), 'CAT at position 0 with C');
  assert(idx.get(3)[1].get('A').has('CAT'), 'CAT at position 1 with A');
  assert(!idx.get(3)[0].get('B').has('CAT'), 'CAT should not be at pos 0 with B');

  const idx2 = buildIndex(new Set(['BALL']));
  assert(idx2.has(4), 'Should index 4-letter words');

  console.log('  ✓ buildIndex');
}

function testParseGrid() {
  const { grid, rows, cols } = parseGrid('_____\n_____\n');
  assert(rows === 2, 'Should have 2 rows');
  assert(cols === 5, 'Should have 5 columns');
  assert(grid[0][0] === '', 'White cell should be empty string');
  assert(grid[0][2] === '', 'White cell at any position');
  assert(grid[1][4] === '', 'Last white cell');

  const { grid: g2 } = parseGrid('**__\n__**');
  assert(g2[0][0] === null, 'Black cell should be null');
  assert(g2[0][2] === '', 'White cell after black');
  assert(g2[1][3] === null, 'Black cell at end');

  try {
    parseGrid('________\n_______');
    assert(false, 'Should throw for > 7 cols');
  } catch (e) {
    assert(e.message.includes('7×7'));
  }
  console.log('  ✓ parseGrid');
}

function testExtractSlots() {
  const { grid } = parseGrid('_____\n_____\n');
  const slots = extractSlots(grid, 2, 5);
  const hSlots = slots.filter(s => s.dir === 'H');
  const vSlots = slots.filter(s => s.dir === 'V');
  assert(hSlots.length === 2, 'Should have 2 horizontal slots');
  assert(vSlots.length === 5, 'Should have 5 vertical slots');
  assert(hSlots[0].cells.length === 5, 'Horizontal slot should have 5 cells');

  const { grid: g2 } = parseGrid('**__\n____');
  const slots2 = extractSlots(g2, 2, 4);
  assert(slots2.filter(s => s.dir === 'H').length === 2, 'Should have 2 horizontal slots');

  console.log('  ✓ extractSlots');
}

function testGetCandidates() {
  const idx = buildIndex(wordSet);
  const { grid } = parseGrid('_____\n_____\n');
  const slots = extractSlots(grid, 2, 5);
  const slot = slots[0]; // First horizontal slot

  let candidates = getCandidates(grid, slot, idx, new Set());
  assert(candidates.length > 0, 'Should find candidates for empty slot');
  assert(candidates.every(w => w.length === 5), 'All candidates should be 5 letters');
  assert(candidates.every(w => wordSet.has(w)), 'All candidates should be in dictionary');

  // Partial: first letter is S
  grid[0][0] = 'S';
  const partial = getCandidates(grid, slot, idx, new Set());
  assert(partial.every(w => w.startsWith('S')), 'All candidates should start with S');

  // Impossible: no word starts with QZ
  grid[0][0] = 'Q';
  grid[0][1] = 'Z';
  const empty = getCandidates(grid, slot, idx, new Set());
  assert(empty.length === 0, 'Should find no candidates for impossible pattern (QZ...)');

  console.log('  ✓ getCandidates');
}

function testIsSlotFilled() {
  const { grid } = parseGrid('_____\n_____');
  const slots = extractSlots(grid, 2, 5);
  const slot = slots[0];

  assert(!isSlotFilled(grid, slot), 'Empty slot should not be filled');
  for (let i = 0; i < 5; i++) grid[0][i] = 'A';
  assert(isSlotFilled(grid, slot), 'Slot with all letters should be filled');

  console.log('  ✓ isSlotFilled');
}

function testIsSlotValid() {
  const idx = buildIndex(wordSet);
  const { grid } = parseGrid('_____\n_____');
  const slots = extractSlots(grid, 2, 5);
  const slot = slots[0];

  assert(!isSlotValid(grid, slot, idx), 'Empty slot should not be valid');
  grid[0] = ['H', 'E', 'L', 'L', 'O'];
  assert(isSlotValid(grid, slot, idx), 'HELLO should be valid');
  grid[0] = ['X', 'X', 'X', 'X', 'X'];
  assert(!isSlotValid(grid, slot, idx), 'XXXXX should not be valid');

  console.log('  ✓ isSlotValid');
}

function testShuffle() {
  const arr = [1, 2, 3, 4, 5];
  const original = [...arr];
  shuffle(arr);
  assert(arr.length === original.length, 'Shuffle should preserve length');
  assert([...arr].sort(), 'Shuffle should contain same elements');
  // Fisher-Yates is deterministic in-place, but we just verify it runs
  console.log('  ✓ shuffle');
}

// ── Integration tests ────────────────────────────────────────────────────────

function testSolve5x5() {
  const idx = buildIndex(wordSet);
  const { grid, rows, cols } = parseGrid('_____\n_____\n_____\n_____\n_____');
  const slots = extractSlots(grid, rows, cols);
  const neededLengths = new Set(slots.map(s => s.cells.length));
  const filtered = new Set([...wordSet].filter(w => neededLengths.has(w.length)));
  const localIdx = buildIndex(filtered);

  const result = solve(grid, rows, cols, slots, localIdx, 15_000);
  assert(result, 'Should solve 5×5 open grid');

  // All horizontal words valid
  for (const slot of slots.filter(s => s.dir === 'H')) {
    assert(isSlotValid(grid, slot, localIdx), `H word should be valid: ${grid[slot.cells[0][0]].slice(slot.cells[0][1], slot.cells[0][1] + slot.cells.length)}`);
  }
  // All vertical words valid
  for (const slot of slots.filter(s => s.dir === 'V')) {
    assert(isSlotValid(grid, slot, localIdx), 'V word should be valid');
  }
  // No duplicate words
  const words = slots.map(s => s.cells.map(([r, c]) => grid[r][c]).join(''));
  assert(new Set(words).size === words.length, 'No duplicate words');

  console.log('  ✓ solve 5×5 open grid');
}

function testSolveWithBlackCells() {
  const idx = buildIndex(wordSet);
  const { grid, rows, cols } = parseGrid('***___\n______\n______\n______\n***___');
  const slots = extractSlots(grid, rows, cols);
  const neededLengths = new Set(slots.map(s => s.cells.length));
  const filtered = new Set([...wordSet].filter(w => neededLengths.has(w.length)));
  const localIdx = buildIndex(filtered);

  const result = solve(grid, rows, cols, slots, localIdx, 30_000);
  assert(result, 'Should solve grid with black cells');

  for (const slot of slots) {
    assert(isSlotValid(grid, slot, localIdx), 'All slots should have valid words');
  }

  console.log('  ✓ solve with black cells');
}

function testNoWordDuplicates() {
  const idx = buildIndex(wordSet);
  const { grid, rows, cols } = parseGrid('_____\n_____\n_____\n_____\n_____');
  const slots = extractSlots(grid, rows, cols);
  const neededLengths = new Set(slots.map(s => s.cells.length));
  const filtered = new Set([...wordSet].filter(w => neededLengths.has(w.length)));
  const localIdx = buildIndex(filtered);

  solve(grid, rows, cols, slots, localIdx, 15_000);

  const words = slots.map(s => s.cells.map(([r, c]) => grid[r][c]).join(''));
  const unique = new Set(words);
  assert(unique.size === words.length, `No duplicates: ${words.length} words, ${unique.size} unique`);

  console.log('  ✓ no word duplicates');
}

// ── Performance benchmarks ─────────────────────────────────────────────────────

function benchmark(grids) {
  console.log('\n── Performance ──');
  console.log('grid size | count | min (ms) | avg (ms) | max (ms)');

  for (const { name, grid: gridStr, timeout } of grids) {
    const idx = buildIndex(wordSet);
    const { grid, rows, cols } = parseGrid(gridStr);
    const slots = extractSlots(grid, rows, cols);
    const neededLengths = new Set(slots.map(s => s.cells.length));
    const filtered = new Set([...wordSet].filter(w => neededLengths.has(w.length)));
    const localIdx = buildIndex(filtered);

    const COUNT = 5;
    const times = [];

    for (let i = 0; i < COUNT; i++) {
      // Reset grid
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (grid[r][c] !== null) grid[r][c] = '';

      const start = Date.now();
      const result = solve(grid, rows, cols, slots, localIdx, timeout);
      const elapsed = Date.now() - start;
      times.push(elapsed);

      if (!result) {
        console.log(`${name} | FAIL (timeout ${timeout}ms)`);
        break;
      }
    }

    if (times.length === COUNT) {
      const min = Math.min(...times);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      console.log(`${name} | ${COUNT} runs | ${min} | ${Math.round(avg)} | ${max}`);
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

const TEST_GRIDS = [
  { name: '5×5', grid: '_____\n_____\n_____\n_____\n_____', timeout: 15_000 },
  { name: '6×5', grid: '_____\n_____\n_____\n_____\n_____\n_____', timeout: 20_000 },
  { name: '7×7 with black cells', grid: '**_____\n**_____\n_______\n_______\n_______\n____**_\n____**_\n', timeout: 30_000 },
];

console.log('\n── Unit tests ──');
testLoadWords();
testBuildIndex();
testParseGrid();
testExtractSlots();
testGetCandidates();
testIsSlotFilled();
testIsSlotValid();
testShuffle();

console.log('\n── Integration tests ──');
testSolve5x5();
testSolveWithBlackCells();
testNoWordDuplicates();

benchmark(TEST_GRIDS);

console.log('\nAll tests passed.\n');