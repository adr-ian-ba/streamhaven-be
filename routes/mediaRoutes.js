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

  const formattedSeasons = movie.seasons?.map((season) => ({
    ...season,
    poster_path: formatPoster(season.poster_path),
  }));

  return {
    ...movie,
    title: movie.title || movie.name,
    release_date: movie.release_date || movie.first_air_date,
    media_type: resolvedType === "movie" ? "MV" : resolvedType === "tv" ? "SR" : resolvedType,
    poster_path: formatPoster(movie.poster_path),
    backdrop_path: formatBackdrop(movie.backdrop_path),
    genres: movie.genres || genreData,
    genre_ids: undefined,
    seasons: formattedSeasons,
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
router.get("/getmovies/:type/:category?/:page?", async (req, res) => {
  try {
    const { type, category, page } = req.params;

    const movieCategories = {
      "now-playing": "/movie/now_playing",
      "popular": "/movie/popular",
      "trending": "/movie/top_rated",
      "upcoming": "/movie/upcoming",
    };

    const seriesCategories = {
      "top": "/tv/top_rated",
      "popular": "/tv/popular",
      "airing": "/tv/airing_today",
      "next-seven": "/tv/on_the_air",
    };

    if (type === "MV") {
      if (category && page) {
        const endpoint = movieCategories[category];
        if (!endpoint) {
          return res.status(400).json({ message: "Invalid movie category", condition: false });
        }

        const result = await apiHelper.get(`${endpoint}?language=en-US&page=${page}`);
        const finalResult = {
          ...result,
          results: await Promise.all(result.results.map((m) => formatMovie(m, "MV"))),
        };

        return res.status(200).json({ message: "Movie Fetch Success", condition: true, result: finalResult });
      }

      // If no category and page: fetch all default categories
      const [now, popular, top, upcoming] = await Promise.all([
        apiHelper.get("/movie/now_playing?language=en-US&page=1"),
        apiHelper.get("/movie/popular?language=en-US&page=1"),
        apiHelper.get("/movie/top_rated?language=en-US&page=1"),
        apiHelper.get("/movie/upcoming?language=en-US&page=1"),
      ]);

      const result = {
        now: await Promise.all(now.results.map((m) => formatMovie(m, "MV"))),
        popular: await Promise.all(popular.results.map((m) => formatMovie(m, "MV"))),
        top: await Promise.all(top.results.map((m) => formatMovie(m, "MV"))),
        upcoming: await Promise.all(upcoming.results.map((m) => formatMovie(m, "MV"))),
      };

      return res.status(200).json({ message: "Movie Fetch Success", condition: true, result });
    }

    if (type === "SR") {
      if (category && page) {
        const endpoint = seriesCategories[category];
        if (!endpoint) {
          return res.status(400).json({ message: "Invalid series category", condition: false });
        }

        const result = await apiHelper.get(`${endpoint}?language=en-US&page=${page}`);
        const finalResult = {
          ...result,
          results: await Promise.all(result.results.map((s) => formatMovie(s, "SR"))),
        };

        return res.status(200).json({ message: "Series Fetch Success", condition: true, result: finalResult });
      }

      // If no category and page: fetch all default series categories
      const [popular, top, airing, nextSeven] = await Promise.all([
        apiHelper.get("/tv/popular?language=en-US&page=1"),
        apiHelper.get("/tv/top_rated?language=en-US&page=1"),
        apiHelper.get("/tv/airing_today?language=en-US&page=1"),
        apiHelper.get("/tv/on_the_air?language=en-US&page=1"),
      ]);

      const result = {
        popular: await Promise.all(popular.results.map((s) => formatMovie(s, "SR"))),
        top: await Promise.all(top.results.map((s) => formatMovie(s, "SR"))),
        airing: await Promise.all(airing.results.map((s) => formatMovie(s, "SR"))),
        nextSeven: await Promise.all(nextSeven.results.map((s) => formatMovie(s, "SR"))),
      };

      return res.status(200).json({ message: "Series Fetch Success", condition: true, result });
    }

    return res.status(400).json({ message: "Invalid media type", condition: false });

  } catch (error) {
    console.error("Error fetching media:", error);
    res.status(500).json({ message: "Internal server error", condition: false });
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

// ========== Keyword ==========
router.get('/keywords', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ condition: false, message: "Missing query" });

  try {
    const result = await apiHelper.get(`/search/keyword?query=${encodeURIComponent(query)}`);
    res.json({ condition: true, keywords: result.results });
  } catch (err) {
    console.error("Keyword search error:", err);
    res.status(500).json({ condition: false, message: "Failed to fetch keywords" });
  }
});


// ========== Genres ==========
router.get('/genres', async (req, res) => {
  try {
    const genres = await Genre.find({}, { _id: 0, tmdbId: 1, name: 1 }).sort({ name: 1 });
    res.json({ condition: true, genres });
  } catch (err) {
    res.status(500).json({ condition: false, message: "Failed to fetch genres" });
  }
});

// ========== Languages ==========
router.get('/languages', async (req, res) => {
  try {
    const result = await apiHelper.get("/configuration/languages");
    res.json({ condition: true, languages: result });
  } catch (err) {
    res.status(500).json({ condition: false, message: "Failed to fetch languages" });
  }
});

// ========= DISCOVER FILTER =========
router.post('/discover', async (req, res) => {
  const {
    type,
    genres,
    keywords,
    language,
    releaseYear,
    voteAverageGte,
    voteAverageLte,
    runtimeGte,
    runtimeLte,
    includeAdult = false,
    sortBy = "popularity.desc",
    page = 1
  } = req.body;

  try {
    const queryParams = new URLSearchParams({
      sort_by: sortBy,
      include_adult: includeAdult,
      include_video: false,
      page,
      language: "en-US"
    });

    if (genres?.length) queryParams.append("with_genres", genres.join(","));
    if (keywords) queryParams.append("with_keywords", keywords);
    if (language) queryParams.append("with_original_language", language);
    if (releaseYear) queryParams.append("primary_release_year", releaseYear);
    if (voteAverageGte) queryParams.append("vote_average.gte", voteAverageGte);
    if (voteAverageLte) queryParams.append("vote_average.lte", voteAverageLte);
    if (runtimeGte) queryParams.append("with_runtime.gte", runtimeGte);
    if (runtimeLte) queryParams.append("with_runtime.lte", runtimeLte);

    const endpoint = type === "SR" ? `/discover/tv` : `/discover/movie`;
    const raw = await apiHelper.get(`${endpoint}?${queryParams.toString()}`);

    const formatted = await Promise.all(
      (raw.results || []).map(movie => formatMovie(movie, type))
    );

    res.json({
      condition: true,
      result: {
        page: raw.page,
        total_pages: raw.total_pages,
        total_results: raw.total_results,
        results: formatted
      }
    });
  } catch (err) {
    console.error("Discover format error:", err);
    res.status(500).json({ condition: false, message: "Failed to fetch discoveries" });
  }
});



export default router;
