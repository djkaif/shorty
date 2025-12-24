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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// --- GOOGLE SETUP ---
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

const authenticate = (req, res, next) => {
    const token = req.headers.cookie?.split('token=')[1]?.split(';')[0];
    if (!token) { req.user = null; return next(); }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        req.user = null;
        next();
    }
};
app.use(authenticate);

// --- ROUTES ---

// 1. HOME PAGE (MUST BE BEFORE :CODE)
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Shorty - URL Shortener',
        baseUrl: process.env.BASE_URL || `https://${req.get('host')}`,
        user: req.user
    });
});

// 2. SIGNUP
app.post('/api/auth/signup', async (req, res) => {
    const { email, password } = req.body;
    try {
        const sheet = await getTable('users');
        const hashedPassword = await bcrypt.hash(password, 10);
        await sheet.addRow({ userId: shortid.generate(), email, password: hashedPassword });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Signup error' }); }
});

// 3. SHORTEN
app.post('/api/shorten', async (req, res) => {
    const { longUrl, customAlias } = req.body;
    if (!validUrl.isUri(longUrl)) return res.status(400).json({ error: 'Invalid URL' });
    try {
        const sheet = await getTable('links');
        const rows = await sheet.getRows();
        let urlCode = customAlias ? customAlias.trim().replace(/\s+/g, '-') : shortid.generate();
        
        if (rows.find(r => r.get('urlCode') === urlCode)) return res.status(409).json({ error: 'Alias taken' });

        const shortUrl = `${process.env.BASE_URL || 'https://' + req.get('host')}/${urlCode}`;
        const qr = await QRCode.toDataURL(shortUrl);
        const newRow = { urlCode, longUrl, shortUrl, qrCode: qr, clicks: 0, date: new Date().toISOString(), userId: req.user ? req.user.userId : 'guest' };
        await sheet.addRow(newRow);
        res.json(newRow);
    } catch (e) { res.status(500).json({ error: 'Database error' }); }
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});



// 4. REDIRECT (MUST BE LAST)
app.get('/:code', async (req, res) => {
    try {
        const sheet = await getTable('links');
        const rows = await sheet.getRows();
        const row = rows.find(r => r.get('urlCode') === req.params.code);
        if (row) {
            row.set('clicks', (parseInt(row.get('clicks')) || 0) + 1);
            await row.save();
            return res.redirect(row.get('longUrl'));
        }
        res.status(404).send('Not Found');
    } catch (e) { res.status(500).send('Error'); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server running on ' + PORT));
