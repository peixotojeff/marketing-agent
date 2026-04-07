import React, { useState, useEffect } from 'react';
import { memberAPI, taskAPI } from '../api';

export default function MemberList() {
  const [members, setMembers] = useState([]);
  const [memberTasks, setMemberTasks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editModal, setEditModal] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await memberAPI.getAll();
      setMembers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await memberAPI.sync();
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveEdit = async (id, data) => {
    try {
      await memberAPI.update(id, data);
      setEditModal(null);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const viewTasks = async (member) => {
    try {
      const res = await memberAPI.getTasks(member.id);
      setMemberTasks({ member, tasks: res.data });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Carregando equipe...</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <h1>Equipe</h1>
        <button onClick={handleSync} disabled={syncing}>{syncing ? 'Sincronizando...' : '🔄 Sincronizar do ClickUp'}</button>
      </div>

      <div className="section">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Departamento</th>
              <th>Especialidade</th>
              <th>Tarefas Ativas</th>
              <th>Capacidade</th>
              <th>Overdue</th>
              <th>Carga</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => {
              const pct = Math.round((member.active_tasks / member.max_capacity) * 100);
              const barColor = pct >= 80 ? 'red' : pct >= 60 ? 'yellow' : 'green';
              return (
                <tr key={member.id}>
                  <td style={{ fontWeight: 600, color: '#f1f5f9' }}>{member.name}</td>
                  <td><span className="badge badge-purple">{member.department || '—'}</span></td>
                  <td style={{ fontSize: 13 }}>{member.specialty || '—'}</td>
                  <td>{member.active_tasks}</td>
                  <td>{member.max_capacity}</td>
                  <td>{member.overdue_tasks > 0 ? <span className="badge badge-red">{member.overdue_tasks}</span> : '—'}</td>
                  <td style={{ minWidth: 100 }}>
                    <div className="progress-bar">
                      <div className={`progress-fill ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{pct}%</span>
                  </td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="secondary" onClick={() => viewTasks(member)} style={{ fontSize: 11, padding: '4px 8px' }}>Tarefas</button>
                    <button className="secondary" onClick={() => setEditModal(member)} style={{ fontSize: 11, padding: '4px 8px' }}>Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Member Tasks */}
      {memberTasks && (
        <div className="section">
          <div className="section-header">
            <h2>Tarefas de {memberTasks.member.name}</h2>
            <button className="secondary" onClick={() => setMemberTasks(null)}>Fechar</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Due Date</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              {memberTasks.tasks.map(task => (
                <tr key={task.id}>
                  <td style={{ color: '#f1f5f9' }}>{task.name}</td>
                  <td>{task.status}</td>
                  <td>{task.priority === 1 ? '🔴' : task.priority === 2 ? '🟡' : '🔵'}</td>
                  <td>{task.due_date ? new Date(task.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>
                    {task.sla_status === 'violated' ? <span className="badge badge-red">Violado</span> : <span className="badge badge-green">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {memberTasks.tasks.length === 0 && (
            <p style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Nenhuma tarefa</p>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <EditMemberModal member={editModal} onSave={handleSaveEdit} onClose={() => setEditModal(null)} />
      )}
    </div>
  );
}

function EditMemberModal({ member, onSave, onClose }) {
  const [form, setForm] = useState({
    department: member.department || '',
    specialty: member.specialty || '',
    max_capacity: member.max_capacity,
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Editar: {member.name}</h3>

        <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Departamento</label>
        <input
          type="text"
          value={form.department}
          onChange={e => setForm({ ...form, department: e.target.value })}
          placeholder="e.g., design, content, seo, social, ads, email"
          style={{ width: '100%', marginBottom: 12 }}
        />

        <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Especialidade</label>
        <input
          type="text"
          value={form.specialty}
          onChange={e => setForm({ ...form, specialty: e.target.value })}
          placeholder="e.g., copywriter, designer, strategist"
          style={{ width: '100%', marginBottom: 12 }}
        />

        <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Capacidade Máxima</label>
        <input
          type="text"
          value={form.max_capacity}
          onChange={e => setForm({ ...form, max_capacity: parseInt(e.target.value) || 5 })}
          style={{ width: '100%', marginBottom: 16 }}
        />

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={() => onSave(member.id, form)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
