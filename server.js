require('dotenv').config();
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const shortid = require('shortid');
const validUrl = require('valid-url');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const useragent = require('useragent');

const app = express();

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const ADMIN_EMAIL = 'your-email@gmail.com'; // CHANGE THIS to your email

// --- GOOGLE SHEETS SETUP ---
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);

async function getTable(sheetName) {
    await doc.loadInfo();
    return doc.sheetsByTitle[sheetName];
}

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Auth Middleware to check if user is logged in
const authenticate = async (req, res, next) => {
    const token = req.headers.cookie?.split('token=')[1]?.split(';')[0];
    if (!token) return next(); // Not logged in, continue as guest
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        next();
    }
};
app.use(authenticate);

// --- AUTH ROUTES ---

// Signup
app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userSheet = await getTable('users');
        const rows = await userSheet.getRows();
        if (rows.find(r => r.get('email') === email)) return res.status(400).json({ error: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = shortid.generate();
        
        await userSheet.addRow({ userId, email, password: hashedPassword });
        res.json({ success: 'Account created! Please login.' });
    } catch (err) {
        res.status(500).json({ error: 'Signup failed' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userSheet = await getTable('users');
        const rows = await userSheet.getRows();
        const user = rows.find(r => r.get('email') === email);

        if (!user || !(await bcrypt.compare(password, user.get('password')))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.get('userId'), email: user.get('email') }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true });
        res.json({ success: 'Logged in!' });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- LINK SHORTENING (With Unique Alias Check) ---
app.post('/api/shorten', async (req, res) => {
    const { longUrl, customAlias } = req.body;
    const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;

    if (!validUrl.isUri(longUrl)) return res.status(401).json({ error: 'Invalid URL' });

    try {
        const linkSheet = await getTable('links');
        const rows = await linkSheet.getRows();
        let urlCode;

        if (customAlias && customAlias.trim() !== "") {
            urlCode = customAlias.trim().replace(/\s+/g, '-');
            // Check if alias already exists (The feature you requested)
            if (rows.find(r => r.get('urlCode') === urlCode)) {
                return res.status(409).json({ error: 'Alias already exists. Please choose another.' });
            }
        } else {
            urlCode = shortid.generate();
        }

        const shortUrl = `${baseUrl}/${urlCode}`;
        const qrCode = await QRCode.toDataURL(shortUrl);

        const newLink = {
            urlCode,
            longUrl,
            shortUrl,
            qrCode,
            clicks: 0,
            date: new Date().toISOString(),
            userId: req.user ? req.user.userId : 'guest'
        };

        await linkSheet.addRow(newLink);
        res.json(newLink);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// --- REDIRECT & ANALYTICS ---
app.get('/:code', async (req, res) => {
    try {
        const linkSheet = await getTable('links');
        const rows = await linkSheet.getRows();
        const row = rows.find(r => r.get('urlCode') === req.params.code);

        if (row) {
            // Update Clicks
            row.set('clicks', (parseInt(row.get('clicks')) || 0) + 1);
            row.set('lastClickedAt', new Date().toISOString());
            await row.save();

            // Track Analytics (The feature you requested)
            const agent = useragent.parse(req.headers['user-agent']);
            const analyticsSheet = await getTable('analytics');
            await analyticsSheet.addRow({
                urlCode: req.params.code,
                timestamp: new Date().toISOString(),
                referrer: req.get('referrer') || 'Direct',
                device: agent.device.toString(),
                browser: agent.toAgent(),
                // Country/City requires a GeoIP service, we'll add that in Phase 3
            });

            return res.redirect(row.get('longUrl'));
        }
        res.status(404).render('index', { title: '404 - Not Found' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Phase 1 Active on Port ${PORT}`));

