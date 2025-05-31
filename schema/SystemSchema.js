import mongoose from "mongoose";

const SystemSchema = new mongoose.Schema({
    donations : {type : Number},
    version : {type : String},
    last_genre_update : {type : Date},
    last_popular_update : {type : Date},
    added_popular_movie : [{
        id : {type : Number, unique : true}
    }],
    added_popular_serie :  [{
        id : {type : Number, unique : true}
    }],
})

const System = mongoose.model("System", SystemSchema);
export default System