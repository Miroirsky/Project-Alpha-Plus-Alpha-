const Updates = {
    "Yellow Notes": {
        id: "0.4.1",
        description: "Adding the yellow notes that can be triggered by pressing space."
    },
    "Remaking the Menu": {
        id: "0.4.0",
        description: "The menu has been redesigned with a cleaner, more polished, and more original look, making the game easier and more enjoyable to navigate. Note: The update log was introduced with this version, so earlier updates are documented retroactively based on the order in which the features were developed."
    },
    "Executable": {
        id: "0.3.0",
        description: "The game can now be played as a standalone desktop application thanks to Electron! The website has been repurposed as a download page, allowing players to download and install the game on their computers."
    },
    "New Export/Import System": {
        id: "0.2.1",
        description: "The track export and import systems have been improved to fix related bugs and make the process more reliable and user-friendly. Sharing, saving, and loading custom tracks is now easier."
    },
    "Menu Rework": {
        id: "0.2.0",
        description: "The entire user interface received a visual overhaul, introducing a cleaner and more consistent theme across the game."
    },
    "Editor": {
        id: "0.1.0",
        description: "The full track editor was introduced! Players can now create their own tracks, test them directly in the game, and export or import tracks to save their work and share their creations."
    },
    "Notes": {
        id: "0.0.2",
        description: "Two new note types were added: Bomb Notes and Directional Notes, expanding the gameplay possibilities and allowing for more varied and challenging tracks."
    },
    "Start": {
        id: "0.0.1",
        description: "The very first playable version of the game was released on the web. It marked the beginning of the project, with the game initially available only through a browser."
    }
};

if (typeof window !== "undefined") {
    window.Updates = Updates;
}
if (typeof module !== "undefined" && module.exports) {
    module.exports = Updates;
}
