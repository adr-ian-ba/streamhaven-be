import mongoose from "mongoose";

const OtpSchema = new mongoose.Schema({
    userId : {type : mongoose.Schema.Types.ObjectId, ref: "User", required : true},
    otp : {type : String, required : true},
    expiresAt: { type: Date, required: true, index: { expires: '10m' } }
})

const OTP = mongoose.model("OTP", OtpSchema)
export default OTP