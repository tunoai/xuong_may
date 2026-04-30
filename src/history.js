// ===== MODULE: LỊCH SỬ GIAO HÀNG =====
import { store } from './store.js';
import { formatDate, formatNumber, buildFilterBar } from './ui.js';

export function initHistoryModule() {
  // Build filters
  const lots = store.getLots();
  const customers = [...new Set(lots.map(l => l.customerName).filter(Boolean))];

  buildFilterBar('history-filters', [
    { type: 'select', id: 'filter-history-customer', label: 'Khách hàng', options: [
      { value: '', label: 'Tất cả' },
      ...customers.map(c => ({ value: c, label: c }))
    ]},
    { type: 'select', id: 'filter-history-lot', label: 'Lô vải', options: [
      { value: '', label: 'Tất cả' },
      ...lots.map(l => ({ value: l.id, label: `${l.fabricName || l.id}${l.color ? ' ' + l.color : ''} ${l.totalFabric ? formatNumber(l.totalFabric) + 'm' : ''}` }))
    ]}
  ]);

  document.getElementById('filter-history-customer')?.addEventListener('change', renderHistory);
  document.getElementById('filter-history-lot')?.addEventListener('change', renderHistory);
}

export function renderHistory() {
  const container = document.getElementById('history-container');
  if (!container) return;

  const filterCustomer = document.getElementById('filter-history-customer')?.value || '';
  const filterLot = document.getElementById('filter-history-lot')?.value || '';

  const allQC = store.getQCs();
  // Filter for completed passes + rework approved
  let historyRecords = allQC.filter(q => q.passAction === 'Done');

  // Also include rework-approved entries
  const reworkApproved = store.getReworks().filter(r => r.status === 'Approved');
  
  // Build combined list
  let rows = [];

  // QC pass records
  historyRecords.forEach(qc => {
    const sewing = store.getSewing(qc.sewingId);
    const lot = store.getLot(sewing?.lotId);
    
    if (filterCustomer && lot?.customerName !== filterCustomer) return;
    if (filterLot && sewing?.lotId !== filterLot) return;
    
    const results = store.getQCResults(qc.id);
    const passItems = results.filter(r => r.passed > 0);
    const totalPassed = passItems.reduce((sum, r) => sum + r.passed, 0);
    const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];
    
    const lotName = lot ? `${lot.fabricName}${lot.color ? ' ' + lot.color : ''} ${formatNumber(lot.totalFabric)}m` : '';
    
    const sizesHtml = passItems.map(r => {
      const isPrio = prioSizes.includes(r.size);
      return `<span class="size-pill${isPrio ? ' priority' : ''}" style="margin-right:4px">${isPrio ? '⭐ ' : ''}${r.size}: ${r.passed}</span>`;
    }).join('');

    rows.push({
      date: qc.dateQC,
      html: `<tr>
        <td>${formatDate(qc.dateQC)}</td>
        <td><strong>${lot ? lot.customerName : ''}</strong></td>
        <td>${lotName}</td>
        <td>${sewing ? sewing.workshopName : ''}</td>
        <td>${sizesHtml}</td>
        <td><strong style="color:var(--green)">${formatNumber(totalPassed)}</strong></td>
        <td>${qc.inspectorName || ''}</td>
        <td><span class="status-badge" style="background:rgba(34,197,94,0.15);color:var(--green)">QC Duyệt</span></td>
        <td><button class="btn-icon" style="color:var(--red)" onclick="deleteHistoryRecord('${qc.id}', 'qc')" title="Xóa lịch sử này">🗑️</button></td>
      </tr>`
    });
  });

  // Rework approved records
  reworkApproved.forEach(r => {
    const lot = store.getLot(r.lotId);
    
    if (filterCustomer && lot?.customerName !== filterCustomer) return;
    if (filterLot && r.lotId !== filterLot) return;
    
    const prioSizes = lot ? store.getPrioritySizes(lot.id) : [];
    const lotName = lot ? `${lot.fabricName}${lot.color ? ' ' + lot.color : ''} ${formatNumber(lot.totalFabric)}m` : '';
    
    const fixedItems = r.fixedBreakdown ? r.fixedBreakdown.split(', ') : [];
    const sizesHtml = fixedItems.map(item => {
      const [size, qty] = item.split(':');
      const isPrio = prioSizes.includes(size);
      return `<span class="size-pill${isPrio ? ' priority' : ''}" style="margin-right:4px">${isPrio ? '⭐ ' : ''}${size}: ${qty}</span>`;
    }).join('');

    const totalFixed = fixedItems.reduce((sum, item) => sum + (parseInt(item.split(':')[1]) || 0), 0);

    rows.push({
      date: r.approvedDate || r.dateSentBack,
      html: `<tr>
        <td>${formatDate(r.approvedDate || r.dateSentBack)}</td>
        <td><strong>${lot ? lot.customerName : ''}</strong></td>
        <td>${lotName}</td>
        <td>—</td>
        <td>${sizesHtml}</td>
        <td><strong style="color:var(--blue)">${formatNumber(totalFixed)}</strong></td>
        <td>—</td>
        <td><span class="status-badge" style="background:rgba(59,130,246,0.15);color:var(--blue)">Sửa Lỗi Duyệt</span></td>
        <td><button class="btn-icon" style="color:var(--red)" onclick="deleteHistoryRecord('${r.id}', 'rework')" title="Xóa lịch sử này">🗑️</button></td>
      </tr>`
    });
  });

  // Sort by date desc
  rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  if (rows.length === 0) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted)">Chưa có lịch sử giao hàng nào.</div>';
    return;
  }

  container.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Ngày</th>
          <th>Khách Hàng</th>
          <th>Lô Vải</th>
          <th>Xưởng May</th>
          <th>Chi Tiết Size</th>
          <th>Tổng SL</th>
          <th>Kiểm Tra</th>
          <th>Nguồn</th>
          <th>Hành Động</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => r.html).join('')}
      </tbody>
    </table>
  `;
}

window.deleteHistoryRecord = (id, type) => {
  if (!confirm('Bạn có chắc muốn xóa lịch sử giao hàng này? Thao tác này không thể hoàn tác.')) return;
  
  if (type === 'qc') {
    store.deleteQC(id);
  } else if (type === 'rework') {
    store.deleteRework(id);
  }
  
  renderHistory();
  import('./ui.js').then(module => module.showToast('Đã xóa thành công lịch sử giao hàng.'));
};
