// ===== SHARED UI UTILITIES =====

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 2500);
  setTimeout(() => toast.remove(), 2800);
}

export function openModal(title, bodyHTML, footerHTML = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

export function statusBadge(status) {
  const cls = status.toLowerCase().replace(/\s+/g, '-');
  const translations = {
    'New': 'MỚI',
    'Cutting': 'ĐANG CẮT',
    'Sewing': 'ĐANG MAY',
    'QC': 'ĐANG QC',
    'Done': 'HOÀN TẤT'
  };
  const translated = translations[status] || status.toUpperCase();
  return `<span class="badge badge-${cls}">${translated}</span>`;
}

export function priorityBadge(priority) {
  const cls = priority.toLowerCase().replace(/\s+/g, '-');
  const translations = {
    'Normal': 'BÌNH THƯỜNG',
    'Urgent': 'GẤP',
    'Very Urgent': 'RẤT GẤP'
  };
  const translated = translations[priority] || priority.toUpperCase();
  return `<span class="badge badge-${cls}">${translated}</span>`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN');
}

export function formatNumber(n) {
  if (n === undefined || n === null) return '0';
  return n.toLocaleString('vi-VN');
}

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];

export function lotLabel(lot) {
  if (!lot) return '';
  const fabric = lot.fabricName || '';
  const color = lot.color ? ` ${lot.color}` : '';
  const meters = lot.totalFabric ? ` | ${lot.totalFabric.toLocaleString('vi-VN')}m` : '';
  return `${lot.id} | ${lot.customerName} | ${fabric}${color}${meters}`;
}

export function buildSizeTable(sizes, fields, editable = false) {
  const headerCells = ['Size', ...fields.map(f => f.label)].map(h => `<th>${h}</th>`).join('');
  const rows = sizes.map((s, i) => {
    const cells = fields.map(f => {
      if (editable && f.editable !== false) {
        return `<td><input type="number" min="0" value="${s[f.key] || 0}" data-index="${i}" data-field="${f.key}" class="size-input" /></td>`;
      }
      const val = s[f.key] || 0;
      return `<td>${val}</td>`;
    }).join('');
    return `<tr><td><strong>${s.size}</strong></td>${cells}</tr>`;
  }).join('');

  return `<table class="size-entry-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function buildFilterBar(containerId, filters) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = filters.map(f => {
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      return `<div class="filter-group"><label>${f.label}:</label><select id="${f.id}">${opts}</select></div>`;
    }
    if (f.type === 'datalist') {
      const opts = f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
      return `<div class="filter-group"><label>${f.label}:</label>
        <input type="text" id="${f.id}" list="${f.id}-list" placeholder="${f.placeholder || 'Gõ để tìm...'}" autocomplete="off" />
        <datalist id="${f.id}-list">${opts}</datalist>
      </div>`;
    }
    return `<div class="filter-group"><label>${f.label}:</label><input type="text" id="${f.id}" placeholder="${f.placeholder || ''}" /></div>`;
  }).join('');
}

// Setup modal close
export function initModalClose() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
}
