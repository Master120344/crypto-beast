const opportunitiesCtx = document.getElementById('opportunitiesChart').getContext('2d');
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
            tension: 0.4,
            pointBackgroundColor: '#c084fc',
            pointBorderColor: '#ffffff',
            pointRadius: 5,
            pointHoverRadius: 7
        }]
    },
    options: {
        scales: {
            y: { 
                beginAtZero: true, 
                ticks: { color: '#f0f0f0', font: { size: 14 } },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
            },
            x: { 
                ticks: { color: '#f0f0f0', font: { size: 14 } },
                grid: { color: 'rgba(255, 255, 255, 0.1)' }
            }
        },
        plugins: {
            legend: { labels: { color: '#f0f0f0', font: { size: 16 } } }
        },
        animation: {
            duration: 1000,
            easing: 'easeInOutQuad'
        }
    }
});

function updateOpportunitiesChart(spread, timestamp) {
    const time = new Date(timestamp).toLocaleTimeString();
    opportunitiesChart.data.labels.push(time);
    opportunitiesChart.data.datasets[0].data.push(spread);
    if (opportunitiesChart.data.labels.length > 10) {
        opportunitiesChart.data.labels.shift();
        opportunitiesChart.data.datasets[0].data.shift();
    }
    opportunitiesChart.update();

    // Hide placeholder text once data is received
    const placeholder = opportunitiesCtx.canvas.parentElement.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
}