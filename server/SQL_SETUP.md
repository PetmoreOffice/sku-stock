# เตรียมข้อมูล SQL Server

ไฟล์ที่ต้องกรอกคือ `server/sql-settings.json` โดยเปลี่ยนค่าตัวอย่างให้ตรงกับ SQL Server ของบริษัท `sql-settings.example.json` เก็บไว้เป็นต้นฉบับสำหรับคัดลอกใหม่ในภายหลัง

## กรอกส่วน `connection`

- `server`: ชื่อ Server หรือ IP เช่น `10.10.1.25` หรือ `SERVER01\\SQLEXPRESS`
- `database`: ชื่อฐานข้อมูล
- `authentication`: ใช้ `sql` สำหรับ SQL Login หรือเปลี่ยนเป็น `windows` หาก API จะใช้ Windows Authentication
- `username`: ผู้ใช้แบบ **read-only**
- `password`: อย่าใส่รหัสผ่านจริงในไฟล์นี้ ให้เก็บในไฟล์ `.env` ของ backend ตอนเริ่มเชื่อมระบบจริง

## กรอกส่วน `sources`

ใส่ชื่อ View หรือตาราง และชื่อคอลัมน์จริงของแต่ละแหล่งข้อมูล:

| ส่วน | ใช้แสดงในหน้าจอ |
| --- | --- |
| `products` | บาร์โค้ด, SKU, ชื่อสินค้า, หน่วย |
| `stockByBranch` | จำนวนคงเหลือของ SKU แยกสาขา/คลัง |
| `receipts` | ประวัติรับเข้า |
| `transfers` | ประวัติโอนย้าย |

## Mapping ที่ใส่แล้ว

- การสแกนอ้างอิง `GOODSMASTER.GOODS_KEY`
- query สแกนอยู่ที่ `server/queries/product-lookup.sql` และค้นหาด้วย `GOODSMASTER.GOODS_CODE` หรือ `SKUMASTER.SKU_BARCODE`
- รหัส SKU ใช้ `SKUMASTER.SKU_CODE` (key ภายในใช้ `SKUMASTER.SKU_KEY`)
- ชื่อสินค้าใช้ `SKUMASTER.SKU_NAME`
- หน่วยที่สแกนเชื่อมจาก `GOODSMASTER.GOODS_UTQ` ไปยัง `UOFQTY.UTQ_KEY` แล้วแสดง `UOFQTY.UTQ_NAME`; ตัวคูณหน่วยใช้ `UOFQTY.UTQ_QTY`
- Query รับเข้าถูกเก็บที่ `server/queries/receipts.sql`
- Query โอนย้ายถูกเก็บที่ `server/queries/transfers.sql`
- ประวัติรับเข้าและโอนย้ายกรองด้วย `SKUMASTER.SKU_KEY`/`TRANSTKD.TRD_SKU` เพื่อให้บาร์ลัง บาร์ถุง และบาร์ชิ้นของ SKU เดียวกันเห็นประวัติชุดเดียวกัน
- ประเภทเอกสารรับเข้าที่ใช้อยู่: `303` (`ใบรับสินค้าจากการซื้อ`, `ใบรับสินค้าตามใบสั่งซื้อ` และเอกสารรับสินค้ากลุ่มเดียวกัน)
- โอนย้ายใช้ฟิลด์ `DI_REF`, `DI_DATE`, `TRD_SH_QTY`, `TRD_UTQNAME`, `WL_CODE`, และ `TRD_TO_WL`

## การกรองตาม Location

- รายการ Location ดึงจาก `WARELOCATION.WL_CODE` ผ่าน `/api/locations`
- ยอดคงเหลือกรองด้วย `WL_CODE`
- รับเข้ากรองด้วย `WL_CODE`
- โอนย้ายกรองด้วย Location ปลายทาง `TRD_TO_WL`
- ยอดโอนย้ายคำนวณจาก `TRANSTKD.TRD_QTY + TRANSTKD.TRD_Q_FREE`
- ประเภทเอกสารโอนย้ายที่ใช้อยู่: `311, 312` (`ใบโอนย้ายสินค้า` และเอกสารโอนย้ายกลุ่มเดียวกัน)

กรุณาเปลี่ยนทุกค่าที่ขึ้นต้น `TODO_CONFIRM_` ให้เป็นชื่อคอลัมน์หรือค่า `DT_PROPERTIES` จริงก่อนเริ่มเชื่อม API

ควรให้ทีมฐานข้อมูลสร้าง **View แบบอ่านอย่างเดียว** สำหรับทั้ง 4 ส่วน แทนการเปิดสิทธิ์ตรงให้เว็บเข้าถึงตาราง ERP หลัก

## ก่อนเชื่อมจริง

1. กรอกชื่อ Server, Database, View และคอลัมน์จริง
2. ห้าม commit `sql-settings.json` หรือไฟล์ `.env` เพราะอาจมีข้อมูลภายในบริษัท
3. ส่งเฉพาะชื่อ View/คอลัมน์ที่กรอกแล้วมาให้ผม จากนั้นผมจะสร้าง API read-only เพื่อเชื่อมข้อมูลเข้าหน้าจอ

## เริ่ม API โดยไม่เก็บรหัสผ่านใน Git

1. คัดลอก `server/.env.example` เป็น `server/.env`
2. กรอก `DB_PASSWORD` ใน `server/.env` เท่านั้น
3. รัน `npm run dev:api`

ไฟล์ `.env` และ `sql-settings.json` ถูก ignore โดย Git แล้ว ห้ามนำขึ้น remote repository
