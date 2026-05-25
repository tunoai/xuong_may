// ===== MODULE 6: DASHBOARD =====
import { store } from './store.js';
import { formatNumber, formatDate, priorityBadge, statusBadge, lotLabel, showToast, openModal, closeModal } from './ui.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let sizeChart = null;
let filtersRendered = false;

// === FILTER STATE ===
let dashboardFilters = {
  lotSearch: '',
  workshopSearch: '',
  dateFrom: '',
  dateTo: '',
  prioOnly: false
};

// Delivery chart filter (independent)
const nowDate = new Date();
let deliveryFilter = {
  from: new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).toISOString().split('T')[0],
  to: nowDate.toISOString().split('T')[0]
};

export function renderDashboard() {
  const lots = store.getLots();
  const container = document.getElementById('dashboard-content');
  const filterBarEl = document.getElementById('dashboard-filter-bar');

  if (lots.length === 0) {
    if (filterBarEl) filterBarEl.innerHTML = '';
    filtersRendered = false;
    container.innerHTML = `<div class="empty-state" style="padding:80px 20px">
      <div class="empty-icon">📊</div>
      <p style="font-size:16px;margin-bottom:8px">Chào mừng đến Xưởng May Manager!</p>
      <p>Bắt đầu bằng cách thêm lô vải đầu tiên ở menu bên trái.</p>
    </div>`;
    return;
  }

  // === Collect unique workshops ===
  const allWorkshops = [...new Set(store.getSewings().map(s => s.workshopName).filter(Boolean))];

  // === Render filter bar (only once, to preserve cursor) ===
  if (!filtersRendered && filterBarEl) {
    renderFilterBar(filterBarEl, allWorkshops);
    filtersRendered = true;
  } else if (filterBarEl) {
    // Update workshop select options without destroying inputs
    const wsSelect = document.getElementById('dash-filter-workshop');
    if (wsSelect) {
      const currentVal = wsSelect.value;
      const newOpts = '<option value="">-- Tất cả xưởng --</option>' + allWorkshops.map(w => `<option value="${w}" ${w === currentVal ? 'selected' : ''}>${w}</option>`).join('');
      wsSelect.innerHTML = newOpts;
    }
    // Update clear button visibility
    const hasFilter = dashboardFilters.lotSearch || dashboardFilters.workshopSearch || dashboardFilters.dateFrom || dashboardFilters.dateTo || dashboardFilters.prioOnly;
    const clearBtn = document.getElementById('dash-filter-clear');
    if (clearBtn) clearBtn.style.display = hasFilter ? '' : 'none';
    else if (hasFilter) {
      const bar = document.getElementById('dash-filter-bar-inner');
      if (bar) bar.insertAdjacentHTML('beforeend', `<button class="dash-filter-clear" id="dash-filter-clear" style="">✕ Xóa bộ lọc</button>`);
      document.getElementById('dash-filter-clear')?.addEventListener('click', () => {
        dashboardFilters = { lotSearch: '', workshopSearch: '', dateFrom: '', dateTo: '', prioOnly: false };
        filtersRendered = false;
        renderDashboard();
      });
    }
    // Update prio button active state
    const prioBtn = document.getElementById('dash-filter-prio');
    if (prioBtn) prioBtn.classList.toggle('active', dashboardFilters.prioOnly);
  }

  // === Alerts ===
  const alerts = [];
  lots.filter(l => l.priority === 'Urgent' || l.priority === 'Very Urgent').forEach(l => {
    const lotName = `${(l.fabricName || '').toUpperCase()}${l.color ? ' ' + l.color.toUpperCase() : ''} - ${l.customerName || ''}`;
    alerts.push({ type: 'urgent', icon: '⚠️', text: `${lotName}: ${l.priority}`, lotId: l.id });
  });

  const sewingAlerts = [];
  store.getSewings().filter(s => s.status !== 'Done').forEach(s => {
    const lot = store.getLot(s.lotId);
    const sizes = store.getSewingSizes(s.id);
    const lowSizes = sizes.filter(sz => {
      const rem = sz.quantitySent - sz.quantityReturned;
      return rem > 0 && rem < 10;
    });
    if (lowSizes.length > 0) {
      const detail = lowSizes.map(sz => `${sz.size}:${sz.quantitySent - sz.quantityReturned}`).join(', ');
      const minRem = Math.min(...lowSizes.map(sz => sz.quantitySent - sz.quantityReturned));
      const lotName = lot ? `${(lot.fabricName || '').toUpperCase()}${lot.color ? ' ' + lot.color.toUpperCase() : ''} - ${lot.customerName || ''}` : s.workshopName;
      sewingAlerts.push({ 
        type: 'urgent', 
        icon: '⏳', 
        text: `${lotName} (${s.workshopName}): [${detail}] - SẮP HẾT`,
        inProg: minRem,
        lotId: s.lotId
      });
    }
  });

  sewingAlerts.sort((a, b) => a.inProg - b.inProg);
  alerts.push(...sewingAlerts);

  const unresolvedReworks = store.getReworks().filter(r => r.status !== 'Returned' && r.status !== 'Rechecked OK');
  if (unresolvedReworks.length > 0) {
    alerts.push({ type: 'danger', icon: '🔄', text: `${unresolvedReworks.length} hàng lỗi chưa xử lý xong` });
  }

  // === Apply filters ===
  const filteredLots = lots.filter(lot => {
    const prioSizes = store.getPrioritySizes(lot.id);
    if (dashboardFilters.prioOnly && prioSizes.length === 0) return false;
    if (dashboardFilters.lotSearch) {
      const q = dashboardFilters.lotSearch.toLowerCase();
      const searchStr = `${lot.id} ${lot.fabricName || ''} ${lot.customerName || ''} ${lot.color || ''}`.toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    if (dashboardFilters.workshopSearch) {
      const q = dashboardFilters.workshopSearch.toLowerCase();
      const lotSewings = store.getSewingsByLot(lot.id);
      const hasWorkshop = lotSewings.some(s => (s.workshopName || '').toLowerCase().includes(q));
      if (!hasWorkshop) return false;
    }
    if (dashboardFilters.dateFrom && lot.dateReceived) {
      if (lot.dateReceived < dashboardFilters.dateFrom) return false;
    }
    if (dashboardFilters.dateTo && lot.dateReceived) {
      if (lot.dateReceived > dashboardFilters.dateTo) return false;
    }
    return true;
  });

  // === Build lot cards ===
  const lotCards = filteredLots.map(lot => {
    const summary = store.getLotSummary(lot.id);
    if (!summary) return '';
    const sizeBreak = store.getSizeBreakdownByLot(lot.id);
    const prioSizes = store.getPrioritySizes(lot.id);
    const hasPrio = prioSizes.length > 0;
    const progress = summary.totalCut > 0 ? Math.round((summary.totalPassed / summary.totalCut) * 100) : 0;
    const remaining = summary.totalCut - summary.totalPassed - summary.totalFailed;
    const inSewing = summary.totalSent - summary.totalReturned;
    const isCompleted = summary.totalCut > 0 && remaining <= 0 && summary.totalFailed === 0;

    // Find workshops holding this lot
    const lotSewings = store.getSewingsByLot(lot.id);
    const workshopNames = [...new Set(lotSewings.map(s => s.workshopName).filter(Boolean))];

    // Sort sizes: remaining > 0 first (ascending by remaining), then remaining = 0
    const sortedSizeBreak = [...sizeBreak].sort((a, b) => {
      const remA = a.cut - a.passed - a.failed;
      const remB = b.cut - b.passed - b.failed;
      if (remA > 0 && remB <= 0) return -1;
      if (remA <= 0 && remB > 0) return 1;
      if (remA > 0 && remB > 0) return remA - remB;
      return 0;
    });

    const sizeChips = sortedSizeBreak.map(s => {
      const isPrio = prioSizes.includes(s.size);
      const sizeRemaining = s.cut - s.passed - s.failed;
      const isLow = sizeRemaining > 0 && sizeRemaining < 10;
      const isDone = sizeRemaining <= 0;
      const remainClass = isDone ? 'sz-done' : isLow ? 'sz-low' : 'sz-remaining';
      return `<div class="dash-size-chip${isPrio ? ' prio' : ''}${isLow ? ' low-remaining' : ''}${isDone ? ' done' : ''}">
        <div class="dash-size-top">
          <span class="dash-size-label">${isPrio ? '⭐ ' : ''}${s.size}</span>
          <span class="dash-size-remain ${remainClass}" title="Còn lại">${isDone ? '✓' : sizeRemaining}</span>
        </div>
        <div class="dash-size-nums">
          <span class="sz-cut" title="Cắt">C:${s.cut}</span>
          <span class="sz-sew" title="Đang may">${s.inProgress > 0 ? `M:${s.inProgress}` : ''}</span>
          <span class="sz-pass" title="Pass">P:${s.passed}</span>
          ${s.failed > 0 ? `<span class="sz-fail" title="Fail">F:${s.failed}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="dash-lot-card${hasPrio ? ' dash-prio' : ''}${isCompleted ? ' dash-completed' : ''}" data-lot-id="${lot.id}">
      <div class="dash-lot-header">
        <div class="dash-lot-id">
          <span class="dash-lot-code">${lot.id}</span>
          ${statusBadge(lot.status)}
        </div>
        <div class="dash-lot-priority" style="display:flex;align-items:center;gap:6px;">
          ${priorityBadge(lot.priority)}
          <button class="btn-dash-delete-lot" data-lot-id="${lot.id}" title="Xóa lô vải" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;color:var(--red);opacity:0.6;transition:opacity 0.2s;">🗑️</button>
        </div>
      </div>
      <div class="dash-lot-info">
        <div class="dash-lot-fabric">
          <span class="dash-fabric-icon">🧵</span>
          <div>
            <div class="dash-fabric-name">${lot.fabricName || '—'}${lot.color ? ` · ${lot.color}` : ''}</div>
            <div class="dash-fabric-customer">${lot.customerName || '—'}</div>
          </div>
        </div>
        <div class="dash-lot-meta">
          <span>📅 ${formatDate(lot.dateReceived)}</span>
          <span>📏 ${formatNumber(lot.totalFabric)}m</span>
        </div>
      </div>

      <div class="dash-progress-section">
        <div class="dash-progress-header">
          <span>Tiến độ tổng</span>
          <span class="dash-progress-pct">${progress}%</span>
        </div>
        <div class="dash-progress-track">
          <div class="dash-progress-fill" style="width:${progress}%"></div>
        </div>
      </div>

      ${isCompleted ? `<div class="dash-completed-banner">✅ ĐÃ GIAO HẾT</div>` : ''}

      <div class="dash-stats-row">
        <div class="dash-stat-mini blue">
          <div class="dash-stat-mini-val">${formatNumber(summary.totalCut)}</div>
          <div class="dash-stat-mini-lbl">Tổng Cắt</div>
        </div>
        <div class="dash-stat-mini orange">
          <div class="dash-stat-mini-val">${formatNumber(inSewing > 0 ? inSewing : 0)}</div>
          <div class="dash-stat-mini-lbl">Đang May</div>
        </div>
        <div class="dash-stat-mini cyan">
          <div class="dash-stat-mini-val">${formatNumber(summary.totalReturned)}</div>
          <div class="dash-stat-mini-lbl">Đã Giao</div>
        </div>
        <div class="dash-stat-mini green">
          <div class="dash-stat-mini-val">${formatNumber(summary.totalPassed)}</div>
          <div class="dash-stat-mini-lbl">QC Pass</div>
        </div>
        <div class="dash-stat-mini red">
          <div class="dash-stat-mini-val">${formatNumber(summary.totalFailed)}</div>
          <div class="dash-stat-mini-lbl">Lỗi</div>
        </div>
        <div class="dash-stat-mini yellow">
          <div class="dash-stat-mini-val">${formatNumber(remaining > 0 ? remaining : 0)}</div>
          <div class="dash-stat-mini-lbl">Còn Lại</div>
        </div>
      </div>

      ${workshopNames.length > 0 ? `<div class="dash-workshops">
        <span class="dash-workshop-icon">🏭</span>
        ${workshopNames.map(w => `<span class="dash-workshop-tag">${w}</span>`).join('')}
      </div>` : ''}

      <div class="dash-sizes-section">
        <div class="dash-sizes-title">Số size còn lại</div>
        <div class="dash-sizes-grid">${sizeChips}</div>
      </div>
    </div>`;
  }).join('');

  // === Build Workshop Summary Cards ===
  const workshopCards = allWorkshops.map(workshopName => {
    const workshopSewings = store.getSewings().filter(s => s.workshopName === workshopName);
    
    // Apply filter
    if (dashboardFilters.workshopSearch) {
      const q = dashboardFilters.workshopSearch.toLowerCase();
      if (!workshopName.toLowerCase().includes(q)) return '';
    }

    let totalHolding = 0;
    let totalDefects = 0;
    const lotMap = {};

    workshopSewings.forEach(sewing => {
      const lot = store.getLot(sewing.lotId);
      const sizes = store.getSewingSizes(sewing.id);
      const inProgress = sizes.reduce((sum, sz) => sum + Math.max(0, sz.quantitySent - sz.quantityReturned), 0);
      totalHolding += inProgress;

      // Get defects for this sewing
      const qcRecords = store.getQCsBySewing(sewing.id);
      const defects = qcRecords.reduce((sum, qc) => {
        const results = store.getQCResults(qc.id);
        return sum + results.reduce((s, r) => s + r.failed, 0);
      }, 0);
      totalDefects += defects;

      const lotKey = sewing.lotId;
      if (!lotMap[lotKey]) {
        lotMap[lotKey] = {
          lot,
          totalSent: 0,
          totalReturned: 0,
          inProgress: 0,
          defects: 0
        };
      }
      lotMap[lotKey].totalSent += sizes.reduce((sum, sz) => sum + sz.quantitySent, 0);
      lotMap[lotKey].totalReturned += sizes.reduce((sum, sz) => sum + sz.quantityReturned, 0);
      lotMap[lotKey].inProgress += inProgress;
      lotMap[lotKey].defects += defects;
    });

    const lotEntries = Object.values(lotMap).filter(e => {
      if (dashboardFilters.lotSearch) {
        const q = dashboardFilters.lotSearch.toLowerCase();
        const searchStr = `${e.lot?.id || ''} ${e.lot?.fabricName || ''} ${e.lot?.customerName || ''}`.toLowerCase();
        if (!searchStr.includes(q)) return false;
      }
      return true;
    });

    if (lotEntries.length === 0 && dashboardFilters.lotSearch) return '';

    const lotRows = lotEntries.map(e => `
      <div class="ws-lot-row">
        <div class="ws-lot-name">
          <strong>${e.lot ? e.lot.id : '?'}</strong>
          <span>${e.lot ? e.lot.fabricName : ''}</span>
        </div>
        <div class="ws-lot-nums">
          <span class="ws-num blue" title="Đang giữ">${e.inProgress} pcs</span>
          <span class="ws-num green" title="Đã giao">${e.totalReturned}</span>
          ${e.defects > 0 ? `<span class="ws-num red" title="Lỗi">${e.defects} lỗi</span>` : ''}
        </div>
      </div>
    `).join('');

    return `<div class="dash-workshop-card">
      <div class="ws-header">
        <div class="ws-name">
          <span class="ws-icon">🏭</span>
          <span>${workshopName}</span>
        </div>
        <div class="ws-badge-row">
          <span class="ws-stat-badge blue">${totalHolding} đang may</span>
          ${totalDefects > 0 ? `<span class="ws-stat-badge red">${totalDefects} lỗi</span>` : `<span class="ws-stat-badge green">0 lỗi</span>`}
        </div>
      </div>
      <div class="ws-lots">${lotRows}</div>
    </div>`;
  }).filter(Boolean).join('');

  // === Build main stat cards ===
  let totalCutAll = 0, totalSewingAll = 0, totalReturnedAll = 0, totalPassedAll = 0, totalFailedAll = 0;
  filteredLots.forEach(lot => {
    const summary = store.getLotSummary(lot.id);
    if (!summary) return;
    totalCutAll += summary.totalCut;
    totalSewingAll += Math.max(0, summary.totalSent - summary.totalReturned);
    totalReturnedAll += summary.totalReturned;
    totalPassedAll += summary.totalPassed;
    totalFailedAll += summary.totalFailed;
  });
  const overallProgress = totalCutAll > 0 ? Math.round((totalPassedAll / totalCutAll) * 100) : 0;

  container.innerHTML = `
    <!-- Alerts -->
    ${alerts.length > 0 ? `<div class="dashboard-section">
      <h3>🚨 Cảnh Báo (${alerts.length})</h3>
      <ul class="alert-list">${alerts.map(a => `<li class="alert-item ${a.type}${a.lotId ? ' alert-clickable' : ''}" ${a.lotId ? `data-lot-id="${a.lotId}"` : ''} title="${a.lotId ? 'Bấm để xem chi tiết lô' : ''}">${a.icon} ${a.text}</li>`).join('')}</ul>
    </div>` : ''}

    <!-- Workshop Summary -->
    ${workshopCards ? `<div class="dashboard-section">
      <h3>🏭 Tổng Hợp Theo Xưởng May</h3>
      <div class="dash-workshop-scroll">${workshopCards}</div>
    </div>` : ''}

    <!-- Lot Cards -->
    <div class="dashboard-section">
      <h3>📋 Chi Tiết Từng Lô <span class="dash-count-badge">${filteredLots.length} lô</span></h3>
      <div class="dash-lot-scroll">
        ${lotCards || '<div class="empty-state"><p>Không tìm thấy lô vải phù hợp</p></div>'}
      </div>
    </div>

    <!-- NHẬN HÀNG TỪ XƯỞNG MAY -->
    <div class="dashboard-section" style="margin-top:20px;">
      <h3>📦 Nhận Hàng Từ Xưởng May</h3>
      <div id="delivery-chart-section"></div>
    </div>
  `;

  // === Alert click -> show lot detail popup ===
  container.querySelectorAll('.alert-item[data-lot-id]').forEach(el => {
    el.addEventListener('click', () => {
      const lotId = el.dataset.lotId;
      showLotDetailPopup(lotId);
    });
  });

  // === Delete lot from dashboard ===
  container.querySelectorAll('.btn-dash-delete-lot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lotId = btn.dataset.lotId;
      const lot = store.getLot(lotId);
      const lotName = lot ? `${lot.fabricName || ''} ${lot.color || ''} - ${lot.customerName || ''}` : lotId;
      if (confirm(`Bạn có chắc muốn xóa lô vải \"${lotName}\"?\nToàn bộ dữ liệu cắt, may, QC của lô này sẽ bị xóa.`)) {
        store.deleteLot(lotId);
        renderDashboard();
        showToast('Đã xóa lô vải và toàn bộ dữ liệu liên quan', 'info');
      }
    });
  });

  // === Render Delivery Chart Section ===
  renderDeliveryChart();
}

let deliveryChartInstance = null;

function renderDeliveryChart() {
  const section = document.getElementById('delivery-chart-section');
  if (!section) return;

  const today = new Date();
  const curMonth = today.getMonth();
  const curYear = today.getFullYear();

  // Quick filter helpers
  const quickFilters = [
    { label: '7 ngày', from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).toISOString().split('T')[0], to: today.toISOString().split('T')[0] },
    { label: '14 ngày', from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13).toISOString().split('T')[0], to: today.toISOString().split('T')[0] },
    { label: 'Tháng này', from: new Date(curYear, curMonth, 1).toISOString().split('T')[0], to: today.toISOString().split('T')[0] },
    { label: 'Tháng trước', from: new Date(curYear, curMonth - 1, 1).toISOString().split('T')[0], to: new Date(curYear, curMonth, 0).toISOString().split('T')[0] },
    { label: 'Năm nay', from: new Date(curYear, 0, 1).toISOString().split('T')[0], to: today.toISOString().split('T')[0] },
  ];

  // Compute data based on deliveryFilter
  const allDeliveries = store.getDeliveries();
  const dailyDeliveryMap = {};
  const workshopDailyMap = {};
  allDeliveries.forEach(d => {
    const dateStr = d.createdAt ? d.createdAt.split('T')[0] : '';
    if (!dateStr) return;
    if (deliveryFilter.from && dateStr < deliveryFilter.from) return;
    if (deliveryFilter.to && dateStr > deliveryFilter.to) return;
    const sewing = store.getSewing(d.sewingId);
    const workshopName = sewing ? (sewing.workshopName || 'Khác') : 'Khác';
    const sizes = store.getDeliverySizes(d.id);
    const totalQty = sizes.reduce((sum, sz) => sum + sz.quantity, 0);
    if (!dailyDeliveryMap[dateStr]) dailyDeliveryMap[dateStr] = 0;
    dailyDeliveryMap[dateStr] += totalQty;
    if (!workshopDailyMap[workshopName]) workshopDailyMap[workshopName] = {};
    if (!workshopDailyMap[workshopName][dateStr]) workshopDailyMap[workshopName][dateStr] = 0;
    workshopDailyMap[workshopName][dateStr] += totalQty;
  });

  // Build date range array
  const dateRange = [];
  const startD = new Date(deliveryFilter.from || today.toISOString().split('T')[0]);
  const endD = new Date(deliveryFilter.to || today.toISOString().split('T')[0]);
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    dateRange.push(d.toISOString().split('T')[0]);
  }
  const dailyLabels = dateRange.map(d => { const p = d.split('-'); return `${p[2]}/${p[1]}`; });

  const wsNames = Object.keys(workshopDailyMap);
  const workshopTableRows = wsNames.map(ws => {
    const dailyVals = dateRange.map(d => workshopDailyMap[ws][d] || 0);
    const total = dailyVals.reduce((a, b) => a + b, 0);
    const daysWorked = dailyVals.filter(v => v > 0).length;
    const avg = daysWorked > 0 ? Math.round(total / daysWorked) : 0;
    const max = Math.max(...dailyVals, 0);
    return `<tr>
      <td style="font-weight:700;">${ws}</td>
      <td style="text-align:center;color:var(--blue);font-weight:800;">${formatNumber(total)}</td>
      <td style="text-align:center;color:var(--green);font-weight:600;">${formatNumber(avg)}</td>
      <td style="text-align:center;color:var(--yellow);">${formatNumber(max)}</td>
      <td style="text-align:center;">${daysWorked} ngày</td>
    </tr>`;
  }).join('');

  // Active quick filter check
  const activeIdx = quickFilters.findIndex(q => q.from === deliveryFilter.from && q.to === deliveryFilter.to);

  section.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:14px;">
      ${quickFilters.map((q, i) => `<button class="delivery-quick-btn${i === activeIdx ? ' active' : ''}" data-idx="${i}" style="padding:10px 18px;font-size:14px;font-weight:600;border-radius:8px;border:1px solid ${i === activeIdx ? 'var(--accent)' : 'var(--border)'};background:${i === activeIdx ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)'};color:${i === activeIdx ? 'var(--accent)' : 'var(--text-muted)'};cursor:pointer;transition:all 0.2s;">${q.label}</button>`).join('')}
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px;">
        <label style="font-size:13px;color:var(--text-muted);font-weight:600;">Từ</label>
        <input type="date" id="delivery-from" value="${deliveryFilter.from}" style="font-size:14px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);" />
        <label style="font-size:13px;color:var(--text-muted);font-weight:600;">Đến</label>
        <input type="date" id="delivery-to" value="${deliveryFilter.to}" style="font-size:14px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);" />
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">Biểu đồ giao hàng theo ngày</div>
        <div class="chart-container" style="height:250px;">
          <canvas id="daily-delivery-chart"></canvas>
        </div>
      </div>
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:10px;">🏭 Năng lực sản xuất theo xưởng</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
              <th style="text-align:left;padding:8px 6px;color:var(--text-muted);font-size:10px;">XƯỞNG</th>
              <th style="text-align:center;padding:8px 6px;color:var(--blue);font-size:10px;">TỔNG GIAO</th>
              <th style="text-align:center;padding:8px 6px;color:var(--green);font-size:10px;">TB/NGÀY</th>
              <th style="text-align:center;padding:8px 6px;color:var(--yellow);font-size:10px;">CAO NHẤT</th>
              <th style="text-align:center;padding:8px 6px;color:var(--text-muted);font-size:10px;">SỐ NGÀY</th>
            </tr>
          </thead>
          <tbody>
            ${workshopTableRows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Chưa có dữ liệu giao hàng</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Quick filter buttons
  section.querySelectorAll('.delivery-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      deliveryFilter.from = quickFilters[idx].from;
      deliveryFilter.to = quickFilters[idx].to;
      renderDeliveryChart();
    });
  });

  // Date inputs
  document.getElementById('delivery-from')?.addEventListener('change', (e) => {
    deliveryFilter.from = e.target.value;
    renderDeliveryChart();
  });
  document.getElementById('delivery-to')?.addEventListener('change', (e) => {
    deliveryFilter.to = e.target.value;
    renderDeliveryChart();
  });

  // Render chart
  const deliveryCanvas = document.getElementById('daily-delivery-chart');
  if (deliveryCanvas) {
    if (deliveryChartInstance) deliveryChartInstance.destroy();
    const ctx = deliveryCanvas.getContext('2d');
    const wsColors = ['#3b82f6', '#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#06b6d4', '#ec4899'];
    const datasets = wsNames.map((ws, i) => ({
      label: ws,
      data: dateRange.map(d => workshopDailyMap[ws][d] || 0),
      backgroundColor: wsColors[i % wsColors.length] + 'cc',
      borderColor: wsColors[i % wsColors.length],
      borderWidth: 1,
      borderRadius: 3,
    }));
    deliveryChartInstance = new Chart(ctx, {
      type: 'bar',
      data: { labels: dailyLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
          y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } }, beginAtZero: true }
        },
        plugins: {
          legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 12, padding: 8 } },
          tooltip: { callbacks: { footer: (items) => `Tổng: ${items.reduce((s, i) => s + i.raw, 0)} sp` } }
        }
      }
    });
  }
}

function renderFilterBar(filterBarEl, allWorkshops) {
  const workshopOptions = allWorkshops.map(w => `<option value="${w}" ${w === dashboardFilters.workshopSearch ? 'selected' : ''}>${w}</option>`).join('');
  const hasFilter = dashboardFilters.lotSearch || dashboardFilters.workshopSearch || dashboardFilters.dateFrom || dashboardFilters.dateTo || dashboardFilters.prioOnly;

  filterBarEl.innerHTML = `
    <div class="dash-filter-bar" id="dash-filter-bar-inner">
      <div class="dash-filter-item">
        <span class="dash-filter-icon">🔍</span>
        <input type="text" id="dash-filter-lot" placeholder="Tìm tên lô, mã lô, khách hàng..." value="${dashboardFilters.lotSearch}" autocomplete="off" />
      </div>
      <div class="dash-filter-item dash-filter-select-wrapper">
        <span class="dash-filter-icon">🏭</span>
        <select id="dash-filter-workshop">
          <option value="">-- Tất cả xưởng --</option>
          ${workshopOptions}
        </select>
      </div>
      <div class="dash-filter-item">
        <span class="dash-filter-icon">📅</span>
        <label style="font-size:11px;color:var(--text-muted);font-weight:600;white-space:nowrap;">Từ ngày</label>
        <input type="date" id="dash-filter-date-from" value="${dashboardFilters.dateFrom}" style="font-size:12px;" />
      </div>
      <div class="dash-filter-item">
        <label style="font-size:11px;color:var(--text-muted);font-weight:600;white-space:nowrap;">Đến ngày</label>
        <input type="date" id="dash-filter-date-to" value="${dashboardFilters.dateTo}" style="font-size:12px;" />
      </div>
      <button class="dash-filter-btn${dashboardFilters.prioOnly ? ' active' : ''}" id="dash-filter-prio" title="Chỉ hiện lô có size ưu tiên">
        ⭐ Size Ưu Tiên
      </button>
      <button class="dash-filter-clear" id="dash-filter-clear" style="${hasFilter ? '' : 'display:none'}">✕ Xóa bộ lọc</button>
    </div>
  `;

  // Setup listeners
  const lotInput = document.getElementById('dash-filter-lot');
  const workshopSelect = document.getElementById('dash-filter-workshop');
  const dateFromInput = document.getElementById('dash-filter-date-from');
  const dateToInput = document.getElementById('dash-filter-date-to');
  const prioBtn = document.getElementById('dash-filter-prio');
  const clearBtn = document.getElementById('dash-filter-clear');

  let debounce = null;
  const triggerTextFilter = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      dashboardFilters.lotSearch = lotInput?.value || '';
      renderDashboard();
    }, 300);
  };

  lotInput?.addEventListener('input', triggerTextFilter);

  workshopSelect?.addEventListener('change', () => {
    dashboardFilters.workshopSearch = workshopSelect.value;
    renderDashboard();
  });

  dateFromInput?.addEventListener('change', () => {
    dashboardFilters.dateFrom = dateFromInput.value;
    renderDashboard();
  });

  dateToInput?.addEventListener('change', () => {
    dashboardFilters.dateTo = dateToInput.value;
    renderDashboard();
  });

  prioBtn?.addEventListener('click', () => {
    dashboardFilters.prioOnly = !dashboardFilters.prioOnly;
    renderDashboard();
  });

  clearBtn?.addEventListener('click', () => {
    dashboardFilters = { lotSearch: '', workshopSearch: '', dateFrom: '', dateTo: '', prioOnly: false };
    filtersRendered = false;
    renderDashboard();
  });
}

function showLotDetailPopup(lotId) {
  const lot = store.getLot(lotId);
  if (!lot) return;

  const summary = store.getLotSummary(lotId);
  if (!summary) return;

  const sizeBreak = store.getSizeBreakdownByLot(lotId);
  const prioSizes = store.getPrioritySizes(lotId);
  const lotSewings = store.getSewingsByLot(lotId);
  const workshopNames = [...new Set(lotSewings.map(s => s.workshopName).filter(Boolean))];
  const progress = summary.totalCut > 0 ? Math.round((summary.totalPassed / summary.totalCut) * 100) : 0;
  const totalRemaining = summary.totalCut - summary.totalPassed - summary.totalFailed;
  const isCompleted = summary.totalCut > 0 && totalRemaining <= 0 && summary.totalFailed === 0;

  // Sort: remaining > 0 first (ascending), then done
  const sortedSizes = [...sizeBreak].sort((a, b) => {
    const remA = a.cut - a.passed - a.failed;
    const remB = b.cut - b.passed - b.failed;
    if (remA > 0 && remB <= 0) return -1;
    if (remA <= 0 && remB > 0) return 1;
    if (remA > 0 && remB > 0) return remA - remB;
    return 0;
  });

  // Build remaining sizes section
  const remainingSizes = sortedSizes.filter(s => (s.cut - s.passed - s.failed) > 0);
  const doneSizes = sortedSizes.filter(s => (s.cut - s.passed - s.failed) <= 0);

  const buildSizeRow = (s) => {
    const rem = s.cut - s.passed - s.failed;
    const isPrio = prioSizes.includes(s.size);
    const isLow = rem > 0 && rem < 10;
    const isDone = rem <= 0;
    const remColor = isDone ? '#4ade80' : isLow ? '#f87171' : '#facc15';
    const remBg = isDone ? 'rgba(34,197,94,0.12)' : isLow ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)';
    return `<tr style="${isPrio ? 'background:rgba(245,158,11,0.06);' : ''}">
      <td style="font-weight:700;font-size:14px;">${isPrio ? '⭐ ' : ''}${s.size}</td>
      <td style="text-align:center;font-weight:800;font-size:16px;padding:6px 12px;background:${remBg};color:${remColor};border-radius:6px;">${isDone ? 'ĐỦ' : rem}</td>
      <td style="text-align:center;color:var(--blue)">${s.cut}</td>
      <td style="text-align:center;color:var(--green)">${s.passed}</td>
      <td style="text-align:center;color:var(--red)">${s.failed}</td>
    </tr>`;
  };

  // Build sewing progress per workshop
  const workshopRows = lotSewings.map(sewing => {
    const sizes = store.getSewingSizes(sewing.id);
    const totalSent = sizes.reduce((s, sz) => s + sz.quantitySent, 0);
    const totalReturned = sizes.reduce((s, sz) => s + sz.quantityReturned, 0);
    const remaining = totalSent - totalReturned;
    const sizeDetail = sizes.filter(sz => sz.quantitySent - sz.quantityReturned > 0)
      .map(sz => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;background:rgba(234,179,8,0.12);border-radius:4px;font-size:11px;color:#facc15;font-weight:600">${sz.size}: ${sz.quantitySent - sz.quantityReturned}</span>`)
      .join('');
    const doneDetail = sizes.filter(sz => sz.quantitySent - sz.quantityReturned <= 0 && sz.quantitySent > 0)
      .map(sz => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;background:rgba(34,197,94,0.12);border-radius:4px;font-size:11px;color:#4ade80;font-weight:600">${sz.size}: ĐỦ</span>`)
      .join('');
    return `<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:700;font-size:13px;">🏭 ${sewing.workshopName || '—'}</span>
        <span style="font-size:12px;color:var(--text-muted)">${sewing.id}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;margin-bottom:6px;">
        <span>Gửi: <strong style="color:var(--blue)">${totalSent}</strong></span>
        <span>Giao: <strong style="color:var(--green)">${totalReturned}</strong></span>
        <span>Còn: <strong style="color:${remaining > 0 ? 'var(--yellow)' : 'var(--green)'}">${remaining > 0 ? remaining : 'ĐỦ'}</strong></span>
      </div>
      <div>${sizeDetail}${doneDetail}</div>
    </div>`;
  }).join('');

  const lotTitle = `${(lot.fabricName || '').toUpperCase()}${lot.color ? ' ' + lot.color.toUpperCase() : ''}`;

  const modalBody = `
    <div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div>
          <div style="font-size:11px;color:var(--text-muted);">${lot.id} · ${lot.customerName || ''}</div>
          <div style="font-size:18px;font-weight:800;color:var(--text-primary);">🧵 ${lotTitle}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:24px;font-weight:800;color:${progress >= 100 ? 'var(--green)' : 'var(--accent)'};">${progress}%</div>
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;">tiến độ</div>
        </div>
      </div>
      ${isCompleted ? '<div style="text-align:center;padding:8px;background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(16,163,74,0.15));border:1px solid rgba(34,197,94,0.4);border-radius:8px;color:#4ade80;font-size:14px;font-weight:800;letter-spacing:1px;margin-bottom:12px;">✅ ĐÃ GIAO HẾT</div>' : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;">
        <span style="padding:3px 10px;border-radius:12px;background:rgba(59,130,246,0.12);color:var(--blue);font-weight:600;">Cắt: ${formatNumber(summary.totalCut)}</span>
        <span style="padding:3px 10px;border-radius:12px;background:rgba(249,115,22,0.12);color:var(--orange);font-weight:600;">Đang may: ${formatNumber(Math.max(0, summary.totalSent - summary.totalReturned))}</span>
        <span style="padding:3px 10px;border-radius:12px;background:rgba(34,197,94,0.12);color:var(--green);font-weight:600;">QC Pass: ${formatNumber(summary.totalPassed)}</span>
        ${summary.totalFailed > 0 ? `<span style="padding:3px 10px;border-radius:12px;background:rgba(239,68,68,0.12);color:var(--red);font-weight:600;">Lỗi: ${formatNumber(summary.totalFailed)}</span>` : ''}
        <span style="padding:3px 10px;border-radius:12px;background:rgba(234,179,8,0.12);color:#facc15;font-weight:600;">Còn lại: ${formatNumber(Math.max(0, totalRemaining))}</span>
      </div>
    </div>

    <!-- SIZE TABLE -->
    <div style="margin-bottom:16px;">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">📊 Chi tiết theo size</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
            <th style="text-align:left;padding:6px 8px;color:var(--text-muted);font-size:10px;">SIZE</th>
            <th style="text-align:center;padding:6px 8px;color:#facc15;font-size:10px;">CÒN LẠI</th>
            <th style="text-align:center;padding:6px 8px;color:var(--blue);font-size:10px;">CẮT</th>
            <th style="text-align:center;padding:6px 8px;color:var(--green);font-size:10px;">ĐÃ GIAO</th>
            <th style="text-align:center;padding:6px 8px;color:var(--red);font-size:10px;">LỖI</th>
          </tr>
        </thead>
        <tbody>
          ${remainingSizes.map(s => buildSizeRow(s)).join('')}
          ${doneSizes.length > 0 && remainingSizes.length > 0 ? '<tr><td colspan="5" style="padding:4px 0;"><div style="border-top:1px dashed rgba(34,197,94,0.3);"></div></td></tr>' : ''}
          ${doneSizes.map(s => buildSizeRow(s)).join('')}
        </tbody>
      </table>
    </div>

    <!-- WORKSHOP PROGRESS -->
    ${workshopRows ? `<div>
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">🏭 Tiến độ theo xưởng</div>
      ${workshopRows}
    </div>` : ''}
  `;

  openModal(`📋 Chi tiết lô: ${lotTitle} - ${lot.customerName || ''}`, modalBody,
    `<button class="btn btn-secondary" onclick="document.getElementById('modal-overlay').classList.add('hidden')">Đóng</button>`);
}
