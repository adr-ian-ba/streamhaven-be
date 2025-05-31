import express from 'express';
import Media from '../schema/MediaSchema.js';
import Genre from '../schema/GenreSchema.js';
import ApiHelper from '../utils/ApiHelper.js';

import dotenv from "dotenv"
dotenv.config();

const tmdbLink = process.env.TMDB_LINK 
const tmdbApiKey = process.env.TMDB_API_KEY
const tmdbImageLink = process.env.TMDB_IMAGE_LINK

const router = express.Router();

const apiHelper = new ApiHelper(tmdbLink, tmdbApiKey);

// Helpers
function formatPoster(path) {
    return path ? `${tmdbImageLink}w500${path}` : "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";
}
function formatBackdrop(path) {
    return path ? `${tmdbImageLink}w1280${path}` : "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";
}

const formatMovie = async (movie, type) => {
  const getGenresByIds = async (genreIds) => {
    const genres = await Genre.find({ tmdbId: { $in: genreIds || [] } }).lean();
    return genres.map(g => ({ id: g.tmdbId, name: g.name }));
  };

  const resolvedType = String(type || movie.media_type);
  const genreData = await getGenresByIds(movie.genre_ids);

  let formattedRecommendations = [];
  if (movie.recommendations?.results?.length) {
    formattedRecommendations = await Promise.all(
      movie.recommendations.results.map((rec) => formatMovie(rec, rec.media_type || "MV"))
    );
  }

  return {
    ...movie,
    title: movie.title || movie.name,
    release_date: movie.release_date || movie.first_air_date,
    media_type: resolvedType === "movie" ? "MV" : resolvedType === "tv" ? "SR" : resolvedType,
    poster_path: formatPoster(movie.poster_path),
    backdrop_path: formatBackdrop(movie.backdrop_path),
    genres: movie.genres || genreData,
    genre_ids: undefined,
    recommendations: formattedRecommendations.length ? formattedRecommendations : undefined
  };
};


// ========== Get trending from DB ==========
router.get('/getmovie', async (req, res) => {
    try {
        const movies = await Media.find({ media_type: "MV" }).lean();
        const series = await Media.find({ media_type: "SR" }).lean();
        res.status(200).json({
            message: "Success",
            condition: true,
            result: { trendingMovies: movies, trendingSeries: series }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching media", condition: false });
    }
});

// ========== Get movie detail ==========
router.get('/get-detail/:id/:type/:ss?', async (req, res) => {
    const { id, type, ss } = req.params;
    try {
        let result;
        if (type === 'MV') {
            result = await apiHelper.get(`/movie/${id}?append_to_response=recommendations&language=en-US`);
        } else if (type === 'SR') {
            const detail = await apiHelper.get(`/tv/${id}?append_to_response=recommendations&language=en-US`);
            const season = await apiHelper.get(`/tv/${id}/season/${ss || 1}?language=en-US`);
            result = { ...detail, ...season };
        }

        const formatted = await formatMovie(result, type);
        res.status(200).json({ message: "Success", condition: true, result: formatted });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching detail", condition: false });
    }
});

// ========== Get movies/series list ==========
router.get('/getmovies/:type/:category?/:page?', async (req, res) => {
    const { type, category, page } = req.params;

    try {
        const buildResult = async (endpoint, mediaType) => {
            const result = await apiHelper.get(endpoint);
            const formatted = await Promise.all(result.results.map(m => formatMovie(m, mediaType)));
            return { ...result, results: formatted };
        };

        if (type === "MV") {
            if (category && page) {
                let endpoint = `/movie/${category}?language=en-US&page=${page}`;
                if (category === "trending") endpoint = `/movie/top_rated?language=en-US&page=${page}`;
                const data = await buildResult(endpoint, "MV");
                return res.status(200).json({ message: "Success", condition: true, result: data });
            } else {
                const [now, popular, top, upcoming] = await Promise.all([
                    buildResult("/movie/now_playing?language=en-US&page=1", "MV"),
                    buildResult("/movie/popular?language=en-US&page=1", "MV"),
                    buildResult("/movie/top_rated?language=en-US&page=1", "MV"),
                    buildResult("/movie/upcoming?language=en-US&page=1", "MV")
                ]);
                return res.status(200).json({ message: "Success", condition: true, result: { now: now.results, popular: popular.results, top: top.results, upcoming: upcoming.results } });
            }
        } else if (type === "SR") {
            if (category && page) {
                let endpoint = `/tv/${category}?language=en-US&page=${page}`;
                if (category === "top") endpoint = `/tv/top_rated?language=en-US&page=${page}`;
                const data = await buildResult(endpoint, "SR");
                return res.status(200).json({ message: "Success", condition: true, result: data });
            } else {
                const [popular, top, airing, nextSeven] = await Promise.all([
                    buildResult("/tv/popular?language=en-US&page=1", "SR"),
                    buildResult("/tv/top_rated?language=en-US&page=1", "SR"),
                    buildResult("/tv/airing_today?language=en-US&page=1", "SR"),
                    buildResult("/tv/on_the_air?language=en-US&page=1", "SR")
                ]);
                return res.status(200).json({ message: "Success", condition: true, result: { popular: popular.results, top: top.results, airing: airing.results, nextSeven: nextSeven.results } });
            }
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching list", condition: false });
    }
});

// ========== Search ==========
router.get('/search/:page?', async (req, res) => {
    const query = req.query.query;
    const page = req.params.page || 1;

    if (!query) return res.status(400).json({ message: "No search query provided", condition: false });

    try {
        const result = await apiHelper.get(`/search/multi?query=${query}&include_adult=false&language=en-US&page=${page}`);
        const filtered = result.results.filter(r => r.media_type !== "person");
        const formatted = await Promise.all(filtered.map(r => formatMovie(r)));

        const finalResponse = {
            total_pages: result.total_pages,
            total_results: result.total_results,
            results: formatted
        };
        res.status(200).json({ message: "Search success", condition: true, result: finalResponse });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Search failed", condition: false });
    }
});

export default router;
