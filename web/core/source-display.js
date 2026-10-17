export function searchStateMessage(envelope) {
  if (envelope?.status === 'unsupported') return 'البحث غير مدعوم في هذا المصدر';
  if (!envelope || envelope.status === 'error') return 'المصدر غير متاح حاليًا. أعد المحاولة.';
  if (envelope.status === 'no_results' || !envelope.data?.length) return 'لا توجد نتائج لهذا البحث';
  return '';
}
