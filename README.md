# Roller Coaster Quiz Challenge

A web-based quiz game where you guess the manufacturer of roller coasters. Features dynamic data loading (from JSON), difficulty modes, autoplay, hints, and an online leaderboard powered by Google Sheets via Google Apps Script. Designed to run on static hosting like GitHub Pages.

## Features

*   Guess the manufacturer from an image.
*   Hard/Easy difficulty modes (text input vs multiple choice).
*   Adjustable guess timer per difficulty.
*   Hint system (reveals park/country).
*   Autoplay mode.
*   Streak counter and local personal best tracking (persisted in browser).
*   Average correct guess time tracking (persisted in browser).
*   Online leaderboard (Top 10 Streaks) using Google Sheets:
    *   Updates existing score if the *same name* submits a *higher* score.
    *   Basic server-side name moderation (bad word filter).
*   Remembers the last used player name for submission (in the same browser).
*   Dark Mode support (syncs with system preference initially).
*   Loads coaster data dynamically from `coasters.json`.
*   Responsive design for various screen sizes.

