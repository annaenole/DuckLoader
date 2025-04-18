/**
 * Main script to download comics with a selection menu
 */

const { showMenu } = require('./ui');
const { loadConfig } = require('./fileUtils');

// Start the script
(async () => {
    await loadConfig(); // Initialize configuration
    await showMenu();
    process.stdin.resume();
})();