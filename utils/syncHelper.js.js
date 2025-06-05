import apiHelper from '../utils/ApiHelper.js';
import Genre from '../schema/GenreSchema.js';
import Media from '../schema/MediaSchema.js';

const syncStatus = {
  genres: null,
  trending: null,
};



const ONE_DAY = 24 * 60 * 60 * 1000;

export async function syncIfNeeded() {
  const now = Date.now();

  // === Sync Genres ===
  if (!syncStatus.genres || now - syncStatus.genres > ONE_DAY) {
    try {
      const [movieGenres, tvGenres] = await Promise.all([
        apiHelper.get("/genre/movie/list?language=en"),
        apiHelper.get("/genre/tv/list?language=en"),
      ]);

      const allGenres = [...movieGenres.genres, ...tvGenres.genres];
      await Genre.bulkWrite(
        allGenres.map((genre) => ({
          updateOne: {
            filter: { tmdbId: genre.id },
            update: { $set: { name: genre.name } },
            upsert: true,
          },
        }))
      );

      syncStatus.genres = now;
      console.log("✅ Genres synced");
    } catch (err) {
      console.error("❌ Genre sync failed:", err.message);
    }
  }

  // === Sync Trending ===
  if (!syncStatus.trending || now - syncStatus.trending > ONE_DAY) {
    try {
      const [movieTrending, tvTrending] = await Promise.all([
        apiHelper.get("/trending/movie/day?language=en-US"),
        apiHelper.get("/trending/tv/day?language=en-US"),
      ]);

      const movieIds = movieTrending.results.map((item) => item.id);
      const tvIds = tvTrending.results.map((item) => item.id);
      const allIds = [...movieIds, ...tvIds];

      await Media.deleteMany({ id: { $nin: allIds } });

      const movieDetails = await Promise.all(movieIds.map((id) => apiHelper.get(`/movie/${id}?language=en-US`)));
      const tvDetails = await Promise.all(tvIds.map((id) => apiHelper.get(`/tv/${id}?language=en-US`)));

      const formatPoster = (path) => (path ? `https://image.tmdb.org/t/p/w500${path}` : null);

      const formatted = [...movieDetails, ...tvDetails].map((item) => ({
        id: item.id,
        title: item.title || item.name,
        media_type: item.title ? "MV" : "SR",
        overview: item.overview,
        genres: item.genres || [],
        vote_average: item.vote_average,
        vote_count: item.vote_count,
        release_date: item.release_date || item.first_air_date,
        poster_path: formatPoster(item.poster_path),
        backdrop_path: formatPoster(item.backdrop_path),
        runtime: item.runtime || null,
        seasons: item.seasons || [],
      }));

      await Media.bulkWrite(
        formatted.map((doc) => ({
          updateOne: {
            filter: { id: doc.id },
            update: { $set: doc },
            upsert: true,
          },
        }))
      );

      syncStatus.trending = now;
      console.log(`Trending anf Genre synced at ${now}`);
    } catch (err) {
      console.error(`At ${Date.now()} Trending sync failed:`, err.message);
    }
  }
}
