// ===== MODULE 6: DASHBOARD =====
import { store } from './store.js';
import { formatNumber, formatDate, priorityBadge, statusBadge, lotLabel } from './ui.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let sizeChart = null;

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

  // === Build per-lot detail table ===
  const lotTableRows = lots.map(lot => {
    const summary = store.getLotSummary(lot.id);
    if (!summary) return '';
    const sizeBreak = store.getSizeBreakdownByLot(lot.id);
    const prioSizes = store.getPrioritySizes(lot.id);
    const progress = summary.totalCut > 0 ? Math.round((summary.totalPassed / summary.totalCut) * 100) : 0;

    const sizeColumns = sizeBreak.map(s => {
      const isPrio = prioSizes.includes(s.size);
      return `<div style="display:inline-block;margin:2px 4px;padding:3px 8px;border-radius:4px;font-size:11px;
        background:${isPrio ? 'rgba(255,170,0,0.15)' : 'var(--bg-secondary)'};
        border:1px solid ${isPrio ? 'var(--yellow)' : 'var(--border)'}">
        <strong>${isPrio ? '⭐' : ''}${s.size}</strong>
        <span style="color:var(--blue)">C:${s.cut}</span>
        <span style="color:var(--orange)">M:${s.returned}</span>
        <span style="color:var(--green)">P:${s.passed}</span>
        ${s.failed > 0 ? `<span style="color:var(--red)">F:${s.failed}</span>` : ''}
      </div>`;
    }).join('');

    return `<tr>
      <td><strong>${lot.id}</strong><div style="font-size:11px;color:var(--text-muted)">${lot.customerName}</div></td>
      <td>${lot.fabricName}<div style="font-size:11px;color:var(--text-muted)">${lot.color}</div></td>
      <td>${formatDate(lot.dateReceived)}</td>
      <td>${priorityBadge(lot.priority)}</td>
      <td>${statusBadge(lot.status)}</td>
      <td>${formatNumber(lot.totalFabric)}m</td>
      <td>${formatNumber(summary.totalCut)}</td>
      <td>${formatNumber(summary.totalReturned)}</td>
      <td style="color:var(--green)">${formatNumber(summary.totalPassed)}</td>
      <td style="color:var(--red)">${formatNumber(summary.totalFailed)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div class="progress-bar-bg" style="width:60px;height:6px">
            <div class="progress-bar-fill" style="width:${progress}%"></div>
          </div>
          <span style="font-size:11px;font-weight:600">${progress}%</span>
        </div>
      </td>
      <td style="white-space:normal;max-width:400px">${sizeColumns}</td>
    </tr>`;
  }).join('');

  // === Priority Size Tracking ===
  const prioTrackingRows = [];
  lots.forEach(lot => {
    const prioSizes = store.getPrioritySizes(lot.id);
    if (prioSizes.length === 0) return;
    const sizeBreak = store.getSizeBreakdownByLot(lot.id);

    prioSizes.forEach(size => {
      const data = sizeBreak.find(s => s.size === size);
      if (!data) return;

      let stage = 'Chưa bắt đầu';
      let stageColor = 'var(--text-muted)';
      if (data.passed > 0) { stage = '✅ QC Passed'; stageColor = 'var(--green)'; }
      else if (data.returned > 0) { stage = '🔍 Đang QC'; stageColor = 'var(--blue)'; }
      else if (data.inProgress > 0) { stage = '🪡 Đang May'; stageColor = 'var(--yellow)'; }
      else if (data.sent > 0) { stage = '🪡 Gửi May'; stageColor = 'var(--orange)'; }
      else if (data.cut > 0) { stage = '✂️ Đã Cắt'; stageColor = 'var(--blue)'; }

      prioTrackingRows.push(`<tr>
        <td><strong>${lot.id}</strong> <span style="color:var(--text-muted);font-size:11px">${lot.customerName}</span></td>
        <td><strong>⭐ ${size}</strong></td>
        <td>${data.cut}</td>
        <td>${data.sent}</td>
        <td>${data.returned}</td>
        <td style="color:var(--green)">${data.passed}</td>
        <td style="color:var(--red)">${data.failed}</td>
        <td style="color:${stageColor};font-weight:600">${stage}</td>
        <td style="color:${data.missing > 0 ? 'var(--red)' : 'var(--green)'}; font-weight:600">${data.missing}</td>
      </tr>`);
    });
  });

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

  // === Chart data ===
  const allSizeData = {};
  lots.forEach(lot => {
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

  container.innerHTML = `
    <!-- Alerts -->
    ${alerts.length > 0 ? `<div class="dashboard-section">
      <h3>🚨 Cảnh Báo (${alerts.length})</h3>
      <ul class="alert-list">${alerts.map(a => `<li class="alert-item ${a.type}">${a.icon} ${a.text}</li>`).join('')}</ul>
    </div>` : ''}

    <!-- Priority Size Tracking -->
    ${prioTrackingRows.length > 0 ? `<div class="dashboard-section">
      <h3>⭐ Size Ưu Tiên - Đang Ở Đâu?</h3>
      <div class="table-wrapper"><table>
        <thead><tr><th>Lô</th><th>Size</th><th>Cắt</th><th>Gửi May</th><th>Nhận Lại</th><th>QC Pass</th><th>QC Fail</th><th>Đang Ở</th><th>Thiếu</th></tr></thead>
        <tbody>${prioTrackingRows.join('')}</tbody>
      </table></div>
    </div>` : ''}

    <!-- Per-Lot Detail Table -->
    <div class="dashboard-section">
      <h3>📋 Chi Tiết Từng Lô</h3>
      <div class="table-wrapper" style="overflow-x:auto"><table>
        <thead><tr>
          <th>Lô</th><th>Vải</th><th>Ngày Nhận</th><th>Ưu Tiên</th><th>Trạng Thái</th>
          <th>Tổng Vải</th><th>Tổng Cắt</th><th>May Trả</th><th>QC Pass</th><th>QC Fail</th><th>Tiến Độ</th><th>Chi Tiết Size (C=Cắt M=May P=Pass F=Fail)</th>
        </tr></thead>
        <tbody>${lotTableRows}</tbody>
      </table></div>
    </div>

    <!-- Chart -->
    ${chartSizes.length > 0 ? `<div class="dashboard-section">
      <h3>📊 So Sánh Tổng Theo Size (Tất Cả Lô)</h3>
      <div class="chart-container"><canvas id="chart-size"></canvas></div>
    </div>` : ''}
  `;

  // Render chart
  if (chartSizes.length > 0) renderSizeChart(chartSizes, allSizeData);
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
