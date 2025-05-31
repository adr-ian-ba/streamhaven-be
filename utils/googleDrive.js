import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import dotenv from "dotenv"
dotenv.config();

const googleDriveFileId = process.env.GOOGLE_DRIVE_FILE_ID

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KEYFILEPATH = path.join(__dirname, '../snack-nadia-service-acc.json');
const SCOPES = ['https://www.googleapis.com/auth/drive'];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });

export async function uploadToDrive(filePath, fileName) {
  const fileMetadata = {
    name: fileName,
    parents: [googleDriveFileId],
  };

  const media = {
    mimeType: mime.lookup(filePath),
    body: fs.createReadStream(filePath),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id',
  });

  const fileId = response.data.id;

  await drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  fs.unlink(filePath, (err) => {
    if (err) {
      console.warn(`❌ Failed to delete local file ${filePath}`, err.message);
    } else {
      console.log(`🗑️ Deleted local file: ${filePath}`);
    }
  });

  return {
    fileId,
    imageUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
  };
}

export async function deleteFromDrive(fileId) {
  try {
    await drive.files.delete({ fileId });
    console.log(`✅ Deleted file from Google Drive: ${fileId}`);
  } catch (err) {
    console.warn(`❌ Failed to delete file from Google Drive: ${fileId}`, err.message);
    throw err;
  }
}
