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
        log(`Launching ${bot}...`);
        const botProcess = spawn('node', [bot], {
            stdio: ['inherit', 'pipe', 'pipe'] // Inherit stdin, pipe stdout and stderr
        });

        // Log bot output
        botProcess.stdout.on('data', (data) => {
            console.log(data.toString().trim());
        });

        // Log bot errors
        botProcess.stderr.on('data', (data) => {
            console.error(data.toString().trim());
        });

        // Handle bot process exit
        botProcess.on('close', (code) => {
            log(`${bot} exited with code ${code}. Restarting...`);
            setTimeout(() => launchBot(bot), 5000); // Restart after 5 seconds
        });
    });
}

// Launch a single bot (used for restarts)
function launchBot(bot) {
    const botProcess = spawn('node', [bot], {
        stdio: ['inherit', 'pipe', 'pipe']
    });

    botProcess.stdout.on('data', (data) => {
        console.log(data.toString().trim());
    });

    botProcess.stderr.on('data', (data) => {
        console.error(data.toString().trim());
    });

    botProcess.on('close', (code) => {
        log(`${bot} exited with code ${code}. Restarting...`);
        setTimeout(() => launchBot(bot), 5000);
    });
}

// Start the system
launchBots();