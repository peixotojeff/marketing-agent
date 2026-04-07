import React, { useState, useEffect } from 'react';
import { slaAPI } from '../api';

export default function SLAMonitor() {
  const [stats, setStats] = useState(null);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, violationsRes] = await Promise.all([
        slaAPI.getStats(),
        slaAPI.getViolations()
      ]);
      setStats(statsRes.data);
      setViolations(violationsRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleCheck = async () => {
    setChecking(true);
    try {
      await slaAPI.check();
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setChecking(false);
    }
  };

  const handleResolve = async (id) => {
    try {
      await slaAPI.resolve(id);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Carregando SLA Monitor...</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 24 }}>
        <h1>SLA Monitor</h1>
        <button onClick={handleCheck} disabled={checking}>{checking ? 'Verificando...' : '🔍 Verificar SLA Agora'}</button>
      </div>

      <div className="stats-grid">
        <StatCard label="Tarefas no Prazo" value={stats?.onTrackTasks || 0} color="success" />
        <StatCard label="Violações Ativas" value={stats?.activeViolations || 0} color="danger" />
        <StatCard label="Total de Violações" value={stats?.totalViolations || 0} color="warning" />
      </div>

      <div className="section">
        <div className="section-header">
          <h2>Violações Ativas</h2>
        </div>

        {violations.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Tarefa</th>
                <th>Responsável</th>
                <th>Prioridade</th>
                <th>Due Date</th>
                <th>Detectada em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {violations.map(v => (
                <tr key={v.id}>
                  <td style={{ color: '#f1f5f9', fontWeight: 500 }}>{v.task_name || 'Task'}</td>
                  <td>{v.member_name || 'Não atribuído'}</td>
                  <td>
                    <span className={`badge ${v.priority === 1 ? 'badge-red' : v.priority === 2 ? 'badge-yellow' : 'badge-blue'}`}>
                      {v.priority === 1 ? 'Urgente' : v.priority === 2 ? 'Alta' : 'Normal'}
                    </span>
                  </td>
                  <td>{v.due_date ? new Date(v.due_date).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>{new Date(v.detected_at).toLocaleString('pt-BR')}</td>
                  <td>
                    <button onClick={() => handleResolve(v.id)} style={{ fontSize: 11, padding: '4px 8px' }}>Resolver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#64748b', padding: 20, textAlign: 'center' }}>Nenhuma violação ativa — tudo no prazo!</p>
        )}
      </div>

      <div className="section">
        <h2 style={{ marginBottom: 16 }}>Como Funciona</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ padding: 16, background: '#0f172a', borderRadius: 8 }}>
            <h3 style={{ color: '#a78bfa', marginBottom: 8 }}>Auto-detecção</h3>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              O agente verifica automaticamente tarefas com due date vencido a cada {process.env.REACT_APP_SLA_INTERVAL || 30} minutos.
              Tarefas com SLA violado são automaticamente marcadas.
            </p>
          </div>
          <div style={{ padding: 16, background: '#0f172a', borderRadius: 8 }}>
            <h3 style={{ color: '#a78bfa', marginBottom: 8 }}>Reatribuição Automática</h3>
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              Quando uma tarefa é atrasada, o agente tenta reatribuí-la para outro membro do mesmo departamento com capacidade disponível.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={`stat-card ${color}`}>
      <h3>{label}</h3>
      <div className="value">{value}</div>
    </div>
  );
}
