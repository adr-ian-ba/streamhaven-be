import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../schema/UserSchema.js';

import dotenv from "dotenv"
dotenv.config();
const jwtSecretKey = process.env.JWT_SECRET_KEY

const router = express.Router();
const salt = 10;

// Middleware: Verify Admin
router.use(async (req, res, next) => {
    try {
        const token = req.headers.authorization;
        if (!token) return res.status(401).json({ message: "No token provided", condition: false });

        const decoded = jwt.verify(token, jwtSecretKey);
        const user = await User.findById(decoded.userId);

        if (!user || user.role !== 'Admin') {
            return res.status(403).json({ message: "Access denied", condition: false });
        }

        req.admin = user;
        next();
    } catch (err) {
        console.error("Admin auth error:", err);
        res.status(401).json({ message: "Unauthorized", condition: false });
    }
});

// ========== Change username ==========
// Change Username
router.post('/user/:id/change-username', async (req, res) => {
  const { newUsername } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ condition: false });

  const exists = await User.findOne({ username: newUsername });
  if (exists) return res.status(200).json({ condition: false, message: "Username taken" });

  user.username = newUsername;
  await user.save();
  res.json({ condition: true, message: "Username updated" });
});


// ========== Reset user password ==========
router.post('/reset-password', async (req, res) => {
    const { userId, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    res.status(200).json({ message: "Password reset successfully" });
});

// ========== Block or unblock user ==========
router.put('/block-user', async (req, res) => {
    const { userId, block } = req.body;

    if (typeof block !== "boolean") {
        return res.status(400).json({ message: "Invalid block value (must be true or false)" });
    }

    await User.findByIdAndUpdate(userId, { isBlocked: block });
    res.status(200).json({ message: `User ${block ? 'blocked' : 'unblocked'} successfully` });
});

// ========== Get all users ==========
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}, 'username email isBlocked role createdAt').sort({ createdAt: -1 });
        res.status(200).json({ message: "User list fetched", users });
    } catch (err) {
        console.error("Fetch users error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

// ========== Promote user to Admin ==========
router.put('/promote-user', async (req, res) => {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "Admin") {
        return res.status(200).json({ message: "User is already an admin" });
    }

    user.role = "Admin";
    await user.save();

    res.status(200).json({ message: "User promoted to Admin successfully" });
});

router.get('/user/:id/history', async (req, res) => {
  const userModel = await import('../schema/UserSchema.js').then(m => m.default);
  const user = await userModel.findById(req.params.id);
  if (!user) return res.status(404).json({ condition: false });

  res.json({ condition: true, history: user.history });
});

router.post('/user/:id/clear-history', async (req, res) => {
  const userModel = await import('../schema/UserSchema.js').then(m => m.default);
  const user = await userModel.findById(req.params.id);
  if (!user) return res.status(404).json({ condition: false });

  user.history = [];
  await user.save();
  res.json({ condition: true, message: "History cleared" });
});

router.post('/user/:id/change-username', async (req, res) => {
  const { newUsername } = req.body;
  const userModel = await import('../schema/UserSchema.js').then(m => m.default);
  const existing = await userModel.findOne({ username: newUsername });
  if (existing) return res.json({ condition: false, message: "Username taken" });

  const user = await userModel.findById(req.params.id);
  if (!user) return res.status(404).json({ condition: false });

  user.username = newUsername;
  await user.save();
  res.json({ condition: true, message: "Username updated" });
});


export default router;
