import express from 'express';
import jwt from 'jsonwebtoken';
import Genre from '../schema/GenreSchema.js';
import Media from '../schema/MediaSchema.js';
import ApiHelper from '../utils/ApiHelper.js';
import User from '../schema/UserSchema.js';

import dotenv from "dotenv"
dotenv.config();
const jwtSecretKey = process.env.JWT_SECRET_KEY
const tmdbLink = process.env.TMDB_LINK 
const tmdbApiKey = process.env.TMDB_API_KEY

const router = express.Router();

const apiHelper = new ApiHelper(tmdbLink, tmdbApiKey);

// Auth middleware: admin-only
router.use(async (req, res, next) => {
    try {
        const token = req.headers.authorization;
        if (!token) return res.status(401).json({ message: "No token provided", condition: false });

        const decoded = jwt.verify(token, jwtSecretKey);
        const user = await User.findById(decoded.userId);

        if (!user || user.role !== 'Admin') {
            return res.status(403).json({ message: "Access denied", condition: false });
        }

        req.admin = user;
        next();
    } catch (err) {
        console.error("Admin auth error:", err);
        res.status(401).json({ message: "Unauthorized", condition: false });
    }
});

// ========== Sync Genres ==========
router.get('/genres', async (req, res) => {
    try {
        const [movieGenres, tvGenres] = await Promise.all([
            apiHelper.get("/genre/movie/list?language=en"),
            apiHelper.get("/genre/tv/list?language=en")
        ]);

        const allGenres = [...movieGenres.genres, ...tvGenres.genres];

        await Genre.bulkWrite(
            allGenres.map(genre => ({
                updateOne: {
                    filter: { tmdbId: genre.id },
                    update: { $set: { name: genre.name } },
                    upsert: true
                }
            }))
        );

        res.status(200).json({ message: "Genres updated", count: allGenres.length });
    } catch (err) {
        console.error("Genre sync error:", err);
        res.status(500).json({ message: "Failed to update genres" });
    }
});

// ========== Sync Trending Movies and Series ==========
router.get('/trending', async (req, res) => {
    try {
        const [movieTrending, tvTrending] = await Promise.all([
            apiHelper.get("/trending/movie/day?language=en-US"),
            apiHelper.get("/trending/tv/day?language=en-US")
        ]);

        const movieIds = movieTrending.results.map(item => item.id);
        const tvIds = tvTrending.results.map(item => item.id);
        const allIds = [...movieIds, ...tvIds];

        // Remove outdated entries
        await Media.deleteMany({ id: { $nin: allIds } });

        const movieDetails = await Promise.all(movieIds.map(id => apiHelper.get(`/movie/${id}?language=en-US`)));
        const tvDetails = await Promise.all(tvIds.map(id => apiHelper.get(`/tv/${id}?language=en-US`)));

        const formatPoster = (path) => path ? `https://image.tmdb.org/t/p/w500${path}` : null;

        const formatted = [...movieDetails, ...tvDetails].map(item => ({
            id: item.id,
            title: item.title || item.name,
            media_type: item.title ? "MV" : "SR",
            overview: item.overview,
            genre_ids: item.genres?.map(g => g.id),
            popularity: item.popularity,
            vote_average: item.vote_average,
            vote_count: item.vote_count,
            release_date: item.release_date || item.first_air_date,
            poster_path: formatPoster(item.poster_path),
            updatedAt: new Date()
        }));

        await Media.bulkWrite(
            formatted.map(doc => ({
                updateOne: {
                    filter: { id: doc.id },
                    update: { $set: doc },
                    upsert: true
                }
            }))
        );

        res.status(200).json({ message: "Trending updated", count: formatted.length });
    } catch (err) {
        console.error("Trending sync error:", err);
        res.status(500).json({ message: "Failed to update trending" });
    }
});

router.get('/users', async (req, res) => {
  const users = await import('../schema/UserSchema.js').then(m =>
    m.default.find({}, 'username email role profile createdAt')
  );
  res.json({ condition: true, users });
});

router.post('/promote', async (req, res) => {
  const { userId } = req.body;
  const userModel = await import('../schema/UserSchema.js').then(m => m.default);
  const user = await userModel.findById(userId);
  if (!user) return res.status(404).json({ condition: false, message: "User not found" });

  user.role = "Admin";
  await user.save();
  res.json({ condition: true, message: "User promoted" });
});

router.post('/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;
  const userModel = await import('../schema/UserSchema.js').then(m => m.default);
  const user = await userModel.findById(userId);
  if (!user) return res.status(404).json({ condition: false });

  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();
  res.json({ condition: true, message: "Password changed" });
});

export default router;
