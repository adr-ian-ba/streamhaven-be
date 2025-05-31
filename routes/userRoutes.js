import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import User from '../schema/UserSchema.js';
import { uploadToDrive, deleteFromDrive } from '../utils/googleDrive.js';
import authMiddleware from '../middleware/authMIddleware.js';


const router = express.Router();

// Ensure uploads directory exists
const uploadPath = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Define custom storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user._id}${ext}`);
  }
});

// File filter for JPEG and PNG
const fileFilter = (req, file, cb) => {
  if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
    return cb(new Error("Only JPG and PNG are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });



function formatPoster(posterPath) {
    return posterPath
        ? `https://image.tmdb.org/t/p/w500${posterPath}`
        : "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg";
}



// ========== check username exist ==========
router.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;

  if (!username || username.length < 3 || username.length > 15 || /\s/.test(username)) {
    return res.status(400).json({ condition: false, message: "Invalid username" });
  }

  const exists = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });

  if (exists) {
    return res.status(200).json({ condition: false, message: "Username is taken" });
  }

  return res.status(200).json({ condition: true, message: "Username is available" });
});


// ========== change username ==========
router.post('/change-username', authMiddleware, async (req, res) => {
  const { username } = req.body;

  if (!username || username.length < 3 || username.length > 15 || /\s/.test(username)) {
    return res.status(400).json({ condition: false, message: "Invalid username" });
  }

  const exists = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, "i") } });
  if (exists) {
    return res.status(400).json({ condition: false, message: "Username already in use" });
  }

  req.user.username = username;
  await req.user.save();

  return res.status(200).json({ condition: true, message: "Username updated", username });
});


// ========== Get saved movies ==========
router.get('/getsavedmovie', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("folders").lean();

    const folders = user?.folders || [];

    const transformed = folders.map(folder => ({
      ...folder,
      saved: folder.saved.map(movie => ({
        ...movie,
        poster_path: formatPoster(movie.poster_path)
      }))
    }));

    res.status(200).json({
      message: "Success",
      condition: true,
      folders: transformed
    });
  } catch (error) {
    console.error("Error fetching folders:", error);
    res.status(500).json({
      message: "Internal Server Error",
      condition: false
    });
  }
});


// ========== Get folder list ==========
router.get('/userfolder', authMiddleware, async (req, res) => {
    const folders = req.user.folders?.map(({ folder_name, _id, saved }) => ({
        folder_name,
        _id,
        saved: saved.map(m => ({ id: m.id }))
    })) || [];
    res.status(200).json({ message: "Success", condition: true, folders });
});

// ========== Add folder ==========
router.post('/addfolder', authMiddleware, async (req, res) => {
    const { folder_name } = req.body;

    if (!folder_name || folder_name.includes(" ") || folder_name.length > 10) {
        return res.status(200).json({ message: "Invalid folder name", condition: false });
    }

    if (req.user.folders.length >= 5) {
        return res.status(200).json({ message: "Folder limit reached", condition: false });
    }

    req.user.folders.push({ folder_name, saved: [] });
    await req.user.save();
    res.status(200).json({ message: "Folder added", condition: true });
});

// ========== Delete folder ==========
router.post('/deletefolder', authMiddleware, async (req, res) => {
    const { folderId } = req.body;
    req.user.folders = req.user.folders.filter(f => f._id.toString() !== folderId);
    await req.user.save();
    res.status(200).json({ message: "Folder deleted", condition: true });
});

// ========== Save movie ==========
router.post('/savemovie', authMiddleware, async (req, res) => {
    const { folderId, movie } = req.body;
    const folder = req.user.folders.find(f => f._id.toString() === folderId);

    if (!folder) return res.status(200).json({ message: "Folder not found", condition: false });

    const exists = folder.saved.some(m => m.id === movie.id);
    if (exists) return res.status(200).json({ message: "Movie already saved", condition: false });

    folder.saved.push(movie);
    await req.user.save();
    res.status(200).json({ message: "Movie saved", condition: true });
});

// ========== Unsave movie ==========
router.post('/unsavemovie', authMiddleware, async (req, res) => {
    const { folderId, movieId } = req.body;
    console.log(folderId, movieId)
    const folder = req.user.folders.find(f => f._id.toString() === folderId);

    if (!folder) return res.status(200).json({ message: "Folder not found", condition: false });

    const initialLength = folder.saved.length;
    folder.saved = folder.saved.filter(m => m.id !== movieId);

    if (folder.saved.length === initialLength) {
        return res.status(200).json({ message: "Movie not found", condition: false });
    }

    await req.user.save();

    const updatedFolder = {
      ...folder.toObject(),
      saved: folder.saved.map(m => ({
        ...m,
        poster_path: formatPoster(m.poster_path),
      })),
    };

  return res.status(200).json({
    message: "Movie removed",
    condition: true,
    updatedFolder
  });
});


// ========== add history ==========
router.post('/addhistory', authMiddleware, async (req, res) => {
  const { movie } = req.body;

  if (!movie || !movie.id || !movie.media_type || !movie.title || !movie.poster_path) {
    return res.status(400).json({ message: "Incomplete movie data", condition: false });
  }

  const user = await User.findById(req.user._id);
  if (!user.history) user.history = [];

  const movieId = Number(movie.id);
  const mediaType = String(movie.media_type).toUpperCase(); 

  user.history = user.history.filter(
    (entry) => !(entry.id === movieId && entry.media_type === mediaType)
  );

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  user.history = user.history.filter((entry) => entry.watchedAt > sevenDaysAgo);

  if (user.history.length >= 50) {
    user.history.pop();
  }

  user.history.unshift({
    id: movieId,
    title: movie.title,
    poster_path: movie.poster_path,
    media_type: mediaType,
    watchedAt: new Date(),
  });

  await user.save();

  res.status(200).json({ message: "History updated", condition: true });
});



// ========== get history ==========
router.get('/gethistory', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id).select("history").lean();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filtered = user.history.filter(h => new Date(h.watchedAt) > sevenDaysAgo);

  res.status(200).json({ message: "History fetched", condition: true, result: filtered });
});

// ========== delete history ==========
router.post('/deletehistory', authMiddleware, async (req, res) => {
  const { movieId } = req.body;

  if (!movieId) {
    return res.status(400).json({ message: "Missing movieId", condition: false });
  }

  const user = await User.findById(req.user._id);
  const initialLength = user.history.length;

  user.history = user.history.filter(m => m.id !== movieId);

  if (user.history.length === initialLength) {
    return res.status(200).json({ message: "Movie not found in history", condition: false });
  }

  await user.save();
  res.status(200).json({ message: "History item deleted", condition: true });
});

// ========== clear history ==========
router.post('/clearhistory', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user._id);

  user.history = [];
  await user.save();

  res.status(200).json({ message: "All history cleared", condition: true });
});

// ========== upload avatar ==========
router.post('/upload-avatar', authMiddleware, upload.single("avatar"), async (req, res) => {
  const filePath = req.file.path;
  const fileName = `avatar-${req.user._id}.jpg`;

  try {
    if (req.user.profileId) {
      await deleteFromDrive(req.user.profileId);
    }

    const { imageUrl, fileId } = await uploadToDrive(filePath, fileName);

    req.user.profile = imageUrl;
    req.user.profileId = fileId;
    await req.user.save();

    res.status(200).json({
      condition: true,
      message: "Profile image updated",
      profile: imageUrl,
    });
  } catch (err) {
    console.error("Upload avatar error:", err);
    res.status(500).json({ condition: false, message: "Upload failed" });
  }
});

// ========== Delete Avatar ==========
router.delete('/delete-avatar', authMiddleware, async (req, res) => {
  try {
    if (!req.user.profileId) {
      return res.status(400).json({ condition: false, message: "No avatar to delete" });
    }

    await deleteFromDrive(req.user.profileId);

    req.user.profile = undefined;
    req.user.profileId = undefined;
    await req.user.save();

    res.status(200).json({ condition: true, message: "Profile avatar deleted" });
  } catch (err) {
    console.error("Delete avatar error:", err);
    res.status(500).json({ condition: false, message: "Failed to delete avatar" });
  }
});



export default router;
