import mongoose from "mongoose";

const SeasonSchema = new mongoose.Schema({
    season_number: { type: Number, required: true },
    name: { type: String, required: true },
    episode_count: { type: Number, required: true }
});

const MediaSchema = new mongoose.Schema({
    id: { type: Number, unique: true, required: true, index: true }, 
    media_type: { type: String, enum: ["MV", "SR"], required: true }, 
    title: { type: String, required: true },
    overview: { type: String, default: "" },
    poster_path: { type: String, default: "" },
    backdrop_path: { type: String, default: "" },
    vote_average: { type: Number, default: 0 },
    vote_count: { type: Number, default: 0 },
    genres: [{ id: Number, name: String }],

    release_date: { type: String, default: "" },
    runtime: { type: Number, default: null }, 

    seasons: { type: [SeasonSchema], default: undefined } 
});

const Media = mongoose.model("Media", MediaSchema);

export default Media;
