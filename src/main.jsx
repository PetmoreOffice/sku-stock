/*
THESIS: A warehouse label, not a transaction screen; scanning reveals proof of stock.
OWN-WORLD: White operational surfaces, ink-navy type, green availability and blue transfer signals.
STORY: Scan, identify the SKU and unit, verify stock by branch, then inspect evidence.
FIRST VIEWPORT: Search field first; product identity and total stock follow without scrolling.
FORM: Handheld one-column evidence card with compact branch rows and segmented history.
*/
import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function formatDate(value) {
  if (!value) return 'ไม่ระบุวันที่';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function mapHistory(rows, kind) {
  return rows.map((row) => ({
    date: formatDate(row.DI_DATE),
    time: formatTime(row.DI_DATE),
    title: kind === 'receipt' ? (row.TRD_SH_REMARK || 'รับเข้า') : `${row.WL_CODE || 'ไม่ระบุต้นทาง'} → ${row.TRD_TO_WL || 'ไม่ระบุปลายทาง'}`,
    ref: row.DI_REF || 'ไม่ระบุเลขเอกสาร',
    location: kind === 'receipt' ? (row.WL_CODE || 'ไม่ระบุคลัง') : 'โอนย้าย',
    amount: Number(row.TRD_SH_QTY || 0).toLocaleString('th-TH'),
    unit: row.TRD_UTQNAME || '',
  }));
}

function Icon({ name, size = 24, stroke = 1.9 }) {
  const paths = {
    scan: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 10v4M10 9v6M13 10v4M16 9v6"/></>,
    box: <><path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></>,
    search: <><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 2"/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
    home: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9Z"/><path d="M9 21v-7h6v7"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function App() {
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState(null);
  const [tab, setTab] = useState('receipt');
  const [records, setRecords] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [stockLoading, setStockLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const totalStock = useMemo(() => stockRows.reduce((sum, row) => sum + Number(row.QTY || 0), 0), [stockRows]);
  const stockUnit = stockRows[0]?.UTQ_NAME || product?.scannedUnit || '';

  const formatQuantity = (value) => Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 4 });

  const loadHistory = async (goodsKey, kind) => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/products/${goodsKey}/history/${kind === 'receipt' ? 'receipts' : 'transfers'}`);
      if (!response.ok) throw new Error('ไม่สามารถอ่านประวัติรายการได้');
      setRecords(mapHistory(await response.json(), kind));
    } catch (requestError) {
      setRecords([]);
      setError(requestError.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadStock = async (goodsKey) => {
    setStockLoading(true);
    try {
      const response = await fetch(`/api/products/${goodsKey}/stock`);
      if (!response.ok) throw new Error('ไม่สามารถอ่านยอดคงเหลือได้');
      setStockRows(await response.json());
    } catch (requestError) {
      setStockRows([]);
      setError(requestError.message);
    } finally {
      setStockLoading(false);
    }
  };

  const search = async (event) => {
    event.preventDefault();
    const scanValue = query.trim();
    if (!scanValue) return setError('กรุณาสแกนหรือพิมพ์รหัสสินค้าก่อนค้นหา');
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/products/scan/${encodeURIComponent(scanValue)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'ไม่สามารถค้นหาสินค้าได้');
      setProduct(data);
      setTab('receipt');
      await Promise.all([loadHistory(data.goodsKey, 'receipt'), loadStock(data.goodsKey)]);
    } catch (requestError) {
      setProduct(null);
      setRecords([]);
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setQuery('');
    setProduct(null);
    setRecords([]);
    setStockRows([]);
    setError('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">คลังสินค้า</p>
        <h1>ตรวจสอบสต็อก</h1>
      </div>
      <button className="icon-button" aria-label="ดูประวัติการค้นหา"><Icon name="history" /></button>
    </header>

    <form className="scan-form" onSubmit={search}>
      <label htmlFor="sku-search">สแกนหรือค้นหา SKU</label>
      <div className="scan-input-wrap">
        <Icon name="scan" size={25} />
        <input ref={inputRef} id="sku-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="สแกนบาร์โค้ด หรือพิมพ์ SKU" autoComplete="off" />
        {query && <button type="button" className="clear-button" onClick={reset} aria-label="ล้างคำค้น"><Icon name="close" size={20} /></button>}
      </div>
      <p className="hint">รองรับการสแกนจาก Handheld และค้นหาด้วยรหัสสินค้า</p>
    </form>

    {error && <p className="error-message" role="alert">{error}</p>}

    {!product && !loading && <section className="empty-state">
      <div className="empty-icon"><Icon name="scan" size={28} /></div>
      <h2>พร้อมสแกนสินค้า</h2>
      <p>สแกนบาร์โค้ด หรือพิมพ์ SKU เพื่อดูจำนวนคงเหลือและประวัติรายการ</p>
    </section>}

    {loading && <section className="empty-state"><div className="empty-icon loading"><Icon name="scan" size={28} /></div><h2>กำลังค้นหาสินค้า</h2><p>กำลังอ่านข้อมูลจากระบบคลังสินค้า</p></section>}

    {product && <>
      <section className="product-card" aria-labelledby="product-name">
        <div className="product-symbol"><Icon name="box" size={31} /></div>
        <div className="product-main">
          <p className="status"><span />พบสินค้า</p>
          <h2 id="product-name">{product.name}</h2>
          <p className="sku">{product.sku}</p>
        </div>
        <div className="unit-block">
          <span>หน่วยที่สแกน</span>
          <strong>{product.scannedUnit}</strong>
        </div>
      </section>

      <section className="stock-section" aria-labelledby="stock-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">คงเหลือทุกสาขา</p>
            <h2 id="stock-title">{stockLoading ? '…' : formatQuantity(totalStock)} <span>{stockLoading ? '' : stockUnit}</span></h2>
          </div>
          <p className="updated">คงเหลือทุก<br/><strong>Location</strong></p>
        </div>
        <p className="conversion">หน่วยที่สแกน: <strong>{product.scannedUnit}</strong> <span>•</span> 1 หน่วย = {Number(product.unitMultiplier || 1).toLocaleString('th-TH')} หน่วยย่อย</p>
        <div className="branch-list">
          {stockLoading && <p className="history-status">กำลังอ่านยอดคงเหลือ…</p>}
          {!stockLoading && stockRows.length === 0 && <p className="history-status">ไม่พบยอดคงเหลือใน Location</p>}
          {!stockLoading && stockRows.map((row) => <article className="branch-row" key={row.WL_CODE}>
            <span className="availability main" />
            <span className="branch-name"><strong>{row.WL_CODE}</strong><small>Warehouse Location</small></span>
            <span className="branch-amount"><strong>{formatQuantity(row.QTY)}</strong><small>{row.UTQ_NAME}</small></span>
            <Icon name="chevron" size={19} stroke={1.7} />
          </article>)}
        </div>
      </section>

      <section className="history-section" aria-labelledby="history-title">
        <div className="history-heading"><h2 id="history-title">ประวัติรายการล่าสุด</h2><span>ข้อมูลตัวอย่าง</span></div>
        <div className="tabs" role="tablist" aria-label="เลือกประเภทประวัติ">
          <button className={tab === 'receipt' ? 'active receipt' : ''} onClick={() => { setTab('receipt'); loadHistory(product.goodsKey, 'receipt'); }} role="tab" aria-selected={tab === 'receipt'}>รับเข้า</button>
          <button className={tab === 'transfer' ? 'active transfer' : ''} onClick={() => { setTab('transfer'); loadHistory(product.goodsKey, 'transfer'); }} role="tab" aria-selected={tab === 'transfer'}>โอนย้าย</button>
        </div>
        <div className="records">
          {historyLoading && <p className="history-status">กำลังอ่านประวัติรายการ…</p>}
          {!historyLoading && records.length === 0 && <p className="history-status">ไม่พบประวัติ{tab === 'receipt' ? 'รับเข้า' : 'โอนย้าย'}ของสินค้านี้</p>}
          {!historyLoading && records.map((entry, index) => <article className="record" key={`${entry.ref}-${index}`}>
            <time><strong>{entry.date}</strong><span>{entry.time} น.</span></time>
            <div className="record-detail"><strong>{entry.title}</strong><span>{entry.ref} · {entry.location}</span></div>
            <div className={`record-amount ${tab}`}><strong>{entry.amount}</strong><span>{entry.unit}</span></div>
          </article>)}
        </div>
        <button className="all-history" onClick={() => alert('หน้าประวัติทั้งหมดจะเชื่อมต่อเมื่อกำหนดขอบเขตข้อมูลเรียบร้อย')}>ดูประวัติทั้งหมด <Icon name="chevron" size={18} /></button>
      </section>
    </>}

    <nav className="bottom-nav" aria-label="เมนูหลัก">
      <button><Icon name="home" size={21}/><span>หน้าหลัก</span></button>
      <button className="selected"><Icon name="scan" size={21}/><span>สแกน</span></button>
      <button><Icon name="list" size={21}/><span>รายการ</span></button>
    </nav>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
