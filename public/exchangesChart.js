const exchangesCtx = document.getElementById('exchangesChart').getContext('2d');
const exchangesChart = new Chart(exchangesCtx, {
    type: 'pie',
    data: {
        labels: ['Kraken (BTC/USD)', 'Uniswap (WETH/USDT)'],
        datasets: [{
            label: 'Exchange Prices',
            data: [0, 0],
            backgroundColor: ['#60a5fa', '#c084fc'],
            borderColor: '#2d2d2d',
            borderWidth: 1
        }]
    },
    options: {
        plugins: {
            legend: { labels: { color: '#f0f0f0', font: { size: 16 } } }
        },
        animation: {
            duration: 1000,
            easing: 'easeInOutQuad'
        }
    }
});

function updateExchangesChart(exchange, price) {
    if (exchange === 'Kraken') {
        exchangesChart.data.datasets[0].data[0] = price;
    } else if (exchange === 'Uniswap') {
        exchangesChart.data.datasets[0].data[1] = price;
    }
    exchangesChart.update();

    // Hide placeholder text once data is received
    const placeholder = exchangesCtx.canvas.parentElement.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
}