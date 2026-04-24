// ===== MAIN ENTRY POINT =====
import './style.css';
import { store } from './store.js';
import { initModalClose, showToast } from './ui.js';
import { initFabricModule, renderKanbanBoard as renderFabricBoard } from './fabric.js';
import { initSewingModule, renderSewingTable } from './sewing.js';
import { initHistoryModule, renderHistory } from './history.js';
import { initReworkModule, renderReworkBoard } from './rework.js';
import { renderDashboard } from './dashboard.js';
import { initTechpack } from './techpack.js';

// === Navigation ===
let currentModule = 'dashboard';

function switchModule(moduleName) {
  currentModule = moduleName;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === moduleName);
  });

  // Show/hide modules
  document.querySelectorAll('.module').forEach(mod => {
    mod.classList.toggle('active', mod.id === `module-${moduleName}`);
  });

  // Re-render active module to refresh data
  refreshModule(moduleName);
}

function refreshModule(moduleName) {
  switch (moduleName) {
    case 'dashboard': renderDashboard(); break;
    case 'fabric': renderFabricBoard(); break;
    case 'sewing': renderSewingTable(); break;
    case 'history': renderHistory(); break;
    case 'rework': renderReworkBoard(); break;
    case 'techpack': {
      const tpSearch = document.getElementById('techpack-search');
      if (tpSearch) tpSearch.dispatchEvent(new Event('input'));
      break;
    }
  }
}

// === Init ===
function init() {
  initModalClose();

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchModule(item.dataset.module);
    });
  });

  // Export
  document.getElementById('btn-export-data').addEventListener('click', () => {
    const data = store.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xuong_may_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã xuất dữ liệu!');
  });

  // Import
  document.getElementById('btn-import-data').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
  });
  document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (store.importData(reader.result)) {
        showToast('Đã nhập dữ liệu thành công!');
        refreshModule(currentModule);
      } else {
        showToast('Lỗi khi nhập dữ liệu!', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Init first module
  initFabricModule();
  initSewingModule();
  initHistoryModule();
  initReworkModule();
  initTechpack();
  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
