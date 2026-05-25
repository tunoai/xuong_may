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
  materialSearch: '',
  prioOnly: false
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
    const hasFilter = dashboardFilters.lotSearch || dashboardFilters.workshopSearch || dashboardFilters.materialSearch || dashboardFilters.prioOnly;
    const clearBtn = document.getElementById('dash-filter-clear');
    if (clearBtn) clearBtn.style.display = hasFilter ? '' : 'none';
    else if (hasFilter) {
      const bar = document.getElementById('dash-filter-bar-inner');
      if (bar) bar.insertAdjacentHTML('beforeend', `<button class="dash-filter-clear" id="dash-filter-clear" style="">✕ Xóa bộ lọc</button>`);
      document.getElementById('dash-filter-clear')?.addEventListener('click', () => {
        dashboardFilters = { lotSearch: '', workshopSearch: '', materialSearch: '', prioOnly: false };
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
    const inProg = sizes.reduce((sum, sz) => sum + sz.quantitySent - sz.quantityReturned, 0);
    if (inProg > 0 && inProg < 10) {
      const detail = sizes.filter(sz => sz.quantitySent - sz.quantityReturned > 0)
        .map(sz => `${sz.size}:${sz.quantitySent - sz.quantityReturned}`).join(', ');
      const lotName = lot ? `${(lot.fabricName || '').toUpperCase()}${lot.color ? ' ' + lot.color.toUpperCase() : ''} - ${lot.customerName || ''}` : s.workshopName;
      sewingAlerts.push({ 
        type: 'urgent', 
        icon: '⏳', 
        text: `${lotName} (${s.workshopName}): ${inProg} pcs đang may [${detail}] - SẮP HẾT`,
        inProg: inProg,
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

  // === Material Stock & Shortage Calculation ===
  const materialStats = {};
  store.getMaterials().forEach(m => {
    materialStats[m.id] = { name: m.name, stock: m.stock, unit: m.unit, required: 0 };
  });

  lots.forEach(lot => {
    if (!lot.techpackId) return;
    const tp = store.getTechpacks().find(t => t.id === lot.techpackId);
    if (!tp || !tp.bom) return;
    
    const summary = store.getLotSummary(lot.id);
    if (!summary) return;
    
    const pendingGarments = summary.totalCut - summary.totalReturned;
    if (pendingGarments > 0) {
      tp.bom.forEach(b => {
        if (b.materialId && materialStats[b.materialId]) {
          materialStats[b.materialId].required += (b.quantity * pendingGarments);
        }
      });
    }
  });

  const materialRows = Object.values(materialStats).filter(m => {
    if (dashboardFilters.materialSearch) {
       const q = dashboardFilters.materialSearch.toLowerCase();
       if (!m.name.toLowerCase().includes(q)) return false;
    }
    return true;
  }).map(m => {
    const isShort = m.stock < m.required;
    const shortage = isShort ? (m.required - m.stock) : 0;
    return `
      <tr>
        <td><strong>${m.name}</strong></td>
        <td style="color:var(--blue); font-weight:bold">${formatNumber(m.stock)} ${m.unit}</td>
        <td>${formatNumber(m.required)} ${m.unit}</td>
        <td style="color:${isShort ? 'var(--red)' : 'var(--green)'}; font-weight:bold">
          ${isShort ? `Thiếu ${formatNumber(shortage)}` : 'Đủ'}
        </td>
      </tr>
    `;
  }).join('');

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

    <!-- Material Shortage Report -->
    <div class="dashboard-section" style="margin-top:20px;">
      <h3>📦 Tồn Kho & Dự Báo Phụ Liệu <span style="font-size:12px; font-weight:400; color:var(--text-muted)">(Cần dùng cho hàng đang cắt/may)</span></h3>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tên Phụ Liệu</th>
              <th>Tồn Kho Hiện Tại</th>
              <th>Cần Dùng (Đang May)</th>
              <th>Trạng Thái</th>
            </tr>
          </thead>
          <tbody>
            ${materialRows || '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted)">Không có dữ liệu phụ liệu</td></tr>'}
          </tbody>
        </table>
      </div>
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
      if (confirm(`Bạn có chắc muốn xóa lô vải "${lotName}"?\nToàn bộ dữ liệu cắt, may, QC của lô này sẽ bị xóa.`)) {
        store.deleteLot(lotId);
        renderDashboard();
        showToast('Đã xóa lô vải và toàn bộ dữ liệu liên quan', 'info');
      }
    });
  });
}

function renderFilterBar(filterBarEl, allWorkshops) {
  const workshopOptions = allWorkshops.map(w => `<option value="${w}" ${w === dashboardFilters.workshopSearch ? 'selected' : ''}>${w}</option>`).join('');
  const hasFilter = dashboardFilters.lotSearch || dashboardFilters.workshopSearch || dashboardFilters.materialSearch || dashboardFilters.prioOnly;

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
        <span class="dash-filter-icon">📦</span>
        <input type="text" id="dash-filter-material" placeholder="Lọc phụ liệu..." value="${dashboardFilters.materialSearch}" autocomplete="off" />
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
  const matInput = document.getElementById('dash-filter-material');
  const prioBtn = document.getElementById('dash-filter-prio');
  const clearBtn = document.getElementById('dash-filter-clear');

  let debounce = null;
  const triggerTextFilter = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      dashboardFilters.lotSearch = lotInput?.value || '';
      dashboardFilters.materialSearch = matInput?.value || '';
      renderDashboard();
    }, 300);
  };

  lotInput?.addEventListener('input', triggerTextFilter);
  matInput?.addEventListener('input', triggerTextFilter);

  workshopSelect?.addEventListener('change', () => {
    dashboardFilters.workshopSearch = workshopSelect.value;
    renderDashboard();
  });

  prioBtn?.addEventListener('click', () => {
    dashboardFilters.prioOnly = !dashboardFilters.prioOnly;
    renderDashboard();
  });

  clearBtn?.addEventListener('click', () => {
    dashboardFilters = { lotSearch: '', workshopSearch: '', materialSearch: '', prioOnly: false };
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
      <td style="text-align:center;font-weight:800;font-size:16px;padding:6px 12px;background:${remBg};color:${remColor};border-radius:6px;">${isDone ? '✓' : rem}</td>
      <td style="text-align:center;color:var(--blue)">${s.cut}</td>
      <td style="text-align:center;color:var(--orange)">${s.inProgress}</td>
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
      .map(sz => `<span style="display:inline-block;margin:2px 4px;padding:2px 8px;background:rgba(34,197,94,0.12);border-radius:4px;font-size:11px;color:#4ade80;font-weight:600">${sz.size}: ✓</span>`)
      .join('');
    return `<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:700;font-size:13px;">🏭 ${sewing.workshopName || '—'}</span>
        <span style="font-size:12px;color:var(--text-muted)">${sewing.id}</span>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;margin-bottom:6px;">
        <span>Gửi: <strong style="color:var(--blue)">${totalSent}</strong></span>
        <span>Giao: <strong style="color:var(--green)">${totalReturned}</strong></span>
        <span>Còn: <strong style="color:${remaining > 0 ? 'var(--yellow)' : 'var(--green)'}">${remaining > 0 ? remaining : '✓'}</strong></span>
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
            <th style="text-align:center;padding:6px 8px;color:var(--orange);font-size:10px;">ĐANG MAY</th>
            <th style="text-align:center;padding:6px 8px;color:var(--green);font-size:10px;">PASS</th>
            <th style="text-align:center;padding:6px 8px;color:var(--red);font-size:10px;">LỖI</th>
          </tr>
        </thead>
        <tbody>
          ${remainingSizes.map(s => buildSizeRow(s)).join('')}
          ${doneSizes.length > 0 && remainingSizes.length > 0 ? '<tr><td colspan="6" style="padding:4px 0;"><div style="border-top:1px dashed rgba(34,197,94,0.3);"></div></td></tr>' : ''}
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
