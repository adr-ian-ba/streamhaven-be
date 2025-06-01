import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import OTP from '../schema/OtpSchema.js';
import User from '../schema/UserSchema.js';
import nodemailer from 'nodemailer';
import { deleteFromDrive } from '../utils/googleDrive.js';
import authMiddleware from '../middleware/authMIddleware.js';

import dotenv from "dotenv"
dotenv.config();

const jwtSecretKey = process.env.JWT_SECRET_KEY
const emailUser = process.env.EMAIL_USER
const emailPass = process.env.EMAIL_PASS
const serverAddress = process.env.SERVER_ADDRESS


const router = express.Router();

const salt = 10;

// Mailer setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass }
});

function createOtp() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}


// ========== DELETE Account ==========
router.delete("/delete-account", authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    if (user.profileId) {
      try {
        await deleteFromDrive(user.profileId);
      } catch (err) {
        console.warn("⚠️ Failed to delete profile picture:", err.message);
      }
    }

    await User.deleteOne({ _id: user._id });

    res.status(200).json({ condition: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ condition: false, message: "Failed to delete account" });
  }
});

// ========== REGISTER ==========
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(200).json({ message: "All fields are required", condition: false });
        }
        if (username.length < 3 || username.length > 15 || /\s/.test(username) || !/^[a-zA-Z0-9._]+$/.test(username)) {
            return res.status(200).json({ message: "Invalid username", condition: false });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(200).json({ message: "Invalid email", condition: false });
        }
        if (password.length < 8) {
            return res.status(200).json({ message: "Password too short", condition: false });
        }

        const normalizedEmail = email.toLowerCase();
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) return res.status(200).json({ message: "Email already registered", condition: false });

        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = await User.create({ username, email: normalizedEmail, password: hashedPassword });

        
        const savedMovie = req.body.savedMovie;

        if (Array.isArray(savedMovie) && savedMovie.length > 0) {
        const validFolders = ["Liked", "Watchlater"];

        savedMovie.forEach(folder => {
            const cleaned = folder.saved.slice(0, 10);

            if (folder.folder_name === "History") {
            // Normalize history structure
            const cleanedHistory = cleaned.map(item => ({
                id: item.id,
                title: item.title,
                poster_path: item.poster_path,
                media_type: item.media_type,
                watchedAt: item.watchedAt || new Date()
            }));

            newUser.history = cleanedHistory;
            } else if (validFolders.includes(folder.folder_name)) {
            newUser.folders.push({ folder_name: folder.folder_name, saved: cleaned });
            }
        });
        } else {
        // No guest data — create empty default folders
        newUser.folders.push({ folder_name: "Liked", saved: [] });
        newUser.folders.push({ folder_name: "Watchlater", saved: [] });
        }


        await newUser.save();


        const otp = await OTP.create({
            userId: newUser._id,
            otp: createOtp(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        const mail = {
        from: emailUser,
        to: newUser.email,
        subject: "Stream Haven – Activate Your Account",
        html: `
            <div style="max-width: 600px; margin: auto; font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center;">
            </div>
            <h2 style="color: #333; text-align: center;">Welcome to Stream Haven 👋</h2>
            <p style="font-size: 16px; color: #444; line-height: 1.5;">
                Thank you for signing up! You're just one step away from joining a community that values <strong>freedom</strong>, <strong>privacy</strong>, and <strong>your voice</strong>.
            </p>
            <p style="font-size: 16px; color: #444; line-height: 1.5;">
                Please click the button below to verify your email and activate your account:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${serverAddress}/verify/${newUser.email}/${otp.otp}" target="_blank" style="background-color: #ff3b3f; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Verify My Account
                </a>
            </div>
            <p style="font-size: 14px; color: #666;">
                If the button doesn't work, copy and paste the following link into your browser:
                <br />
                <a href="${serverAddress}/verify/${newUser.email}/${otp.otp}" style="color: #007BFF;">${serverAddress}/verify/${newUser.email}/${otp.otp}</a>
            </p>
            <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />
            <p style="text-align: center; font-size: 13px; color: #999;">
                &copy; ${new Date().getFullYear()} Stream Haven. All rights reserved.
            </p>
            </div>
        `
        };


        transporter.sendMail(mail);

        res.status(200).json({ message: "User registered. Please check your email.", condition: true });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ========== LOGIN ==========
router.post('/login', async (req, res) => {
    try {
        const { email, password, remember } = req.body;
        const normalizedEmail = email.toLowerCase();

        if (!email || !password) {
            return res.status(200).json({ message: "All fields are required", condition: false });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return res.status(200).json({ message: "No account found", condition: false });
        if (!user.isVerified) return res.status(200).json({ message: "Account not verified", condition: false });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(200).json({ message: "Invalid credentials", condition: false });

        const token = jwt.sign({ userId: user._id }, jwtSecretKey, {
            expiresIn: remember ? '1d' : '30d'
        });

        res.status(200).json({
            message: "Login successful",
            token,
            condition: true
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ========== CHECK AUTH ==========
router.post('/check-auth', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(200).json({ message: "No token provided", condition: false });

        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecretKey);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({ message: "Token expired", condition: false });
            }
            return res.status(401).json({ message: "Invalid token", condition: false });
        }

        const user = await User.findById(decoded.userId);
        if (!user) return res.status(200).json({ message: "Invalid token or user not found", condition: false });

        res.status(200).json({
            message: "User authenticated",
            username: user.username,
            profile : user. profile || "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png",
            condition: true
        });
    } catch (error) {
        console.error("Check-auth error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ========== SEND VERIFY ==========
router.post('/send-verify', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(200).json({ message: "Email not registered", condition: false });
        if (user.isVerified) return res.status(200).json({ message: "Already verified", condition: true });

        let otp = await OTP.findOne({ userId: user._id });
        if (!otp) {
            otp = await OTP.create({
                userId: user._id,
                otp: createOtp(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000)
            });
        }

const mail = {
        from: emailUser,
        to: user.email,
        subject: "Stream Haven – Activate Your Account",
        html: `
            <div style="max-width: 600px; margin: auto; font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center;">
            </div>
            <h2 style="color: #333; text-align: center;">Welcome to Stream Haven 👋</h2>
            <p style="font-size: 16px; color: #444; line-height: 1.5;">
                Thank you for signing up! You're just one step away from joining a community that values <strong>freedom</strong>, <strong>privacy</strong>, and <strong>your voice</strong>.
            </p>
            <p style="font-size: 16px; color: #444; line-height: 1.5;">
                Please click the button below to verify your email and activate your account:
            </p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${serverAddress}/verify/${user.email}/${otp.otp}" target="_blank" style="background-color: #ff3b3f; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Verify My Account
                </a>
            </div>
            <p style="font-size: 14px; color: #666;">
                If the button doesn't work, copy and paste the following link into your browser:
                <br />
                <a href="${serverAddress}/verify/${user.email}/${otp.otp}" style="color: #007BFF;">${serverAddress}/verify/${user.email}/${otp.otp}</a>
            </p>
            <hr style="margin: 40px 0; border: none; border-top: 1px solid #ddd;" />
            <p style="text-align: center; font-size: 13px; color: #999;">
                &copy; ${new Date().getFullYear()} Stream Haven. All rights reserved.
            </p>
            </div>
        `
        };

        transporter.sendMail(mail);

        res.status(200).json({ message: "Verification email sent", condition: true });
    } catch (error) {
        console.error("Send-verify error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// ========== VERIFY (EMAIL) ==========
router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: "Email not registered", condition: false });

    const validOtp = await OTP.findOne({ userId: user._id, otp });
    if (!validOtp) return res.status(200).json({ message: "Invalid or expired OTP", condition: false });

    user.isVerified = true;
    user.createdAt = undefined
    await user.save();
    await OTP.deleteOne({ _id: validOtp._id });

    const token = jwt.sign({ userId: user._id }, jwtSecretKey, { expiresIn: '7d' });

    res.status(200).json({
      message: "Account verified",
      token,
      condition: true
    });
  } catch (error) {
    console.error("Email verify error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ========== VERIFY (PASSWORD RESET) ==========
router.post('/verify-reset', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: "Email not registered", condition: false });

    const validOtp = await OTP.findOne({ userId: user._id, otp });
    if (!validOtp) return res.status(200).json({ message: "Invalid or expired OTP", condition: false });

    if (!newPassword || newPassword.length < 8) {
      return res.status(200).json({ message: "Password too short", condition: false });
    }

    const hashed = await bcrypt.hash(newPassword, salt);
    user.password = hashed;
    await user.save();
    await OTP.deleteOne({ _id: validOtp._id });

    res.status(200).json({ message: "Password reset successful", condition: true });
  } catch (error) {
    console.error("Password reset verify error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// ========== RESET PASSWORD ==========
router.post('/resetpass', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(200).json({ message: "Email not registered", condition: false });

        const otp = await OTP.create({
            userId: user._id,
            otp: createOtp(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        const mail = {
        from: emailUser,
        to: user.email,
        subject: "Stream Haven Password Reset",
        html: `
            <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 24px;">
            <div style="max-width: 600px; margin: auto; background-color: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <h2 style="color: #333;">🔐 Stream Haven Password Reset</h2>
                <p style="color: #555;">We received a request to reset your password. Click the button below to proceed:</p>
                <div style="text-align: center; margin: 30px 0;">
                <a href="https://streamhaven.onrender.com/resetpass/${user.email}/${otp.otp}"
                    style="background-color: #0066ff; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                    Reset My Password
                </a>
                </div>
                <p style="color: #999; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
                <p style="color: #999; font-size: 14px;">This link will expire in 10 minutes.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;">
                <p style="color: #ccc; font-size: 12px; text-align: center;">Stream Haven • streamhaven.onrender.com</p>
            </div>
            </div>
        `
        };


        transporter.sendMail(mail);

        res.status(200).json({
            message: "Password reset link sent if email is registered",
            condition: true
        });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

export default router;
