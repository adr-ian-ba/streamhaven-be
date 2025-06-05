import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import dotenv from 'dotenv';
import User from '../schema/UserSchema.js';

dotenv.config();
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const serverAddress = process.env.SERVER_ADDRESS


passport.use(new GoogleStrategy({
  clientID: googleClientId,
  clientSecret: googleClientSecret,
  callbackURL: `${serverAddress}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ email: profile.emails[0].value });

    if (!user) {
      user = await User.create({
        username: profile.displayName,
        email: profile.emails[0].value,
        password: "GOOGLE_AUTH", // mark it
        isVerified: true,
        profile: profile.photos[0].value,
        role: "User",
        loginMethod : "google"
      });
    }

    done(null, user);
  } catch (err) {
    done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});
