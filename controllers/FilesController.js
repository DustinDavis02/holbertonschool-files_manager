/* eslint-disable linebreak-style */
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
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

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { parentId = '0', page = 0 } = req.query;
    const files = await dbClient.db.collection('files')
      .find({ userId: ObjectId(userId), parentId })
      .skip(20 * page)
      .limit(20)
      .toArray();

    return res.status(200).json(files);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const updateResult = await dbClient.db.collection('files').findOneAndUpdate(
      { _id: ObjectId(fileId), userId: ObjectId(userId) },
      { $set: { isPublic: true } },
      { returnOriginal: false },
    );

    if (!updateResult.value) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(updateResult.value);
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const updateResult = await dbClient.db.collection('files').findOneAndUpdate(
      { _id: ObjectId(fileId), userId: ObjectId(userId) },
      { $set: { isPublic: false } },
      { returnOriginal: false },
    );

    if (!updateResult.value) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(updateResult.value);
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const token = req.headers['x-token'];
    const userId = token ? await redisClient.get(`auth_${token}`) : null;

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId) });
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (!file.isPublic && (!userId || file.userId.toString() !== userId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    if (!fs.existsSync(file.localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const mimeType = mime.lookup(file.name) || 'application/octet-stream';
    res.contentType(mimeType);
    fs.createReadStream(file.localPath).pipe(res);

    return null;
  }
}

export default FilesController;
