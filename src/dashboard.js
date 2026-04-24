// ===== MODULE 6: DASHBOARD =====
import { store } from './store.js';
import { formatNumber, formatDate, priorityBadge, statusBadge, lotLabel } from './ui.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let sizeChart = null;

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

  if (lots.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:80px 20px">
      <div class="empty-icon">📊</div>
      <p style="font-size:16px;margin-bottom:8px">Chào mừng đến Xưởng May Manager!</p>
      <p>Bắt đầu bằng cách thêm lô vải đầu tiên ở menu bên trái.</p>
    </div>`;
    return;
  }

  // === Collect unique workshops ===
  const allWorkshops = [...new Set(store.getSewings().map(s => s.workshopName).filter(Boolean))];

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

  // === Chart data ===
  const allSizeData = {};
  filteredLots.forEach(lot => {
    const sizeBreak = store.getSizeBreakdownByLot(lot.id);
    sizeBreak.forEach(s => {
      if (!allSizeData[s.size]) allSizeData[s.size] = { cut: 0, returned: 0, passed: 0 };
      allSizeData[s.size].cut += s.cut;
      allSizeData[s.size].returned += s.returned;
      allSizeData[s.size].passed += s.passed;
    });
  });
  const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];
  const chartSizes = [...sizeOrder.filter(s => allSizeData[s]), ...Object.keys(allSizeData).filter(s => !sizeOrder.includes(s))];

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
    <!-- FILTER BAR -->
    <div class="dash-filter-bar" id="dash-filter-bar">
      <div class="dash-filter-item">
        <span class="dash-filter-icon">🔍</span>
        <input type="text" id="dash-filter-lot" placeholder="Tìm tên lô, mã lô, khách hàng..." value="${dashboardFilters.lotSearch}" autocomplete="off" />
      </div>
      <div class="dash-filter-item">
        <span class="dash-filter-icon">🏭</span>
        <input type="text" id="dash-filter-workshop" placeholder="Lọc theo xưởng may..." value="${dashboardFilters.workshopSearch}" autocomplete="off" list="dash-workshop-list" />
        <datalist id="dash-workshop-list">
          ${allWorkshops.map(w => `<option value="${w}">`).join('')}
        </datalist>
      </div>
      <div class="dash-filter-item">
        <span class="dash-filter-icon">📦</span>
        <input type="text" id="dash-filter-material" placeholder="Lọc phụ liệu..." value="${dashboardFilters.materialSearch}" autocomplete="off" />
      </div>
      <button class="dash-filter-btn${dashboardFilters.prioOnly ? ' active' : ''}" id="dash-filter-prio" title="Chỉ hiện lô có size ưu tiên">
        ⭐ Size Ưu Tiên
      </button>
      ${(dashboardFilters.lotSearch || dashboardFilters.workshopSearch || dashboardFilters.materialSearch || dashboardFilters.prioOnly) ? 
        `<button class="dash-filter-clear" id="dash-filter-clear">✕ Xóa bộ lọc</button>` : ''}
    </div>

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

    <!-- Chart -->
    ${chartSizes.length > 0 ? `<div class="dashboard-section">
      <h3>📊 So Sánh Tổng Theo Size</h3>
      <div class="chart-container"><canvas id="chart-size"></canvas></div>
    </div>` : ''}
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

  // === Setup filter listeners ===
  setupDashboardFilters();

  // Render chart
  if (chartSizes.length > 0) renderSizeChart(chartSizes, allSizeData);
}

function setupDashboardFilters() {
  const lotInput = document.getElementById('dash-filter-lot');
  const workshopInput = document.getElementById('dash-filter-workshop');
  const matInput = document.getElementById('dash-filter-material');
  const prioBtn = document.getElementById('dash-filter-prio');
  const clearBtn = document.getElementById('dash-filter-clear');

  let debounce = null;

  const triggerFilter = () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      dashboardFilters.lotSearch = lotInput?.value || '';
      dashboardFilters.workshopSearch = workshopInput?.value || '';
      dashboardFilters.materialSearch = matInput?.value || '';
      renderDashboard();
    }, 300);
  };

  lotInput?.addEventListener('input', triggerFilter);
  workshopInput?.addEventListener('input', triggerFilter);
  matInput?.addEventListener('input', triggerFilter);

  prioBtn?.addEventListener('click', () => {
    dashboardFilters.prioOnly = !dashboardFilters.prioOnly;
    renderDashboard();
  });

  clearBtn?.addEventListener('click', () => {
    dashboardFilters = { lotSearch: '', workshopSearch: '', materialSearch: '', prioOnly: false };
    renderDashboard();
  });
}

function renderSizeChart(sizes, sizeData) {
  const canvas = document.getElementById('chart-size');
  if (!canvas) return;
  if (sizeChart) sizeChart.destroy();

  sizeChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sizes,
      datasets: [
        { label: 'Cắt', data: sizes.map(s => sizeData[s].cut), backgroundColor: 'rgba(69,170,242,0.7)', borderRadius: 4 },
        { label: 'May Trả', data: sizes.map(s => sizeData[s].returned), backgroundColor: 'rgba(255,170,0,0.7)', borderRadius: 4 },
        { label: 'QC Pass', data: sizes.map(s => sizeData[s].passed), backgroundColor: 'rgba(0,214,143,0.7)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { color: '#8b90a5', font: { family: 'Inter', size: 11 } } }
      },
      scales: {
        x: { ticks: { color: '#8b90a5', font: { family: 'Inter' } }, grid: { color: 'rgba(42,46,63,0.5)' } },
        y: { ticks: { color: '#8b90a5', font: { family: 'Inter' } }, grid: { color: 'rgba(42,46,63,0.5)' }, beginAtZero: true }
      }
    }
  });
}
