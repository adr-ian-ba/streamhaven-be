
import jwt from 'jsonwebtoken';
import User from '../schema/UserSchema.js';

import dotenv from "dotenv"
dotenv.config();

const jwtSecretKey = process.env.JWT_SECRET_KEY



async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization;
    if (!token) {
      return res.status(401).json({ message: "No token provided", condition: false });
    }

    const decoded = jwt.verify(token, jwtSecretKey);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid token", condition: false });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ message: "Unauthorized", condition: false });
  }
}

export default authMiddleware;
