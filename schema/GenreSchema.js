import mongoose from "mongoose";

const GenreSchema = new mongoose.Schema({
    tmdbId: { type: Number, required: true },
    name: { type: String, required: true }
});


const Genre = mongoose.model("Genre", GenreSchema)
export default Genre