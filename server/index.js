import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';

const directory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(directory, '.env') });
const settings = JSON.parse(await fs.readFile(path.join(directory, 'sql-settings.json'), 'utf8'));
const queriesDirectory = path.join(directory, 'queries');
let firebaseServiceAccount = null;
try {
  firebaseServiceAccount = JSON.parse(await fs.readFile(path.join(directory, 'firebase-service-account.json'), 'utf8'));
} catch {
  // The file is created locally from Firebase Console and is intentionally ignored by Git.
}
const app = express();
const port = Number(process.env.API_PORT || 3001);
const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS || 'petmoregroups.com,newgenman.co.th')
  .split(',').map((domain) => domain.trim().toLowerCase()).filter(Boolean);

const poolConfig = {
  server: process.env.DB_SERVER || settings.connection.server,
  port: Number(process.env.DB_PORT || settings.connection.port || 1433),
  database: process.env.DB_DATABASE || settings.connection.database,
  user: process.env.DB_USER || settings.connection.username,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT ? process.env.DB_ENCRYPT === 'true' : Boolean(settings.connection.encrypt),
    trustServerCertificate: process.env.DB_TRUST_CERTIFICATE
      ? process.env.DB_TRUST_CERTIFICATE === 'true'
      : Boolean(settings.connection.trustServerCertificate),
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

const pool = new mssql.ConnectionPool(poolConfig);
if (!poolConfig.password) {
  throw new Error('Missing DB_PASSWORD. Add it to server/.env before starting the API.');
}
const poolReady = pool.connect();

const envFirebaseReady = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL
  && process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_CLIENT_EMAIL.startsWith('REPLACE_')
  && !process.env.FIREBASE_PRIVATE_KEY.includes('REPLACE_WITH');
if (!getApps().length && (firebaseServiceAccount || envFirebaseReady)) {
  const serviceAccount = firebaseServiceAccount || {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };
  initializeApp({ credential: cert(serviceAccount) });
}

async function requireAuth(req, res, next) {
  if (!getApps().length) return res.status(503).json({ message: 'ระบบ Login ยังตั้งค่าไม่ครบ' });
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return res.status(401).json({ message: 'กรุณา Login ก่อนใช้งาน' });
  try {
    req.user = await getAuth().verifyIdToken(token);
    const email = String(req.user.email || '').toLowerCase();
    const domain = email.split('@').pop();
    if (!email || !allowedEmailDomains.includes(domain)) {
      return res.status(403).json({ message: 'อีเมลนี้ไม่มีสิทธิ์ใช้งานระบบ' });
    }
    next();
  } catch { res.status(401).json({ message: 'Session หมดอายุ กรุณา Login ใหม่' }); }
}

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5173' }));
app.use(express.json());

async function queryFile(name) {
  return fs.readFile(path.join(queriesDirectory, name), 'utf8');
}

function asGoodsKey(value) {
  const goodsKey = Number(value);
  return Number.isSafeInteger(goodsKey) && goodsKey > 0 ? goodsKey : null;
}

function asLocationCode(value) {
  const locationCode = String(value || '').trim();
  return locationCode && locationCode.length <= 50 ? locationCode : null;
}

app.get('/api/health', async (_req, res) => {
  try {
    await poolReady;
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' });
  }
});

app.get('/api/products/scan/:scanValue', requireAuth, async (req, res, next) => {
  try {
    const scanValue = req.params.scanValue.trim();
    if (!scanValue || scanValue.length > 100) return res.status(400).json({ message: 'รหัสที่สแกนไม่ถูกต้อง' });

    const sql = await queryFile('product-lookup.sql');
    const result = await (await poolReady)
      .request()
      .input('scanValue', mssql.NVarChar(100), scanValue)
      .query(sql);

    if (!result.recordset[0]) return res.status(404).json({ message: 'ไม่พบสินค้า' });
    const item = result.recordset[0];
    res.json({
      goodsKey: item.GOODS_KEY,
      goodsCode: item.GOODS_CODE,
      skuKey: item.SKU_KEY,
      sku: item.SKU_CODE,
      name: item.SKU_NAME,
      barcode: item.SKU_BARCODE,
      scannedUnit: item.SCANNED_UNIT_CODE,
      unitMultiplier: item.UNIT_MULTIPLIER,
    });
  } catch (error) { next(error); }
});

app.get('/api/locations', requireAuth, async (_req, res, next) => {
  try {
    const sql = await queryFile('locations.sql');
    const result = await (await poolReady).request().query(sql);
    res.json(result.recordset.map((row) => row.WL_CODE));
  } catch (error) { next(error); }
});

app.get('/api/products/:goodsKey/stock', requireAuth, async (req, res, next) => {
  try {
    const goodsKey = asGoodsKey(req.params.goodsKey);
    if (!goodsKey) return res.status(400).json({ message: 'รหัสสินค้าไม่ถูกต้อง' });

    const sql = await queryFile('stock-by-location.sql');
    const locationCode = asLocationCode(req.query.location);
    const result = await (await poolReady)
      .request()
      .input('goodsKey', mssql.Int, goodsKey)
      .input('locationCode', mssql.NVarChar(50), locationCode)
      .query(sql);
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.get('/api/products/:goodsKey/history/:kind', requireAuth, async (req, res, next) => {
  try {
    const goodsKey = asGoodsKey(req.params.goodsKey);
    const file = req.params.kind === 'receipts' ? 'receipts.sql' : req.params.kind === 'transfers' ? 'transfers.sql' : null;
    const locationCode = asLocationCode(req.query.location);
    const requestedLimit = Number(req.query.limit);
    const historyLimit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 1000)
      : 20;
    if (!goodsKey || !file) return res.status(400).json({ message: 'คำขอไม่ถูกต้อง' });

    const sql = await queryFile(file);
    const result = await (await poolReady)
      .request()
      .input('goodsKey', mssql.Int, goodsKey)
      .input('historyLimit', mssql.Int, historyLimit)
      .input('locationCode', mssql.NVarChar(50), locationCode)
      .query(sql);
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error('Database request failed:', error.message);
  res.status(500).json({ message: 'ไม่สามารถอ่านข้อมูลจากฐานข้อมูลได้' });
});

app.listen(port, () => console.log(`Read-only API listening on http://127.0.0.1:${port}`));
