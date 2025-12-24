document.getElementById('shortenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const longUrl = document.getElementById('longUrl').value;
    const customAlias = document.getElementById('customAlias').value;
    const errorMsg = document.getElementById('error-msg');
    const resultArea = document.getElementById('result-area');

    errorMsg.innerText = '';
    
    try {
        const res = await fetch('/api/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ longUrl, customAlias })
        });

        const data = await res.json();

        if (res.status === 200) {
            resultArea.classList.remove('hidden');
            
            // Update UI
            document.getElementById('shortLink').href = data.shortUrl;
            document.getElementById('shortLink').innerText = data.shortUrl;
            document.getElementById('qrImage').src = data.qrCode;
            document.getElementById('downloadQr').href = data.qrCode;
            document.getElementById('clickCount').innerText = data.clicks;

            // Save to Local Storage History
            saveToHistory(data);
        } else {
            errorMsg.innerText = data.error || 'Something went wrong';
        }

    } catch (err) {
        errorMsg.innerText = 'Server error. Please try again.';
    }
});

document.getElementById('copyBtn').addEventListener('click', () => {
    const text = document.getElementById('shortLink').href;
    navigator.clipboard.writeText(text);
    document.getElementById('copyBtn').innerText = 'Copied!';
    setTimeout(() => document.getElementById('copyBtn').innerText = 'Copy', 2000);
});

function saveToHistory(data) {
    let history = JSON.parse(localStorage.getItem('shortyHistory')) || [];
    history.unshift(data);
    if (history.length > 5) history.pop(); // Keep last 5
    localStorage.setItem('shortyHistory', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('recentList');
    const history = JSON.parse(localStorage.getItem('shortyHistory')) || [];
    
    list.innerHTML = history.map(item => `
        <div class="recent-item">
            <span>${item.urlCode}</span>
            <a href="${item.shortUrl}" target="_blank">${item.shortUrl}</a>
        </div>
    `).join('');
}

// Load history on start
renderHistory();
