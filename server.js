require('dotenv').config();
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const shortid = require('shortid');
const validUrl = require('valid-url');
const QRCode = require('qrcode');
const path = require('path');

const app = express();

// --- GOOGLE SHEETS CONNECTION SETUP ---
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
// Parse the full JSON string from your environment variable
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);

// Helper to initialize and get the first sheet
async function getSheet() {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    // Ensure headers exist if sheet is new
    await sheet.setHeaderRow(['urlCode', 'longUrl', 'shortUrl', 'qrCode', 'clicks', 'date']);
    return sheet;
}

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

// 2. Create Short URL API
app.post('/api/shorten', async (req, res) => {
    const { longUrl, customAlias } = req.body;
    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;

    if (!validUrl.isUri(longUrl)) {
        return res.status(401).json({ error: 'Invalid URL supplied' });
    }

    try {
        const sheet = await getSheet();
        const rows = await sheet.getRows();
        let urlCode;

        // Custom alias logic (Preserved from your JSON code)
        if (customAlias && customAlias.trim() !== "") {
            urlCode = customAlias.trim().replace(/\s+/g, '-');
            const existing = rows.find(row => row.get('urlCode') === urlCode);
            if (existing) {
                return res.status(400).json({ error: 'Alias already in use' });
            }
        } else {
            urlCode = shortid.generate();
        }

        const shortUrl = `${baseUrl}/${urlCode}`;
        const qrCodeImage = await QRCode.toDataURL(shortUrl);

        // Add to Google Sheets
        const newRow = {
            urlCode: urlCode,
            longUrl: longUrl,
            shortUrl: shortUrl,
            qrCode: qrCodeImage,
            clicks: 0,
            date: new Date().toLocaleString()
        };

        await sheet.addRow(newRow);

        // Return the same format as before for your frontend
        res.json(newRow);

    } catch (err) {
        console.error('Shorten Error:', err);
        res.status(500).json({ error: 'Server error accessing database' });
    }
});

// 3. Redirect Endpoint (With Click Analytics)
app.get('/:code', async (req, res) => {
    try {
        const sheet = await getSheet();
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get('urlCode') === req.params.code);

        if (row) {
            // Analytics: Increment click count in the sheet
            let currentClicks = parseInt(row.get('clicks')) || 0;
            row.set('clicks', currentClicks + 1);
            await row.save();

            return res.redirect(row.get('longUrl'));
        } else {
            return res.status(404).render('index', { title: '404 - Link Not Found' });
        }
    } catch (err) {
        console.error('Redirect Error:', err);
        res.status(500).send('Server error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} with Google Sheets`));
