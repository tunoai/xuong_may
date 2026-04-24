// ===== MODULE 6: DASHBOARD =====
import { store } from './store.js';
import { formatNumber, formatDate, priorityBadge, statusBadge, lotLabel } from './ui.js';
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
    alerts.push({ type: 'urgent', icon: '⚠️', text: `${l.id} - ${l.customerName}: ${l.priority}` });
  });

  store.getSewings().filter(s => s.status === 'In Progress').forEach(s => {
    const sizes = store.getSewingSizes(s.id);
    const inProg = sizes.reduce((sum, sz) => sum + sz.quantitySent - sz.quantityReturned, 0);
    if (inProg > 0) {
      const detail = sizes.filter(sz => sz.quantitySent - sz.quantityReturned > 0)
        .map(sz => `${sz.size}:${sz.quantitySent - sz.quantityReturned}`).join(', ');
      alerts.push({ type: 'info', icon: '🪡', text: `${s.id} (${s.workshopName}): ${inProg} pcs đang may [${detail}]` });
    }
  });

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

    // Find workshops holding this lot
    const lotSewings = store.getSewingsByLot(lot.id);
    const workshopNames = [...new Set(lotSewings.map(s => s.workshopName).filter(Boolean))];

    const sizeChips = sizeBreak.map(s => {
      const isPrio = prioSizes.includes(s.size);
      return `<div class="dash-size-chip${isPrio ? ' prio' : ''}">
        <span class="dash-size-label">${isPrio ? '⭐ ' : ''}${s.size}</span>
        <div class="dash-size-nums">
          <span class="sz-cut" title="Cắt">C:${s.cut}</span>
          <span class="sz-sew" title="Đang may">${s.inProgress > 0 ? `M:${s.inProgress}` : ''}</span>
          <span class="sz-pass" title="Pass">P:${s.passed}</span>
          ${s.failed > 0 ? `<span class="sz-fail" title="Fail">F:${s.failed}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="dash-lot-card${hasPrio ? ' dash-prio' : ''}">
      <div class="dash-lot-header">
        <div class="dash-lot-id">
          <span class="dash-lot-code">${lot.id}</span>
          ${statusBadge(lot.status)}
        </div>
        <div class="dash-lot-priority">${priorityBadge(lot.priority)}</div>
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
        <div class="dash-sizes-title">Chi tiết size</div>
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
    <!-- OVERVIEW STATS -->
    <div class="stat-row">
      <div class="stat-card blue">
        <div class="stat-label">Tổng Đã Cắt</div>
        <div class="stat-value">${formatNumber(totalCutAll)}<span class="stat-unit">pcs</span></div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Đang May</div>
        <div class="stat-value">${formatNumber(totalSewingAll)}<span class="stat-unit">pcs</span></div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">QC Đạt</div>
        <div class="stat-value">${formatNumber(totalPassedAll)}<span class="stat-unit">pcs</span></div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Hàng Lỗi</div>
        <div class="stat-value">${formatNumber(totalFailedAll)}<span class="stat-unit">pcs</span></div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-label">Tiến Độ Chung</div>
        <div class="stat-value">${overallProgress}<span class="stat-unit">%</span></div>
      </div>
    </div>

    <!-- Alerts -->
    ${alerts.length > 0 ? `<div class="dashboard-section">
      <h3>🚨 Cảnh Báo (${alerts.length})</h3>
      <ul class="alert-list">${alerts.map(a => `<li class="alert-item ${a.type}">${a.icon} ${a.text}</li>`).join('')}</ul>
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
