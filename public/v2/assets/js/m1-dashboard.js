/**
 * M1 Marketing Dashboard JS
 */

const M1_API = '/api/m1';

async function m1Get(path) {
  const res = await fetch(M1_API + path);
  return res.json();
}

async function m1Post(path, data) {
  const res = await fetch(M1_API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function m1Put(path, data) {
  const res = await fetch(M1_API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function m1Delete(path) {
  const res = await fetch(M1_API + path, { method: 'DELETE' });
  return res.json();
}

// ─── Load Dashboard ───

async function loadDashboard() {
  try {
    const data = await m1Get('/dashboard');
    if (!data.success) throw new Error(data.error);

    const a = data.affiliates;
    const l = data.leads;

    document.getElementById('statAffiliates').textContent = a.active || 0;
    document.getElementById('statLeads').textContent = l.total || 0;
    document.getElementById('statClosed').textContent = l.closed_won || 0;
    document.getElementById('statRevenue').textContent = '$' + Number(l.total_revenue || 0).toLocaleString();

    document.getElementById('pipeNew').textContent = l.new_leads || 0;
    document.getElementById('pipeConversation').textContent = l.in_conversation || 0;
    document.getElementById('pipeQualified').textContent = l.qualified || 0;
    document.getElementById('pipeWon').textContent = l.closed_won || 0;
    document.getElementById('pipeLost').textContent = l.closed_lost || 0;

    if (data.errors.unresolved > 0) {
      document.getElementById('errorsSection').style.display = 'block';
      loadErrors();
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

// ─── Affiliates ───

async function loadAffiliates() {
  try {
    const data = await m1Get('/affiliates');
    if (!data.success) throw new Error(data.error);

    const container = document.getElementById('affiliatesContainer');
    if (data.affiliates.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-user-plus"></i>No affiliates yet. Add your first one!</div>';
      return;
    }

    let html = '<table class="affiliates-table"><thead><tr><th>Name</th><th>Channel</th><th>Niche</th><th>Status</th><th></th></tr></thead><tbody>';
    for (const aff of data.affiliates) {
      const badge = aff.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>';
      html += `<tr>
        <td><strong>${esc(aff.name)}</strong></td>
        <td>${esc(aff.preferred_channel || 'telegram')}</td>
        <td>${esc(aff.assigned_niche || '-')}</td>
        <td>${badge}</td>
        <td><button class="btn-help" onclick="editAffiliate(${aff.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn-help" onclick="confirmDeleteAffiliate(${aff.id}, '${esc(aff.name)}')" title="Delete"><i class="fas fa-trash"></i></button></td>
      </tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  } catch (err) {
    document.getElementById('affiliatesContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Error loading affiliates</div>';
  }
}

// ─── Leads ───

async function loadLeads() {
  try {
    const data = await m1Get('/leads');
    if (!data.success) throw new Error(data.error);

    const container = document.getElementById('leadsContainer');
    if (data.leads.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-user-tag"></i>No leads yet. Marketing workflows will capture them automatically.</div>';
      return;
    }

    let html = '<div class="leads-list">';
    for (const lead of data.leads.slice(0, 15)) {
      const statusClass = {
        'new': 'badge-new', 'in_conversation': 'badge-conversation',
        'qualified': 'badge-qualified', 'closed_won': 'badge-won',
        'closed_lost': 'badge-lost', 'lost': 'badge-lost',
      }[lead.status] || 'badge-new';

      const timeAgo = lead.last_message_at ? formatTimeAgo(new Date(lead.last_message_at)) : 'No messages';

      html += `<div class="lead-row">
        <span class="lead-name">${esc(lead.lead_name || lead.lead_phone || 'Unknown')}</span>
        <span class="badge ${statusClass}">${esc(lead.status || 'new')}</span>
        <span class="lead-stage">${esc(lead.current_stage || '-')}</span>
        <span class="lead-time">${timeAgo}</span>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    document.getElementById('leadsContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Error loading leads</div>';
  }
}

// ─── Errors ───

async function loadErrors() {
  try {
    const data = await m1Get('/errors');
    if (!data.success || data.errors.length === 0) return;

    const container = document.getElementById('errorsContainer');
    let html = '<div class="leads-list">';
    for (const err of data.errors.slice(0, 5)) {
      html += `<div class="lead-row" style="border-color: var(--danger);">
        <span class="lead-name" style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> ${esc(err.workflow_name || 'Unknown')}</span>
        <span class="lead-stage">${esc(err.node_name || '')}</span>
        <span class="lead-time">${esc((err.error_message || '').substring(0, 60))}</span>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading errors:', err);
  }
}

// ─── Affiliate Modal ───

let editingAffiliateId = null;

function showAddAffiliateModal() {
  editingAffiliateId = null;
  document.getElementById('affiliateModalTitle').innerHTML = '<i class="fas fa-user-plus"></i> Add Affiliate';
  document.getElementById('affiliateForm').reset();
  document.getElementById('affiliateModal').classList.add('active');
  document.getElementById('affiliateModal').style.display = 'flex';
}

function closeAffiliateModal() {
  document.getElementById('affiliateModal').classList.remove('active');
  document.getElementById('affiliateModal').style.display = 'none';
}

async function editAffiliate(id) {
  const data = await m1Get(`/affiliates/${id}`);
  if (!data.success) return;

  editingAffiliateId = id;
  const a = data.affiliate;
  document.getElementById('affiliateModalTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Affiliate';
  document.getElementById('affName').value = a.name || '';
  document.getElementById('affEmail').value = a.email || '';
  document.getElementById('affPhone').value = a.phone || '';
  document.getElementById('affTelegram').value = a.telegram_chat_id || '';
  document.getElementById('affChannel').value = a.preferred_channel || 'telegram';
  document.getElementById('affNiche').value = a.assigned_niche || 'general';
  document.getElementById('affTimezone').value = a.timezone || 'UTC';

  document.getElementById('affiliateModal').classList.add('active');
  document.getElementById('affiliateModal').style.display = 'flex';
}

async function handleAffiliateSubmit(e) {
  e.preventDefault();

  const body = {
    name: document.getElementById('affName').value,
    email: document.getElementById('affEmail').value || null,
    phone: document.getElementById('affPhone').value || null,
    telegram_chat_id: document.getElementById('affTelegram').value || null,
    preferred_channel: document.getElementById('affChannel').value,
    assigned_niche: document.getElementById('affNiche').value,
    timezone: document.getElementById('affTimezone').value,
  };

  let result;
  if (editingAffiliateId) {
    result = await m1Put(`/affiliates/${editingAffiliateId}`, body);
  } else {
    result = await m1Post('/affiliates', body);
  }

  if (result.success) {
    closeAffiliateModal();
    loadAffiliates();
    loadDashboard();
  } else {
    alert('Error: ' + (result.error || 'Unknown'));
  }

  return false;
}

async function confirmDeleteAffiliate(id, name) {
  if (!confirm(`Delete affiliate "${name}"? This cannot be undone.`)) return;

  const result = await m1Delete(`/affiliates/${id}`);
  if (result.success) {
    loadAffiliates();
    loadDashboard();
  }
}

// ─── Utilities ───

function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

// ─── Init ───

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  loadAffiliates();
  loadLeads();
});
