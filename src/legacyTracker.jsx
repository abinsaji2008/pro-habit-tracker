// Core logic preserved from the original habit-tracking app.
// This module documents the existing data model used by the legacy tracker:
// users/{uid}/tasks, users/{uid}/habits, users/{uid}/dailyRecords.
export function trackerKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

export function calculateDailyProgress(data, selected) {
  const tasks = Object.entries(data?.tasks || {}).filter(([, t]) => t.date === selected);
  const habits = Object.entries(data?.habits || {}).filter(([, h]) => h.active !== false);
  const total = tasks.length + habits.length;
  const completed = tasks.filter(([, t]) => t.completed).length + habits.filter(([id]) => !!data?.dailyRecords?.[selected]?.habitChecks?.[id]).length;
  return { total, completed, percent: total ? Math.round(completed / total * 100) : 0 };
}
