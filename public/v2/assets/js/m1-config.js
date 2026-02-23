/**
 * M1 AI Config JS — Prompts, Stages, Objections, Niche Problems
 */

const M1_API = '/api/m1';

async function m1Get(path) {
  const res = await fetch(M1_API + path);
  return res.json();
}
async function m1Put(path, data) {
  const res = await fetch(M1_API + path, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
async function m1Post(path, data) {
  const res = await fetch(M1_API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
async function m1Delete(path) {
  const res = await fetch(M1_API + path, { method: 'DELETE' });
  return res.json();
}

function esc(s) {
  if (!s) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

function showSaveIndicator(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ─── Tab Switching ───

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  document.querySelector(`.tab-btn[onclick="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

// ─── AI Prompts ───

let promptsData = [];

async function loadPrompts() {
  try {
    const data = await m1Get('/prompts');
    if (!data.success) throw new Error(data.error);
    promptsData = data.prompts;

    const container = document.getElementById('promptsContainer');
    if (promptsData.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-robot"></i>No AI prompts configured yet.</div>';
      return;
    }

    let html = '';
    for (const p of promptsData) {
      const badge = p.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>';
      const preview = (p.system_prompt || '').substring(0, 150).replace(/\n/g, ' ');

      html += `<div class="config-card">
        <div class="config-card-header">
          <h3><i class="fas fa-robot"></i> ${esc(p.prompt_name)} ${badge}</h3>
          <button class="btn-primary" onclick="editPrompt(${p.id})" style="font-size: 0.85rem; padding: 6px 14px;">
            <i class="fas fa-edit"></i> Edit
          </button>
        </div>
        <div class="prompt-editor" style="min-height: 80px; cursor: default; font-size: 0.8rem; color: var(--text-secondary);" onclick="editPrompt(${p.id})">${esc(preview)}...</div>
        <div class="prompt-meta">
          <span class="meta-item"><i class="fas fa-key"></i> ${esc(p.prompt_id)}</span>
          <span class="meta-item"><i class="fas fa-tag"></i> ${esc(p.niche || 'general')}</span>
          <span class="meta-item"><i class="fas fa-code-branch"></i> v${p.version || 1}</span>
          <span class="meta-item"><i class="fas fa-ruler-horizontal"></i> ${(p.system_prompt || '').length} chars</span>
        </div>
      </div>`;
    }
    container.innerHTML = html;
  } catch (err) {
    document.getElementById('promptsContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Error loading prompts: ' + esc(err.message) + '</div>';
  }
}

function editPrompt(id) {
  const p = promptsData.find(x => x.id === id);
  if (!p) return;

  document.getElementById('promptEditId').value = id;
  document.getElementById('promptEditName').value = p.prompt_name || '';
  document.getElementById('promptEditNiche').value = p.niche || 'general';
  document.getElementById('promptEditText').value = p.system_prompt || '';

  document.getElementById('promptModal').classList.add('active');
  document.getElementById('promptModal').style.display = 'flex';
}

function closePromptModal() {
  document.getElementById('promptModal').classList.remove('active');
  document.getElementById('promptModal').style.display = 'none';
}

async function handlePromptSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('promptEditId').value;
  const result = await m1Put(`/prompts/${id}`, {
    system_prompt: document.getElementById('promptEditText').value,
    niche: document.getElementById('promptEditNiche').value,
  });
  if (result.success) {
    closePromptModal();
    loadPrompts();
  } else {
    alert('Error: ' + (result.error || 'Unknown'));
  }
  return false;
}

// ─── Closing Stages ───

let stagesData = [];

async function loadStages() {
  try {
    const data = await m1Get('/stages');
    if (!data.success) throw new Error(data.error);
    stagesData = data.stages;

    const container = document.getElementById('stagesContainer');
    if (stagesData.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-route"></i>No closing stages configured.</div>';
      return;
    }

    let html = '';
    for (const s of stagesData) {
      const badge = s.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Off</span>';
      html += `<div class="stage-item" onclick="editStage(${s.id})" style="cursor: pointer;">
        <div class="stage-order">${s.stage_order}</div>
        <div>
          <div class="stage-name">${esc(s.stage_name)}</div>
          <div class="stage-desc">${esc(s.stage_description || '')}</div>
        </div>
        <div class="stage-msg-limit">Max: ${s.max_message_length || '-'} chars</div>
        ${badge}
        <button class="btn-help" title="Edit"><i class="fas fa-edit"></i></button>
      </div>`;
    }
    container.innerHTML = html;
  } catch (err) {
    document.getElementById('stagesContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Error: ' + esc(err.message) + '</div>';
  }
}

function editStage(id) {
  const s = stagesData.find(x => x.id === id);
  if (!s) return;

  document.getElementById('stageEditId').value = id;
  document.getElementById('stageEditName').value = s.stage_name || '';
  document.getElementById('stageEditDesc').value = s.stage_description || '';
  document.getElementById('stageEditMaxLen').value = s.max_message_length || 300;

  document.getElementById('stageModal').classList.add('active');
  document.getElementById('stageModal').style.display = 'flex';
}

function closeStageModal() {
  document.getElementById('stageModal').classList.remove('active');
  document.getElementById('stageModal').style.display = 'none';
}

async function handleStageSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('stageEditId').value;
  const result = await m1Put(`/stages/${id}`, {
    stage_name: document.getElementById('stageEditName').value,
    stage_description: document.getElementById('stageEditDesc').value,
    max_message_length: parseInt(document.getElementById('stageEditMaxLen').value) || 300,
  });
  if (result.success) {
    closeStageModal();
    loadStages();
    showSaveIndicator('stagesSaveIndicator');
  } else {
    alert('Error: ' + (result.error || 'Unknown'));
  }
  return false;
}

// ─── Objections ───

let objectionsData = [];

async function loadObjections() {
  try {
    const data = await m1Get('/objections');
    if (!data.success) throw new Error(data.error);
    objectionsData = data.objections;

    const container = document.getElementById('objectionsContainer');
    if (objectionsData.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-shield-alt"></i>No objection handlers configured.</div>';
      return;
    }

    let html = '';
    for (const o of objectionsData) {
      const badge = o.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Off</span>';
      html += `<div class="objection-card" onclick="editObjection(${o.id})" style="cursor: pointer;">
        <div class="objection-type">
          <i class="fas fa-comment-slash"></i> ${esc(o.objection_id)} ${badge}
        </div>
        <div class="objection-category">${esc(o.objection_category || o.objection_type || '')}</div>
        <div class="objection-response">${esc((o.response_template || '').substring(0, 120))}${(o.response_template || '').length > 120 ? '...' : ''}</div>
        ${o.follow_up_question ? '<div class="objection-followup"><i class="fas fa-question-circle"></i> ' + esc(o.follow_up_question) + '</div>' : ''}
        <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">Max attempts: ${o.max_attempts || '-'}</div>
      </div>`;
    }
    container.innerHTML = html;
  } catch (err) {
    document.getElementById('objectionsContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Error: ' + esc(err.message) + '</div>';
  }
}

function editObjection(id) {
  const o = objectionsData.find(x => x.id === id);
  if (!o) return;

  document.getElementById('objEditId').value = id;
  document.getElementById('objEditStrategy').value = o.response_strategy || '';
  document.getElementById('objEditTemplate').value = o.response_template || '';
  document.getElementById('objEditFollowup').value = o.follow_up_question || '';
  document.getElementById('objEditMaxAttempts').value = o.max_attempts || 2;

  document.getElementById('objectionModal').classList.add('active');
  document.getElementById('objectionModal').style.display = 'flex';
}

function closeObjectionModal() {
  document.getElementById('objectionModal').classList.remove('active');
  document.getElementById('objectionModal').style.display = 'none';
}

async function handleObjectionSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('objEditId').value;
  const result = await m1Put(`/objections/${id}`, {
    response_strategy: document.getElementById('objEditStrategy').value,
    response_template: document.getElementById('objEditTemplate').value,
    follow_up_question: document.getElementById('objEditFollowup').value,
    max_attempts: parseInt(document.getElementById('objEditMaxAttempts').value) || 2,
  });
  if (result.success) {
    closeObjectionModal();
    loadObjections();
    showSaveIndicator('objectionsSaveIndicator');
  } else {
    alert('Error: ' + (result.error || 'Unknown'));
  }
  return false;
}

// ─── Niche Problems ───

let problemsData = [];

async function loadProblems() {
  try {
    const data = await m1Get('/niche-problems');
    if (!data.success) throw new Error(data.error);
    problemsData = data.problems;

    const container = document.getElementById('problemsContainer');
    if (problemsData.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-lightbulb"></i>No niche problems yet. Add problems for the Content Generator AI to create marketing posts.</div>';
      return;
    }

    let html = '';
    for (const p of problemsData) {
      const painClass = p.pain_level <= 3 ? 'pain-low' : p.pain_level <= 6 ? 'pain-med' : 'pain-high';
      const statusBadge = p.active !== false ? '' : ' <span class="badge badge-inactive">Inactive</span>';

      html += `<div class="niche-problem-item">
        <div class="pain-level ${painClass}">${p.pain_level || 5}</div>
        <div style="flex: 1;">
          <strong>${esc(p.problem_title)}</strong>${statusBadge}
          <div style="font-size: 0.8rem; color: var(--text-secondary);">${esc(p.niche || 'general')} ${p.problem_description ? '&mdash; ' + esc(p.problem_description.substring(0, 80)) : ''}</div>
        </div>
        <button class="btn-help" onclick="event.stopPropagation(); confirmDeleteProblem(${p.id}, '${esc(p.problem_title)}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div>`;
    }
    container.innerHTML = html;
  } catch (err) {
    document.getElementById('problemsContainer').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i>Error: ' + esc(err.message) + '</div>';
  }
}

function showAddProblemModal() {
  document.getElementById('probEditId').value = '';
  document.getElementById('problemForm').reset();
  document.getElementById('probPainLevel').value = 5;
  document.getElementById('problemModalTitle').innerHTML = '<i class="fas fa-lightbulb"></i> Add Niche Problem';
  document.getElementById('problemModal').classList.add('active');
  document.getElementById('problemModal').style.display = 'flex';
}

function closeProblemModal() {
  document.getElementById('problemModal').classList.remove('active');
  document.getElementById('problemModal').style.display = 'none';
}

async function handleProblemSubmit(e) {
  e.preventDefault();
  const body = {
    niche: document.getElementById('probNiche').value,
    problem_title: document.getElementById('probTitle').value,
    problem_description: document.getElementById('probDescription').value || null,
    pain_level: parseInt(document.getElementById('probPainLevel').value) || 5,
  };

  const result = await m1Post('/niche-problems', body);
  if (result.success) {
    closeProblemModal();
    loadProblems();
  } else {
    alert('Error: ' + (result.error || 'Unknown'));
  }
  return false;
}

async function confirmDeleteProblem(id, title) {
  if (!confirm(`Delete problem "${title}"?`)) return;
  const result = await m1Delete(`/niche-problems/${id}`);
  if (result.success) loadProblems();
}

// ─── Init ───

document.addEventListener('DOMContentLoaded', () => {
  loadPrompts();
  loadStages();
  loadObjections();
  loadProblems();
});
