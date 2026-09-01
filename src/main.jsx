/*
THESIS: A warehouse control room, not a transaction screen; login establishes a focused read-only station.
OWN-WORLD: White operational surfaces, ink-navy type, green availability and blue transfer signals.
STORY: Scan, identify the SKU and unit, verify stock by branch, then inspect evidence.
FIRST VIEWPORT: Search field first; product identity and total stock follow without scrolling.
FORM: Handheld one-column evidence card with compact branch rows and segmented history.
*/
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from './firebase';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/noto-sans-thai/700.css';
import '@fontsource/noto-sans-thai/800.css';
import './styles.css';

function formatDate(value) {
  if (!value) return 'ไม่ระบุวันที่';
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function apiErrorMessage(response, fallback) {
  if (response.status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
  if (response.status === 403) return 'บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลดังกล่าว';
  if (response.status >= 500) return 'เชื่อมต่อระบบคลังสินค้าไม่ได้ โปรดลองใหม่';
  return fallback;
}

function friendlyRequestError(error, fallback) {
  if (/failed to fetch|network|networkerror|unexpected token|unexpected end/i.test(error?.message || '')) return 'เชื่อมต่อระบบคลังสินค้าไม่ได้ โปรดลองใหม่';
  return error?.message || fallback;
}

function mapHistory(rows, kind) {
  return rows.map((row) => ({
    kind,
    timestamp: new Date(row.DI_DATE).getTime() || 0,
    date: formatDate(row.DI_DATE),
    title: kind === 'receipt' ? (row.TRD_SH_REMARK || 'รับเข้า') : `ปลายทาง: ${row.TRD_TO_WL || 'ไม่ระบุ'}`,
    ref: row.DI_REF || 'ไม่ระบุเลขเอกสาร',
    location: kind === 'receipt' ? (row.WL_CODE || 'ไม่ระบุคลัง') : 'โอนย้าย',
    expiry: row.TRD_EXP_D ? formatDate(row.TRD_EXP_D) : '',
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
    back: <path d="m15 18-6-6 6-6"/>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    logout: <><path d="M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5"/><path d="m15 16 4-4-4-4M19 12H9"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function AccountMenu({ email, menuOpen, confirmOpen, onCloseMenu, onRequestSignOut, onCancelSignOut, onConfirmSignOut }) {
  return <>
    {menuOpen && <div className="sheet-backdrop" onClick={onCloseMenu}>
      <section className="account-sheet" role="dialog" aria-modal="true" aria-label="เมนูบัญชี" onClick={(event) => event.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <p className="eyebrow">บัญชีที่ใช้งาน</p>
        <p className="account-email">{email}</p>
        <button className="signout-action" type="button" onClick={onRequestSignOut}><Icon name="logout" size={20}/><span><strong>ออกจากระบบ</strong><small>จะมีการยืนยันอีกครั้ง</small></span><Icon name="chevron" size={18}/></button>
        <button className="sheet-cancel" type="button" onClick={onCloseMenu}>ปิดเมนู</button>
      </section>
    </div>}
    {confirmOpen && <div className="dialog-backdrop" role="presentation">
      <section className="signout-dialog" role="dialog" aria-modal="true" aria-labelledby="signout-title">
        <div className="signout-dialog-icon"><Icon name="logout" size={23}/></div>
        <h2 id="signout-title">ออกจากระบบ?</h2>
        <p>หากออกจากระบบ ต้องกรอกอีเมลและรหัสผ่านอีกครั้งก่อนใช้งาน</p>
        <div className="dialog-actions"><button type="button" onClick={onCancelSignOut}>ยกเลิก</button><button className="confirm-signout" type="button" onClick={onConfirmSignOut}>ออกจากระบบ</button></div>
      </section>
    </div>}
  </>;
}

function ErrorNotice({ message, onRetry, retrying = false }) {
  return <div className="error-message" role="alert">
    <span>{message}</span>
    {onRetry && <button type="button" onClick={onRetry} disabled={retrying}>{retrying ? 'กำลังลองใหม่…' : 'ลองใหม่'}</button>}
  </div>;
}

function HistoryRecordDetail({ entry }) {
  const isReceipt = entry.kind === 'receipt';
  return <div className="record-detail expiry-detail">
    <strong className={`expiry-primary${entry.expiry ? '' : ' missing'}`}>หมดอายุ: {entry.expiry || 'ไม่ระบุ'}</strong>
    <span className="record-reference" title={entry.title}>{isReceipt ? `อ้างอิง: ${entry.title}` : entry.title}</span>
    <span className="record-meta">{isReceipt ? `${entry.ref} · ${entry.location}` : `อ้างอิง: ${entry.ref}`}</span>
  </div>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const allowed = ['petmoregroups.com', 'newgenman.co.th'];
    if (!allowed.some((domain) => normalizedEmail.endsWith(`@${domain}`))) {
      setError('กรุณาใช้อีเมล @petmoregroups.com หรือ @newgenman.co.th'); setLoading(false); return;
    }
    try { await signInWithEmailAndPassword(auth, normalizedEmail, password); onLogin(); }
    catch { setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); }
    finally { setLoading(false); }
  };
  return <main className="login-shell"><div className="login-frame">
    <section className="login-hero">
      <div className="login-brand"><span className="login-brand-mark"><Icon name="scan" size={25} /></span><span>SKU STOCK</span></div>
      <div className="control-grid" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
      <div className="login-hero-copy"><p className="login-kicker">WAREHOUSE STOCK SYSTEM</p>
        <h1>SKU<br/><em>STOCK</em></h1>
        <p>ตรวจสอบสต็อกสินค้า<br/>รวดเร็ว · แม่นยำ</p>
      </div>
      <div className="control-status"><span className="status-dot"/> ระบบพร้อมใช้งาน <b>READ-ONLY</b></div>
    </section>
    <section className="login-card">
      <p className="eyebrow">SECURE ACCESS</p><h2>เข้าสู่ระบบ</h2>
      <p className="login-copy">ใช้บัญชีบริษัทเพื่อดูข้อมูลสต็อก</p>
    <form onSubmit={submit} className="login-form">
      <label>อีเมลบริษัท<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
      <label>รหัสผ่าน<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      {error && <p className="error-message">{error}</p>}
      <button className="login-button" disabled={loading}>{loading ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
    </form>
    </section>
  </div></main>;
}

function App() {
  const [user, setUser] = useState(undefined);
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState(null);
  const [view, setView] = useState('home');
  const [activeProductPanel, setActiveProductPanel] = useState('stock');
  const [tab, setTab] = useState('receipt');
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [allHistory, setAllHistory] = useState([]);
  const [stockRows, setStockRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [allHistoryLoading, setAllHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [stockLoading, setStockLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryAction, setRetryAction] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (user && view === 'scan' && !locationPickerOpen && !accountMenuOpen && !signOutConfirmOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [user, view, locationPickerOpen, accountMenuOpen, signOutConfirmOpen]);
  const totalStock = useMemo(() => stockRows.reduce((sum, row) => sum + Number(row.QTY || 0), 0), [stockRows]);
  const stockUnit = stockRows[0]?.UTQ_NAME || product?.scannedUnit || '';
  const selectedLocationLabel = selectedLocation || 'ยังไม่ได้เลือก Location';

  const formatQuantity = (value) => {
    const quantity = Number(value);
    if (!Number.isFinite(quantity)) return '0';
    return quantity.toLocaleString('th-TH', Number.isInteger(quantity)
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fetchHistory = async (skuKey, kind, limit = 20, locationCode = selectedLocation) => {
    const token = await auth.currentUser.getIdToken();
    const params = new URLSearchParams({ limit: String(limit) });
    if (locationCode) params.set('location', locationCode);
    const response = await fetch(`/api/skus/${skuKey}/history/${kind === 'receipt' ? 'receipts' : 'transfers'}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(apiErrorMessage(response, 'ไม่สามารถอ่านประวัติรายการได้'));
    return mapHistory(await response.json(), kind);
  };

  const loadHistory = async (skuKey, kind, locationCode = selectedLocation) => {
    setHistoryLoading(true);
    try {
      setRecords(await fetchHistory(skuKey, kind, 20, locationCode));
    } catch (requestError) {
      setRecords([]);
      setError(friendlyRequestError(requestError, 'ไม่สามารถอ่านประวัติรายการได้'));
      setRetryAction('history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const selectProductPanel = (panel) => {
    setActiveProductPanel(panel);
    if (!product || panel === 'stock') return;
    setTab(panel);
    setError('');
    setRetryAction('');
    loadHistory(product.skuKey, panel);
  };

  const loadLocations = async () => {
    setError('');
    setRetryAction('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/locations', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(apiErrorMessage(response, 'ไม่สามารถอ่านรายการ Location ได้'));
      setLocations(await response.json());
    } catch (requestError) {
      setError(friendlyRequestError(requestError, 'ไม่สามารถอ่านรายการ Location ได้'));
      setRetryAction('locations');
    }
  };

  const chooseLocation = async (locationCode) => {
    setSelectedLocation(locationCode);
    setLocationPickerOpen(false);
    setLocationSearch('');
    setAllHistory([]);
    setError('');
    if (!product) {
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    await Promise.all([
      loadStock(product.goodsKey, locationCode),
      activeProductPanel === 'stock' ? Promise.resolve() : loadHistory(product.skuKey, activeProductPanel, locationCode),
    ]);
  };

  const openAllHistory = async () => {
    if (!product) return;
    setView('history');
    setHistoryFilter('all');
    setAllHistoryLoading(true);
    setError('');
    setRetryAction('');
    try {
      const [receipts, transfers] = await Promise.all([
        fetchHistory(product.skuKey, 'receipt', 1000),
        fetchHistory(product.skuKey, 'transfer', 1000),
      ]);
      setAllHistory([...receipts, ...transfers].sort((a, b) => b.timestamp - a.timestamp));
    } catch (requestError) {
      setAllHistory([]);
      setError(friendlyRequestError(requestError, 'ไม่สามารถอ่านประวัติทั้งหมดได้'));
      setRetryAction('all-history');
    } finally {
      setAllHistoryLoading(false);
    }
  };

  const loadStock = async (goodsKey, locationCode = selectedLocation) => {
    setStockLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationCode) params.set('location', locationCode);
      const suffix = params.toString() ? `?${params}` : '';
      const response = await auth.currentUser.getIdToken().then((token) => fetch(`/api/products/${goodsKey}/stock${suffix}`, { headers: { Authorization: `Bearer ${token}` } }));
      if (!response.ok) throw new Error(apiErrorMessage(response, 'ไม่สามารถอ่านยอดคงเหลือได้'));
      setStockRows(await response.json());
    } catch (requestError) {
      setStockRows([]);
      setError(friendlyRequestError(requestError, 'ไม่สามารถอ่านยอดคงเหลือได้'));
      setRetryAction('stock');
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadLocations();
  }, [user]);

  const searchByCode = async (scanValue) => {
    if (!scanValue) return setError('กรุณาสแกนหรือพิมพ์รหัสสินค้าก่อนค้นหา');
    setLoading(true);
    setError('');
    setRetryAction('');
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`/api/products/scan/${encodeURIComponent(scanValue)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || apiErrorMessage(response, 'ไม่สามารถค้นหาสินค้าได้'));
      setProduct(data);
      setView('scan');
      setActiveProductPanel('stock');
      setTab('receipt');
      await Promise.all([loadHistory(data.skuKey, 'receipt'), loadStock(data.goodsKey)]);
    } catch (requestError) {
      setProduct(null);
      setRecords([]);
      setError(friendlyRequestError(requestError, 'ไม่สามารถค้นหาสินค้าได้'));
      setRetryAction('search');
    } finally {
      setLoading(false);
    }
  };

  const search = async (event) => {
    event.preventDefault();
    await searchByCode(query.trim());
  };

  const clearLookup = (nextView) => {
    setQuery('');
    setProduct(null);
    setRecords([]);
    setAllHistory([]);
    setView(nextView);
    setActiveProductPanel('stock');
    setStockRows([]);
    setError('');
    setRetryAction('');
  };

  const reset = () => {
    clearLookup('scan');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const goHome = () => {
    clearLookup('home');
  };

  const goToScan = () => {
    if (!selectedLocation) {
      setError('กรุณาเลือก Location ก่อนเริ่มสแกนสินค้า');
      setLocationPickerOpen(true);
      return;
    }
    setView('scan');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const goToHistory = () => {
    if (product) {
      openAllHistory();
      return;
    }
    clearLookup('history');
  };

  const retryLastRequest = async () => {
    setError('');
    if (retryAction === 'locations') return loadLocations();
    if (retryAction === 'search') return searchByCode(query.trim());
    if (retryAction === 'stock' && product) return loadStock(product.goodsKey);
    if (retryAction === 'history' && product && activeProductPanel !== 'stock') return loadHistory(product.skuKey, activeProductPanel);
    if (retryAction === 'all-history' && product) return openAllHistory();
  };

  const requestSignOut = () => {
    setAccountMenuOpen(false);
    setSignOutConfirmOpen(true);
  };

  const confirmSignOut = async () => {
    setSignOutConfirmOpen(false);
    await signOut(auth);
  };

  const accountMenu = <AccountMenu
    email={user?.email || 'บัญชีบริษัท'}
    menuOpen={accountMenuOpen}
    confirmOpen={signOutConfirmOpen}
    onCloseMenu={() => setAccountMenuOpen(false)}
    onRequestSignOut={requestSignOut}
    onCancelSignOut={() => setSignOutConfirmOpen(false)}
    onConfirmSignOut={confirmSignOut}
  />;

  if (user === undefined) return <main className="login-shell"><p>กำลังตรวจสอบสิทธิ์…</p></main>;
  if (!user) return <Login onLogin={() => {}} />;
  const filteredAllHistory = historyFilter === 'all' ? allHistory : allHistory.filter((entry) => entry.kind === historyFilter);
  const matchingLocations = locations.filter((location) => location.toLowerCase().includes(locationSearch.trim().toLowerCase()));
  const quickLocationCodes = ['101', '111', '121', '131', 'TT', 'SP'];
  const quickLocations = quickLocationCodes.filter((location) => matchingLocations.includes(location));
  const otherLocations = matchingLocations.filter((location) => !quickLocationCodes.includes(location));
  const receiptCount = allHistory.filter((entry) => entry.kind === 'receipt').length;
  const transferCount = allHistory.filter((entry) => entry.kind === 'transfer').length;
  const locationPicker = locationPickerOpen && <div className="sheet-backdrop" onClick={() => setLocationPickerOpen(false)}>
    <section className="location-sheet" role="dialog" aria-modal="true" aria-labelledby="location-picker-title" onClick={(event) => event.stopPropagation()}>
      <span className="sheet-handle" aria-hidden="true" />
      <div className="location-sheet-heading"><div><p className="eyebrow">ตั้งค่าก่อนสแกน</p><h2 id="location-picker-title">เลือก Location</h2></div><button className="icon-button" type="button" onClick={() => setLocationPickerOpen(false)} aria-label="ปิด"><Icon name="close" size={20}/></button></div>
      <label className="location-search"><Icon name="search" size={19}/><input value={locationSearch} onChange={(event) => setLocationSearch(event.target.value)} placeholder="ค้นหา Location" autoFocus /></label>
      {quickLocations.length > 0 && <section className="quick-location-section" aria-label="Location ที่ใช้บ่อย">
        <p className="location-section-title">Location แนะนำ</p>
        <div className="location-option-list">
          {quickLocations.map((location) => <button type="button" className={`location-option ${selectedLocation === location ? 'selected' : ''}`} key={location} onClick={() => chooseLocation(location)}><span><strong>{location}</strong><small>กรองข้อมูลเฉพาะ Location นี้</small></span>{selectedLocation === location && <span className="location-check">เลือกอยู่</span>}</button>)}
        </div>
      </section>}
      {otherLocations.length > 0 && <section className="other-location-section" aria-label="Location อื่น">
        <p className="location-section-title">Location เพิ่มเติม</p>
        <div className="location-option-list">
          {otherLocations.map((location) => <button type="button" className={`location-option ${selectedLocation === location ? 'selected' : ''}`} key={location} onClick={() => chooseLocation(location)}><span><strong>{location}</strong><small>กรองข้อมูลเฉพาะ Location นี้</small></span>{selectedLocation === location && <span className="location-check">เลือกอยู่</span>}</button>)}
        </div>
      </section>}
      {matchingLocations.length === 0 && <p className="history-status">ไม่พบ Location ที่ค้นหา</p>}
    </section>
  </div>;

  if (view === 'home') return <main className="app-shell home-page-shell">
    <header className="topbar home-topbar">
      <div><p className="eyebrow">คลังสินค้า</p><h1>เริ่มตรวจสอบ</h1></div>
      <button className="icon-button menu-button" type="button" onClick={() => setAccountMenuOpen(true)} aria-label="เมนูเพิ่มเติม" aria-haspopup="dialog" aria-expanded={accountMenuOpen}><Icon name="more" /></button>
    </header>

    <section className={`home-scan-start ${!selectedLocation ? 'is-locked' : ''}`} aria-labelledby="start-scan-title">
      <div className="home-scan-icon"><Icon name="scan" size={35}/></div>
      <p className="eyebrow">งานหลัก</p>
      <h2 id="start-scan-title">เริ่มสแกนสินค้า</h2>
      <p>{selectedLocation ? 'สแกนบาร์โค้ดหรือพิมพ์ SKU เพื่อดูข้อมูลใน Location นี้' : 'เริ่มจากเลือก Location ด้านล่าง เพื่อให้ข้อมูลที่เห็นตรงกับตำแหน่งเก็บ'}</p>
      <button type="button" onClick={goToScan}>{selectedLocation ? 'เริ่มสแกน' : 'เลือก Location ด้านล่าง'} <Icon name="chevron" size={20}/></button>
    </section>

    <section className="home-location" aria-label="Location ที่ใช้กรองข้อมูล">
      <p><span className="home-step-badge">1</span> เลือก Location ก่อนเริ่มสแกน</p>
      <button type="button" className="location-trigger" onClick={() => setLocationPickerOpen(true)} aria-haspopup="dialog" aria-expanded={locationPickerOpen}>
        <span className="location-trigger-icon"><Icon name="pin" size={20}/></span>
        <span><strong>{selectedLocationLabel}</strong><small>{selectedLocation ? 'ข้อมูลสแกนจะแสดงเฉพาะ Location นี้' : 'จำเป็นต้องเลือกก่อนเข้าสู่หน้าสแกน'}</small></span>
        <Icon name="chevron" size={19}/>
      </button>
    </section>
    {error && <ErrorNotice message={error} onRetry={retryAction ? retryLastRequest : undefined} />}
    <p className="home-readonly"><span /> ระบบสำหรับดูข้อมูลเท่านั้น</p>

    <nav className="bottom-nav" aria-label="เมนูหลัก">
      <button className="selected"><Icon name="home" size={21}/><span>หน้าหลัก</span></button>
      <button onClick={goToScan}><Icon name="scan" size={21}/><span>สแกน</span></button>
      <button onClick={goToHistory}><Icon name="list" size={21}/><span>รายการ</span></button>
    </nav>
    {accountMenu}
    {locationPicker}
  </main>;

  if (view === 'history') return <main className="app-shell history-page-shell">
    <header className="topbar history-page-topbar">
      <button className="back-button" onClick={product ? () => setView('scan') : goHome}><Icon name="back" size={21}/><span>ย้อนกลับ</span></button>
      <button className="icon-button menu-button" type="button" onClick={() => setAccountMenuOpen(true)} aria-label="เมนูเพิ่มเติม" aria-haspopup="dialog" aria-expanded={accountMenuOpen}><Icon name="more" /></button>
    </header>

    <section className="history-page-intro" aria-labelledby="all-history-title">
      <p className="eyebrow">ประวัติสินค้า</p>
      <h1 id="all-history-title">{product ? 'ดูประวัติทั้งหมด' : 'รายการสินค้า'}</h1>
      {product && <><p>{product.name}</p><span>{product.sku} · {product.scannedUnit} · {selectedLocationLabel}</span></>}
    </section>

    {error && <ErrorNotice message={error} onRetry={retryAction ? retryLastRequest : undefined} retrying={allHistoryLoading} />}

    {!product ? <section className="empty-state history-empty-state">
      <div className="empty-icon"><Icon name="list" size={28} /></div>
      <h2>ยังไม่มีสินค้าที่เลือก</h2>
      <p>สแกนหรือค้นหาสินค้าก่อน แล้วจึงดูประวัติรับเข้าและโอนย้ายได้</p>
      <button type="button" className="empty-primary-action" onClick={goToScan}>ไปหน้าสแกน <Icon name="chevron" size={18}/></button>
    </section> : <section className="all-history-panel" aria-label="ประวัติรับเข้าและโอนย้าย">
      <div className="history-summary">
        <div><strong>{allHistory.length.toLocaleString('th-TH')}</strong><span>รายการทั้งหมด</span></div>
        <p>แสดงได้สูงสุด 1,000 รายการต่อประเภท</p>
      </div>
      <div className="history-filter" role="tablist" aria-label="กรองประวัติสินค้า">
        <button className={historyFilter === 'all' ? 'active all' : ''} onClick={() => setHistoryFilter('all')} role="tab" aria-selected={historyFilter === 'all'}>ทั้งหมด <span>{allHistory.length}</span></button>
        <button className={historyFilter === 'receipt' ? 'active receipt' : ''} onClick={() => setHistoryFilter('receipt')} role="tab" aria-selected={historyFilter === 'receipt'}>รับเข้า <span>{receiptCount}</span></button>
        <button className={historyFilter === 'transfer' ? 'active transfer' : ''} onClick={() => setHistoryFilter('transfer')} role="tab" aria-selected={historyFilter === 'transfer'}>โอนย้าย <span>{transferCount}</span></button>
      </div>
      <div className="all-history-records">
        {allHistoryLoading && <p className="history-status">กำลังอ่านประวัติทั้งหมด…</p>}
        {!allHistoryLoading && filteredAllHistory.length === 0 && <p className="history-status">ไม่พบประวัติ{historyFilter === 'all' ? '' : historyFilter === 'receipt' ? 'รับเข้า' : 'โอนย้าย'}ของสินค้านี้</p>}
        {!allHistoryLoading && filteredAllHistory.map((entry, index) => <article className="all-history-record" key={`${entry.kind}-${entry.ref}-${index}`}>
          <time><strong>{entry.date}</strong></time>
          <HistoryRecordDetail entry={entry} />
          <div className={`record-amount ${entry.kind}`}><span className={`history-kind ${entry.kind}`}>{entry.kind === 'receipt' ? 'รับเข้า' : 'โอนย้าย'}</span><strong>{entry.amount}</strong><span>{entry.unit}</span></div>
        </article>)}
      </div>
    </section>}

    <nav className="bottom-nav" aria-label="เมนูหลัก">
      <button onClick={goHome}><Icon name="home" size={21}/><span>หน้าหลัก</span></button>
      <button onClick={goToScan}><Icon name="scan" size={21}/><span>สแกน</span></button>
      <button className="selected"><Icon name="list" size={21}/><span>รายการ</span></button>
    </nav>
    {accountMenu}
    {locationPicker}
  </main>;
  return <main className="app-shell">
    <header className="topbar scan-topbar">
      <div>
        <p className="eyebrow">คลังสินค้า</p>
        <h1>ตรวจสอบสต็อก</h1>
      </div>
      <div className="scan-header-actions">
        <button type="button" className="scan-location-tag" onClick={() => setLocationPickerOpen(true)} aria-label={`เปลี่ยน Location ปัจจุบัน: ${selectedLocationLabel}`} aria-haspopup="dialog" aria-expanded={locationPickerOpen}><Icon name="pin" size={16}/><strong>{selectedLocationLabel}</strong><Icon name="chevron" size={15}/></button>
        <button className="icon-button menu-button" type="button" onClick={() => setAccountMenuOpen(true)} aria-label="เมนูเพิ่มเติม" aria-haspopup="dialog" aria-expanded={accountMenuOpen}><Icon name="more" /></button>
      </div>
    </header>

    <form className="scan-form" onSubmit={search}>
      <label htmlFor="sku-search">สแกนบาร์โค้ดสินค้า</label>
      <div className="scan-input-wrap">
        <Icon name="scan" size={25} />
        <input ref={inputRef} id="sku-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="สแกนบาร์โค้ด หรือกรอกรหัสสินค้า" autoComplete="off" />
        {query && <button type="button" className="clear-button" onClick={reset} aria-label="ล้างคำค้น"><Icon name="close" size={20} /></button>}
      </div>
      <p className="hint">สแกนด้วยเครื่อง Handheld หรือกรอกรหัสสินค้าแทน</p>
    </form>

    {error && <ErrorNotice message={error} onRetry={retryAction ? retryLastRequest : undefined} retrying={loading || stockLoading || historyLoading} />}

    {!product && !loading && <section className="empty-state">
      <div className="empty-icon"><Icon name="scan" size={28} /></div>
      <h2>พร้อมตรวจสอบสินค้า</h2>
      <p>สแกนบาร์โค้ดเพื่อดูยอดคงเหลือและประวัติรายการ</p>
    </section>}

    {loading && <section className="empty-state"><div className="empty-icon loading"><Icon name="scan" size={28} /></div><h2>กำลังค้นหาสินค้า</h2><p>กำลังอ่านข้อมูลจากระบบคลังสินค้า</p></section>}

    {product && <>
      <section className="product-card" aria-labelledby="product-name">
        <div className="product-symbol"><Icon name="box" size={31} /></div>
        <div className="product-main">
          <p className="status"><span />พบข้อมูลสินค้า</p>
          <h2 id="product-name">{product.name}</h2>
          <p className="sku">{product.sku}</p>
        </div>
        <div className="unit-block">
          <span>หน่วยที่สแกน</span>
          <strong>{product.scannedUnit}</strong>
        </div>
      </section>

      <div className="product-panel-switch" role="tablist" aria-label="เลือกข้อมูลสินค้า">
        <button className={activeProductPanel === 'stock' ? 'active stock' : ''} onClick={() => selectProductPanel('stock')} role="tab" aria-selected={activeProductPanel === 'stock'}>ตำแหน่งเก็บ</button>
        <button className={activeProductPanel === 'receipt' ? 'active receipt' : ''} onClick={() => selectProductPanel('receipt')} role="tab" aria-selected={activeProductPanel === 'receipt'}>รับเข้า</button>
        <button className={activeProductPanel === 'transfer' ? 'active transfer' : ''} onClick={() => selectProductPanel('transfer')} role="tab" aria-selected={activeProductPanel === 'transfer'}>โอนย้าย</button>
      </div>

      {activeProductPanel === 'stock' && <section className="stock-section" aria-labelledby="stock-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ยอดคงเหลือแยกตาม Location</p>
            <h2 id="stock-title">{stockLoading ? '…' : formatQuantity(totalStock)} <span>{stockLoading ? '' : stockUnit}</span></h2>
          </div>
          <p className="updated">ข้อมูลจาก<br/><strong>{selectedLocationLabel}</strong></p>
        </div>
        <p className="conversion">หน่วยจากบาร์โค้ด: <strong>{product.scannedUnit}</strong> <span>•</span> 1 หน่วย = {Number(product.unitMultiplier || 1).toLocaleString('th-TH')} หน่วยย่อย</p>
        <div className="branch-list">
          {stockLoading && <p className="history-status">กำลังอ่านยอดคงเหลือ…</p>}
          {!stockLoading && stockRows.length === 0 && <p className="history-status">ไม่พบยอดคงเหลือใน Location</p>}
          {!stockLoading && stockRows.map((row) => <article className="branch-row" key={row.WL_CODE}>
            <span className="availability main" />
            <span className="branch-name"><strong>{row.WL_CODE}</strong><small>ตำแหน่งเก็บ</small></span>
            <span className="branch-amount"><strong>{formatQuantity(row.QTY)}</strong><small>{row.UTQ_NAME}</small></span>
            <Icon name="chevron" size={19} stroke={1.7} />
          </article>)}
        </div>
      </section>}

      {activeProductPanel !== 'stock' && <section className="history-section" aria-labelledby="history-title">
        <div className="history-heading">
          <div><p className="eyebrow">ข้อมูลจากระบบคลัง</p><h2 id="history-title">{activeProductPanel === 'receipt' ? 'รายการรับเข้า' : 'รายการโอนย้าย'}</h2></div>
          <span>{activeProductPanel === 'receipt' ? 'รับเข้า' : 'โอนย้าย'}</span>
        </div>
        <div className="records">
          {historyLoading && <p className="history-status">กำลังอ่านประวัติรายการ…</p>}
          {!historyLoading && records.length === 0 && <p className="history-status">ไม่พบประวัติ{activeProductPanel === 'receipt' ? 'รับเข้า' : 'โอนย้าย'}ของสินค้านี้</p>}
          {!historyLoading && records.map((entry, index) => <article className="record" key={`${entry.ref}-${index}`}>
            <time><strong>{entry.date}</strong></time>
            <HistoryRecordDetail entry={entry} />
            <div className={`record-amount ${activeProductPanel}`}><strong>{entry.amount}</strong><span>{entry.unit}</span></div>
          </article>)}
        </div>
        <button className="all-history" onClick={openAllHistory}>ดูประวัติทั้งหมด <Icon name="chevron" size={18} /></button>
      </section>}
    </>}

    <nav className="bottom-nav" aria-label="เมนูหลัก">
      <button onClick={goHome}><Icon name="home" size={21}/><span>หน้าหลัก</span></button>
      <button className="selected" onClick={goToScan}><Icon name="scan" size={21}/><span>สแกน</span></button>
      <button onClick={goToHistory}><Icon name="list" size={21}/><span>รายการ</span></button>
    </nav>
    {accountMenu}
    {locationPicker}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
