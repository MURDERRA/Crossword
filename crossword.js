#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

// ── Exports for testing ───────────────────────────────────────────────────────

module.exports = {
  loadWords,
  buildIndex,
  parseGrid,
  extractSlots,
  getCandidates,
  isSlotFilled,
  isSlotValid,
  solve,
  shuffle,
};

// ── Word list ─────────────────────────────────────────────────────────────────

function loadWords(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const set = new Set();
  for (const line of text.split('\n')) {
    const w = line.trim().toUpperCase();
    if (/^[A-Z]{2,7}$/.test(w)) set.add(w);
  }
  return set;
}

// Position-letter index: index[len][pos][letter] → Set<word>
function buildIndex(wordSet) {
  const idx = new Map();
  for (const word of wordSet) {
    const len = word.length;
    if (!idx.has(len)) idx.set(len, Array.from({ length: len }, () => new Map()));
    const posArr = idx.get(len);
    for (let p = 0; p < len; p++) {
      const ch = word[p];
      if (!posArr[p].has(ch)) posArr[p].set(ch, new Set());
      posArr[p].get(ch).add(word);
    }
  }
  return idx;
}

// ── Grid parsing ──────────────────────────────────────────────────────────────

function parseGrid(input) {
  const lines = input.trim().split('\n').map(l => l.trimEnd());
  const rows = lines.length;
  const cols = Math.max(...lines.map(l => l.length));
  if (rows > 7 || cols > 7) throw new Error('Grid exceeds 7×7');

  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push((lines[r][c] ?? '_') === '*' ? null : '');
    }
    grid.push(row);
  }
  return { grid, rows, cols };
}

// ── Slot extraction ────────────────────────────────────────────────────────────

function extractSlots(grid, rows, cols) {
  const slots = [];

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (grid[r][c] === null) { c++; continue; }
      let end = c;
      while (end < cols && grid[r][end] !== null) end++;
      if (end - c >= 2) slots.push({ cells: rng(c, end).map(k => [r, k]), dir: 'H', id: slots.length });
      c = end + 1;
    }
  }

  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (grid[r][c] === null) { r++; continue; }
      let end = r;
      while (end < rows && grid[end][c] !== null) end++;
      if (end - r >= 2) slots.push({ cells: rng(r, end).map(k => [k, c]), dir: 'V', id: slots.length });
      r = end + 1;
    }
  }

  return slots;
}

function rng(a, b) {
  const arr = [];
  for (let i = a; i < b; i++) arr.push(i);
  return arr;
}

// ── Candidate lookup ──────────────────────────────────────────────────────────

// Returns words matching the current (possibly partial) slot pattern, excluding usedWords
function getCandidates(grid, slot, wordIndex, usedWords) {
  const len = slot.cells.length;
  const posArr = wordIndex.get(len);
  if (!posArr) return [];

  let result = null;

  for (let i = 0; i < len; i++) {
    const ch = grid[slot.cells[i][0]][slot.cells[i][1]];
    if (!ch) continue;

    const bucket = posArr[i]?.get(ch);
    if (!bucket || bucket.size === 0) return [];

    if (result === null) {
      result = new Set(bucket);
    } else {
      for (const w of result) if (!bucket.has(w)) result.delete(w);
      if (result.size === 0) return [];
    }
  }

  if (result === null) {
    result = new Set();
    for (const m of posArr) for (const ws of m.values()) for (const w of ws) result.add(w);
  }

  const out = [];
  for (const w of result) if (!usedWords.has(w)) out.push(w);
  return out;
}

// A slot is "filled" when every cell has a non-empty letter
function isSlotFilled(grid, slot) {
  return slot.cells.every(([r, c]) => grid[r][c] !== '');
}

// A slot's current letters form a valid word
function isSlotValid(grid, slot, wordIndex) {
  if (!isSlotFilled(grid, slot)) return false;
  const word = slot.cells.map(([r, c]) => grid[r][c]).join('');
  const len = word.length;
  const posArr = wordIndex.get(len);
  if (!posArr) return false;
  // Just check via any position bucket
  return posArr[0]?.get(word[0])?.has(word) ?? false;
}

// ── Core backtracking solver ──────────────────────────────────────────────────

function tryBacktrack(grid, rows, cols, slots, wordIndex, deadline) {
  const usedWords = new Set();

  // MRV: pick the unfilled slot with fewest valid candidates
  function pickSlot() {
    let best = null;
    let bestCount = Infinity;
    for (const slot of slots) {
      // Skip slots already fully determined by crossing words
      if (isSlotFilled(grid, slot)) continue;
      const count = getCandidates(grid, slot, wordIndex, usedWords).length;
      if (count === 0) return null; // immediate failure
      if (count < bestCount) { bestCount = count; best = slot; }
    }
    return best;
  }

  // After all unfilled slots are gone, verify all filled slots are valid words (no duplicates)
  function allValid() {
    const words = [];
    for (const slot of slots) {
      if (!isSlotValid(grid, slot, wordIndex)) return false;
      words.push(slot.cells.map(([r, c]) => grid[r][c]).join(''));
    }
    return new Set(words).size === words.length;
  }

  function backtrack() {
    if (Date.now() > deadline) return false;

    const slot = pickSlot();
    if (slot === null && slots.some(s => !isSlotFilled(grid, s))) {
      return false; // a slot has 0 candidates
    }
    if (!slot) return allValid(); // all slots filled

    // Slots filled via crossing words are not in usedWords — add them now
    // so we don't reuse their word in another slot
    const autoFilled = [];
    for (const s of slots) {
      if (isSlotFilled(grid, s)) {
        const w = s.cells.map(([r, c]) => grid[r][c]).join('');
        if (!usedWords.has(w)) { usedWords.add(w); autoFilled.push(w); }
      }
    }

    const candidates = shuffle(getCandidates(grid, slot, wordIndex, usedWords));

    // Save grid state for this slot's cells only isn't enough (other slots share cells)
    // Save the entire grid
    const savedGrid = grid.map(row => [...row]);

    let found = false;
    for (const word of candidates) {
      if (Date.now() > deadline) break;

      // Place word
      for (let i = 0; i < slot.cells.length; i++) {
        grid[slot.cells[i][0]][slot.cells[i][1]] = word[i];
      }
      usedWords.add(word);

      if (backtrack()) { found = true; break; }

      // Restore
      usedWords.delete(word);
      for (let r = 0; r < rows; r++) grid[r] = [...savedGrid[r]];
    }

    // Undo auto-fills from usedWords
    for (const w of autoFilled) usedWords.delete(w);

    return found;
  }

  return backtrack();
}

// ── Solve with random restarts ───────────────────────────────────────────────

function solve(grid, rows, cols, slots, wordIndex, timeoutMs) {
  const globalDeadline = Date.now() + timeoutMs;

  // Attempt budgets: start small, grow geometrically
  let budget = Math.min(500, timeoutMs / 4);

  function resetGrid() {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (grid[r][c] !== null) grid[r][c] = '';
  }

  while (Date.now() < globalDeadline) {
    resetGrid();
    const attemptDeadline = Math.min(Date.now() + budget, globalDeadline);
    if (tryBacktrack(grid, rows, cols, slots, wordIndex, attemptDeadline)) return true;
    budget = Math.min(budget * 2, timeoutMs);
  }

  return false;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function printGrid(grid, rows, cols) {
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      line += grid[r][c] === null ? '*' : (grid[r][c] || '?');
    }
    console.log(line);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const readline = require('readline');

async function readInput() {
  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin });
    const lines = [];
    for await (const line of rl) lines.push(line);
    return lines.join('\n');
  }
  if (process.argv[2]) return fs.readFileSync(process.argv[2], 'utf8');
  console.error('Usage: node crossword.js <grid-file>  OR  echo "<grid>" | node crossword.js');
  process.exit(1);
}

async function main() {
  const wordsPath = path.join(__dirname, 'words.txt');
  if (!fs.existsSync(wordsPath)) {
    console.error(`words.txt not found at ${wordsPath}`);
    process.exit(1);
  }

  const wordSet = loadWords(wordsPath);
  const input = await readInput();
  const { grid, rows, cols } = parseGrid(input);
  const slots = extractSlots(grid, rows, cols);

  if (slots.length === 0) {
    console.error('No valid slots found (all cells black or only single-cell runs).');
    process.exit(1);
  }

  const neededLengths = new Set(slots.map(s => s.cells.length));
  const filteredWords = new Set([...wordSet].filter(w => neededLengths.has(w.length)));
  const wordIndex = buildIndex(filteredWords);

  // Give larger grids more time; max 60s
  const maxDim = Math.max(rows, cols);
  const timeoutMs = maxDim <= 5 ? 15_000 : maxDim <= 6 ? 30_000 : 60_000;

  const solved = solve(grid, rows, cols, slots, wordIndex, timeoutMs);

  if (!solved) {
    console.error('No valid crossword found within the time limit.');
    process.exit(1);
  }

  printGrid(grid, rows, cols);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}