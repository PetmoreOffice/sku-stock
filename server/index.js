import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mssql from 'mssql';
import 'dotenv/config';

const directory = path.dirname(fileURLToPath(import.meta.url));
const settings = JSON.parse(await fs.readFile(path.join(directory, 'sql-settings.json'), 'utf8'));
const queriesDirectory = path.join(directory, 'queries');
const app = express();
const port = Number(process.env.API_PORT || 3001);

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

app.use(cors({ origin: process.env.WEB_ORIGIN || 'http://127.0.0.1:5173' }));
app.use(express.json());

async function queryFile(name) {
  return fs.readFile(path.join(queriesDirectory, name), 'utf8');
}

function asGoodsKey(value) {
  const goodsKey = Number(value);
  return Number.isSafeInteger(goodsKey) && goodsKey > 0 ? goodsKey : null;
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

app.get('/api/products/scan/:scanValue', async (req, res, next) => {
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

app.get('/api/products/:goodsKey/stock', async (req, res, next) => {
  try {
    const goodsKey = asGoodsKey(req.params.goodsKey);
    if (!goodsKey) return res.status(400).json({ message: 'รหัสสินค้าไม่ถูกต้อง' });

    const sql = await queryFile('stock-by-location.sql');
    const result = await (await poolReady)
      .request()
      .input('goodsKey', mssql.Int, goodsKey)
      .input('historyLimit', mssql.Int, 20)
      .query(sql);
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.get('/api/products/:goodsKey/history/:kind', async (req, res, next) => {
  try {
    const goodsKey = asGoodsKey(req.params.goodsKey);
    const file = req.params.kind === 'receipts' ? 'receipts.sql' : req.params.kind === 'transfers' ? 'transfers.sql' : null;
    if (!goodsKey || !file) return res.status(400).json({ message: 'คำขอไม่ถูกต้อง' });

    const sql = await queryFile(file);
    const result = await (await poolReady)
      .request()
      .input('goodsKey', mssql.Int, goodsKey)
      .query(sql);
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error('Database request failed:', error.message);
  res.status(500).json({ message: 'ไม่สามารถอ่านข้อมูลจากฐานข้อมูลได้' });
});

app.listen(port, () => console.log(`Read-only API listening on http://127.0.0.1:${port}`));
