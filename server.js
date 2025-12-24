require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const shortid = require('shortid');
const validUrl = require('valid-url');
const QRCode = require('qrcode');
const path = require('path');
const Url = require('./models/Url');

const app = express();

// Connect to Database
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

// Middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes

// 1. Home Page (Render the UI)
app.get('/', async (req, res) => {
    res.render('index', { 
        title: 'Shorty - Free Custom URL Shortener',
        baseUrl: process.env.BASE_URL || req.get('host') 
    });
});

// 2. Create Short URL API
app.post('/api/shorten', async (req, res) => {
    const { longUrl, customAlias } = req.body;
    const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;

    if (!validUrl.isUri(longUrl)) {
        return res.status(401).json({ error: 'Invalid URL supplied' });
    }

    try {
        let urlCode;
        
        // Use custom alias if provided, otherwise generate random
        if (customAlias && customAlias.trim() !== "") {
            urlCode = customAlias.trim().replace(/\s+/g, '-');
            const existing = await Url.findOne({ urlCode });
            if (existing) {
                return res.status(400).json({ error: 'Alias already in use' });
            }
        } else {
            urlCode = shortid.generate();
        }

        // Check if long URL already exists (optional, keeping it fresh for this build)
        // Create QR Code
        const shortUrl = `${baseUrl}/${urlCode}`;
        const qrCodeImage = await QRCode.toDataURL(shortUrl);

        const newUrl = new Url({
            urlCode,
            longUrl,
            shortUrl,
            qrCode: qrCodeImage,
            date: new Date()
        });

        await newUrl.save();
        res.json(newUrl);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 3. Redirect Endpoint
app.get('/:code', async (req, res) => {
    try {
        const url = await Url.findOne({ urlCode: req.params.code });

        if (url) {
            // Analytics: Increment click count
            url.clicks++;
            url.save();
            return res.redirect(url.longUrl);
        } else {
            return res.status(404).render('index', { title: '404 - Link Not Found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json('Server error');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
