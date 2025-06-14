import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import session from 'express-session';
import passport from 'passport';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import syncRoutes from './routes/syncRoutes.js';

import User from './schema/UserSchema.js';

dotenv.config();
const mongodbLink = process.env.MONGODB_CONNECTION_LINK_LEGACY

const app = express();

app.set('trust proxy', 1);
// app.use(cors({
//   origin: '*',
//   credentials: true
// }));




app.use(cors({
  origin: ['https://streamhaven.onrender.com', 'http://localhost:5173', 'https://streamhaven.nusagitra.web.id'],
  credentials: true
}));

// // 👇 Handle preflight requests
// app.options('*', cors({
//   origin: ['https://streamhaven.onrender.com', 'http://localhost:5173', 'https://streamhaven.nusagitra.web.id'],
//   credentials: true
// }));


app.use(session({
  secret: process.env.JWT_SECRET_KEY || "kjsd(#J8f{];vn87(*983rCOUYWN(*);})",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.text());

const globalLimiter = rateLimit({
    windowMs: 10 * 1000,
    max: 20,
    message: { message: "Too many requests, slow down!" },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.log(`🚨 Rate limit exceeded: ${req.ip}`);
        res.status(429).json({ message: "Too many requests, slow down!" });
    }
});

app.use(globalLimiter);

// Attach route handlers
app.use('/auth', authRoutes);
app.use('/user', userRoutes);
app.use('/media', mediaRoutes);
app.use('/admin', adminRoutes);
app.use('/sync', syncRoutes);

app.get('/test', (req, res) => res.send('hehe'));

async function startServer() {
    try {
        await mongoose.connect(mongodbLink, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to DB');
                await User.collection.createIndex(
            { createdAt: 1 },
            {
                expireAfterSeconds: 1296000,
                partialFilterExpression: { isVerified: false }
            }
        );
        console.log('TTL index for unverified users created');

        app.listen(3001, () => console.log('Server started on port 3000'));
    } catch (err) {
        console.error('DB Connection Error:', err);
        process.exit(1);
    }
}

startServer();
