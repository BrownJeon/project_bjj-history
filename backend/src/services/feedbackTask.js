const core = require('./feedbackCore');
const { safeParse } = require('../utils/respond');
// Research has legacy utf8mb3/short fields. This deliberately bounded task snapshot
// contains a title, ONE selected practice and its check; complete evidence stays in feedback.
function taskSnapshot(summary, feedbackId) {
  const compact = (value, max) => [...String(value || '').normalize('NFC')].filter(ch => ch.codePointAt(0) <= 0xffff).slice(0, max).join('');
  const practice = summary.practiceMethods[0];
  if (!practice) throw new core.FeedbackError(422, '연습 방법이 있는 피드백을 먼저 정리해주세요');
  const title = compact(summary.title, 70) || `피드백 ${feedbackId}`;
  const action = compact(practice.title, 100);
  const check = compact(practice.check, 160);
  return { title: `피드백: ${title}`, label: action || title, note: `피드백 #${feedbackId}\n선택한 연습: ${action}\n체크: ${check}`, memo: `피드백 #${feedbackId} · ${compact(action, 150)}` };
}
function createTaskAssigner({ sequelize, Feedback, write, shape, clipsFor, orderedClips, now = () => new Date() }) {
  return async function assign(uid, id, input) {
    const feedbackId = core.positive(id);
    const rev = core.positive(input.revision, 'revision');
    if (typeof input.replace !== 'boolean' || !Object.hasOwn(input, 'expectedTaskId')) core.invalid('현재 과제 확인과 교체 여부가 필요합니다');
    const expected = input.expectedTaskId === null ? null : core.positive(input.expectedTaskId, 'expectedTaskId');
    try {
      const saved = await sequelize.transaction(async transaction => {
        // One deterministic order for feedback assignment requests: owner -> feedback -> open task.
        const [users] = await sequelize.query('SELECT id FROM users WHERE id=? FOR UPDATE', { replacements: [uid], transaction });
        if (!users.length) throw new core.FeedbackError(404, '사용자를 찾을 수 없습니다');
        const row = await Feedback.findOne({ where: { id: feedbackId, user_id: uid }, raw: true, transaction, lock: transaction.LOCK.UPDATE });
        if (!row) throw new core.FeedbackError(404, '피드백을 찾을 수 없습니다');
        if (row.revision !== rev) throw new core.FeedbackError(409, '피드백이 변경되었습니다. 최신 내용을 불러온 뒤 다시 시도해주세요');
        const clips = orderedClips(row, await clipsFor([row], uid));
        const summary = safeParse(row.summary, null);
        if (!summary || row.summary_hash !== core.snapshotHash(row, clips) || row.ai_status === 'pending') throw new core.FeedbackError(409, '최신 피드백 정리를 완료한 후 과제로 지정해주세요');
        const [current] = await sequelize.query('SELECT id,node_id FROM research_tasks WHERE user_id=? AND closed_at IS NULL FOR UPDATE', { replacements: [uid], transaction });
        const currentId = current.length ? Number(current[0].id) : null;
        if (currentId !== expected) throw new core.FeedbackError(409, '현재 과제가 변경되었습니다. 다시 확인한 후 지정해주세요');
        const binding = safeParse(row.task_binding, null);
        const sourceHash = core.summarySourceHash(row);
        const same = binding?.sourceHash === sourceHash;
        if (same && binding.taskId === currentId) return { row, task: { id: binding.taskId, nodeId: binding.nodeId, projectId: binding.projectId, open: true }, reused: true };
        if (currentId && !input.replace) throw new core.FeedbackError(409, '열린 과제가 있습니다. 교체 여부를 확인해주세요');
        const snap = taskSnapshot(summary, row.id);
        const projectId = await write.createProject(uid, { title: snap.title, goal: '피드백에 정리한 한 가지 연습을 확인한다' }, { transaction });
        const version = await write.activeVersionOf(projectId, transaction);
        const nodeId = await write.createNode(uid, version, { kind: '대처', label: snap.label, note: snap.note }, { transaction });
        const made = await write.setWeeklyTask(uid, { id: nodeId, owner_id: uid }, { memo: snap.memo, replace: input.replace }, { transaction });
        const taskBinding = { sourceHash, taskId: made.taskId, nodeId, projectId };
        const patch = { task_binding: JSON.stringify(taskBinding), revision: row.revision + 1, updated_at: now() };
        const [count] = await Feedback.update(patch, { where: { id: row.id, user_id: uid, revision: rev }, transaction });
        if (count !== 1) throw new core.FeedbackError(409, '피드백이 변경되었습니다. 다시 시도해주세요');
        return { row: { ...row, ...patch }, task: { id: made.taskId, nodeId, projectId, open: true }, reused: false };
      });
      return { feedback: await shape(saved.row), task: saved.task, reused: saved.reused };
    } catch (error) {
      if (error.__dup || error.name === 'SequelizeUniqueConstraintError' || ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.original?.code)) throw new core.FeedbackError(409, '현재 과제가 변경되었습니다. 다시 확인한 후 지정해주세요');
      throw error;
    }
  };
}
module.exports = { createTaskAssigner, taskSnapshot };
