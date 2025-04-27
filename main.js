// File: main.js
// Main script to launch all bots as separate processes
// Orchestrates PriceSentryBot, SpreadEagleBot, TradeMasterBot, DecoyKrakenBot, DecoyCoinbaseBot, and EvolveGeniusBot

const { spawn } = require('child_process');

// List of bots to launch
const bots = [
    'priceSentryBot.js',
    'spreadEagleBot.js',
    'tradeMasterBot.js',
    'decoyKrakenBot.js',
    'decoyCoinbaseBot.js',
    'evolveGeniusBot.js'
];

// Log messages with timestamp
function log(message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - Main: ${message}`);
}

// Launch each bot as a separate process
function launchBots() {
    log('Starting Crypto Beast Multi-Bot System...');
    bots.forEach(bot => {
        launchBot(bot);
    });
}

// Launch a single bot (used for initial launch and restarts)
function launchBot(bot) {
    log(`Launching ${bot}...`);
    const botProcess = spawn('node', [bot], {
        stdio: ['inherit', 'pipe', 'pipe'] // Inherit stdin, pipe stdout and stderr
    });

    // Log bot output
    botProcess.stdout.on('data', (data) => {
        console.log(`${bot}: ${data.toString().trim()}`);
    });

    // Log bot errors
    botProcess.stderr.on('data', (data) => {
        console.error(`${bot} Error: ${data.toString().trim()}`);
    });

    // Handle bot process exit
    botProcess.on('close', (code) => {
        log(`${bot} exited with code ${code}. Restarting...`);
        setTimeout(() => launchBot(bot), 5000); // Restart after 5 seconds
    });

    // Handle bot process errors
    botProcess.on('error', (err) => {
        log(`Failed to start ${bot}: ${err.message}`);
    });
}

// Start the system
launchBots();