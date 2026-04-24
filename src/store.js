// ===== DATA STORE WITH LOCALSTORAGE + FIREBASE =====
import { saveToFirestore, subscribeToFirestore } from './firebaseSync.js';

const STORAGE_KEY = 'xuong_may_data';

const DEFAULT_DATA = {
  lots: [],
  cuttings: [],
  cuttingSizes: [],
  sewings: [],
  sewingSizes: [],
  deliveries: [],
  qcRecords: [],
  qcResults: [],
  reworks: [],
  techpacks: [],
  prioritySizes: {},
  counters: { lot: 0, cutting: 0, sewing: 0, delivery: 0, qc: 0, rework: 0, techpack: 0 }
};

class Store {
  constructor() {
    this.data = this.load();
    this.listeners = [];
    this._isSyncingFromCloud = false;
    this.initFirebaseSync();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_DATA, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    // Đồng bộ lên Firebase (nếu không phải đang nhận data từ cloud)
    if (!this._isSyncingFromCloud) {
      saveToFirestore(this.data);
    }
    this.notify();
  }

  notify() {
    this.listeners.forEach(fn => fn(this.data));
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  // === FIREBASE REAL-TIME SYNC ===
  initFirebaseSync() {
    subscribeToFirestore((cloudData) => {
      this._isSyncingFromCloud = true;
      this.data = { ...DEFAULT_DATA, ...cloudData };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      this.notify();
      this._isSyncingFromCloud = false;
    });
  }

  // === ID Generators ===
  nextId(type) {
    this.data.counters[type] = (this.data.counters[type] || 0) + 1;
    const prefix = { lot: 'LOT', cutting: 'CUT', sewing: 'SEW', delivery: 'DEL', qc: 'QC', rework: 'RW' };
    return `${prefix[type]}-${String(this.data.counters[type]).padStart(4, '0')}`;
  }

  // === LOT CRUD ===
  addLot(lot) {
    lot.id = this.nextId('lot');
    lot.status = 'New';
    lot.createdAt = new Date().toISOString();
    this.data.lots.push(lot);
    this.save();
    return lot;
  }

  updateLot(id, updates) {
    const idx = this.data.lots.findIndex(l => l.id === id);
    if (idx >= 0) {
      this.data.lots[idx] = { ...this.data.lots[idx], ...updates };
      this.save();
    }
  }

  getLot(id) { return this.data.lots.find(l => l.id === id); }
  getLots() { return this.data.lots; }

  deleteLot(id) {
    this.data.lots = this.data.lots.filter(l => l.id !== id);
    this.save();
  }

  // === CUTTING CRUD ===
  addCutting(cutting) {
    cutting.id = this.nextId('cutting');
    this.data.cuttings.push(cutting);
    this.updateLotStatus(cutting.lotId);
    this.save();
    return cutting;
  }

  updateCutting(id, updates) {
    const idx = this.data.cuttings.findIndex(c => c.id === id);
    if (idx >= 0) {
      this.data.cuttings[idx] = { ...this.data.cuttings[idx], ...updates };
      this.save();
    }
  }

  getCutting(id) { return this.data.cuttings.find(c => c.id === id); }
  getCuttingsByLot(lotId) { return this.data.cuttings.filter(c => c.lotId === lotId); }

  deleteCutting(id) {
    this.data.cuttings = this.data.cuttings.filter(c => c.id !== id);
    this.data.cuttingSizes = this.data.cuttingSizes.filter(s => s.cuttingId !== id);
    this.save();
  }

  markCuttingExported(id) {
    this.updateCutting(id, { isExported: true });
  }
  getCuttings() { return this.data.cuttings; }

  // === CUTTING SIZES ===
  setCuttingSizes(cuttingId, sizes) {
    this.data.cuttingSizes = this.data.cuttingSizes.filter(s => s.cuttingId !== cuttingId);
    sizes.forEach(s => {
      if (s.quantity > 0) {
        this.data.cuttingSizes.push({ cuttingId, size: s.size, quantity: s.quantity });
      }
    });
    this.save();
  }

  getCuttingSizes(cuttingId) { return this.data.cuttingSizes.filter(s => s.cuttingId === cuttingId); }

  getCuttingSizesByLot(lotId) {
    const cuttingIds = this.getCuttingsByLot(lotId).map(c => c.id);
    return this.data.cuttingSizes.filter(s => cuttingIds.includes(s.cuttingId));
  }

  getTotalCutByLot(lotId) {
    return this.getCuttingSizesByLot(lotId).reduce((sum, s) => sum + s.quantity, 0);
  }

  // === SEWING CRUD ===
  addSewing(sewing) {
    sewing.id = this.nextId('sewing');
    sewing.status = 'In Progress';
    this.data.sewings.push(sewing);
    this.updateLotStatus(sewing.lotId);
    this.save();
    return sewing;
  }

  updateSewing(id, updates) {
    const idx = this.data.sewings.findIndex(s => s.id === id);
    if (idx >= 0) {
      this.data.sewings[idx] = { ...this.data.sewings[idx], ...updates };
      this.save();
    }
  }

  getSewing(id) { return this.data.sewings.find(s => s.id === id); }
  getSewingsByLot(lotId) { return this.data.sewings.filter(s => s.lotId === lotId); }
  getSewings() { return this.data.sewings; }

  deleteSewing(id) {
    this.data.sewings = this.data.sewings.filter(s => s.id !== id);
    this.data.sewingSizes = this.data.sewingSizes.filter(s => s.sewingId !== id);
    // Also delete associated deliveries
    if (this.data.deliveries) {
      const deliveryIds = this.data.deliveries.filter(d => d.sewingId === id).map(d => d.id);
      this.data.deliveries = this.data.deliveries.filter(d => d.sewingId !== id);
      if (this.data.deliverySizes) {
        this.data.deliverySizes = this.data.deliverySizes.filter(s => !deliveryIds.includes(s.deliveryId));
      }
    }
    this.save();
  }

  // === SEWING SIZES ===
  setSewingSizes(sewingId, sizes) {
    this.data.sewingSizes = this.data.sewingSizes.filter(s => s.sewingId !== sewingId);
    sizes.forEach(s => {
      this.data.sewingSizes.push({
        sewingId, size: s.size,
        quantitySent: s.quantitySent || 0,
        quantityReturned: s.quantityReturned || 0
      });
    });
    this.save();
  }

  getSewingSizes(sewingId) { return this.data.sewingSizes.filter(s => s.sewingId === sewingId); }

  getSewingSizesByLot(lotId) {
    const sewingIds = this.getSewingsByLot(lotId).map(s => s.id);
    return this.data.sewingSizes.filter(s => sewingIds.includes(s.sewingId));
  }

  // === DELIVERY CRUD ===
  addDelivery(delivery) {
    delivery.id = this.nextId('delivery');
    delivery.status = 'Delivery'; // 'Delivery', 'QC', 'QC_Done'
    delivery.createdAt = new Date().toISOString();
    if (!this.data.deliveries) this.data.deliveries = [];
    this.data.deliveries.push(delivery);
    this.save();
    return delivery;
  }

  updateDelivery(id, updates) {
    if (!this.data.deliveries) this.data.deliveries = [];
    const idx = this.data.deliveries.findIndex(d => d.id === id);
    if (idx >= 0) {
      this.data.deliveries[idx] = { ...this.data.deliveries[idx], ...updates };
      this.save();
    }
  }

  getDeliveries() { return this.data.deliveries || []; }
  getDelivery(id) { return (this.data.deliveries || []).find(d => d.id === id); }

  deleteDelivery(id) {
    if (this.data.deliveries) {
      this.data.deliveries = this.data.deliveries.filter(d => d.id !== id);
    }
    if (this.data.deliverySizes) {
      this.data.deliverySizes = this.data.deliverySizes.filter(s => s.deliveryId !== id);
    }
    this.save();
  }

  setDeliverySizes(deliveryId, sizes) {
    if (!this.data.deliverySizes) this.data.deliverySizes = [];
    this.data.deliverySizes = this.data.deliverySizes.filter(s => s.deliveryId !== deliveryId);
    sizes.forEach(s => {
      this.data.deliverySizes.push({
        deliveryId,
        size: s.size,
        quantity: s.quantity
      });
    });
    this.save();
  }

  getDeliverySizes(deliveryId) {
    return (this.data.deliverySizes || []).filter(s => s.deliveryId === deliveryId);
  }

  // === QC CRUD ===
  addQC(qc) {
    qc.id = this.nextId('qc');
    qc.passAction = 'Pending';
    qc.failAction = 'Pending';
    this.data.qcRecords.push(qc);
    const sewing = this.getSewing(qc.sewingId);
    if (sewing) this.updateLotStatus(sewing.lotId);
    this.save();
    return qc;
  }

  updateQC(id, updates) {
    const idx = this.data.qcRecords.findIndex(q => q.id === id);
    if (idx >= 0) {
      this.data.qcRecords[idx] = { ...this.data.qcRecords[idx], ...updates };
      this.save();
    }
  }

  getQC(id) { return this.data.qcRecords.find(q => q.id === id); }
  getQCsBySewing(sewingId) { return this.data.qcRecords.filter(q => q.sewingId === sewingId); }
  getQCs() { return this.data.qcRecords; }

  // === QC RESULTS ===
  setQCResults(qcId, results) {
    this.data.qcResults = this.data.qcResults.filter(r => r.qcId !== qcId);
    results.forEach(r => {
      this.data.qcResults.push({
        qcId, size: r.size,
        checked: r.checked || 0,
        passed: r.passed || 0,
        failed: r.failed || 0
      });
    });
    this.save();
  }

  getQCResults(qcId) { return this.data.qcResults.filter(r => r.qcId === qcId); }

  getQCResultsByLot(lotId) {
    const sewingIds = this.getSewingsByLot(lotId).map(s => s.id);
    const qcIds = this.data.qcRecords.filter(q => sewingIds.includes(q.sewingId)).map(q => q.id);
    return this.data.qcResults.filter(r => qcIds.includes(r.qcId));
  }

  // === PRIORITY SIZES ===
  setPrioritySizes(lotId, sizes) {
    if (!this.data.prioritySizes) this.data.prioritySizes = {};
    this.data.prioritySizes[lotId] = sizes;
    this.save();
  }

  getPrioritySizes(lotId) {
    return (this.data.prioritySizes && this.data.prioritySizes[lotId]) || [];
  }

  isSizePriority(lotId, size) {
    return this.getPrioritySizes(lotId).includes(size);
  }

  // === REWORK CRUD ===
  addRework(rework) {
    rework.id = this.nextId('rework');
    if (!rework.status) rework.status = 'Defect'; // 'Defect', 'Fixing', 'Done'
    this.data.reworks.push(rework);
    this.save();
    return rework;
  }

  updateRework(id, updates) {
    const idx = this.data.reworks.findIndex(r => r.id === id);
    if (idx >= 0) {
      this.data.reworks[idx] = { ...this.data.reworks[idx], ...updates };
      this.save();
    }
  }

  getRework(id) { return this.data.reworks.find(r => r.id === id); }
  getReworksByQC(qcId) { return this.data.reworks.filter(r => r.qcId === qcId); }
  getReworks() { return this.data.reworks; }

  // Auto-create rework entries from QC failures
  autoCreateReworks(qcId) {
    const qc = this.getQC(qcId);
    if (!qc) return;
    const results = this.getQCResults(qcId);
    const sewing = this.getSewing(qc.sewingId);
    const lot = sewing ? this.getLot(sewing.lotId) : null;

    // Remove old auto-reworks for this QC
    this.data.reworks = this.data.reworks.filter(r => r.qcId !== qcId || !r.autoCreated);

    // Create a SINGLE rework card for the entire QC failure to match the Kanban style
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    if (totalFailed > 0) {
      const lotInfo = lot ? `${lot.id} | ${lot.customerName} | ${lot.fabricName}` : qc.sewingId;
      
      // Store failed breakdown inside notes or a special field
      const breakdown = results.filter(r => r.failed > 0).map(r => `${r.size}:${r.failed}`).join(', ');

      this.data.reworks.push({
        id: this.nextId('rework'),
        qcId,
        sewingId: qc.sewingId,
        deliveryId: qc.deliveryId, // Track delivery
        lotId: sewing ? sewing.lotId : '',
        totalFailed: totalFailed,
        breakdown: breakdown,
        dateSentBack: qc.dateQC,
        status: 'Defect',
        dateReturned: '',
        notes: `Từ phiếu QC: ${qcId}`,
        autoCreated: true
      });
    }
    this.save();
  }

  // === LOT STATUS AUTO-UPDATE ===
  updateLotStatus(lotId) {
    const lot = this.getLot(lotId);
    if (!lot) return;
    const qcResults = this.getQCResultsByLot(lotId);
    const sewings = this.getSewingsByLot(lotId);
    const cuttings = this.getCuttingsByLot(lotId);

    if (qcResults.length > 0) {
      lot.status = 'QC';
    } else if (sewings.length > 0) {
      lot.status = 'Sewing';
    } else if (cuttings.length > 0) {
      lot.status = 'Cutting';
    } else {
      lot.status = 'New';
    }

    const totalCut = this.getTotalCutByLot(lotId);
    const totalPassed = qcResults.reduce((s, r) => s + r.passed, 0);
    if (totalCut > 0 && totalPassed >= totalCut) {
      lot.status = 'Done';
    }
  }

  // === COMPUTED HELPERS ===
  getLotSummary(lotId) {
    const lot = this.getLot(lotId);
    if (!lot) return null;

    const cutSizes = this.getCuttingSizesByLot(lotId);
    const sewSizes = this.getSewingSizesByLot(lotId);
    const qcResults = this.getQCResultsByLot(lotId);

    const totalCut = cutSizes.reduce((s, c) => s + c.quantity, 0);
    const totalSent = sewSizes.reduce((s, c) => s + c.quantitySent, 0);
    const totalReturned = sewSizes.reduce((s, c) => s + c.quantityReturned, 0);
    const totalPassed = qcResults.reduce((s, r) => s + r.passed, 0);
    const totalFailed = qcResults.reduce((s, r) => s + r.failed, 0);
    const totalChecked = qcResults.reduce((s, r) => s + r.checked, 0);

    return {
      lot, totalCut, totalSent, totalReturned, totalPassed, totalFailed, totalChecked,
      inProgress: totalSent - totalReturned
    };
  }

  getSizeBreakdownByLot(lotId) {
    const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];
    const cutSizes = this.getCuttingSizesByLot(lotId);
    const sewSizes = this.getSewingSizesByLot(lotId);
    const qcResults = this.getQCResultsByLot(lotId);

    const allSizes = new Set([
      ...cutSizes.map(s => s.size),
      ...sewSizes.map(s => s.size),
      ...qcResults.map(r => r.size)
    ]);

    const result = [];
    const sizeOrder = [...sizes, ...Array.from(allSizes).filter(s => !sizes.includes(s))];

    sizeOrder.forEach(size => {
      if (!allSizes.has(size)) return;
      const cut = cutSizes.filter(s => s.size === size).reduce((sum, s) => sum + s.quantity, 0);
      const sent = sewSizes.filter(s => s.size === size).reduce((sum, s) => sum + s.quantitySent, 0);
      const returned = sewSizes.filter(s => s.size === size).reduce((sum, s) => sum + s.quantityReturned, 0);
      const passed = qcResults.filter(r => r.size === size).reduce((sum, r) => sum + r.passed, 0);
      const failed = qcResults.filter(r => r.size === size).reduce((sum, r) => sum + r.failed, 0);

      result.push({
        size, cut, sent, returned, passed, failed,
        inProgress: sent - returned,
        missing: cut - passed
      });
    });

    return result;
  }

  // ===== TECHPACKS & BOM =====
  getTechpacks() { return this.data.techpacks || []; }
  
  addTechpack(techpack) {
    this.data.counters.techpack = (this.data.counters.techpack || 0) + 1;
    const newTechpack = { 
      id: `TP-${this.data.counters.techpack.toString().padStart(4, '0')}`, 
      ...techpack, 
      createdAt: new Date().toISOString() 
    };
    if (!this.data.techpacks) this.data.techpacks = [];
    this.data.techpacks.push(newTechpack);
    this.save();
    return newTechpack;
  }

  updateTechpack(id, updates) {
    this.data.techpacks = this.data.techpacks.map(t => t.id === id ? { ...t, ...updates } : t);
    this.save();
  }

  deleteTechpack(id) {
    this.data.techpacks = this.data.techpacks.filter(t => t.id !== id);
    this.save();
  }


  // === EXPORT / IMPORT ===
  exportData() { return JSON.stringify(this.data, null, 2); }

  importData(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      this.data = { ...DEFAULT_DATA, ...parsed };
      this.save();
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }
}

export const store = new Store();
