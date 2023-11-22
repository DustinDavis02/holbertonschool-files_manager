/* eslint-disable linebreak-style */
// controllers/FilesController.js
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, parentId = '0', isPublic = false, data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) return res.status(400).json({ error: 'Missing data' });

    // Validate parent ID if provided
    if (parentId !== '0') {
      const parent = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId) });
      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    if (type === 'folder') {
      // Save folder info to DB
      const newFolder = await dbClient.db.collection('files').insertOne({
        userId, name, type, isPublic, parentId,
      });
      return res.status(201).json({
        id: newFolder.insertedId, userId, name, type, isPublic, parentId,
      });
    }
    {
      // Save file or image to disk and DB
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

      const filePath = path.join(folderPath, uuidv4());
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));

      const newFile = await dbClient.db.collection('files').insertOne({
        userId, name, type, isPublic, parentId, localPath: filePath,
      });
      return res.status(201).json({
        id: newFile.insertedId, userId, name, type, isPublic, parentId, localPath: filePath,
      });
    }
  }
}

export default FilesController;
