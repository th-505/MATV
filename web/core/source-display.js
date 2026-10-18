export function searchStateMessage(envelope) {
  if (envelope?.status === 'unsupported') return 'البحث غير مدعوم في هذا المصدر';
  if (!envelope || envelope.status === 'error') return 'المصدر غير متاح حاليًا. أعد المحاولة.';
  if (envelope.status === 'no_results' || !envelope.data?.length) return 'لا توجد نتائج لهذا البحث';
  return '';
}

// Abort transport where possible, and retain a generation guard for late completions.
export class ExploreRequest {
  generation = 0;
  controller = null;
  invalidate() {
    ++this.generation;
    this.controller?.abort();
    this.controller = null;
  }
  start() {
    this.invalidate();
    this.controller = new AbortController();
    return { generation: this.generation, signal: this.controller.signal };
  }
  current(request) { return request.generation === this.generation && !request.signal.aborted; }
}

export function mountSourcePicker(select, state, load) {
  let loading = false;
  async function reload() {
    if (loading) return;
    loading = true;
    state.textContent = 'جارٍ تحميل المصادر…';
    try {
      const providers = await load();
      const selected = select.value;
      select.replaceChildren(new Option('جميع المصادر', ''), ...providers.map(p => new Option(p.displayName, p.id)));
      select.value = providers.some(p => p.id === selected) ? selected : '';
      state.replaceChildren();
    } catch {
      state.textContent = 'تعذر تحميل المصادر ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'إعادة محاولة تحميل المصادر';
      retry.onclick = reload;
      state.appendChild(retry);
    } finally { loading = false; }
  }
  reload();
  return reload;
}
