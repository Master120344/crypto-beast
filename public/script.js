// Initialize Charts
const opportunitiesCtx = document.getElementById('opportunitiesChart').getContext('2d');
const profitsCtx = document.getElementById('profitsChart').getContext('2d');
const exchangesCtx = document.getElementById('exchangesChart').getContext('2d');
const botActivityCtx = document.getElementById('botActivityChart').getContext('2d');
const tradeVolumeCtx = document.getElementById('tradeVolumeChart').getContext('2d');
const gasPricesCtx = document.getElementById('gasPricesChart').getContext('2d');
const successRateCtx = document.getElementById('successRateChart').getContext('2d');
const decoyBotCtx = document.getElementById('decoyBotChart').getContext('2d');
const latencyCtx = document.getElementById('latencyChart').getContext('2d');
const historicalSpreadsCtx = document.getElementById('historicalSpreadsChart').getContext('2d');

// Chart 1: Arbitrage Opportunities (Line Chart)
const opportunitiesChart = new Chart(opportunitiesCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Arbitrage Spread ($)',
            data: [],
            borderColor: '#c084fc',
            backgroundColor: 'rgba(192, 132, 252, 0.2)',
            fill: true,
            tension: 0.4
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 2: Profits Made (Bar Chart)
const profitsChart = new Chart(profitsCtx, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [{
            label: 'Profit ($)',
            data: [],
            backgroundColor: '#34d399',
            borderColor: '#34d399',
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 3: Exchanges Monitored (Pie Chart)
const exchangesChart = new Chart(exchangesCtx, {
    type: 'pie',
    data: {
        labels: ['Kraken', 'Uniswap'],
        datasets: [{
            label: 'Exchanges',
            data: [50, 50],
            backgroundColor: ['#60a5fa', '#c084fc'],
            borderColor: '#2d2d2d',
            borderWidth: 1
        }]
    },
    options: {
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 4: Bot Activity (Line Chart)
const botActivityChart = new Chart(botActivityCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Bot Actions per Minute',
            data: [],
            borderColor: '#f87171',
            backgroundColor: 'rgba(248, 113, 113, 0.2)',
            fill: true,
            tension: 0.4
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 5: Trade Volume (Bar Chart)
const tradeVolumeChart = new Chart(tradeVolumeCtx, {
    type: 'bar',
    data: {
        labels: [],
        datasets: [{
            label: 'Trade Volume ($)',
            data: [],
            backgroundColor: '#a78bfa',
            borderColor: '#a78bfa',
            borderWidth: 1
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 6: Gas Prices (Line Chart)
const gasPricesChart = new Chart(gasPricesCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'BSC Gas Price (Gwei)',
                data: [],
                borderColor: '#fbbf24',
                backgroundColor: 'rgba(251, 191, 36, 0.2)',
                fill: true,
                tension: 0.4
            },
            {
                label: 'ETH Gas Price (Gwei)',
                data: [],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                fill: true,
                tension: 0.4
            }
        ]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 7: Trade Success Rate (Doughnut Chart)
const successRateChart = new Chart(successRateCtx, {
    type: 'doughnut',
    data: {
        labels: ['Successful', 'Failed'],
        datasets: [{
            label: 'Success Rate',
            data: [75, 25],
            backgroundColor: ['#4ade80', '#f87171'],
            borderColor: '#2d2d2d',
            borderWidth: 1
        }]
    },
    options: {
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 8: Decoy Bot Activity (Line Chart)
const decoyBotChart = new Chart(decoyBotCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Decoy Orders per Minute',
            data: [],
            borderColor: '#f472b6',
            backgroundColor: 'rgba(244, 114, 182, 0.2)',
            fill: true,
            tension: 0.4
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 9: Latency Metrics (Line Chart)
const latencyChart = new Chart(latencyCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Kraken Latency (ms)',
                data: [],
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                fill: true,
                tension: 0.4
            },
            {
                label: 'Uniswap Latency (ms)',
                data: [],
                borderColor: '#c084fc',
                backgroundColor: 'rgba(192, 132, 252, 0.2)',
                fill: true,
                tension: 0.4
            }
        ]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Chart 10: Historical Spreads (Area Chart)
const historicalSpreadsChart = new Chart(historicalSpreadsCtx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Historical Spreads ($)',
            data: [],
            borderColor: '#e879f9',
            backgroundColor: 'rgba(232, 121, 249, 0.2)',
            fill: true,
            tension: 0.4
        }]
    },
    options: {
        scales: {
            y: { beginAtZero: true, ticks: { color: '#e0e0e0' } },
            x: { ticks: { color: '#e0e0e0' } }
        },
        plugins: {
            legend: { labels: { color: '#e0e0e0' } }
        }
    }
});

// Terminal Display
const terminal = document.getElementById('terminal');
const totalOpportunities = document.getElementById('totalOpportunities');
const totalProfits = document.getElementById('totalProfits');
const activeBots = document.getElementById('activeBots');

function addTerminalMessage(message, type) {
    const span = document.createElement('span');
    span.className = type;
    span.textContent = `[${type.toUpperCase()}] ${message}`;
    terminal.appendChild(span);
    terminal.appendChild(document.createElement('br'));
    terminal.scrollTop = terminal.scrollHeight;
}

// Simulated Data Updates
let opportunitiesCount = 0;
let profits = 0;
let botActions = 0;
let decoyOrders = 0;

function updateCharts() {
    const now = new Date().toLocaleTimeString();
    const spread = Math.random() * 100000;
    const profit = spread > 100 ? Math.random() * 5000 : 0;
    const botAction = Math.random() > 0.5 ? 1 : 0;
    const decoyOrder = Math.random() > 0.7 ? 1 : 0;
    const krakenLatency = Math.random() * 10;
    const uniswapLatency = Math.random() * 20;
    const tradeVolume = profit > 0 ? profit * 2 : 0;

    // Update Opportunities Chart
    opportunitiesChart.data.labels.push(now);
    opportunitiesChart.data.datasets[0].data.push(spread);
    if (opportunitiesChart.data.labels.length > 20) {
        opportunitiesChart.data.labels.shift();
        opportunitiesChart.data.datasets[0].data.shift();
    }
    opportunitiesChart.update();

    // Update Profits Chart
    if (profit > 0) {
        profitsChart.data.labels.push(`Trade ${profitsChart.data.labels.length + 1}`);
        profitsChart.data.datasets[0].data.push(profit);
        profits += profit;
        totalProfits.textContent = `$${profits.toFixed(2)}`;
        if (profitsChart.data.labels.length > 10) {
            profitsChart.data.labels.shift();
            profitsChart.data.datasets[0].data.shift();
        }
        profitsChart.update();
    }

    // Update Bot Activity Chart
    botActivityChart.data.labels.push(now);
    botActivityChart.data.datasets[0].data.push(botActions + botAction);
    botActions += botAction;
    activeBots.textContent = botActions > 0 ? '2' : '1';
    if (botActivityChart.data.labels.length > 20) {
        botActivityChart.data.labels.shift();
        botActivityChart.data.datasets[0].data.shift();
    }
    botActivityChart.update();

    // Update Trade Volume Chart
    if (tradeVolume > 0) {
        tradeVolumeChart.data.labels.push(now);
        tradeVolumeChart.data.datasets[0].data.push(tradeVolume);
        if (tradeVolumeChart.data.labels.length > 20) {
            tradeVolumeChart.data.labels.shift();
            tradeVolumeChart.data.datasets[0].data.shift();
        }
        tradeVolumeChart.update();
    }

    // Update Gas Prices Chart
    gasPricesChart.data.labels.push(now);
    gasPricesChart.data.datasets[0].data.push(Math.random() * 50);
    gasPricesChart.data.datasets[1].data.push(Math.random() * 100);
    if (gasPricesChart.data.labels.length > 20) {
        gasPricesChart.data.labels.shift();
        gasPricesChart.data.datasets[0].data.shift();
        gasPricesChart.data.datasets[1].data.shift();
    }
    gasPricesChart.update();

    // Update Success Rate Chart
    if (profit > 0) {
        successRateChart.data.datasets[0].data = [successRateChart.data.datasets[0].data[0] + 1, successRateChart.data.datasets[0].data[1]];
        successRateChart.update();
    }

    // Update Decoy Bot Chart
    decoyBotChart.data.labels.push(now);
    decoyBotChart.data.datasets[0].data.push(decoyOrders + decoyOrder);
    decoyOrders += decoyOrder;
    if (decoyBotChart.data.labels.length > 20) {
        decoyBotChart.data.labels.shift();
        decoyBotChart.data.datasets[0].data.shift();
    }
    decoyBotChart.update();

    // Update Latency Chart
    latencyChart.data.labels.push(now);
    latencyChart.data.datasets[0].data.push(krakenLatency);
    latencyChart.data.datasets[1].data.push(uniswapLatency);
    if (latencyChart.data.labels.length > 20) {
        latencyChart.data.labels.shift();
        latencyChart.data.datasets[0].data.shift();
        latencyChart.data.datasets[1].data.shift();
    }
    latencyChart.update();

    // Update Historical Spreads Chart
    historicalSpreadsChart.data.labels.push(now);
    historicalSpreadsChart.data.datasets[0].data.push(spread);
    if (historicalSpreadsChart.data.labels.length > 20) {
        historicalSpreadsChart.data.labels.shift();
        historicalSpreadsChart.data.datasets[0].data.shift();
    }
    historicalSpreadsChart.update();

    // Update Terminal
    addTerminalMessage(`Kraken-Uniswap Spread: $${spread.toFixed(2)}`, 'info');
    if (spread > 100) {
        opportunitiesCount++;
        totalOpportunities.textContent = opportunitiesCount;
        addTerminalMessage(`Arbitrage Opportunity Detected! Spread: $${spread.toFixed(2)}`, 'opportunity');
        if (profit > 0) {
            addTerminalMessage(`Executing flash loan trade: Kraken -> Uniswap`, 'trade');
        }
    }
}

// Simulate live updates every 5 seconds
setInterval(updateCharts, 5000);

// Initial update
updateCharts();
