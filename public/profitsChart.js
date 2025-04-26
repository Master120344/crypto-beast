const profitsCtx = document.getElementById('profitsChart').getContext('2d');
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

function updateProfitsChart(profit, timestamp) {
    const time = new Date(timestamp).toLocaleTimeString();
    profitsChart.data.labels.push(time);
    profitsChart.data.datasets[0].data.push(profit);
    if (profitsChart.data.labels.length > 5) {
        profitsChart.data.labels.shift();
        profitsChart.data.datasets[0].data.shift();
    }
    profitsChart.update();

    // Hide placeholder text once data is received
    const placeholder = profitsCtx.canvas.parentElement.querySelector('.placeholder-text');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
}