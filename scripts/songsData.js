/**
 * @file songsData.js
 * @description Catalog of playable songs and their metadata for Project Alpha Plus.
 */

const SONGS_DATA = [
  {
    id: "test",
    name: "test",
    file: "Assets/Songs/IMG_2449.mp3",
    nps: 3.8,
    duration: "03:49",
    durationSeconds: 229,
    mapper: "AlphaDev",
    creator: "Original Audio",
    date: "2025-05-18",
    difficulty: "Normal",
    color: "#00d4ff"
  },
  {
    id: "test1",
    name: "test1",
    file: "Assets/Songs/Sanstitre9juin20251019.mp3",
    nps: 5.4,
    duration: "02:33",
    durationSeconds: 153,
    mapper: "PulseBeat",
    creator: "Sanstitre Studio",
    date: "2025-06-09",
    difficulty: "Hard",
    color: "#2ed573"
  },
  {
    id: "test2",
    name: "test2",
    file: "Assets/Songs/Sanstitre10juin20251715.mp3",
    nps: 7.2,
    duration: "03:37",
    durationSeconds: 217,
    mapper: "Vortex",
    creator: "Sanstitre Studio",
    date: "2025-06-10",
    difficulty: "Expert",
    color: "#ffa502"
  },
  {
    id: "test3",
    name: "test3",
    file: "Assets/Songs/Sanstitre10juin20251744.mp3",
    nps: 9.6,
    duration: "04:42",
    durationSeconds: 282,
    mapper: "NovaCore",
    creator: "Sanstitre Studio",
    date: "2025-06-10",
    difficulty: "Master",
    color: "#ff4757"
  }
];

// Expose to window
window.SONGS_DATA = SONGS_DATA;
