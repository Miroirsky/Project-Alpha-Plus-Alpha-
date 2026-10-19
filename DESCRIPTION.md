### Note Timing, Directional Arrows & Scoring Update

- Change note growth duration from **0.5s to 1s**. Keep the existing 1-second hit window and 0.5-second fade-out.
- Add **directional arrows** to notes, indicating the direction the mouse must approach from.
- **Scoring:**
  - **Perfect hit:** 200 points if the mouse is already correctly positioned before the note finishes growing and approaches from the required direction.
  - **Normal hit:** 150–50 points, depending on how early the player hovers over the note after it finishes growing.
  - **Wrong direction:** Deduct 20 points when the player hovers over a note from the wrong direction.
  - **Miss:** 0 points if the hit window expires.
- Preserve existing scoring statistics, including Perfect hit counts, accuracy, combos, and best scores. Wrong-direction penalties must update the total score correctly.
- Ensure arrows are visually clear, animations feel satisfying, and all timing and scoring remain consistent with the existing gameplay and end screen.

Keep the implementation modular and modify the existing systems rather than duplicating them.