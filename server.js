require('dotenv').config();
const express = require('express');
const shortid = require('shortid');
const validUrl = require('valid-url');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();
const DATA_FILE = path.join(__dirname, 'links.json');

// --- DATABASE HELPER FUNCTIONS ---

// Ensure links.json exists so the app doesn't crash
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

const getLinks = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

const saveLinks = (links) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(links, null, 2));
};

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- ROUTES ---

// 1. Home Page
app.get('/', async (req, res) => {
    res.render('index', {
        title: 'Shorty - Free Custom URL Shortener',
        baseUrl: process.env.BASE_URL || `https://${req.get('host')}`
    });
});

// 2. Create Short URL API (Keeping all your logic)
app.post('/api/shorten', async (req, res) => {
    const { longUrl, customAlias } = req.body;
    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;

    if (!validUrl.isUri(longUrl)) {
        return res.status(401).json({ error: 'Invalid URL supplied' });
    }

    try {
        let links = getLinks();
        let urlCode;

        // Custom alias logic (Identical to your original code)
        if (customAlias && customAlias.trim() !== "") {
            urlCode = customAlias.trim().replace(/\s+/g, '-');
            const existing = links.find(l => l.urlCode === urlCode);
            if (existing) {
                return res.status(400).json({ error: 'Alias already in use' });
            }
        } else {
            urlCode = shortid.generate();
        }

        const shortUrl = `${baseUrl}/${urlCode}`;
        const qrCodeImage = await QRCode.toDataURL(shortUrl);

        // Create the new link object
        const newUrl = {
            urlCode,
            longUrl,
            shortUrl,
            qrCode: qrCodeImage,
            clicks: 0,
            date: new Date()
        };

        links.push(newUrl);
        saveLinks(links);
        
        res.json(newUrl);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 3. Redirect Endpoint (With Click Analytics)
app.get('/:code', async (req, res) => {
    try {
        let links = getLinks();
        const linkIndex = links.findIndex(l => l.urlCode === req.params.code);

        if (linkIndex !== -1) {
            // Analytics: Increment click count
            links[linkIndex].clicks++;
            saveLinks(links);
            
            return res.redirect(links[linkIndex].longUrl);
        } else {
            return res.status(404).render('index', { title: '404 - Link Not Found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
