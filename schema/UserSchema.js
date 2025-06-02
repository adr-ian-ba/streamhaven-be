import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username : {type : String, required : true},
    email : {type : String, required: true, unique : true},
    password : {type : String, required : true},
    isVerified : {type:Boolean, default : false},
    haveUploaded : {type : Boolean, default : false},
    joined : {type : Date, default : Date.now},
    isBlocked: { type: Boolean, default: false },
    profile: { type: String, default: "" },
    profileId: { type: String, default: "" },

    role : {
        type : String,
        required : true,
        enum : ["Admin", "User"],
        default : "User"
    },
    history: [
    {
        id: { type: Number, required: true },
        title: String,
        poster_path: String,
        media_type: String,
        watchedAt: { type: Date, default: Date.now } 
    }
    ],

    folders : [
        {
            folder_name : {type : String, required : true},
            saved : [{
                id : {type : Number, required : true},
                poster_path : {type : String},
                title : {type : String},
                overview : {type : String},
                vote_count : {type : Number},
                vote_average : {type : Number},
                media_type : {type : String}
            }]
        }
    ],
    createdAt: { type: Date, default: Date.now }

})

const User = mongoose.model("User", userSchema)
export default User